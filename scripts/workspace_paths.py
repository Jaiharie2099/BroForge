"""Workspace-owned state paths; source assets always come from CODE_ROOT."""
import os, sys
sys.dont_write_bytecode = True
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
import json
import os
from pathlib import Path

CODE_ROOT = Path(__file__).resolve().parents[1]


def workspace_path():
    return Path(os.environ.get('BROFORCE_WORKSPACE') or Path.cwd()).expanduser().resolve()


def state_path():
    return workspace_path() / '.broforge'


def dependency_path(dependency):
    return state_path() / 'dependencies' / dependency['name'] / dependency['archive']


def dotnet_environment():
    state = state_path()
    environment = os.environ.copy()
    environment.update(
        PYTHONDONTWRITEBYTECODE='1',
        BROFORCE_WORKSPACE=str(workspace_path()),
        BROFORCE_WORKSHOP_ROOT=str(state),
        DOTNET_ROOT=str(state / '.toolchain/dotnet'),
        DOTNET_CLI_HOME=str(state / '.toolchain/dotnet-home'),
        NUGET_PACKAGES=str(state / '.toolchain/nuget/packages'),
        NUGET_HTTP_CACHE_PATH=str(state / '.toolchain/nuget/http-cache'),
        NUGET_PLUGINS_CACHE_PATH=str(state / '.toolchain/nuget/plugins-cache'),
        DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER='1',
        MSBUILDDISABLENODEREUSE='1',
        DOTNET_CLI_TELEMETRY_OPTOUT='1',
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1',
    )
    return environment


def configured_game_path():
    override = os.environ.get('BROFORCE_GAME_PATH')
    if override:
        return Path(override).expanduser().resolve()
    manifest = workspace_path() / 'broforge.json'
    if manifest.is_file():
        value = json.loads(manifest.read_text()).get('gamePath')
        if value:
            path = Path(value).expanduser()
            return (workspace_path() / path).resolve()
    return None


if __name__ == '__main__':
    print(state_path())
