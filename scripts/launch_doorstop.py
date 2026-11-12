"""Launch the Linux ELF game with the isolated Doorstop profile."""
import os, sys
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
import os
import sys
from pathlib import Path
from workspace_paths import state_path, workspace_path

root = state_path()
game = Path(sys.argv[1])
with game.open('rb') as stream:
    header = stream.read(20)
if header[:4] != b'\x7fELF' or header[5] != 1:
    raise SystemExit('Expected a little-endian Linux ELF executable')
architecture = {(2, 62): 'x64', (1, 3): 'x86'}.get(
    (header[4], int.from_bytes(header[18:20], 'little')))
if architecture is None:
    raise SystemExit('Doorstop profile supports only x86 and x64 ELF executables')
profile = root / 'runtime/profile'
environment = os.environ.copy()
environment.update(BROFORCE_WORKSPACE=str(workspace_path()), BROFORCE_WORKSHOP_ROOT=str(root))
environment.update(DOORSTOP_ENABLED='1',
    DOORSTOP_TARGET_ASSEMBLY=str(profile / 'UMM/Core/UnityModManager.dll'),
    DOORSTOP_MONO_DEBUG_ENABLED='0')
library = str(profile / f'doorstop_libs/libdoorstop_{architecture}.so')
environment['LD_PRELOAD'] = ':'.join(filter(None, [library, environment.get('LD_PRELOAD')]))
os.execve(game, [str(game), *sys.argv[2:]], environment)
