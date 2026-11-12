"""Integration checks against the installed game's real managed implementation."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NativeDesignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        state = Path(os.environ.get('BROFORCE_WORKSPACE', Path.cwd())).resolve() / '.broforge'
        cls.dotnet = state / '.toolchain/dotnet/dotnet'
        cls.tool = state / '.toolchain/native-campaign-tool/NativeCampaignTool.dll'
        cls.managed = Path(os.environ.get('BROFORCE_MANAGED_DIR', Path.home() / 'snap/steam/common/.local/share/Steam/steamapps/common/Broforce/Broforce_Data/Managed'))
        if not cls.dotnet.exists() or not cls.tool.exists() or not (cls.managed / 'Assembly-CSharp.dll').exists():
            raise unittest.SkipTest('Requires local .NET tool build and installed Broforce managed assemblies')

    def run_tool(self, *args):
        return subprocess.run([str(self.dotnet), str(self.tool), '--managed', str(self.managed), *map(str, args)], capture_output=True, text=True, cwd=ROOT)

    def test_native_constructors_match_verified_editable_campaign(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'native.bfg'
            result = self.run_tool('--design', ROOT/'templates/campaigns/high-ground.json', '--output', output)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertIn('native Campaign/MapData', report['nativeApi'])
            self.assertEqual(output.with_suffix('.bfc').read_bytes(), (ROOT/'library/levels/high-ground/The High Ground.bfc').read_bytes())
            self.assertIn('native editable round trip', report['validation'])

    def test_input_route_still_packages_existing_campaign(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'published.bfg'
            result = self.run_tool('--input', ROOT/'library/levels/high-ground/The High Ground.bfc', '--output', output)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report['nativeApi'], 'Campaign.Deserialize -> FileIO.SerializeCampaign(true,true)')
            self.assertIsNone(report['editableOutput'])
            self.assertFalse(output.with_suffix('.bfc').exists())

    def test_invalid_native_terrain_enum_fails_without_output(self):
        with tempfile.TemporaryDirectory() as directory:
            design = json.loads((ROOT/'templates/campaigns/high-ground.json').read_text())
            design['levels'][0]['terrain'][0]['type'] = 'NotARealTerrainType'
            input_file = Path(directory) / 'invalid.json'
            input_file.write_text(json.dumps(design))
            output = Path(directory) / 'invalid.bfg'
            result = self.run_tool('--design', input_file, '--output', output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('NotARealTerrainType', result.stderr)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
