"""Materialize pinned local mod dependencies; preserves profile settings."""
from pathlib import Path
import hashlib,json,zipfile,subprocess,sys,shutil
from workshop_paths import game_path
ROOT=Path(__file__).resolve().parents[1]
PROFILE=ROOT/'runtime/profile'

def prepare():
    lock=json.loads((ROOT/'dependencies.lock.json').read_text())
    PROFILE.mkdir(parents=True,exist_ok=True)
    for dep in lock:
        archive=ROOT/dep['checkout']/dep['archive']
        if not archive.is_file():
            raise RuntimeError(f"Missing {archive}. Clone {dep['repository']} into {dep['checkout']} and checkout {dep['commit']}.")
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
    subprocess.run([sys.executable,str(ROOT/'scripts/build_bridge.py')],check=True)
    levels=game_path()/'Levels'
    backup=ROOT/'runtime/backups';backup.mkdir(parents=True,exist_ok=True)
    for ext in ['bfc','bfg']:
        src=ROOT/f'library/levels/high-ground/The High Ground.{ext}'
        target=levels/src.name
        if target.exists() and target.read_bytes()!=src.read_bytes():
            digest=hashlib.sha256(target.read_bytes()).hexdigest()[:12]
            shutil.copy2(target,backup/f'{target.stem}-{digest}.{ext}')
        shutil.copy2(src,target)
    print(f'Prepared profile: {PROFILE}\nInstalled editable and playable campaigns into {levels}')

if __name__=='__main__':prepare()
