import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CODE_ROOT,STATE,WORKSPACE,workspaceManifest,workspaceStatus,atomicJson} from './workspace.js';
import {installFiles,inventory,planRemoval,applyRemoval,pruneTransactionBackups} from './ownership.js';
import {steamRemovalPlan,removeSteamIntegration} from './launch.js';
import {project,listProjects,createProject,currentBuild,buildProject,installProject,gameControl,bridgeReady,exists,json,save,files} from './core.js';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

export async function installSkills(directory) {
 await workspaceManifest();const target=path.resolve(directory),copies=[];
 for(const skill of await fs.readdir(path.join(CODE_ROOT,'skills'),{withFileTypes:true})) if(skill.isDirectory()) {
  for(const file of await files(path.join(CODE_ROOT,'skills',skill.name)))copies.push({source:path.join(CODE_ROOT,'skills',skill.name,file),path:path.join(target,skill.name,file)});
 }
 return installFiles('skills:export',copies);
}
export async function resolveProjects(id) {
 const all=(await listProjects()).projects,byId=new Map(all.map(p=>[p.id,p])),result=[],visiting=new Set(),seen=new Set();
 async function visit(key){
  if(visiting.has(key))throw Error('Project dependency cycle at '+key);if(seen.has(key))return;
  const m=byId.get(key);if(!m)throw Error('Missing project dependency: '+key);visiting.add(key);
  const deps=[...(m.dependencies||[])];
  if(m.kind==='campaign'&&m.initialBro){const matches=all.filter(p=>p.kind==='bro'&&p.name===m.initialBro);if(matches.length!==1)throw Error('initialBro must match exactly one local bro project: '+m.initialBro);deps.push(matches[0].id);}
  for(const dep of new Set(deps))await visit(dep);visiting.delete(key);seen.add(key);result.push(m);
 }
 await visit(id);return result;
}
async function playTarget(id) {
 const {manifest}=await project(id);if(manifest.kind==='campaign')return manifest;
 const arenaId=('play-'+id).slice(0,52)+'-'+digest(id).slice(0,8);
 let arena;
 try {arena=(await project(arenaId)).manifest;if(arena.generatedFor!==id)throw Error('Playtest project ID is already in use: '+arenaId);}
 catch(e){if(e.code!=='ENOENT')throw e;await createProject({id:arenaId,kind:'campaign',name:(manifest.name+' Playtest').slice(0,80),author:'BroForge',initialBro:manifest.name,dependencies:[id]});arena=(await project(arenaId)).manifest;arena.generatedFor=id;await save(path.join((await project(arenaId)).dir,'project.json'),arena);}
 if(arena.initialBro!==manifest.name){arena.initialBro=manifest.name;await save(path.join((await project(arenaId)).dir,'project.json'),arena);}
 return arena;
}
export async function playProject({id,restart=false,overwrite=false}={}, {control=gameControl,ready:runtimeReady=bridgeReady,build:compile=buildProject}={}) {
 await workspaceManifest();const workspace=await workspaceStatus();
 if(!workspace.readiness.toolchain||!workspace.readiness.profile)return {stage:'setup-required',workspace:WORKSPACE,message:'Run initialize_workspace, then poll workspace_status until setup is ready.'};
 const target=await playTarget(id),order=await resolveProjects(target.id),installed=[];
 for(const m of order){let built;try{built=await currentBuild(m.id);}catch{await compile(m.id);built=await currentBuild(m.id);}const receipt=await installProject(m.id,overwrite);installed.push({id:m.id,kind:m.kind,artifacts:built.report.artifacts,assemblyIdentity:built.report.assemblyIdentity,receipt});}
 const ready=await runtimeReady();let loaded={};try{loaded=await json(path.join(STATE,'runtime/loaded-artifacts.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const changed=installed.filter(p=>p.kind==='bro'&&(loaded.session!==ready?.session||JSON.stringify(loaded.projects?.[p.id])!==JSON.stringify(p.artifacts)));
 if(ready&&changed.length){
  if(!restart)return {stage:'installed',restartRequired:true,projects:installed.map(p=>p.id),message:'The running profile has older or unverified character assets. Call play_project with restart=true to restart this managed game.'};
  await control('quit');
  let closed=false;for(let i=0;i<100;i++){try{process.kill(ready.pid,0);}catch{closed=true;break;}await new Promise(r=>setTimeout(r,100));}if(!closed)throw Error('Managed game is still closing; retry after it exits');
 }
 await control('launch');const observed=await control('start_campaign',{name:target.name});
 const mapMatches=observed.map?.startsWith('BWM:'+target.id+'|');
 const bro=target.initialBro?order.find(p=>p.kind==='bro'&&p.name===target.initialBro):null;
 const expectedIdentity=bro?installed.find(p=>p.id===bro.id)?.assemblyIdentity:null;
 const characterMatches=!bro||observed.players?.some(p=>(p.character==='WorkshopBros.'+bro.preset||p.character===bro.preset)&&expectedIdentity?.mvid&&p.assemblyMvid===expectedIdentity.mvid);
 const proof={stage:mapMatches&&characterMatches?'loaded':'verification-failed',projectId:id,campaignId:target.id,projects:installed.map(p=>({id:p.id,artifacts:p.artifacts})),observed,checks:{mapMatches,characterMatches},gameplayTested:false,scope:'Confirms runtime map and initial bro; does not prove mechanics, artwork or level completion.',recordedAt:new Date().toISOString()};
 await save(path.join((await project(id)).dir,'records/play.json'),proof);return proof;
}

export async function uninstallWorkspace({apply=false,planId,includeRuntime=true}={}) {
 await workspaceManifest();
 const owned=await inventory();
 const entries=owned.entries||owned.files||[];
 const owners=[...new Set(entries.map(e=>e.owner))].filter(o=>includeRuntime||o!=='runtime:setup');
 const removal=await planRemoval({owners});const steam=await steamRemovalPlan();
 const combined={files:removal,steam,includeRuntime};const token=digest(combined);
 const projects=(await listProjects()).projects,untrackedInstallations=[];
 for(const p of projects){const record=path.join((await project(p.id)).dir,'records/install.json');if(await exists(record)&&!owners.includes('project:'+p.id))untrackedInstallations.push({id:p.id,record,message:'Legacy or untracked installation retained; migration is required before automatic removal'});}
 const fullPlan={...combined,planId:token,untrackedInstallations};
 const planFile=path.join(STATE,'runtime/uninstall-plan.json');await atomicJson(planFile,fullPlan);
 const allConflicts=[...(removal.conflicts||[]),...steam.conflicts];
 const summary={planId:token,workspace:WORKSPACE,includeRuntime,sourcesRetained:true,planFile,operationCount:removal.operations.length,operations:removal.operations.slice(0,100),operationsTruncated:removal.operations.length>100,conflictCount:allConflicts.length,conflicts:allConflicts.slice(0,100),untrackedInstallations,steamOperations:steam.operations};
 if(!apply)return {...summary,applied:false};
 if(planId!==token)throw Error('Uninstall plan changed; request a fresh dry run');
 if(summary.conflicts.length)throw Error('Uninstall blocked by changed files or settings; no changes were removed');
 if(await bridgeReady())throw Error('Close this workspace’s running game with game_control quit before uninstalling');
 // Restore external Steam settings before deleting local launchers; preserves
 // unrelated Steam preferences changed after integration.
 await removeSteamIntegration(steam);
 const result=await applyRemoval({owners,planId:removal.planId});
 const backupCleanup=pruneTransactionBackups();
 for(const p of projects.filter(p=>owners.includes('project:'+p.id))){const dir=(await project(p.id)).dir;const install=path.join(dir,'records/install.json');if(await exists(install)){await save(path.join(dir,'records/uninstall-workspace.json'),{removedAt:new Date().toISOString(),planId:token});await fs.rm(install,{force:true});}}
 if(includeRuntime)await atomicJson(path.join(STATE,'runtime/setup.json'),{status:'removed',removedAt:new Date().toISOString()});
 await atomicJson(path.join(STATE,'runtime/uninstall-last.json'),{removedAt:new Date().toISOString(),planId:token,result,sourcesRetained:true});
 return {...summary,applied:true,result,backupCleanup};
}
