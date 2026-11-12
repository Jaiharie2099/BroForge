// Opt-in live demonstration: takes over player-one input through the MCP bridge.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {CODE_ROOT,WORKSPACE,STATE} from '../src/workspace.js';
const client=new Client({name:'spider-bro-live-demo',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(CODE_ROOT,'src/cli.js'),'serve'],cwd:'/',env:{...process.env,BROFORCE_WORKSPACE:WORKSPACE},stderr:'inherit'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const output=path.join(STATE,'runtime/spider-demo');await fs.mkdir(output,{recursive:true});
async function call(name,args={}){
 const r=await client.callTool({name,arguments:args},{timeout:180000});
 await fs.appendFile(path.join(output,'mcp.jsonl'),JSON.stringify({at:new Date().toISOString(),tool:name,args,result:r.structuredContent||r.content})+'\n');
 if(r.isError)throw Error(r.content[0].text);return r.structuredContent;
}
async function game(action,args={}){return call('game_control',{action,...args});}
const proof={startedAt:new Date().toISOString()};
try{
 await client.connect(transport);
 const projects=(await call('list_projects')).projects;
 if(!projects.some(p=>p.id==='spider-bro'))await call('create_project',{id:'spider-bro',kind:'bro',name:'Spider Bro',template:'spider-bro'});
 if(!projects.some(p=>p.id==='spider-bro-showcase'))await call('create_project',{id:'spider-bro-showcase',kind:'campaign',name:'Spider Bro Showcase',initialBro:'Spider Bro',dependencies:['spider-bro']});
 const design=await fs.readFile(path.join(CODE_ROOT,'library/campaigns/spider-bro-showcase/design.json'),'utf8');
 await call('write_project_file',{id:'spider-bro-showcase',file:'design.json',text:design});
 proof.play=await call('play_project',{id:'spider-bro-showcase',restart:true});
 console.log('PLAY',JSON.stringify({stage:proof.play.stage,checks:proof.play.checks,observed:proof.play.observed}));
 if(proof.play.stage!=='loaded')throw Error('Workspace play failed runtime verification');
 if(process.argv.includes('--prepare-only')){proof.initial=await game('status');console.log('STATUS',JSON.stringify(proof.initial));}
 else {
  async function run(command,args){const child=spawn(command,args,{cwd:WORKSPACE,env:{...process.env,BROFORCE_WORKSPACE:WORKSPACE,PYTHONDONTWRITEBYTECODE:'1'},stdio:'inherit'});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)throw Error(command+' failed with code '+code);}
  await run(process.execPath,[path.join(CODE_ROOT,'scripts/record_spider_clips.js')]);
  await run('python3',[path.join(CODE_ROOT,'scripts/render_spider_gif.py')]);
  proof.gameplayTested=true;proof.gif='docs/media/spider-bro-gameplay.gif';
 }
}finally{await fs.writeFile(path.join(output,'proof.json'),JSON.stringify(proof,null,2)+'\n');await client.close();}
