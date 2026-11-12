"""Workspace contracts without downloads, native builds, or game launches."""
import sys
sys.dont_write_bytecode = True
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import workspace_paths as paths
import workshop_paths
import setup_workshop
import prepare_profile


class WorkspacePathsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='broforge-tests-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.workspace = self.base / 'workspace with spaces'
        self.workspace.mkdir()
        self.environment = patch.dict(os.environ, {}, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_default_is_cwd_not_checkout(self):
        with contextlib.chdir(self.workspace):
            self.assertEqual(paths.workspace_path(), self.workspace)
            self.assertEqual(paths.state_path(), self.workspace / '.broforge')

    def test_explicit_environment_wins_over_cwd(self):
        os.environ['BROFORCE_WORKSPACE'] = str(self.workspace)
        with contextlib.chdir(self.base):
            self.assertEqual(paths.workspace_path(), self.workspace)
            self.assertEqual(paths.CODE_ROOT, SCRIPTS.parent)

    def test_manifest_game_path_and_environment_override(self):
        os.environ['BROFORCE_WORKSPACE'] = str(self.workspace)
        game = self.workspace / 'game'
        assembly = game / 'Broforce_Data/Managed/Assembly-CSharp.dll'
        assembly.parent.mkdir(parents=True)
        assembly.write_bytes(b'untouched game')
        (self.workspace / 'broforge.json').write_text(json.dumps({
            'schemaVersion': 1, 'workspaceId': 'fixture', 'gamePath': 'game'}))
        self.assertEqual(workshop_paths.game_path(), game)
        os.environ['BROFORCE_GAME_PATH'] = str(self.base / 'override')
        self.assertEqual(paths.configured_game_path(), self.base / 'override')

    def test_dotnet_environment_contract(self):
        os.environ['BROFORCE_WORKSPACE'] = str(self.workspace)
        state = self.workspace / '.broforge'
        env = paths.dotnet_environment()
        expected = {
            'DOTNET_CLI_HOME': '.toolchain/dotnet-home',
            'NUGET_PACKAGES': '.toolchain/nuget/packages',
            'NUGET_HTTP_CACHE_PATH': '.toolchain/nuget/http-cache',
            'NUGET_PLUGINS_CACHE_PATH': '.toolchain/nuget/plugins-cache',
        }
        for key, suffix in expected.items():
            self.assertEqual(env[key], str(state / suffix))
        self.assertEqual(env['BROFORCE_WORKSHOP_ROOT'], str(state))
        self.assertEqual(env['PYTHONDONTWRITEBYTECODE'], '1')
        self.assertEqual(env['DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER'], '1')
        self.assertEqual(env['MSBUILDDISABLENODEREUSE'], '1')

    def test_skills_rejected_before_any_setup(self):
        with patch.object(sys, 'argv', ['setup_workshop.py', '--skills-dir', str(self.base / 'external')]), \
                patch.object(setup_workshop, 'game_path') as game, \
                patch.object(setup_workshop.shutil, 'copytree') as copy, \
                contextlib.redirect_stderr(io.StringIO()) as stderr:
            with self.assertRaises(SystemExit) as error:
                setup_workshop.main()
        self.assertEqual(error.exception.code, 2)
        self.assertIn('Use CLI setup --skills-dir, which records ownership', stderr.getvalue())
        game.assert_not_called()
        copy.assert_not_called()
        self.assertFalse((self.base / 'external').exists())

    def test_mocked_setup_builds_workspace_copy_without_game_writes(self):
        game = self.base / 'game'
        assembly = game / 'Broforce_Data/Managed/Assembly-CSharp.dll'
        assembly.parent.mkdir(parents=True)
        assembly.write_bytes(b'untouched game')
        dotnet = self.workspace / '.broforge/.toolchain/dotnet/dotnet'
        dotnet.parent.mkdir(parents=True)
        dotnet.touch()
        digest = Mock(hexdigest=lambda: 'd518444c45ba73f834bfbd163973f3c0fdbb935522144d9b95e6db74029a6b86')
        # Only source copying is real; download, hash validation, and processes are mocked.
        with patch.object(sys, 'argv', ['setup_workshop.py', '--workspace', str(self.workspace)]), \
                patch.object(setup_workshop, 'game_path', return_value=game), \
                patch.object(setup_workshop.platform, 'system', return_value='Linux'), \
                patch.object(setup_workshop.platform, 'machine', return_value='x86_64'), \
                patch.object(setup_workshop.hashlib, 'sha256', return_value=digest), \
                patch.object(setup_workshop, 'fetch') as fetch, \
                patch.object(setup_workshop.subprocess, 'run', return_value=Mock(returncode=1)) as run, \
                contextlib.redirect_stdout(io.StringIO()):
            setup_workshop.main()
        state = self.workspace / '.broforge'
        for call in fetch.call_args_list:
            self.assertTrue(call.args[1].is_relative_to(state / 'dependencies'))
        build = next(call for call in run.call_args_list if 'build' in call.args[0])
        self.assertIn('/nodeReuse:false', build.args[0])
        self.assertIn('-p:UseSharedCompilation=false', build.args[0])
        copied = state / '.toolchain/build/NativeCampaignTool'
        self.assertEqual(build.args[0][2], str(copied))
        self.assertTrue((copied / 'NativeCampaignTool.csproj').is_file())
        self.assertFalse((copied / 'obj').exists())
        self.assertFalse((copied / 'bin').exists())
        self.assertIn(str(state / '.toolchain/obj/NativeCampaignTool'), ' '.join(build.args[0]))
        self.assertEqual(assembly.read_bytes(), b'untouched game')
        self.assertFalse((game / 'Levels').exists())
        self.assertEqual(run.call_args.kwargs['env']['PYTHONDONTWRITEBYTECODE'], '1')

    def test_sdk_downloads_are_inside_captured_toolchain(self):
        game = self.base / 'game'
        assembly = game / 'Broforce_Data/Managed/Assembly-CSharp.dll'
        assembly.parent.mkdir(parents=True)
        assembly.write_bytes(b'fixture')
        metadata = {'releases': [{'sdk': {'version': '8.0.427', 'files': [{
            'rid': 'linux-x64', 'name': 'sdk.tar.gz', 'url': 'https://invalid/sdk', 'hash': 'FAKE'}]}}]}

        def fake_fetch(url, target, *args):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(metadata) if target.name == 'dotnet-releases.json' else 'fixture')

        digest = Mock(hexdigest=lambda: 'd518444c45ba73f834bfbd163973f3c0fdbb935522144d9b95e6db74029a6b86')
        with patch.object(sys, 'argv', ['setup_workshop.py', '--workspace', str(self.workspace), '--skip-profile']), \
                patch.object(setup_workshop, 'game_path', return_value=game), \
                patch.object(setup_workshop.platform, 'system', return_value='Linux'), \
                patch.object(setup_workshop.platform, 'machine', return_value='x86_64'), \
                patch.object(setup_workshop.hashlib, 'sha256', return_value=digest), \
                patch.object(setup_workshop, 'fetch', side_effect=fake_fetch) as fetch, \
                patch.object(setup_workshop.tarfile, 'open') as archive, \
                patch.object(setup_workshop.subprocess, 'run'), \
                contextlib.redirect_stdout(io.StringIO()):
            setup_workshop.main()
        downloads = self.workspace / '.broforge/.toolchain/downloads'
        self.assertEqual(fetch.call_args_list[-2].args[1], downloads / 'dotnet-releases.json')
        self.assertEqual(fetch.call_args_list[-1].args[1], downloads / 'dotnet-sdk-8.0.427-linux-x64.tar.gz')
        archive.return_value.__enter__.return_value.extractall.assert_called_once()
        self.assertFalse((self.workspace / '.broforge/runtime').exists())

    def test_prepare_only_materializes_profile(self):
        os.environ['BROFORCE_WORKSPACE'] = str(self.workspace)
        source = self.base / 'source'
        source.mkdir()
        dep = {'name': 'fixture', 'archive': 'profile.zip'}
        archive = paths.dependency_path(dep)
        archive.parent.mkdir(parents=True)
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('UMM/Core/fixture.dll', b'fixture')
        import hashlib
        dep['sha256'] = hashlib.sha256(archive.read_bytes()).hexdigest()
        (source / 'dependencies.lock.json').write_text(json.dumps([dep]))
        profile = paths.state_path() / 'runtime/profile'
        with patch.object(prepare_profile, 'ROOT', source), \
                patch.object(prepare_profile, 'PROFILE', profile), \
                patch.object(prepare_profile.subprocess, 'run') as run, \
                contextlib.redirect_stdout(io.StringIO()):
            prepare_profile.prepare()
        self.assertTrue((profile / 'UMM/Core/fixture.dll').is_file())
        self.assertEqual(len(run.call_args_list), 1)
        self.assertTrue(run.call_args.args[0][1].endswith('scripts/build_bridge.py'))
        self.assertEqual(set(self.base.iterdir()), {self.workspace, source})


if __name__ == '__main__':
    unittest.main()
