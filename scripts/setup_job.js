// Runs outside MCP's request lifetime; emits durable progress and local logs.
import path from 'node:path';
import {spawn} from 'node:child_process';
import {captureLocalFiles,inventory} from '../src/ownership.js';
import {CODE_ROOT,WORKSPACE,STATE,workspaceEnv,claimSetupReservation,publishSetupStatus} from '../src/workspace.js';
const jobId=process.env.BROFORCE_SETUP_JOB_ID;
if(!await claimSetupReservation(jobId))throw Error('Setup reservation is missing, stale, or owned by another job');
const startedAt=new Date().toISOString();
await publishSetupStatus(jobId,{status:'running',startedAt});
try {
  const owned=inventory();
  const excluded=owned.entries.filter(e=>e.owner!=='runtime:setup'&&e.path.startsWith(STATE+path.sep)).map(e=>e.path);
  const roots=[path.join(STATE,'.toolchain'),path.join(STATE,'dependencies'),path.join(STATE,'runtime/profile')];
  await captureLocalFiles('runtime:setup',roots,async(registerWriter)=>{
    const args=[path.join(CODE_ROOT,'scripts/setup_workshop.py'),'--workspace',WORKSPACE,...(process.env.BROFORCE_SETUP_SKIP_PROFILE?['--skip-profile']:[])];
    // No writes before the journal durably records this worker's process group.
    const gate='import os,sys; token=sys.stdin.buffer.read(1); sys.exit(2) if token != b"1" else os.execvp("python3",["python3",*sys.argv[1:]])';
    const child=spawn('python3',['-c',gate,...args],{cwd:WORKSPACE,env:workspaceEnv(),detached:true,stdio:['pipe','inherit','inherit']});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
    try {registerWriter(child.pid);child.stdin.end('1');}
    catch(e){child.stdin.end();await done;throw e;}
    const code=await done;
    const alive=()=>{try{process.kill(-child.pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
    // Terminate only orphaned workers from this setup's own process group.
    if(alive()){process.kill(-child.pid,'SIGTERM');for(let i=0;i<40&&alive();i++)await new Promise(r=>setTimeout(r,50));}
    if(alive()){process.kill(-child.pid,'SIGKILL');for(let i=0;i<40&&alive();i++)await new Promise(r=>setTimeout(r,50));}
    if(code!==0)throw Error('Setup exited with code '+code);
  },{excludePaths:[...excluded,path.join(STATE,'runtime/profile/ipc'),path.join(STATE,'runtime/profile/UMM/Config'),path.join(STATE,'runtime/profile/campaign-policies.json')],excludeNames:['Log.txt','Player.log','Settings.xml','Params.xml']});
  const {writeManagedLaunchers}=await import('../src/launch.js');
  await writeManagedLaunchers();
  await publishSetupStatus(jobId,{status:'ready',startedAt,finishedAt:new Date().toISOString()});
}catch(e){await publishSetupStatus(jobId,{status:'failed',startedAt,finishedAt:new Date().toISOString(),error:e.message});console.error(e.message);process.exitCode=1;}
