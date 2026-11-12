"""Resolve a local installation without storing a machine-specific path in source."""
import os, sys
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
from workspace_paths import configured_game_path
from pathlib import Path

def game_path():
    override=configured_game_path()
    candidates=[Path(override)] if override else [
        Path.home()/'snap/steam/common/.local/share/Steam/steamapps/common/Broforce',
        Path.home()/'.local/share/Steam/steamapps/common/Broforce',
        Path.home()/'.steam/steam/steamapps/common/Broforce',
    ]
    for candidate in candidates:
        if (candidate/'Broforce_Data/Managed/Assembly-CSharp.dll').is_file(): return candidate.resolve()
    raise RuntimeError('Set BROFORCE_GAME_PATH to your Broforce installation')

if __name__=='__main__': print(game_path())
