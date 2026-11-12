"""Materialize pinned local mod dependencies; preserves profile settings."""
import os, sys
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
from pathlib import Path
import hashlib,json,zipfile,subprocess,sys
from workspace_paths import CODE_ROOT, state_path, dependency_path, dotnet_environment
ROOT=CODE_ROOT
PROFILE=state_path()/'runtime/profile'

def prepare():
    lock=json.loads((ROOT/'dependencies.lock.json').read_text())
    PROFILE.mkdir(parents=True,exist_ok=True)
    for dep in lock:
        archive=dependency_path(dep)
        if not archive.is_file():
            raise RuntimeError(f"Missing {archive}. Run setup_workshop.py for this workspace.")
        if hashlib.sha256(archive.read_bytes()).hexdigest()!=dep['sha256']:raise RuntimeError(f"Archive differs from lock: {archive}")
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None, archive
            for member in z.infolist():
                path=Path(member.filename)
                if path.parts[0] not in ['UMM','doorstop_libs'] and path.name!='run_umm.sh':continue
                target=(PROFILE/path).resolve()
                if not target.is_relative_to(PROFILE.resolve()):raise RuntimeError('Invalid archive member path')
                z.extract(member,PROFILE)
    settings=PROFILE/'UMM/Config/UMM/Params.xml'
    if not settings.exists():
        settings.parent.mkdir(parents=True,exist_ok=True)
        settings.write_text('<?xml version="1.0"?><Param><ShowOnStart>0</ShowOnStart></Param>')
    subprocess.run([sys.executable,str(ROOT/'scripts/build_bridge.py')],check=True,env=dotnet_environment())
    print(f'Prepared profile: {PROFILE}')

if __name__=='__main__':prepare()
