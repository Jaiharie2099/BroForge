from pathlib import Path
import subprocess,shutil
from workshop_paths import game_path
root=Path(__file__).resolve().parents[1]
game=game_path()
managed=game/'Broforce_Data/Managed'
profile=root/'runtime/profile'
out=profile/'UMM/Mods/BroforceWorkshop'
out.mkdir(parents=True,exist_ok=True)
refs=[managed/'mscorlib.dll',managed/'System.dll',managed/'System.Core.dll',managed/'Assembly-CSharp.dll']
refs+=list(managed.glob('UnityEngine*.dll'))
refs += [profile/'UMM/Core/UnityModManager.dll',profile/'UMM/Core/0Harmony.dll',profile/'UMM/Mods/BroMakerLib/BroMakerLib.dll',profile/'UMM/Mods/RocketLib/RocketLib.dll',profile/'UMM/Mods/RocketLib/Newtonsoft.Json.dll']
csc=next((root/'.toolchain/dotnet/sdk').glob('*/Roslyn/bincore/csc.dll'))
cmd=[str(root/'.toolchain/dotnet/dotnet'),str(csc),'-noconfig','-nostdlib','-target:library','-langversion:7.3','-debug:full','-optimize-' ,'-out:'+str(out/'WorkshopBridge.dll')]+['-r:'+str(p) for p in refs]+[str(root/'mods/WorkshopBridge/Main.cs')]
subprocess.run(cmd,check=True)
shutil.copy2(root/'mods/WorkshopBridge/Info.json',out/'Info.json')
print(out)
