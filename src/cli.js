#!/usr/bin/env node
import path from 'node:path';
import { ROOT, run, inspectInstallation } from './core.js';
const command = process.argv[2] || 'serve';
try {
  if(command==='serve'){const {serve}=await import('./server.js');await serve();}
  else if(command==='doctor')console.log(JSON.stringify(await inspectInstallation(),null,2));
  else if(command==='config')console.log(JSON.stringify({mcpServers:{'broforce-workshop':{command:process.execPath,args:[path.join(ROOT,'src/cli.js'),'serve'],env:{...(process.env.BROFORCE_GAME_PATH?{BROFORCE_GAME_PATH:process.env.BROFORCE_GAME_PATH}:{})}}}},null,2));
  else if(command==='setup'){
    const {spawn}=await import('node:child_process');const child=spawn('python3',[path.join(ROOT,'scripts/setup_workshop.py'),...process.argv.slice(3)],{cwd:ROOT,stdio:'inherit'});process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
    if(!process.exitCode)console.log('Agent configuration: node src/cli.js config\nSkills: '+path.join(ROOT,'skills'));
  }else if(command==='preview'){const {startPreview}=await import('./preview.js');const preview=await startPreview(Number(process.argv[3]||4317));console.log('Broforce Workshop: '+preview.url);}
  else throw Error('Usage: broforce-workshop [setup [--skip-profile] [--skills-dir PATH] | serve | doctor | config | preview [PORT]]');
}catch(e){console.error(e.message);process.exitCode=1;}
