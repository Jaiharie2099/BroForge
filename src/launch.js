import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CODE_ROOT,WORKSPACE,STATE,workspaceManifest,atomicJson} from './workspace.js';
import {installFiles} from './ownership.js';
const execute=promisify(execFile);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const q=x=>"'"+String(x).replaceAll("'","'\\''")+"'";
const receiptPath=path.join(STATE,'runtime/steam-integration.json');
export function launcherFiles() {
  return [
    {path:path.join(WORKSPACE,'play-broforce'),mode:0o755,data:`#!/bin/sh\nset -eu\nexport BROFORCE_WORKSPACE=${q(WORKSPACE)}\nexec ${q(process.execPath)} ${q(path.join(CODE_ROOT,'src/cli.js'))} --workspace ${q(WORKSPACE)} launch "$@"\n`},
    {path:path.join(STATE,'launchers/steam-broforce'),mode:0o755,data:`#!/bin/sh\nset -eu\nexport BROFORCE_WORKSPACE=${q(WORKSPACE)}\nexport BROFORCE_WORKSHOP_ROOT=${q(STATE)}\nexport PYTHONDONTWRITEBYTECODE=1\nif [ "$#" -eq 0 ]; then echo 'Steam launch options must append %command%.' >&2; exit 2; fi\nexec python3 ${q(path.join(CODE_ROOT,'scripts/launch_doorstop.py'))} "$@"\n`}
  ];
}
export async function writeManagedLaunchers(){await workspaceManifest();return installFiles('launch:managed',launcherFiles());}
export function steamLaunchOptions(previous={exists:false}){
 const wrapper='"'+path.join(STATE,'launchers/steam-broforce').replaceAll('"','\\"')+'" %command%';
 const old=previous.exists?previous.value.trim():'';
 if(!old)return wrapper;
 const count=old.split('%command%').length-1;
 if(count>1)throw Error('Existing launch options contain multiple command placeholders');
 return count===1?old.replace('%command%',wrapper):wrapper+' '+old;
}

// Parse token locations, not the complete account data: modify just this game's
// LaunchOptions value and retain all unrelated Steam settings byte-for-byte.
export function vdfNodes(text) {
  const tokens=[...text.matchAll(/"(?:\\.|[^"\\])*"|[{}]/g)];
  const decode=s=>JSON.parse(s);
  const nodes=[];const stack=[];
  for(let i=0;i<tokens.length;){
    const t=tokens[i];
    if(t[0]==='}') {const n=stack.pop();if(!n)throw Error('Invalid Steam VDF');n.close=t.index;i++;continue;}
    if(t[0]==='{')throw Error('Invalid Steam VDF');
    const key=decode(t[0]),next=tokens[i+1];if(!next)throw Error('Invalid Steam VDF');
    const n={key,path:[...stack.map(x=>x.key),key],start:t.index};
    if(next[0]==='{'){n.open=next.index;nodes.push(n);stack.push(n);i+=2;}
    else {if(next[0]==='}')throw Error('Invalid Steam VDF');n.value=decode(next[0]);n.valueStart=next.index;n.end=next.index+next[0].length;nodes.push(n);i+=2;}
  }
  if(stack.length)throw Error('Unclosed Steam VDF');return nodes;
}
const appPath=['userlocalconfigstore','software','valve','steam','apps','274190'];
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v.toLowerCase()===b[i]);
export function readSteamSetting(text){const nodes=vdfNodes(text).filter(n=>eq(n.path,[...appPath,'launchoptions']));if(nodes.length>1)throw Error('Duplicate Steam launch options');return nodes.length?{exists:true,value:nodes[0].value}:{exists:false};}
export function patchSteamSetting(text,setting){
  const nodes=vdfNodes(text),leaves=nodes.filter(n=>eq(n.path,[...appPath,'launchoptions']));if(leaves.length>1)throw Error('Duplicate Steam launch options');const leaf=leaves[0];
  if(leaf){if(setting.exists)return text.slice(0,leaf.valueStart)+JSON.stringify(setting.value)+text.slice(leaf.end);const line=text.lastIndexOf('\n',leaf.start)+1;const begin=text.slice(line,leaf.start).trim()?leaf.start:line;let end=leaf.end;while(text[end]==='\t'||text[end]===' ')end++;if(text[end]==='\r')end++;if(text[end]==='\n')end++;return text.slice(0,begin)+text.slice(end);}
  if(!setting.exists)return text;
  const apps=nodes.filter(n=>eq(n.path,appPath.slice(0,-1))),app=nodes.filter(n=>eq(n.path,appPath));
  if(app.length>1||apps.length!==1)throw Error('Cannot locate the Steam apps settings section');
  const parent=app[0]||apps[0],line=text.lastIndexOf('\n',parent.close)+1,indent=text.slice(line,parent.close);
  if(indent.trim())throw Error('Unsupported Steam VDF formatting');
  const entry=app[0]?`${indent}\t"LaunchOptions"\t\t${JSON.stringify(setting.value)}\n`:`${indent}\t"274190"\n${indent}\t{\n${indent}\t\t"LaunchOptions"\t\t${JSON.stringify(setting.value)}\n${indent}\t}\n`;
  return text.slice(0,line)+entry+text.slice(line);
}
async function configPath(given){
  if(given)return path.resolve(given);
  const roots=[path.join(os.homedir(),'snap/steam/common/.local/share/Steam/userdata'),path.join(os.homedir(),'.local/share/Steam/userdata'),path.join(os.homedir(),'.steam/steam/userdata')];const found=new Set();
  for(const root of roots){let entries;try{entries=await fs.readdir(root);}catch(e){if(e.code==='ENOENT')continue;throw e;}for(const entry of entries){const p=path.join(root,entry,'config/localconfig.vdf');try{found.add(await fs.realpath(p));}catch(e){if(e.code!=='ENOENT')throw e;}}}
  if(found.size!==1)throw Error('Specify configPath for the intended Steam account; found '+found.size+' account configs');return [...found][0];
}
async function noLinks(p){let current=path.parse(p).root;for(const part of path.resolve(p).split(path.sep).filter(Boolean)){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Steam config path cannot contain symlinks: '+current);}catch(e){if(e.code!=='ENOENT')throw e;}}}
async function steamClosed(){try{await execute('pgrep',['-x','steam']);throw Error('Close Steam before applying or removing launch integration; other settings will be preserved');}catch(e){if(e.code===1)return;throw e;}}
async function receipt(){try{return JSON.parse(await fs.readFile(receiptPath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function writeConfig(file,text,expected) {
 await noLinks(file);if(expected!==undefined&&await fs.readFile(file,'utf8')!==expected)throw Error('Steam config changed during the operation');
 const mode=(await fs.stat(file)).mode&0o777,temp=file+'.broforge-'+randomUUID()+'.tmp';let created=false;
 try{await fs.writeFile(temp,text,{flag:'wx',mode});created=true;if(expected!==undefined&&await fs.readFile(file,'utf8')!==expected)throw Error('Steam config changed during the operation');await fs.rename(temp,file);created=false;}
 finally{if(created)await fs.rm(temp,{force:true});}
}
export function removeEmptyCreatedApp(text) {
 const nodes=vdfNodes(text),app=nodes.find(n=>eq(n.path,appPath));
 if(!app||nodes.some(n=>n.path.length>app.path.length&&eq(n.path.slice(0,app.path.length),appPath)))return text;
 const line=text.lastIndexOf('\n',app.start)+1;let end=app.close+1;while(text[end]===' '||text[end]==='\t')end++;if(text[end]==='\r')end++;if(text[end]==='\n')end++;
 return text.slice(0,line)+text.slice(end);
}
export async function steamRemovalPlan(){
 const saved=await receipt();if(!saved)return {operations:[],conflicts:[]};await noLinks(saved.configPath);
 const text=await fs.readFile(saved.configPath,'utf8'),current=readSteamSetting(text);
 const applied=JSON.stringify(current)===JSON.stringify({exists:true,value:saved.installed});const original=JSON.stringify(current)===JSON.stringify(saved.original);
 return {operations:[{kind:'steam-launch-options',path:saved.configPath,action:original?'already-restored':'restore',original:saved.original}],conflicts:applied||original?[]:[{path:saved.configPath,reason:'Steam launch options changed after integration; preserve the current value'}],saved,current};
}
export async function removeSteamIntegration(plan,{assertSteamClosed=steamClosed}={}){
 if(!plan.saved)return;
 await assertSteamClosed();const now=await steamRemovalPlan();if(now.conflicts.length||digest(now)!==digest(plan))throw Error('Steam integration changed since planning');
 if(now.operations[0].action!=='already-restored'){const text=await fs.readFile(now.saved.configPath,'utf8');let restored=patchSteamSetting(text,now.saved.original);if(now.saved.createdApp)restored=removeEmptyCreatedApp(restored);await writeConfig(now.saved.configPath,restored,text);}
 // Retain an audit record outside the active ownership inventory.
 await atomicJson(path.join(STATE,'runtime/steam-integration-removed.json'),{...now.saved,removedAt:new Date().toISOString()});
 await fs.rm(receiptPath,{force:true});
}
export async function configureLaunch({mode='managed',action='plan',configPath:given,planId}={}, {assertSteamClosed=steamClosed}={}) {
 await workspaceManifest();
 if(mode==='managed') {
  const plan={mode,files:launcherFiles().map(f=>({path:f.path,mode:f.mode,sha256:digest(f.data)}))};plan.planId=digest(plan);
  if(action==='apply'){if(planId!==plan.planId)throw Error('Launch plan changed; request a new plan');await writeManagedLaunchers();}
  return {...plan,applied:action==='apply',launcher:path.join(WORKSPACE,'play-broforce')};
 }
 if(mode!=='steam')throw Error('Unknown launch mode');
 if(action==='remove') {const plan=await steamRemovalPlan();const expected=digest(plan);if(planId!==expected)throw Error('Use configure_launch action=status to get the removal planId');if(plan.conflicts.length)throw Error('Steam launch options changed; nothing removed');await removeSteamIntegration(plan,{assertSteamClosed});return {removed:true};}
 if(action==='status'){const plan=await steamRemovalPlan();return {...plan,saved:undefined,planId:digest(plan),enabled:!!plan.saved&&plan.current?.value===plan.saved.installed};}
 const file=await configPath(given);await noLinks(file);const text=await fs.readFile(file,'utf8'),current=readSteamSetting(text),previous=await receipt(),installed=steamLaunchOptions(previous?.original||current);
 if(previous&&previous.configPath!==file)throw Error('Remove the previous Steam integration before choosing another account');
 if(previous&&current.value!==previous.installed&&JSON.stringify(current)!==JSON.stringify(previous.original))throw Error('Steam launch options changed; resolve existing integration before replacing it');
 const plan={mode,configPath:file,previous:current,launchOptions:installed,externalWrite:true};plan.planId=digest(plan);
 if(action==='apply') {
  if(planId!==plan.planId)throw Error('Steam launch plan changed; request a new plan');await assertSteamClosed();
  const fresh=await fs.readFile(file,'utf8');if(JSON.stringify(readSteamSetting(fresh))!==JSON.stringify(current))throw Error('Steam setting changed since planning');
  await writeManagedLaunchers();
  // Store only the setting being changed, never Steam authentication/account data.
  const saved={...(previous||{configPath:file,original:current,installed,createdApp:!vdfNodes(fresh).some(n=>eq(n.path,appPath)),createdAt:new Date().toISOString()}),status:'pending'};
  await atomicJson(receiptPath,saved);
  await writeConfig(file,patchSteamSetting(fresh,{exists:true,value:installed}),fresh);
  await atomicJson(receiptPath,{...saved,status:'applied'});
 }
 return {...plan,applied:action==='apply'};
}
