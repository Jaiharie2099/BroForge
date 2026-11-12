import os, sys
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
from pathlib import Path
import subprocess,shutil
from workshop_paths import game_path
from workspace_paths import CODE_ROOT, state_path, dotnet_environment
root=CODE_ROOT
state=state_path()
game=game_path()
managed=game/'Broforce_Data/Managed'
profile=state/'runtime/profile'
out=profile/'UMM/Mods/BroforceWorkshop'
out.mkdir(parents=True,exist_ok=True)
refs=[managed/'mscorlib.dll',managed/'System.dll',managed/'System.Core.dll',managed/'Assembly-CSharp.dll']
refs+=list(managed.glob('UnityEngine*.dll'))
refs += [profile/'UMM/Core/UnityModManager.dll',profile/'UMM/Core/0Harmony.dll',profile/'UMM/Mods/BroMakerLib/BroMakerLib.dll',profile/'UMM/Mods/RocketLib/RocketLib.dll',profile/'UMM/Mods/RocketLib/Newtonsoft.Json.dll']
csc=next((state/'.toolchain/dotnet/sdk').glob('*/Roslyn/bincore/csc.dll'))
cmd=[str(state/'.toolchain/dotnet/dotnet'),str(csc),'-noconfig','-nostdlib','-target:library','-langversion:7.3','-debug:full','-optimize-' ,'-out:'+str(out/'WorkshopBridge.dll')]+['-r:'+str(p) for p in refs]+[str(root/'mods/WorkshopBridge/Main.cs')]
subprocess.run(cmd,check=True,env=dotnet_environment())
shutil.copy2(root/'mods/WorkshopBridge/Info.json',out/'Info.json')
print(out)
