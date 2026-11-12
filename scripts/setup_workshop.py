"""Fetch pinned prerequisites and prepare the Linux authoring profile."""
import os, sys
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
import argparse, hashlib, json, os, platform, shutil, subprocess, tarfile, urllib.request
from pathlib import Path
from workshop_paths import game_path
from workspace_paths import CODE_ROOT, state_path, workspace_path, dependency_path, dotnet_environment
ROOT=CODE_ROOT

def fetch(url, target, digest=None, algorithm='sha256'):
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists() and digest and hashlib.new(algorithm,target.read_bytes()).hexdigest()==digest:
        return
    print(f'Downloading {url}',flush=True)
    temporary=target.with_suffix(target.suffix+'.download')
    try:
        with urllib.request.urlopen(url,timeout=120) as source, temporary.open('wb') as output:
            shutil.copyfileobj(source,output)
        if digest and hashlib.new(algorithm,temporary.read_bytes()).hexdigest()!=digest:
            raise RuntimeError(f'Checksum mismatch: {url}')
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--skip-profile',action='store_true');p.add_argument('--skills-dir');p.add_argument('--workspace',type=Path);args=p.parse_args()
    if args.skills_dir is not None:
        p.error('Use CLI setup --skills-dir, which records ownership')
    os.environ['BROFORCE_WORKSPACE']=str(args.workspace.expanduser().resolve() if args.workspace is not None else workspace_path())
    state=state_path()
    os.environ['BROFORCE_WORKSHOP_ROOT']=str(state)
    if platform.system()!='Linux' or platform.machine() not in ('x86_64','AMD64'):
        raise RuntimeError('This release supports Linux x86_64 only')
    game=game_path()
    assembly=game/'Broforce_Data/Managed/Assembly-CSharp.dll'
    digest=hashlib.sha256(assembly.read_bytes()).hexdigest()
    if digest!='d518444c45ba73f834bfbd163973f3c0fdbb935522144d9b95e6db74029a6b86':
        raise RuntimeError(f'Unverified game assembly {digest}; this installer targets the tested build only')
    if not args.skip_profile and subprocess.run(['pgrep','-x','Broforce.x86_64'],stdout=subprocess.DEVNULL).returncode==0:
        raise RuntimeError('Close Broforce before preparing/updating the mod profile; use --skip-profile to prepare authoring tools only')
    for dep in json.loads((ROOT/'dependencies.lock.json').read_text()):
        repository=dep['repository'].removesuffix('.git').replace('https://github.com/','https://raw.githubusercontent.com/')
        fetch(f"{repository}/{dep['commit']}/{dep['archive']}",dependency_path(dep),dep['sha256'])
    dotnet=state/'.toolchain/dotnet/dotnet'
    if not dotnet.exists():
        metadata=state/'.toolchain/downloads/dotnet-releases.json'
        fetch('https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json',metadata)
        releases=json.loads(metadata.read_text())['releases']
        sdk=next(s for r in releases for s in r.get('sdks',[r.get('sdk',{})]) if s.get('version')=='8.0.427')
        artifact=next(f for f in sdk['files'] if f['rid']=='linux-x64' and f['name'].endswith('.tar.gz'))
        archive=state/'.toolchain/downloads/dotnet-sdk-8.0.427-linux-x64.tar.gz'
        fetch(artifact['url'],archive,artifact['hash'].lower(),'sha512')
        dotnet.parent.mkdir(parents=True,exist_ok=True)
        with tarfile.open(archive) as source:
            source.extractall(dotnet.parent,filter='data')
    # Build a workspace copy so SDK tasks cannot write into the source project.
    build_source=state/'.toolchain/build/NativeCampaignTool'
    if build_source.exists():
        shutil.rmtree(build_source)
    shutil.copytree(ROOT/'tools/NativeCampaignTool',build_source,
        ignore=shutil.ignore_patterns('bin','obj'))
    intermediates=state/'.toolchain/obj/NativeCampaignTool'
    subprocess.run([str(dotnet),'build',str(build_source),'/nodeReuse:false','-p:UseSharedCompilation=false',
        '-p:BaseIntermediateOutputPath='+str(intermediates)+'/',
        '-p:MSBuildProjectExtensionsPath='+str(intermediates)+'/',
        '-o',str(state/'.toolchain/native-campaign-tool')],check=True,env=dotnet_environment())
    if not args.skip_profile:
        subprocess.run(['python3',str(ROOT/'scripts/prepare_profile.py')],check=True,env=dotnet_environment())
    print('Setup complete. Run npm run doctor. Configure your agent with the configuration printed by: node src/cli.js config')
if __name__=='__main__':main()
