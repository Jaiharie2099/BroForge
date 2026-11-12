import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const CODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = path.resolve(process.env.BROFORCE_WORKSPACE || process.cwd());
export const WORKSPACE = syncFs.existsSync(selected) ? syncFs.realpathSync(selected) : selected;
export const STATE = path.join(WORKSPACE, '.broforge');
export const PROJECTS = path.resolve(process.env.BROFORCE_PROJECTS_DIR || path.join(WORKSPACE, 'projects'));
export const workspaceEnv = () => ({ ...process.env, BROFORCE_WORKSPACE: WORKSPACE, BROFORCE_WORKSHOP_ROOT: STATE, PYTHONDONTWRITEBYTECODE: '1',
  DOTNET_CLI_HOME: path.join(STATE,'.toolchain/dotnet-home'), NUGET_PACKAGES: path.join(STATE,'.toolchain/nuget/packages'),
  NUGET_HTTP_CACHE_PATH:path.join(STATE,'.toolchain/nuget/http-cache'), NUGET_PLUGINS_CACHE_PATH:path.join(STATE,'.toolchain/nuget/plugins-cache'),
  DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER:'1', MSBUILDDISABLENODEREUSE:'1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1', DOTNET_CLI_TELEMETRY_OPTOUT:'1' });

const setupFile=path.join(STATE,'runtime/setup.json');
const reservationFile=path.join(STATE,'runtime/setup-reservation.json');
const reservationLock=path.join(STATE,'runtime/setup-reservation.lock');
const alive=pid=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
function readSetupJson(file) {
  let fd;
  try {fd=syncFs.openSync(file,syncFs.constants.O_RDONLY|syncFs.constants.O_NOFOLLOW);return JSON.parse(syncFs.readFileSync(fd,'utf8'));}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
  finally{if(fd!==undefined)syncFs.closeSync(fd);}
}
function syncSetupDirectory() {
  const fd=syncFs.openSync(path.dirname(reservationFile),'r');
  try{syncFs.fsyncSync(fd);}finally{syncFs.closeSync(fd);}
}
function durableSetupJson(file,value,exclusive=false) {
  const target=exclusive?file:file+'.'+randomUUID()+'.tmp';
  const fd=syncFs.openSync(target,'wx',0o600);
  try{syncFs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');syncFs.fsyncSync(fd);}
  finally{syncFs.closeSync(fd);}
  if(!exclusive)syncFs.renameSync(target,file);
  syncSetupDirectory();
}
// Only short, synchronous reservation/status transactions run under this guard.
// A guard left by a crash fails closed; never steal a lock from an uncertain owner.
async function withSetupReservation(action) {
  await assertLocalDirectory(path.dirname(reservationFile));
  await fs.mkdir(path.dirname(reservationFile),{recursive:true});
  const deadline=Date.now()+5000;
  for(;;) {
    let fd;
    try {fd=syncFs.openSync(reservationLock,'wx',0o600);}
    catch(e){
      if(e.code!=='EEXIST')throw e;
      if(Date.now()>=deadline)throw Error('Setup reservation is busy. If no initializer or supervisor remains, inspect '+reservationLock+' before removing the stale lock.');
      await new Promise(resolve=>setTimeout(resolve,20));continue;
    }
    try {
      syncFs.writeFileSync(fd,JSON.stringify({pid:process.pid}));syncFs.fsyncSync(fd);
      return action();
    } finally {syncFs.closeSync(fd);syncFs.unlinkSync(reservationLock);syncSetupDirectory();}
  }
}
function liveSetupWriter() {
  const pending=readSetupJson(path.join(STATE,'runtime/ownership.json'))?.pending;
  const pgid=pending?.owner==='runtime:setup' && pending.capture ? pending.writerProcessGroup : null;
  if(!Number.isSafeInteger(pgid)||pgid<=1||pgid>0x7fffffff)return null;
  try{process.kill(-pgid,0);return pgid;}catch(e){if(e.code==='ESRCH')return null;if(e.code==='EPERM')return pgid;throw e;}
}
async function reserveSetup() {
  return withSetupReservation(()=>{
    const current=readSetupJson(reservationFile);
    if(current && ['reserved','running'].includes(current.phase) && alive(current.pid))return null;
    // Respect supervisors started before the reservation protocol was introduced.
    const status=readSetupJson(setupFile);
    if(status?.status==='running' && alive(status.pid))return null;
    if(liveSetupWriter())return null;
    const reservation={jobId:randomUUID(),pid:process.pid,phase:'reserved',createdAt:new Date().toISOString()};
    durableSetupJson(reservationFile,reservation,!current);
    return reservation;
  });
}
export async function claimSetupReservation(jobId) {
  if(!jobId)return false;
  return withSetupReservation(()=>{
    const current=readSetupJson(reservationFile);
    if(current?.jobId!==jobId || !['reserved','running'].includes(current.phase))return false;
    if(current.phase==='running' && current.pid!==process.pid)return false;
    durableSetupJson(reservationFile,{...current,pid:process.pid,phase:'running'});
    return true;
  });
}
export async function publishSetupStatus(jobId,value) {
  if(!jobId)return false;
  return withSetupReservation(()=>{
    const current=readSetupJson(reservationFile);
    if(current?.jobId!==jobId || current.pid!==process.pid || current.phase!=='running')return false;
    if(!['running','ready','failed','interrupted'].includes(value.status))throw Error('Invalid setup status');
    durableSetupJson(setupFile,{...value,jobId,pid:process.pid});
    if(value.status!=='running')durableSetupJson(reservationFile,{...current,phase:value.status});
    return true;
  });
}
async function finishReservation(jobId,error) {
  return withSetupReservation(()=>{
    const current=readSetupJson(reservationFile);
    if(current?.jobId!==jobId || current.phase!=='reserved' || current.pid!==process.pid)return;
    if(error)durableSetupJson(setupFile,{jobId,pid:process.pid,status:'failed',error:error.message,finishedAt:new Date().toISOString()});
    durableSetupJson(reservationFile,{...current,phase:error?'failed':'idle'});
  });
}

export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  try { await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}); await fs.rename(temp,file); }
  finally { await fs.rm(temp,{force:true}); }
}
export async function assertLocalDirectory(dir) {
  const relative=path.relative(WORKSPACE,dir);
  if (relative.startsWith('..'+path.sep) || relative==='..' || path.isAbsolute(relative)) throw Error('Managed state and projects must stay inside the selected workspace');
  let current=WORKSPACE;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try { if((await fs.lstat(current)).isSymbolicLink()) throw Error('Workspace directory cannot be a symlink: '+current); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
}
export async function workspaceManifest(required=true) {
  await assertLocalDirectory(STATE); await assertLocalDirectory(PROJECTS);
  const file=path.join(WORKSPACE,'broforge.json');
  try {
    if((await fs.lstat(file)).isSymbolicLink()) throw Error('Workspace manifest cannot be a symlink');
    const value=JSON.parse(await fs.readFile(file,'utf8'));
    if(value.schemaVersion!==1 || !value.workspaceId) throw Error('Unsupported workspace manifest');
    return value;
  } catch(e) { if(e.code!=='ENOENT'||required) throw e.code==='ENOENT'?Error('Initialize this workspace first with initialize_workspace or CLI setup'):e; return null; }
}
export async function workspaceStatus() {
  const manifest=await workspaceManifest(false);
  let setup=null;
  try { setup=JSON.parse(await fs.readFile(path.join(STATE,'runtime/setup.json'),'utf8')); }catch(e){if(e.code!=='ENOENT')throw e;}
  const reservation=readSetupJson(reservationFile);
  if(reservation && ['reserved','running'].includes(reservation.phase) &&
      (setup?.jobId!==reservation.jobId || setup?.status!=='running')) {
    setup={jobId:reservation.jobId,pid:reservation.pid,status:reservation.phase==='reserved'?'starting':'running',startedAt:reservation.createdAt};
  }
  if(['running','starting'].includes(setup?.status) && !alive(setup.pid)) {
    setup={...setup,status:'interrupted',message:'Setup process is no longer running; inspect setup.log and rerun initialize_workspace.'};
  }
  const writer=liveSetupWriter();
  if(writer && !(['running','starting'].includes(setup?.status) && alive(setup.pid))) {
    setup={...setup,status:'interrupted',writerAlive:true,writerProcessGroup:writer,
      message:'Setup supervisor is no longer running, but its writer process group is still alive. Wait for it to exit before repairing setup or recovering ownership.'};
  }
  const present=async file=>fs.access(file).then(()=>true,()=>false);
  return {workspace:WORKSPACE,stateDirectory:STATE,projectsDirectory:PROJECTS,initialized:!!manifest,manifest,setup,
    readiness:{toolchain:await present(path.join(STATE,'.toolchain/native-campaign-tool/NativeCampaignTool.dll')),profile:await present(path.join(STATE,'runtime/profile/UMM/Mods/BroforceWorkshop/WorkshopBridge.dll'))},
    launcher:path.join(WORKSPACE,'play-broforce'),externalWrites:'Only explicit content installation, skill export, or Steam integration'};
}
export async function initializeWorkspace({gamePath,prepare=true,wait=false,repair=false}={}) {
  await fs.mkdir(WORKSPACE,{recursive:true});
  const reservation=await reserveSetup();
  if(!reservation) {
    if(wait) {
      for(;;) {
        const current=await workspaceStatus();
        if(!['starting','running'].includes(current.setup?.status)) {
          if(current.setup?.status==='failed'||current.setup?.status==='interrupted')throw Error('Setup failed; inspect '+path.join(STATE,'runtime/setup.log'));
          return current;
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }
    return workspaceStatus();
  }
  let handedOff=false;
  try {
    let manifest=await workspaceManifest(false);
    if(manifest?.gamePath && gamePath && path.resolve(gamePath)!==manifest.gamePath)throw Error('Workspace is already bound to another game installation');
    manifest ||= {schemaVersion:1,workspaceId:randomUUID(),createdAt:new Date().toISOString()};
    if(gamePath)manifest.gamePath=await fs.realpath(path.resolve(gamePath));
    await atomicJson(path.join(WORKSPACE,'broforge.json'),manifest);
    await fs.mkdir(PROJECTS,{recursive:true});
    const current=await workspaceStatus();
    const {writeManagedLaunchers}=await import('./launch.js');
    await writeManagedLaunchers();
    const previous=readSetupJson(setupFile);
    if(prepare && !(!repair && previous?.status==='ready' && current.readiness.toolchain && current.readiness.profile)) {
      const log=await fs.open(path.join(STATE,'runtime/setup.log'),'a',0o600);
      let child,exit;
      try {
        child=spawn(process.execPath,[path.join(CODE_ROOT,'scripts/setup_job.js')],{
          cwd:WORKSPACE,env:{...workspaceEnv(),BROFORCE_SETUP_JOB_ID:reservation.jobId,...(manifest.gamePath?{BROFORCE_GAME_PATH:manifest.gamePath}:{})},
          detached:true,stdio:['ignore',log.fd,log.fd]});
        // Register exit before awaiting spawn; a fast failure cannot be missed.
        exit=new Promise(resolve=>{child.once('exit',code=>resolve(code??1));child.once('error',()=>resolve(1));});
        await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
        await withSetupReservation(()=>{
          const current=readSetupJson(reservationFile);
          if(current?.jobId===reservation.jobId && current.phase==='reserved') {
            durableSetupJson(reservationFile,{...current,pid:child.pid});
          }
        });
        handedOff=true;
      }finally{await log.close();}
      if(wait) {
        const code=await exit;
        if(code!==0)throw Error('Setup failed; inspect '+path.join(STATE,'runtime/setup.log'));
      }else{
        child.unref();
        for(let i=0;i<20;i++) {
          const current=readSetupJson(reservationFile);
          if(current?.jobId!==reservation.jobId || current.phase!=='reserved')break;
          await new Promise(resolve=>setTimeout(resolve,25));
        }
      }
    }
    if(!handedOff)await finishReservation(reservation.jobId);
    return workspaceStatus();
  }catch(error){
    await finishReservation(reservation.jobId,error);
    throw error;
  }
}
