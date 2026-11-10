// Reproducible documentation capture. Uses real MCP calls; never installs or launches the game.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../src/core.js';
const exec = promisify(execFile), out = path.join(ROOT,'runtime/readme-demo');
await fs.mkdir(out,{recursive:true});
await fs.rm(path.join(out,'projects/furnace-escape'),{recursive:true,force:true});
const client = new Client({name:'broforge-readme-capture',version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/cli.js'),'serve'],env:{...process.env,BROFORCE_PROJECTS_DIR:path.join(out,'projects')},stderr:'inherit'});
const transcript=[];
async function call(name,args={}){const start=Date.now();const r=await client.callTool({name,arguments:args},{timeout:120000});if(r.isError)throw Error(r.content[0].text);const data=r.structuredContent;transcript.push({tool:name,args,result:data,elapsedMs:Date.now()-start});return data;}
async function capture(label,url){await exec(process.env.BROFORCE_CHROMIUM||'/snap/bin/chromium',['--headless','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check','--user-data-dir='+path.join(out,'chromium'), '--window-size=1240,1100','--force-device-scale-factor=1','--virtual-time-budget=2500','--screenshot='+path.join(out,label+'.png'),url],{timeout:45000,maxBuffer:2e6});}
try{
 await client.connect(transport);
 await call('inspect_installation');
 const id='furnace-escape';
 if(!(await call('list_projects')).projects.some(p=>p.id===id))await call('create_project',{id,kind:'campaign',name:'Furnace Escape',author:'BroForge demo'});
 const project=await call('read_project',{id}), final=project.design;
 const catalog=await call('inspect_native_catalog',{section:'DoodadInfo',field:'type'});
 const names=new Map(Object.entries(catalog.fields.type.values).map(([name,value])=>[value,name]));
 for(const doodad of final.levels[0].doodads)if(typeof doodad.type==='number')doodad.type=names.get(doodad.type)??doodad.type;
 // The template is edited through the same MCP file tool an agent uses.
 // Add a new steel landing and change the opening shelf for this documentation project.
 final.levels[0].terrain.push({layer:'foreground',bounds:[14,27,18,28],type:'Steel'});
 final.levels[0].settings.levelDescription='BWM:furnace-escape|Furnace Escape';
 const partial=structuredClone(final);partial.levels[0].terrain=final.levels[0].terrain.filter(r=>r.bounds[2]<25);partial.levels[0].doodads=final.levels[0].doodads.filter(d=>d.x<25);partial.levels[0].triggers=[];
 await call('write_project_file',{id,file:'design.json',text:JSON.stringify(partial,null,2)});
 const preview=await call('preview_project',{id});
 await capture('01-route',preview.url);
 await call('write_project_file',{id,file:'design.json',text:JSON.stringify(final,null,2)});
 await capture('02-encounters',preview.url);
 const build=await call('build_project',{id});
 await capture('03-built',preview.url);
 await fs.writeFile(path.join(out,'transcript.json'),JSON.stringify({caption:'Replayed real MCP calls and actual web UI captures. Timing is edited; no game installation or playtest performed.',transcript},null,2));
 console.log(JSON.stringify({captured:true,artifacts:build.artifacts,frames:out},null,2));
}finally{await client.close();}
