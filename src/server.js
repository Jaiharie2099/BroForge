import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, project, within, exists, json, run, save, hash, gamePath, inspectInstallation, listProjects, createProject, readProject, writeProjectFile, buildProject, installProject, uninstallProject, gameControl } from './core.js';
import { startPreview } from './preview.js';
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const server = new McpServer({ name: 'broforce-workshop', version: '0.1.0' }, { instructions: 'Linux Broforce authoring. Read broforce://guide and the relevant skill resource first. Campaigns are built with the installed game native serializers. Preview is schematic; runtime testing is separate. Mutations operate on local projects. New bro DLLs require a game restart. All stdout is MCP protocol.' });
let preview, queue = Promise.resolve();
function tool(name, description, schema, fn, readOnly = false) {
  server.registerTool(name, { description, inputSchema: z.object(schema), annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false } }, async args => {
    const call = async () => { try { const output = await fn(args); return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output }; } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; } };
    if (readOnly) return call();
    const next = queue.then(call); queue = next.catch(() => {}); return next;
  });
}
tool('inspect_installation', 'Inspect Linux game compatibility, toolchain, mod profile, and live bridge. No changes.', {}, inspectInstallation, true);
tool('list_projects', 'List editable campaign and bro projects in the local library.', {}, listProjects, true);
tool('create_project', 'Create a new campaign from the proven short Hell template, or a new rifle bro inheriting the BroMaker Rambro adapter. Never overwrites. Edit generated sources to create original content.', { id, kind: z.enum(['campaign','bro']), name: z.string().min(1).max(80), author: z.string().max(100).optional(), initialBro: z.string().min(1).max(100).optional() }, createProject);
tool('read_project', 'Inspect project sources and file list; optionally read a text file. Paths are project-relative.', { id, file: z.string().optional() }, a => readProject(a.id, a.file), true);
tool('write_project_file', 'Write editable JSON, C#, credits, or other text within a project. Does not edit managed manifests/build records. Rebuild after edits.', { id, file: z.string(), text: z.string().max(2_000_000) }, a => writeProjectFile(a.id,a.file,a.text));
tool('import_bro_asset', 'Copy an existing locally generated/reference PNG or WAV into a bro project assets directory. Your agent supplies image generation separately. Record its provenance in CREDITS.md.', { id, sourcePath: z.string(), destination: z.string(), overwrite: z.boolean().default(false) }, async a => {
  const {dir,manifest}=await project(a.id); if(manifest.kind!=='bro') throw Error('Expected a bro project');
  const extension=path.extname(a.destination).toLowerCase(); if(!['.png','.wav'].includes(extension)) throw Error('Only PNG or WAV');
  const source=path.resolve(a.sourcePath), bytes=await fs.readFile(source); if(bytes.length>32*1024*1024) throw Error('Asset exceeds 32 MB');
  if(extension==='.png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG signature');
  if(extension==='.wav'&&(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'))throw Error('Invalid WAV signature');
  const dest=await within(path.join(dir,'assets'),a.destination); if(await exists(dest)&&!a.overwrite)throw Error('Asset exists; set overwrite=true to replace');
  await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);return {file:dest,sha256:hash(bytes),rebuildRequired:true};
});
tool('build_project', 'Build and validate a campaign through real Campaign/MapData constructors and native .bfc/.bfg serializers, or compile a bro DLL against Unity Mono game references. Saves hash-bound reports. Does not install or claim playtesting.', { id }, a => buildProject(a.id));
tool('install_project', 'Install a current build into local Custom Campaigns or the separate BroMaker profile. Refuses changed sources/artifacts and conflicting files unless overwrite=true; differing files are backed up. New bro DLLs require restarting the Workshop game.', { id, overwrite: z.boolean().default(false) }, a => installProject(a.id,a.overwrite));
tool('uninstall_project', 'Remove unchanged files from this project installation and restore recorded backups. Keeps editable sources and refuses files changed outside the installer.', { id }, a => uninstallProject(a.id));
tool('configure_project', 'Update project author/version or campaign initialBro. Does not rename the project or C# preset. Source metadata changes require rebuilding and reinstalling.', { id, author:z.string().max(100).optional(), version:z.string().regex(/^\d+\.\d+\.\d+$/).optional(), initialBro:z.string().max(100).nullable().optional() }, async a=>{const {dir,manifest}=await project(a.id);if(a.initialBro!==undefined&&manifest.kind!=='campaign')throw Error('initialBro is a campaign setting');for(const key of ['author','version','initialBro'])if(a[key]!==undefined)manifest[key]=a[key];await save(path.join(dir,'project.json'),manifest);return {...manifest,rebuildRequired:true};});
tool('preview_project', 'Start a loopback read-only preview website; return a zoomable campaign schematic or bro asset/animation page. Not a Unity render.', { id: id.optional() }, async a => { if(a.id) await project(a.id); preview ||= await startPreview(); return {url:preview.url+(a.id?'/#'+a.id:''),mode:'schematic-and-assets',gameRendered:false}; });
tool('game_control', 'Control the separate Workshop game profile. launch starts it; start_campaign loads an installed campaign; status observes runtime classes/geometry. drive is bounded input for one local player. switch_bro requires the bro DLL already loaded; quit closes this game.', { action:z.enum(['launch','status','start_campaign','load_editor','play','drive','hide_ui','switch_bro','quit']), name:z.string().max(80).optional(), milliseconds:z.number().int().min(1).max(10000).optional(), right:z.boolean().optional(),left:z.boolean().optional(),fire:z.boolean().optional(),jump:z.boolean().optional(), projectId:id.optional() }, async ({action,projectId,...args})=>{
  if(['start_campaign','load_editor','switch_bro'].includes(action)&&!args.name)throw Error('name is required for this action');
  const observed=await gameControl(action,args);
  if(projectId){ const {dir}=await project(projectId); const receipt=await json(path.join(dir,'records/install.json'));for(const f of receipt.files)if(hash(await fs.readFile(f.path))!==f.sha256)throw Error('Installed files differ from recorded installation; observation is not bound to that build');await save(path.join(dir,'records/observed-'+action+'.json'),{utc:new Date().toISOString(),installedArtifacts:receipt.artifacts,action,observed,scope:'Observation only; not an automatic gameplay success verdict'}); }
  return observed;
});
tool('inspect_native_catalog', 'Read supported map settings, terrain/object/trigger/action enums directly from the installed assembly. Select a section to keep responses small.', { section:z.enum(['MapData','DoodadInfo','TriggerInfo','LevelEventActionInfo']).default('DoodadInfo'), field:z.string().optional() }, async a=>{
  const game=await gamePath();const catalog=JSON.parse(await run(path.join(ROOT,'.toolchain/dotnet/dotnet'),[path.join(ROOT,'.toolchain/native-campaign-tool/NativeCampaignTool.dll'),'--managed',path.join(game,'Broforce_Data/Managed'),'--catalog','true']));const fields=catalog.fields[a.section];if(a.field&&!fields[a.field])throw Error('Unknown field');return {gameAssemblySha256:catalog.gameAssemblySha256,section:a.section,fields:a.field?{[a.field]:fields[a.field]}:fields};
},true);
for(const [name,file] of Object.entries({guide:'docs/mcp-guide.md','skill-create-campaign':'skills/broforce-create-campaign/SKILL.md','skill-create-bro':'skills/broforce-create-bro/SKILL.md','skill-bro-art':'skills/broforce-bro-art/SKILL.md','campaign-design':'templates/campaigns/high-ground.json','bro-assets':'skills/broforce-bro-art/references/assets.md'})) {
  const uri='broforce://'+name;
  server.registerResource(name,uri,{description:'Broforce authoring reference: '+name,mimeType:file.endsWith('.json')?'application/json':'text/markdown'},async()=>({contents:[{uri,mimeType:file.endsWith('.json')?'application/json':'text/markdown',text:await fs.readFile(path.join(ROOT,file),'utf8')}]}));
}
for(const kind of ['campaign','bro']) server.registerPrompt('create-'+kind,{description:'Guided Broforce '+kind+' authoring workflow',argsSchema:z.object({brief:z.string()})},async({brief})=>({messages:[{role:'user',content:{type:'text',text:`Read broforce://guide and broforce://skill-create-${kind}, then create this ${kind}: ${brief}. Use the MCP tools to build and preview it; follow my requested scope for installation/playtesting.`}}]}));
export async function serve(){ const transport=new StdioServerTransport();await server.connect(transport);const close=async()=>{if(preview)preview.server.close();await server.close();};process.once('SIGTERM',()=>close().finally(()=>process.exit(0)));process.once('SIGINT',()=>close().finally(()=>process.exit(0)));server.server.onclose=()=>{if(preview)preview.server.close();}; }
