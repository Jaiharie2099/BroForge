import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
let workspace,api;
before(async()=>{
  workspace=await fs.mkdtemp(path.join(os.tmpdir(),'broforge-reservation-tests-'));
  process.env.BROFORCE_WORKSPACE=workspace;
  api=await import('../src/workspace.js');
});
after(async()=>{await fs.rm(workspace,{recursive:true,force:true});});
const reservationFile=()=>path.join(api.STATE,'runtime/setup-reservation.json');
const statusFile=()=>path.join(api.STATE,'runtime/setup.json');
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));

// Fake the supervisor boundary: no Python, downloads, builds, or game process.
function fakeSupervisor(t,{finish=true,failSpawn=false}={}) {
  const children=[];
  t.mock.method(childProcess,'spawn',(_exe,_args,options)=>{
    const child=new EventEmitter();child.pid=process.pid;child.unref=()=>{};
    const jobId=options.env.BROFORCE_SETUP_JOB_ID;
    assert.ok(jobId);assert.equal(options.detached,true);
    children.push({child,jobId,options});
    queueMicrotask(()=>child.emit(failSpawn?'error':'spawn',failSpawn?Error('fake spawn failure'):undefined));
    if(!failSpawn)setTimeout(async()=>{
      try {
        assert.equal(await api.claimSetupReservation(jobId),true);
        assert.equal(await api.publishSetupStatus(jobId,{status:'running'}),true);
        if(finish)setTimeout(async()=>{
          try{await api.publishSetupStatus(jobId,{status:'ready'});child.emit('exit',0);}
          catch(error){child.emit('error',error);}
        },30);
      }catch(error){child.emit('error',error);}
    },10);
    return child;
  });
  syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  return children;
}

test('concurrent initialization reserves one supervisor and one manifest identity',async t=>{
  const children=fakeSupervisor(t);
  const results=await Promise.all(Array.from({length:12},()=>api.initializeWorkspace({wait:true})));
  assert.equal(children.length,1);
  assert.equal((await json(statusFile())).jobId,children[0].jobId);
  assert.equal((await json(statusFile())).status,'ready');
  assert.equal(new Set(results.filter(r=>r.manifest).map(r=>r.manifest.workspaceId)).size,1);
  assert.equal((await json(reservationFile())).phase,'ready');
});

test('ready fast path skips spawn; repair forces one new supervisor',async t=>{
  for(const name of ['.toolchain/native-campaign-tool/NativeCampaignTool.dll','runtime/profile/UMM/Mods/BroforceWorkshop/WorkshopBridge.dll']) {
    const file=path.join(api.STATE,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture');
  }
  const children=fakeSupervisor(t);
  const previous=(await json(statusFile())).jobId;
  await api.initializeWorkspace({wait:true});
  assert.equal(children.length,0);
  assert.equal((await json(statusFile())).jobId,previous);
  await Promise.all(Array.from({length:8},()=>api.initializeWorkspace({repair:true,wait:true})));
  assert.equal(children.length,1);
  assert.notEqual((await json(statusFile())).jobId,previous);
});

test('only matching job and supervisor PID can publish; terminal writes are fenced',async()=>{
  const jobId='ownership-fixture';
  await api.atomicJson(reservationFile(),{jobId,pid:process.pid,phase:'reserved',createdAt:new Date().toISOString()});
  const before=await fs.readFile(statusFile(),'utf8');
  assert.equal(await api.claimSetupReservation('stale-job'),false);
  assert.equal(await api.publishSetupStatus(jobId,{status:'failed'}),false);
  assert.equal(await api.claimSetupReservation(jobId),true);
  assert.equal(await api.publishSetupStatus('stale-job',{status:'failed'}),false);
  assert.equal(await fs.readFile(statusFile(),'utf8'),before);
  await api.atomicJson(reservationFile(),{jobId,pid:2147483647,phase:'running'});
  assert.equal(await api.publishSetupStatus(jobId,{status:'failed'}),false);
  await api.atomicJson(reservationFile(),{jobId,pid:process.pid,phase:'running'});
  assert.equal(await api.publishSetupStatus(jobId,{status:'ready',pid:999,jobId:'spoof'}),true);
  assert.equal((await json(statusFile())).pid,process.pid);
  assert.equal((await json(statusFile())).jobId,jobId);
  assert.equal(await api.publishSetupStatus(jobId,{status:'failed'}),false);
});

test('legacy live setup is respected without creating a competing reservation',async t=>{
  await api.atomicJson(statusFile(),{status:'running',pid:process.pid});
  await fs.rm(reservationFile());
  const children=fakeSupervisor(t);
  assert.equal((await api.initializeWorkspace({repair:true})).setup.status,'running');
  assert.equal(children.length,0);
  await assert.rejects(fs.access(reservationFile()),{code:'ENOENT'});
  await api.atomicJson(statusFile(),{status:'ready',pid:process.pid});
});

test('spawn failure releases reservation and allows a later retry',async t=>{
  fakeSupervisor(t,{failSpawn:true});
  await assert.rejects(api.initializeWorkspace({repair:true}),/fake spawn failure/);
  assert.equal((await json(reservationFile())).phase,'failed');
  assert.equal((await json(statusFile())).status,'failed');
});

test('interrupted supervisor with a live captured writer blocks repair',async t=>{
  const ledgerFile=path.join(api.STATE,'runtime/ownership.json');
  const original=await fs.readFile(ledgerFile);
  await api.atomicJson(statusFile(),{status:'running',pid:2147483647});
  await fs.rm(reservationFile(),{force:true});
  const ledger=JSON.parse(original);
  ledger.pending={capture:true,owner:'runtime:setup',writerProcessGroup:4321};
  await api.atomicJson(ledgerFile,ledger);
  const realKill=process.kill;
  t.mock.method(process,'kill',(pid,signal)=>{
    if(pid===-4321)return true;
    return realKill(pid,signal);
  });
  const children=fakeSupervisor(t);
  try {
    const status=await api.workspaceStatus();
    assert.equal(status.setup.status,'interrupted');
    assert.equal(status.setup.writerAlive,true);
    assert.equal(status.setup.writerProcessGroup,4321);
    await api.initializeWorkspace({repair:true});
    assert.equal(children.length,0);
  }finally{await fs.writeFile(ledgerFile,original);}
});

test('dead reservation is interrupted even when an earlier job was ready',async()=>{
  await api.atomicJson(statusFile(),{status:'ready',pid:process.pid,jobId:'previous'});
  await api.atomicJson(reservationFile(),{jobId:'dead-job',pid:2147483647,phase:'reserved'});
  const status=await api.workspaceStatus();
  assert.equal(status.setup.status,'interrupted');
  assert.equal(status.setup.jobId,'dead-job');
});

test('independent processes cannot claim the same supervisor reservation',async()=>{
  const jobId='cross-process-job';
  await api.atomicJson(reservationFile(),{jobId,pid:process.pid,phase:'reserved'});
  const module=new URL('../src/workspace.js',import.meta.url).href;
  const source=`const api=await import(${JSON.stringify(module)}); console.log(await api.claimSetupReservation(${JSON.stringify(jobId)}));`;
  const results=await Promise.all(Array.from({length:6},()=>new Promise((resolve,reject)=>{
    childProcess.execFile(process.execPath,['--input-type=module','-e',source],{env:api.workspaceEnv()},(error,stdout)=>error?reject(error):resolve(stdout.trim()));
  })));
  assert.equal(results.filter(result=>result==='true').length,1);
  assert.equal(results.filter(result=>result==='false').length,5);
});
