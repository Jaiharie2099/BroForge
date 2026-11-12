import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
let workspace,game,api,life,launch,paths,ownership,hasGame=false;
before(async()=>{
 workspace=await fs.mkdtemp(path.join(os.tmpdir(),'broforge-lifecycle-'));process.env.BROFORCE_WORKSPACE=workspace;delete process.env.BROFORCE_PROJECTS_DIR;
 paths=await import('../src/workspace.js');api=await import('../src/core.js');life=await import('../src/lifecycle.js');launch=await import('../src/launch.js');ownership=await import('../src/ownership.js');
 game=path.join(workspace,'purchased-game');await fs.mkdir(path.join(game,'Broforce_Data/Managed'),{recursive:true});
 const candidates=[process.env.BROFORCE_GAME_PATH,path.join(os.homedir(),'snap/steam/common/.local/share/Steam/steamapps/common/Broforce'),path.join(os.homedir(),'.local/share/Steam/steamapps/common/Broforce')].filter(Boolean);
 for(const candidate of candidates){try{await fs.copyFile(path.join(candidate,'Broforce_Data/Managed/Assembly-CSharp.dll'),path.join(game,'Broforce_Data/Managed/Assembly-CSharp.dll'));hasGame=true;break;}catch{}}
 process.env.BROFORCE_GAME_PATH=game;
 await paths.initializeWorkspace({prepare:false,gamePath:game});
});
after(async()=>{await fs.rm(workspace,{recursive:true,force:true});});
async function built(id){const {dir,manifest}=await api.project(id);const artifacts={};await fs.mkdir(path.join(dir,'build'),{recursive:true});
 const outputs=manifest.kind==='campaign'?{[manifest.name+'.bfc']:'native-editor-fixture',[manifest.name+'.bfg']:'native-play-fixture'}:{'package/Hero.dll':'compiled-bro-fixture','package/bro.json':await fs.readFile(path.join(dir,'bro.json'),'utf8')};
 for(const [file,text]of Object.entries(outputs)){await fs.mkdir(path.dirname(path.join(dir,'build',file)),{recursive:true});await fs.writeFile(path.join(dir,'build',file),text);artifacts[file]=api.hash(text);}
 const report={project:manifest,...await api.buildEnvironment(),assemblyIdentity:manifest.kind==='bro'?{mvid:'fixture-mvid-'+id}:null,sourceHashes:await api.sourceHashes(dir),artifacts};await api.save(path.join(dir,'build/report.json'),report);return report;}

test('workspace init is cwd-independent, local, executable and does not install levels',async()=>{
 const s=await paths.workspaceStatus();assert.equal(s.workspace,workspace);assert.equal(s.stateDirectory,path.join(workspace,'.broforge'));assert.equal(s.projectsDirectory,path.join(workspace,'projects'));
 assert.equal(await api.exists(path.join(game,'Levels')),false);assert.ok((await fs.stat(s.launcher)).mode&0o111);
 const out=await execute(process.execPath,[path.join(paths.CODE_ROOT,'src/cli.js'),'--workspace',workspace,'config'],{cwd:'/'});const config=JSON.parse(out.stdout);assert.equal(config.mcpServers['broforce-workshop'].env.BROFORCE_WORKSPACE,workspace);
 const before=await fs.readFile(path.join(workspace,'broforge.json'),'utf8');await paths.initializeWorkspace({prepare:false});assert.equal(await fs.readFile(path.join(workspace,'broforge.json'),'utf8'),before);
});
test('launch plans bind apply to their concrete contents',async()=>{
 const plan=await launch.configureLaunch();await assert.rejects(launch.configureLaunch({action:'apply',planId:'stale'}),/plan changed/);
 const applied=await launch.configureLaunch({action:'apply',planId:plan.planId});assert.equal(applied.applied,true);
 const file=path.join(workspace,'play-broforce');assert.match(await fs.readFile(file,'utf8'),/--workspace/);
});
test('Steam VDF edit preserves account data, other apps and later unrelated preference changes',()=>{
 const text='"UserLocalConfigStore"\n{\n "Auth" { "274190" "opaque-do-not-touch" }\n "Software"\n {\n  "Valve"\n  {\n   "Steam"\n   {\n    "apps"\n    {\n     "274190"\n     {\n      "LaunchOptions" "MANGOHUD=1 %command% --windowed"\n      "Other" "old"\n     }\n     "999" { "LaunchOptions" "untouched" }\n    }\n   }\n  }\n }\n}\n';
 const original=launch.readSteamSetting(text);assert.equal(original.value,'MANGOHUD=1 %command% --windowed');
 const options=launch.steamLaunchOptions(original);assert.match(options,/MANGOHUD=1/);assert.match(options,/%command% --windowed$/);assert.equal(options.split('%command%').length,2);
 const changed=launch.patchSteamSetting(text,{exists:true,value:options});assert.equal(launch.readSteamSetting(changed).value,options);assert.match(changed,/opaque-do-not-touch/);assert.match(changed,/"999" \{ "LaunchOptions" "untouched" \}/);
 const userChanged=changed.replace('"Other" "old"','"Other" "new"');const restored=launch.patchSteamSetting(userChanged,original);assert.equal(restored,text.replace('"Other" "old"','"Other" "new"'));
 const absent=text.replace('      "LaunchOptions" "MANGOHUD=1 %command% --windowed"\n','');assert.deepEqual(launch.readSteamSetting(absent),{exists:false});assert.equal(launch.patchSteamSetting(launch.patchSteamSetting(absent,{exists:true,value:options}),{exists:false}),absent);
});
test('Steam integration applies/restores just its setting and recovers a pending apply',async()=>{
 const file=path.join(workspace,'steam-localconfig.vdf');
 const original='"UserLocalConfigStore"\n{\n "Software"\n {\n  "Valve"\n  {\n   "Steam"\n   {\n    "apps"\n    {\n     "274190"\n     {\n      "Other" "original"\n     }\n    }\n   }\n  }\n }\n}\n';
 await fs.writeFile(file,original);const seam={assertSteamClosed:async()=>{}};
 let plan=await launch.configureLaunch({mode:'steam',configPath:file});
 // Simulate a supervisor dying after its pending setting receipt but before writing Steam.
 await paths.atomicJson(path.join(paths.STATE,'runtime/steam-integration.json'),{configPath:file,original:{exists:false},installed:plan.launchOptions,status:'pending'});
 plan=await launch.configureLaunch({mode:'steam',configPath:file});await launch.configureLaunch({mode:'steam',action:'apply',configPath:file,planId:plan.planId},seam);
 const installed=await fs.readFile(file,'utf8');assert.equal(launch.readSteamSetting(installed).value,plan.launchOptions);
 await fs.writeFile(file,installed.replace('"Other" "original"','"Other" "user changed"'));
 const status=await launch.configureLaunch({mode:'steam',action:'status'});assert.equal(status.enabled,true);
 await launch.configureLaunch({mode:'steam',action:'remove',planId:status.planId},seam);
 assert.equal(await fs.readFile(file,'utf8'),original.replace('"Other" "original"','"Other" "user changed"'));
 // If integration had to create an app block, remove it only while it is still empty.
 const withoutApp=original.replace(/     "274190"\n     \{[\s\S]*?     \}\n/,'');
 const inserted=launch.patchSteamSetting(withoutApp,{exists:true,value:'test %command%'});
 assert.equal(launch.removeEmptyCreatedApp(launch.patchSteamSetting(inserted,{exists:false})),withoutApp);
});
test('dependencies resolve in install order and cycles/missing bros fail before installing',async()=>{
 await api.createProject({id:'test-bro',kind:'bro',name:'Test Bro'});await api.createProject({id:'test-map',kind:'campaign',name:'Test Map',initialBro:'Test Bro'});
 assert.deepEqual((await life.resolveProjects('test-map')).map(x=>x.id),['test-bro','test-map']);
 await api.createProject({id:'missing-map',kind:'campaign',name:'Missing Map',initialBro:'Missing Bro'});await assert.rejects(life.resolveProjects('missing-map'),/exactly one/);
 await api.createProject({id:'cycle-a',kind:'campaign',name:'Cycle A',dependencies:['cycle-b']});await api.createProject({id:'cycle-b',kind:'campaign',name:'Cycle B',dependencies:['cycle-a']});await assert.rejects(life.resolveProjects('cycle-a'),/cycle/);
});
test('play prepares bro dependencies, uses an editable arena, verifies runtime class and does not claim gameplay testing',async t=>{
 if(!hasGame){t.skip('No supported local assembly fixture');return;}
 for(const name of ['.toolchain/native-campaign-tool/NativeCampaignTool.dll','runtime/profile/UMM/Mods/BroforceWorkshop/WorkshopBridge.dll']){const p=path.join(paths.STATE,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,'readiness-fixture');}
 let campaign;const calls=[];
 const control=async(action,args)=>{calls.push(action);if(action==='start_campaign'){campaign=(await api.listProjects()).projects.find(p=>p.name===args.name);return {map:'BWM:'+campaign.id+'|Test Bro',players:[{character:'WorkshopBros.Workshop_test_bro',assemblyMvid:'fixture-mvid-test-bro'}]};}return {ready:true};};
 const proof=await life.playProject({id:'test-bro'},{control,ready:async()=>null,build:built});assert.equal(proof.stage,'loaded');assert.equal(proof.gameplayTested,false);assert.deepEqual(calls,['launch','start_campaign']);assert.equal(campaign.generatedFor,'test-bro');assert.equal(campaign.initialBro,'Test Bro');
 assert.ok(await api.exists(path.join(game,'Levels',(await api.campaignInstallName(campaign))+'.bfg')));assert.ok(await api.exists(path.join(paths.STATE,'runtime/profile/UMM/BroMaker_Storage/workshop-test-bro/Hero.dll')));
 const paused=await life.playProject({id:'test-bro'},{control:async()=>assert.fail('must not stop or launch without restart authorization'),ready:async()=>({pid:process.pid}),build:built});assert.equal(paused.stage,'installed');assert.equal(paused.restartRequired,true);
 const broReport=(await api.currentBuild('test-bro')).report;
 await paths.atomicJson(path.join(paths.STATE,'runtime/loaded-artifacts.json'),{session:'earlier-session',projects:{'test-bro':broReport.artifacts}});
 const staleSession=await life.playProject({id:'test-bro'},{control:async()=>assert.fail('old session proof must require restart'),ready:async()=>({session:'new-session',pid:process.pid}),build:built});assert.equal(staleSession.restartRequired,true);
 const wrongAssembly=await life.playProject({id:'test-bro'},{control:async action=>action==='start_campaign'?{map:'BWM:'+campaign.id+'|Test Bro',players:[{character:'WorkshopBros.Workshop_test_bro',assemblyMvid:'older-compiled-assembly'}]}:{},ready:async()=>null,build:built});assert.equal(wrongAssembly.stage,'verification-failed');assert.equal(wrongAssembly.checks.mapMatches,true);
 const wrong=await life.playProject({id:'test-bro'},{control:async a=>a==='start_campaign'?{map:'wrong map',players:[{character:'Rambro'}]}:{},ready:async()=>null,build:built});assert.equal(wrong.stage,'verification-failed');
});
test('workspaces with identical campaign names install separately and cannot remove each other',async t=>{
 if(!hasGame){t.skip('No supported local assembly fixture');return;}
 await api.createProject({id:'shared-map',kind:'campaign',name:'Shared Name'});await built('shared-map');const first=await api.installProject('shared-map');
 const second=await fs.mkdtemp(path.join(os.tmpdir(),'broforge-other-workspace-'));
 const coreUrl=new URL('../src/core.js',import.meta.url).href,pathsUrl=new URL('../src/workspace.js',import.meta.url).href;
 const code=`import fs from 'node:fs/promises';import path from 'node:path';const paths=await import(${JSON.stringify(pathsUrl)});await paths.initializeWorkspace({prepare:false,gamePath:${JSON.stringify(game)}});const api=await import(${JSON.stringify(coreUrl)});await api.createProject({id:'shared-map',kind:'campaign',name:'Shared Name'});const {dir,manifest}=await api.project('shared-map');await fs.mkdir(path.join(dir,'build'));const artifacts={};for(const ext of ['bfc','bfg']){const file=manifest.name+'.'+ext;await fs.writeFile(path.join(dir,'build',file),'native-fixture');artifacts[file]=api.hash('native-fixture');}await api.save(path.join(dir,'build/report.json'),{project:manifest,...await api.buildEnvironment(),sourceHashes:await api.sourceHashes(dir),artifacts});console.log(JSON.stringify(await api.installProject('shared-map')));`;
 try {
  const output=await execute(process.execPath,['--input-type=module','-e',code],{cwd:'/',env:{...process.env,BROFORCE_WORKSPACE:second}});const other=JSON.parse(output.stdout);assert.notEqual(first.launchName,other.launchName);
  await api.uninstallProject('shared-map');for(const file of other.files)assert.ok(await api.exists(file.path));
  await execute(process.execPath,['--input-type=module','-e',`const api=await import(${JSON.stringify(coreUrl)});await api.uninstallProject('shared-map');`],{cwd:'/',env:{...process.env,BROFORCE_WORKSPACE:second}});
 }finally{await fs.rm(second,{recursive:true,force:true});}
});
test('project uninstall and full uninstall preserve backups, refuse edits, keep authored sources and remove launchers',async t=>{
 if(!hasGame){t.skip('No supported local assembly fixture');return;}
 await built('test-map');const level=path.join(game,'Levels',(await api.campaignInstallName((await api.project('test-map')).manifest))+'.bfg');await fs.mkdir(path.dirname(level),{recursive:true});await fs.writeFile(level,'user original');
 await assert.rejects(api.installProject('test-map'),/overwrite/);assert.equal(await fs.readFile(level,'utf8'),'user original');
 await api.installProject('test-map',true);
 const policy=path.join(paths.STATE,'runtime/profile/campaign-policies.d/test-map.json');assert.equal(JSON.parse(await fs.readFile(policy,'utf8'))['BWM:test-map|'].initialBro,'Test Bro');
 await assert.rejects(api.uninstallProject('test-bro'),/dependent projects/);
 await fs.writeFile(level,'later user edit');
 const conflict=await life.uninstallWorkspace();assert.ok(conflict.conflicts.some(x=>x.path===level));await assert.rejects(life.uninstallWorkspace({apply:true,planId:conflict.planId}),/blocked/);assert.equal(await fs.readFile(level,'utf8'),'later user edit');assert.ok(await api.exists(path.join(workspace,'play-broforce')));
 await fs.writeFile(level,'native-play-fixture');const removed=await api.uninstallProject('test-map');assert.equal(removed.uninstalled,true);assert.equal(await fs.readFile(level,'utf8'),'user original');
 await api.createProject({id:'legacy-bro',kind:'bro',name:'Legacy Bro'});const legacyRecord=path.join((await api.project('legacy-bro')).dir,'records/install.json');await api.save(legacyRecord,{files:[{path:'/untracked/legacy/location'}]});
 const plan=await life.uninstallWorkspace();assert.ok(plan.untrackedInstallations.some(p=>p.id==='legacy-bro'));const result=await life.uninstallWorkspace({apply:true,planId:plan.planId});assert.equal(result.applied,true);assert.equal(await api.exists(path.join(workspace,'play-broforce')),false);assert.ok(await api.exists(path.join(workspace,'projects/test-bro/src/Hero.cs')));assert.equal((await ownership.inventory()).entries.length,0);assert.ok(await api.exists(legacyRecord));
});
