import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CODE_ROOT, WORKSPACE, STATE, PROJECTS, workspaceEnv, workspaceManifest } from './workspace.js';
import {installFiles,uninstallOwner,inventory} from './ownership.js';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
export const ROOT = CODE_ROOT;
export {WORKSPACE,STATE,PROJECTS};
const execute = promisify(execFile);
export const hash = data => createHash('sha256').update(data).digest('hex');
export async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
export async function json(p) { return JSON.parse(await fs.readFile(p, 'utf8')); }
export async function save(p, data) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n'); }
export async function run(command, args, options = {}) {
  try { return (await execute(command, args, { cwd: WORKSPACE, env: workspaceEnv(), timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options })).stdout; }
  catch (e) { throw new Error(`${path.basename(command)} failed: ${(e.stderr || e.stdout || e.message).slice(-12000)}`); }
}
export function validId(id) { if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('id must be 1..64 lowercase letters, digits, hyphens'); return id; }
export function safeName(name) { if (!name || name.length > 80 || /[\x00-\x1f/\\<>:"|?*]/.test(name) || name.endsWith('.') || name.trim() !== name) throw new Error('Invalid content name'); return name; }
export async function project(id) { const dir = path.join(PROJECTS, validId(id)); if ((await fs.lstat(dir)).isSymbolicLink()) throw new Error('Project symlinks are unsupported'); const manifest = await json(path.join(dir, 'project.json')); return { dir, manifest }; }
// Resolve existing ancestors too: a symlink must not let project edits escape the project.
export async function within(dir, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Expected a relative file path');
  const target = path.resolve(dir, relative), root = await fs.realpath(dir);
  if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error('Path escapes project');
  let parent = target;
  while (!(await exists(parent))) parent = path.dirname(parent);
  const real = await fs.realpath(parent);
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error('Symlink escapes project');
  return target;
}
export async function files(dir, prefix = '') {
  const out = [];
  for (const item of await fs.readdir(path.join(dir, prefix), { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('Project symlinks are unsupported');
    const rel = path.join(prefix, item.name);
    if (item.isDirectory()) out.push(...await files(dir, rel)); else if (item.isFile()) out.push(rel);
  }
  return out.sort();
}
export async function gamePath() {
  const configuredPath=(await workspaceManifest(false))?.gamePath;
  const configured=configuredPath?path.resolve(WORKSPACE,configuredPath):undefined;
  const candidates = process.env.BROFORCE_GAME_PATH || configured ? [process.env.BROFORCE_GAME_PATH || configured] : [
    path.join(os.homedir(), 'snap/steam/common/.local/share/Steam/steamapps/common/Broforce'),
    path.join(os.homedir(), '.local/share/Steam/steamapps/common/Broforce'),
    path.join(os.homedir(), '.steam/steam/steamapps/common/Broforce')];
  for (const p of candidates) if (await exists(path.join(p, 'Broforce_Data/Managed/Assembly-CSharp.dll'))) return fs.realpath(p);
  throw new Error('Broforce not found. Set BROFORCE_GAME_PATH to its installation directory.');
}
export async function inspectInstallation() {
  let game, fingerprint, error;
  try { game = await gamePath(); fingerprint = hash(await fs.readFile(path.join(game, 'Broforce_Data/Managed/Assembly-CSharp.dll'))); } catch (e) { error = e.message; }
  return { platform: process.platform, game, error, gameAssemblySha256: fingerprint,
    compatibility: fingerprint === 'd518444c45ba73f834bfbd163973f3c0fdbb935522144d9b95e6db74029a6b86' && process.platform === 'linux' ? 'tested-linux-build' : 'unverified',
    nativeTool: await exists(path.join(STATE, '.toolchain/native-campaign-tool/NativeCampaignTool.dll')),
    dotnet: await exists(path.join(STATE, '.toolchain/dotnet/dotnet')),
    modProfile: await exists(path.join(STATE, 'runtime/profile/UMM/Mods/BroforceWorkshop/WorkshopBridge.dll')),
    workspace: WORKSPACE, stateDirectory: STATE, projectsDirectory: PROJECTS, bridge: await bridgeReady(),
    limitations: ['Linux only', 'Single local player tested', 'Level preview is schematic, not a Unity render', 'Image generation is supplied by your agent, not by this server'] };
}
async function requireCompatible() { const state = await inspectInstallation(); if (state.compatibility !== 'tested-linux-build') throw new Error(`Unsupported/unverified game assembly: ${state.gameAssemblySha256 || state.error}`); return state.game; }
export async function listProjects() {
  if (!(await exists(PROJECTS))) return {projects:[]};
  const entries = await fs.readdir(PROJECTS, { withFileTypes: true });
  const result = [];
  for (const e of entries) if (e.isDirectory() && !e.isSymbolicLink() && await exists(path.join(PROJECTS, e.name, 'project.json'))) result.push((await project(e.name)).manifest);
  return { projects: result };
}
export async function createProject({ id, kind, name, author = 'Local author', initialBro, dependencies = [], template = 'rifle' }) {
  await workspaceManifest();
  dependencies.forEach(validId);
  validId(id); safeName(name);
  if (!['campaign', 'bro'].includes(kind)) throw new Error('kind must be campaign or bro');
  if (!['rifle', 'spider-bro'].includes(template)) throw new Error('template must be rifle or spider-bro');
  if (kind === 'campaign' && template !== 'rifle') throw new Error('Bro templates require kind bro');
  await fs.mkdir(PROJECTS, { recursive: true });
  const dir = path.join(PROJECTS, id);
  await fs.mkdir(dir); // Deliberately never overwrite another project.
  const manifest = { schemaVersion: 1, id, kind, name, author, version: '0.1.0', created: new Date().toISOString(), ...(initialBro ? { initialBro } : {}), dependencies };
  try {
    if (kind === 'campaign') {
      const design = await json(path.join(ROOT, 'templates/campaigns/high-ground.json'));
      design.name = name;
      design.levels[0].settings.levelDescription = `BWM:${id}|${name}`;
      await save(path.join(dir, 'design.json'), design);
    } else if (template === 'spider-bro') {
      const bundled = path.join(ROOT, 'library/bros/spider-bro/0.2.5/project');
      for (const entry of await fs.readdir(bundled)) {
        await fs.cp(path.join(bundled, entry), path.join(dir, entry), { recursive: true, force: false, errorOnExist: true });
      }
      const className = `Workshop_${id.replaceAll('-', '_')}`;
      manifest.preset = className;
      manifest.version = '0.2.5';
      manifest.provenance = { template: 'spider-bro', version: '0.2.5' };
      for (const file of await files(path.join(dir, 'src'))) {
        const target = path.join(dir, 'src', file);
        await fs.writeFile(target, (await fs.readFile(target, 'utf8')).replaceAll('Workshop_spider_bro', className));
      }
      const config = await json(path.join(dir, 'bro.json'));
      config.name = name;
      config.characterPreset = className;
      config.cutscene.heading = name;
      await save(path.join(dir, 'bro.json'), config);
    } else {
      // A new preset inherits BroMaker's complete vanilla adapter; no upstream character art is copied.
      const className = `Workshop_${id.replaceAll('-', '_')}`;
      manifest.preset = className;
      await fs.mkdir(path.join(dir, 'src')); await fs.mkdir(path.join(dir, 'assets'));
      await fs.writeFile(path.join(dir, 'src/Hero.cs'), `using BroMakerLib;\nusing BroMakerLib.Vanilla.Bros;\nnamespace WorkshopBros {\n [HeroPreset("${className}", HeroType.Rambro)]\n public class ${className} : RambroM { }\n}\n`);
      await save(path.join(dir, 'bro.json'), { name, characterPreset: className, parameters: {}, abilities: {}, beforeAwake: { speed: 130, fireRate: 0.2 }, afterAwake: {}, beforeStart: {}, afterStart: {}, cutscene: { playCutsceneOnFirstSpawn: false, heading: name } });
      await save(path.join(dir, 'animations.json'), { note: 'Add animation definitions for your own PNG assets. Asset paths are relative to assets/. Frame rectangles are pixels from top-left; preview metadata does not change game configuration.', animations: [] });
      await fs.writeFile(path.join(dir, 'CREDITS.md'), 'Original source scaffold: Broforce Workshop. Uses the locally installed game and BroMaker Rambro adapter.\nAdd authors, sources, licenses, and image generation details for your added assets.\n');
    }
    await save(path.join(dir, 'project.json'), manifest);
    return readProject(id);
  } catch (e) { await fs.rm(dir, { recursive: true, force: true }); throw e; }
}
export async function readProject(id, file) {
  const { dir, manifest } = await project(id);
  if (file) { const p = await within(dir, file); const stat = await fs.stat(p); if (stat.size > 2_000_000) throw new Error('Text file exceeds 2 MB'); return { file, text: await fs.readFile(p, 'utf8') }; }
  return { ...manifest, directory: dir, files: await files(dir), ...(manifest.kind === 'campaign' ? { design: await json(path.join(dir, 'design.json')) } : { config: await json(path.join(dir, 'bro.json')) }) };
}
export async function writeProjectFile(id, file, text) {
  const { dir } = await project(id);
  if (Buffer.byteLength(text) > 2_000_000) throw new Error('Text exceeds 2 MB');
  const target = await within(dir, file);
  const normalized = path.relative(dir, target);
  if (normalized === 'project.json' || normalized === 'build' || normalized.startsWith('build/') || normalized === 'records' || normalized.startsWith('records/')) throw new Error('Manifest, build, and records are managed by tools');
  if (file.endsWith('.json')) JSON.parse(text);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, text);
  return { file: target, sha256: hash(text), rebuildRequired: true };
}
export async function sourceHashes(dir) {
  const result = {};
  for (const file of await files(dir)) if (!file.startsWith('build/') && !file.startsWith('records/') && !file.startsWith('.building-')) result[file] = hash(await fs.readFile(await within(dir, file)));
  return result;
}
export async function validateBro(dir, config, animations) {
  const errors = [], warnings = [];
  const referenced = [];
  for (const [key, value] of Object.entries(config.parameters || {})) if (['Avatar', 'Sprite', 'GunSprite', 'SpecialIcons'].includes(key) && typeof value === 'string') referenced.push(value);
  if (config.beforeAwake?.gunGrabSprite) referenced.push(config.beforeAwake.gunGrabSprite);
  for (const key of ['spritePath', 'barkPath', 'fanfarePath', 'backgroundPath']) if (config.cutscene?.[key]) referenced.push(config.cutscene[key]);
  for (const name of new Set(referenced)) { const p = await within(path.join(dir, 'assets'), name); if (!(await exists(p))) errors.push(`Missing asset ${name}`); }
  for (const anim of animations.animations || []) {
    const p = await within(path.join(dir, 'assets'), anim.file);
    const data = await fs.readFile(p);
    if (!data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) { errors.push(`${anim.file} is not PNG`); continue; }
    const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
    if (!Array.isArray(anim.frames) || !anim.frames.length) errors.push(`No frames for ${anim.name}`);
    for (const rect of anim.frames || []) if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isInteger) || rect[0] < 0 || rect[1] < 0 || rect[2] < 1 || rect[3] < 1 || rect[0] + rect[2] > w || rect[1] + rect[3] > h) errors.push(`Frame outside ${anim.file}: ${JSON.stringify(rect)}`);
    if (!(anim.fps > 0 && anim.fps <= 120)) errors.push(`Invalid fps for ${anim.name}`);
  }
  if (!referenced.length) warnings.push('Using inherited vanilla art. Add original assets before calling this a visually custom bro.');
  if (!config.cutscene?.playCutsceneOnFirstSpawn) warnings.push('Introduction is disabled.');
  return { errors, warnings, runtime: 'not tested' };
}
export async function buildEnvironment() {
  const toolchain={};
  for(const [key,file] of Object.entries({nativeCampaignTool:'.toolchain/native-campaign-tool/NativeCampaignTool.dll',workshopBridge:'runtime/profile/UMM/Mods/BroforceWorkshop/WorkshopBridge.dll',dotnet:'.toolchain/dotnet/dotnet'})) {
    if(await exists(path.join(STATE,file)))toolchain[key+'Sha256']=hash(await fs.readFile(path.join(STATE,file)));
  }
  const sdkDir=path.join(STATE,'.toolchain/dotnet/sdk');
  if(await exists(sdkDir)){const sdk=(await fs.readdir(sdkDir)).sort().at(-1);const compiler=path.join(sdkDir,sdk,'Roslyn/bincore/csc.dll');if(await exists(compiler))toolchain.compilerSha256=hash(await fs.readFile(compiler));}
  return {toolchain,gameAssemblySha256:(await inspectInstallation()).gameAssemblySha256,dependencies:await json(path.join(ROOT,'dependencies.lock.json'))};
}
export async function buildProject(id) {
  await workspaceManifest();
  const game = await requireCompatible(), { dir, manifest } = await project(id);
  const sources = await sourceHashes(dir);
  const temp = path.join(dir, `.building-${randomUUID()}`);
  await fs.mkdir(temp);
  try {
    let details;
    if (manifest.kind === 'campaign') {
      const design = await json(path.join(dir, 'design.json'));
      if (design.name !== manifest.name) throw new Error('design.name must match project name');
      // Every map carries this project's spawn-policy key.
      for (const level of design.levels) if (!level.settings.levelDescription?.startsWith(`BWM:${id}|`)) throw new Error(`Each levelDescription must start with BWM:${id}|`);
      details = JSON.parse(await run(path.join(STATE, '.toolchain/dotnet/dotnet'), [path.join(STATE, '.toolchain/native-campaign-tool/NativeCampaignTool.dll'), '--managed', path.join(game, 'Broforce_Data/Managed'), '--design', path.join(dir, 'design.json'), '--output', path.join(temp, manifest.name + '.bfg'), '--name', manifest.name, '--author', manifest.author, '--description', manifest.name]));
    } else {
      const config = await json(path.join(dir, 'bro.json'));
      if (config.name !== manifest.name || config.characterPreset !== manifest.preset) throw new Error('bro name/preset must match project metadata');
      const validation = await validateBro(dir, config, await json(path.join(dir, 'animations.json')));
      if (validation.errors.length) throw new Error(JSON.stringify(validation));
      const packageDir = path.join(temp, 'package'); await fs.mkdir(packageDir);
      await fs.cp(path.join(dir, 'assets'), packageDir, { recursive: true });
      await save(path.join(packageDir, 'bro.json'), config);
      await save(path.join(packageDir, 'workshop.mod.json'), { Name: manifest.name, Version: manifest.version, BroMakerVersion: '2.6.2', Author: manifest.author, CustomBros: ['bro.json'], Assemblies: ['Hero.dll'] });
      await fs.copyFile(path.join(dir, 'CREDITS.md'), path.join(packageDir, 'CREDITS.md'));
      const managed = path.join(game, 'Broforce_Data/Managed'), profile = path.join(STATE, 'runtime/profile/UMM');
      const refs = ['mscorlib.dll', 'System.dll', 'System.Core.dll', 'Assembly-CSharp.dll'].map(x => path.join(managed, x));
      refs.push(...(await fs.readdir(managed)).filter(x => x.startsWith('UnityEngine') && x.endsWith('.dll')).map(x => path.join(managed, x)));
      refs.push(path.join(profile, 'Mods/BroMakerLib/BroMakerLib.dll'), path.join(profile, 'Mods/RocketLib/RocketLib.dll'), path.join(profile, 'Core/0Harmony.dll'));
      const sdk = (await fs.readdir(path.join(STATE, '.toolchain/dotnet/sdk'))).sort().at(-1);
      const cs = (await files(path.join(dir, 'src'))).filter(x => x.endsWith('.cs')).map(x => path.join(dir, 'src', x));
      const compiler = await run(path.join(STATE, '.toolchain/dotnet/dotnet'), [path.join(STATE, '.toolchain/dotnet/sdk', sdk, 'Roslyn/bincore/csc.dll'), '-noconfig', '-nostdlib', '-target:library', '-langversion:7.3', '-deterministic+', '-out:' + path.join(packageDir, 'Hero.dll'), ...refs.map(x => '-r:' + x), ...cs]);
      details = { validation, compiler, target: 'Unity Mono game references; not a .NET 8 gameplay assembly' };
    }
    if (JSON.stringify(sources) !== JSON.stringify(await sourceHashes(dir))) throw new Error('Project changed during build; retry');
    const artifacts = {};
    for (const file of await files(temp)) artifacts[file] = hash(await fs.readFile(path.join(temp, file)));
    const environment=await buildEnvironment();
    const assemblyIdentity=manifest.kind==='bro'?JSON.parse(await run(path.join(STATE,'.toolchain/dotnet/dotnet'),[path.join(STATE,'.toolchain/native-campaign-tool/NativeCampaignTool.dll'),'--assembly-identity',path.join(temp,'package/Hero.dll')])):null;
    const report = { project: manifest, toolVersion: (await json(path.join(ROOT, 'package.json'))).version, ...environment, assemblyIdentity, builtAt: new Date().toISOString(), sourceHashes: sources, artifacts, details, runtime: 'not tested for this build' };
    await save(path.join(temp, 'report.json'), report);
    await fs.rm(path.join(dir, 'build'), { recursive: true, force: true }); await fs.rename(temp, path.join(dir, 'build'));
    return { ...report, directory: path.join(dir, 'build') };
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
export async function currentBuild(id) {
  const { dir, manifest } = await project(id), report = await json(path.join(dir, 'build/report.json'));
  const environment=await buildEnvironment();
  if(JSON.stringify({toolchain:report.toolchain,gameAssemblySha256:report.gameAssemblySha256,dependencies:report.dependencies})!==JSON.stringify(environment))throw Error('Build environment changed; rebuild before installing');
  if (JSON.stringify(report.sourceHashes) !== JSON.stringify(await sourceHashes(dir))) throw new Error('Source changed since build; rebuild before installing');
  for (const [file, digest] of Object.entries(report.artifacts)) if (hash(await fs.readFile(await within(dir, 'build/' + file))) !== digest) throw new Error('Built artifact changed; rebuild');
  return { dir, manifest, report };
}
export async function campaignInstallName(manifest) {
  const workspace=await workspaceManifest();
  return 'BF-'+workspace.workspaceId+'-'+manifest.id;
}
export async function installProject(id, overwrite = false) {
  await workspaceManifest();
  const game = await requireCompatible(), { dir, manifest, report } = await currentBuild(id);
  const copies = [];
  const launchName=manifest.kind==='campaign'?await campaignInstallName(manifest):undefined;
  if (manifest.kind === 'campaign') {
    for (const ext of ['bfc', 'bfg']) copies.push({source:path.join(dir,'build',manifest.name+'.'+ext),path:path.join(game,'Levels',launchName+'.'+ext)});
    copies.push({path:path.join(STATE,'runtime/profile/campaign-policies.d',id+'.json'),data:JSON.stringify({['BWM:'+id+'|']:{initialBro:manifest.initialBro||null,subsequentVanilla:true}},null,2)+'\n'});
  } else {
    const target=path.join(STATE,'runtime/profile/UMM/BroMaker_Storage','workshop-'+id);
    for(const file of Object.keys(report.artifacts)) if(file.startsWith('package/')) copies.push({source:path.join(dir,'build',file),path:path.join(target,file.slice(8))});
  }
  const installed=await installFiles('project:'+id,copies,{overwrite});
  const receipt={...installed,id,installedAt:new Date().toISOString(),artifacts:report.artifacts,launchName,restartRequired:manifest.kind==='bro'};
  await save(path.join(dir,'records/install.json'),receipt);
  return receipt;
}
export async function uninstallProject(id) {
  const {dir,manifest}=await project(id);
  const receiptFile=path.join(dir,'records/install.json');
  const dependents=[];
  for(const other of (await listProjects()).projects) if(other.id!==id&&await exists(path.join((await project(other.id)).dir,'records/install.json'))&&((other.dependencies||[]).includes(id)||(manifest.kind==='bro'&&other.initialBro===manifest.name)))dependents.push(other.id);
  if(dependents.length)throw Error('Uninstall installed dependent projects first: '+dependents.join(', '));
  const owned=await inventory();
  if(!owned.entries?.some?.(x=>x.owner==='project:'+id) && !(owned.files||[]).some(x=>x.owner==='project:'+id)) {
    // The journal is authoritative; older installs are not silently adopted.
    if(await exists(receiptFile)) throw Error('Legacy installation receipt needs explicit migration; no files were removed');
  }
  const removed=await uninstallOwner('project:'+id);
  await save(path.join(dir,'records/uninstall.json'),{utc:new Date().toISOString(),removed});
  await fs.rm(receiptFile,{force:true});
  return {id,uninstalled:true,sourcesRetained:true,restartRequired:manifest.kind==='bro'};
}
export async function bridgeReady() {
  try { const ready = await json(path.join(STATE, 'runtime/profile/ipc/ready.json')); process.kill(ready.pid, 0); return ready; } catch { return null; }
}
export async function gameControl(action, args = {}) {
  if (action === 'record_start') {
    if (typeof args.name !== 'string' || !/^[0-9a-z_-]{1,64}$/.test(args.name)) throw new Error('Recording name must be 1..64 lowercase letters, digits, underscores or hyphens');
    if (!Number.isInteger(args.milliseconds) || args.milliseconds < 1 || args.milliseconds > 10000) throw new Error('Recording milliseconds must be 1..10000');
    if (args.fps !== undefined && (!Number.isInteger(args.fps) || args.fps < 1 || args.fps > 15)) throw new Error('Recording fps must be 1..15');
  }
  if (action === 'launch') {
    if (await bridgeReady()) return { alreadyRunning: true };
    const game = await requireCompatible();
    await fs.mkdir(path.join(STATE, 'runtime'), { recursive: true });
    const log = await fs.open(path.join(STATE, 'runtime/mcp-launch.log'), 'a');
    // stdio MCP clients commonly strip desktop variables. Recover only the
    // graphical session keys from the user's existing systemd session.
    const launchEnv = { ...workspaceEnv(), BROFORCE_GAME_PATH: game };
    const runtimeDir = launchEnv.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
    if (await exists(runtimeDir)) {
      launchEnv.XDG_RUNTIME_DIR = runtimeDir;
      launchEnv.DBUS_SESSION_BUS_ADDRESS ||= `unix:path=${runtimeDir}/bus`;
      try {
        const session = await run('systemctl', ['--user', 'show-environment'], { env: launchEnv, timeout: 5000 });
        for (const line of session.split('\n')) {
          const split = line.indexOf('='), key = line.slice(0, split);
          if (['DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','PULSE_SERVER','XDG_SESSION_TYPE'].includes(key)) launchEnv[key] ||= line.slice(split + 1);
        }
      } catch { /* A non-systemd desktop can supply these keys in client env. */ }
    }
    if (!launchEnv.DISPLAY && !launchEnv.WAYLAND_DISPLAY) throw new Error('No desktop display found. Set DISPLAY/XAUTHORITY or WAYLAND_DISPLAY/XDG_RUNTIME_DIR in your MCP client env.');
    const child = spawn(path.join(ROOT, 'scripts/run_modded.sh'), [], { cwd: WORKSPACE, env: launchEnv, detached: true, stdio: ['ignore', log.fd, log.fd] }); child.unref(); await log.close();
    child.on('error', e => console.error('Game launch failed:', e.message));
    for (let i = 0; i < 60; i++) { const ready = await bridgeReady(); if (ready) {
      const projects={};for(const m of (await listProjects()).projects) if(m.kind==='bro'){
        const receipt=path.join((await project(m.id)).dir,'records/install.json');if(await exists(receipt))projects[m.id]=(await json(receipt)).artifacts;
      }
      await save(path.join(STATE,'runtime/loaded-artifacts.json'),{session:ready.session,projects});return {ready};
    } await new Promise(r => setTimeout(r, 500)); }
    throw new Error('Bridge not ready after 30 seconds; inspect runtime/mcp-launch.log. Launch outcome may be unknown.');
  }
  if(['start_campaign','load_editor'].includes(action)&&args.name) {
    const matches=(await listProjects()).projects.filter(p=>p.kind==='campaign'&&p.name===args.name);
    if(matches.length>1)throw Error('Campaign name is ambiguous; use its installed launchName');
    if(matches.length===1){const file=path.join((await project(matches[0].id)).dir,'records/install.json');if(await exists(file)){const receipt=await json(file);args={...args,name:receipt.launchName||args.name};}}
  }
  const allowed = ['status', 'start_campaign', 'load_editor', 'play', 'drive', 'hide_ui', 'switch_bro', 'quit', 'record_start', 'record_stop', 'record_status'];
  if (!allowed.includes(action)) throw new Error('Unsupported game action');
  const code = 'import json,sys;sys.path.insert(0,sys.argv[1]);from workshop import request,start_campaign;a=json.loads(sys.argv[3]);print(json.dumps(start_campaign(a["name"]) if sys.argv[2]=="start_campaign" else request(sys.argv[2],**a)))';
  const state = JSON.parse(await run('python3', ['-c', code, path.join(ROOT, 'scripts'), action, JSON.stringify(args)], { timeout: 65000 }));
  if (action === 'status' || action === 'start_campaign') {
    await fs.mkdir(path.join(STATE, 'runtime/mcp-playtests'), { recursive: true });
    await save(path.join(STATE, 'runtime/mcp-playtests/latest.json'), { utc: new Date().toISOString(), action, observed: state });
  }
  return state;
}
