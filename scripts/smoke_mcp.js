// Opt-in real-game test. Creates two named test projects, installs them and starts the game.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/core.js';
const client=new Client({name:'broforce-live-smoke',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/cli.js'),'serve'],cwd:'/tmp',stderr:'inherit'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(name,args={}){const result=await client.callTool({name,arguments:args}, {timeout:120000});if(result.isError)throw Error(result.content[0].text);return result.structuredContent;}
const result={utc:new Date().toISOString(),steps:[]};
try{
 await client.connect(transport);
 for(const p of [{id:'mcp-rifle-smoke',kind:'bro',name:'Workshop Rifle Test',author:'Workshop smoke test'},{id:'mcp-campaign-smoke',kind:'campaign',name:'Workshop MCP Smoke',author:'Workshop smoke test',initialBro:'Workshop Rifle Test'}]){
  const all=await call('list_projects');if(!all.projects.some(x=>x.id===p.id))await call('create_project',p);
  result.steps.push(await call('build_project',{id:p.id}));result.steps.push(await call('install_project',{id:p.id,overwrite:true}));
 }
 const installation=await call('inspect_installation');if(installation.bridge)throw Error('Close the existing Workshop game before this explicit restart test');
 await call('game_control',{action:'launch'});
 await call('game_control',{action:'start_campaign',name:'Workshop MCP Smoke',projectId:'mcp-campaign-smoke'});
 for(let i=0;i<40;i++){
  result.initial=await call('game_control',{action:'status',projectId:'mcp-campaign-smoke'});
  if(result.initial.players[0]?.character && result.initial.players[0].y<=570)break;
  await sleep(500);
 }
 if(result.initial.players[0]?.character!=='WorkshopBros.Workshop_mcp_rifle_smoke')throw Error('Custom first spawn not observed: '+JSON.stringify(result.initial));
 await call('game_control',{action:'drive',right:true,jump:true,fire:true,milliseconds:2600});await sleep(2800);
 for(let i=0;i<16;i++){
  const state=await call('game_control',{action:'status'});
  const character=state.players[0]?.character;
  const empty=state.cages.every(c=>c.colliders.every(col=>col.name!=='Hobro'));
  if(character&&character!=='WorkshopBros.Workshop_mcp_rifle_smoke'&&empty){result.rescued=state;break;}
  await call('game_control',{action:'drive',right:true,fire:true,milliseconds:400});await sleep(600);
 }
 if(!result.rescued)throw Error('Vanilla rescue not observed');
 for(let i=0;i<60;i++){
  const state=await call('game_control',{action:'status'});
  if(state.scene==='VictoryCustomCampaign'){result.end=state;break;}
  await call('game_control',{action:'drive',right:true,jump:true,fire:true,milliseconds:1800});await sleep(2000);
 }
 if(!result.end)throw Error('Normal campaign victory not observed');
 result.passed=true;
}catch(e){result.passed=false;result.error=e.stack;process.exitCode=1;}
finally{await fs.mkdir(path.join(ROOT,'runtime'),{recursive:true});await fs.writeFile(path.join(ROOT,'runtime/mcp-live-smoke.json'),JSON.stringify(result,null,2));await client.close();console.log(JSON.stringify({passed:result.passed,initial:result.initial?.players,rescued:result.rescued?.players,end:result.end?.scene,error:result.error},null,2));}
