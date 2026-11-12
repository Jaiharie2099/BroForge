#!/usr/bin/env node
import path from 'node:path';
const args=process.argv.slice(2);
const workspaceIndex=args.indexOf('--workspace');
if(workspaceIndex!==-1){if(!args[workspaceIndex+1])throw Error('--workspace requires a path');process.env.BROFORCE_WORKSPACE=path.resolve(args[workspaceIndex+1]);args.splice(workspaceIndex,2);}
const command=args.shift()||'serve';
const flag=name=>args.includes(name);
const option=name=>{const i=args.indexOf(name);if(i===-1)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(name+' requires a value');return args[i+1];};
try {
 const {CODE_ROOT,WORKSPACE,workspaceEnv,initializeWorkspace,workspaceStatus}=await import('./workspace.js');
 const print=x=>console.log(JSON.stringify(x,null,2));
 if(command==='serve'){const {serve}=await import('./server.js');await serve();}
 else if(command==='config')print({mcpServers:{'broforce-workshop':{command:process.execPath,args:[path.join(CODE_ROOT,'src/cli.js'),'serve'],env:{BROFORCE_WORKSPACE:WORKSPACE,...(process.env.BROFORCE_GAME_PATH?{BROFORCE_GAME_PATH:process.env.BROFORCE_GAME_PATH}:{})}}}});
 else if(command==='status')print(await workspaceStatus());
 else if(command==='setup'||command==='init'){
  if(flag('--skip-profile'))process.env.BROFORCE_SETUP_SKIP_PROFILE='1';
  const result=await initializeWorkspace({gamePath:option('--game-path'),prepare:!flag('--no-prepare'),wait:true,repair:flag('--repair')});
  if(option('--skills-dir')){const {installSkills}=await import('./lifecycle.js');await installSkills(option('--skills-dir'));}
  print(result);console.log('MCP configuration: '+process.execPath+' '+path.join(CODE_ROOT,'src/cli.js')+' --workspace '+JSON.stringify(WORKSPACE)+' config');
 }else if(command==='doctor'){const {inspectInstallation}=await import('./core.js');print(await inspectInstallation());}
 else if(command==='preview'){const {startPreview}=await import('./preview.js');const preview=await startPreview(Number(args[0]||4317));console.log('Broforce Workshop: '+preview.url);}
 else if(command==='launch'){const {gameControl}=await import('./core.js');print(await gameControl('launch'));}
 else if(command==='play'){const {playProject}=await import('./lifecycle.js');print(await playProject({id:args[0],restart:flag('--restart'),overwrite:flag('--overwrite')}));}
 else if(command==='uninstall'){const {uninstallWorkspace}=await import('./lifecycle.js');print(await uninstallWorkspace({apply:flag('--apply'),planId:option('--plan-id'),includeRuntime:!flag('--keep-runtime')}));}
 else if(command==='configure-launch'){const {configureLaunch}=await import('./launch.js');print(await configureLaunch({mode:option('--mode')||'managed',action:option('--action')||'plan',configPath:option('--config'),planId:option('--plan-id')}));}
 else if(command==='install-skills'){const {installSkills}=await import('./lifecycle.js');if(!args[0])throw Error('Provide a skill directory');print(await installSkills(args[0]));}
 else throw Error('Usage: broforce-workshop [--workspace PATH] [setup|init [--no-prepare] [--game-path PATH] [--skills-dir PATH] | serve | doctor | status | config | preview [PORT] | launch | play ID [--restart] | configure-launch | uninstall [--apply --plan-id ID]]');
}catch(e){console.error(e.message);process.exitCode=1;}
