// Explicit live recording through public MCP controls; no actor teleporting or invulnerability flags.
import fs from 'node:fs/promises';import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {CODE_ROOT,WORKSPACE,STATE} from '../src/workspace.js';
const client=new Client({name:'spider-bro-recording',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(CODE_ROOT,'src/cli.js'),'serve'],cwd:'/',env:{...process.env,BROFORCE_WORKSPACE:WORKSPACE},stderr:'inherit'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const proof={clips:[],startedAt:new Date().toISOString()};
const suffix=Date.now().toString(36);
async function game(action,args={}){const r=await client.callTool({name:'game_control',arguments:{action,...args}},{timeout:120000});if(r.isError)throw Error(r.content[0].text);return r.structuredContent;}
async function drive(ms,keys={}){return game('drive',{milliseconds:ms,...keys});}
async function tap(){await drive(95,{fire:true});await sleep(130);await drive(240);await sleep(270);}
async function fresh(){await game('start_campaign',{name:'Spider Bro Showcase'});for(let i=0;i<40;i++){const s=await game('status');const p=s.players?.[0];if(p?.character==='WorkshopBros.Workshop_spider_bro'&&p.counters.specialAmmo===3&&p.x>100)return s;await sleep(100);}throw Error('Spider Bro did not settle at the entrance');}
async function start(label,ms){const r=await game('record_start',{name:label+'-'+suffix,milliseconds:ms,fps:8});return {label,...r};}
async function finish(clip){for(let i=0;i<90;i++){const r=await game('record_status');if(!r.recording){if(r.error)throw Error(r.error);clip.frames=r.frames;clip.directory=r.directory;clip.after=await game('status');proof.clips.push(clip);console.log(clip.label,JSON.stringify({frames:clip.frames,player:clip.after.players[0],directory:clip.directory}));return;}await sleep(120);}throw Error('Recording did not finish');}
try{
 await client.connect(transport);
 let clip;
 if(!process.argv.includes('--swing-only')) {
 await fresh();clip=await start('combat',5000);clip.before=await game('status');await drive(110,{special:true});await sleep(140);await drive(200);await tap();await tap();await tap();await drive(1200,{right:true});await sleep(1250);await tap();await tap();await finish(clip);
 await fresh();clip=await start('sense',6200);clip.before=await game('status');await drive(120,{special:true});await sleep(150);await drive(6000);await finish(clip);
 await fresh();await drive(120,{special:true});await sleep(150);await drive(200);await tap();await tap();await drive(1500,{right:true});await sleep(1530);await tap();await tap();

 }else {
  const current=await game('status');if(current.players?.[0]?.character!=='WorkshopBros.Workshop_spider_bro')throw Error('Load Spider Bro Showcase before swing-only capture');
  await drive(10000,{left:true});await sleep(1350);await drive(180);await sleep(220);
 }
 clip=await start('swing',5000);clip.before=await game('status');
 // Keep fire continuously held across the input change; jump is only a pulse.
 await drive(10000,{right:true,fire:true,jump:true});await sleep(60);
 await drive(10000,{right:true,fire:true});await sleep(1350);
 await drive(10000,{left:true,fire:true});await sleep(850);
 await drive(10000,{right:true,fire:true});await sleep(450);
 await drive(1200,{right:true});await sleep(1250);await finish(clip);
}finally{await fs.mkdir(path.join(STATE,'runtime/spider-demo'),{recursive:true});await fs.writeFile(path.join(STATE,'runtime/spider-demo/clips-'+suffix+'.json'),JSON.stringify(proof,null,2)+'\n');await client.close();}
