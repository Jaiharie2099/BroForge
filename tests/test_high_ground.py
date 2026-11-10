"""Regression checks for the actual serialized placement/selection mistakes."""
import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validator', ROOT / 'tools/validate_high_ground.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class HighGroundTests(unittest.TestCase):
    def setUp(self):
        self.payload = (ROOT / 'library/levels/high-ground/The High Ground.bfc').read_bytes()

    def validate_bytes(self, content):
        with tempfile.TemporaryDirectory() as temporary:
            p = Path(temporary) / 'test.bfc'
            p.write_bytes(content)
            return validator.validate(p)

    def test_current_campaign_validates(self):
        self.assertTrue(self.validate_bytes(self.payload)['complete_binary_consumed'])

    def test_sunken_cage_is_rejected(self):
        raised = struct.pack('<iii?', 30, 25, 0, False) + bytes([0, 1, 0])
        sunk = struct.pack('<iii?', 30, 24, 0, False) + bytes([0, 1, 0])
        self.assertEqual(self.payload.count(raised), 1)
        with self.assertRaisesRegex(AssertionError, 'Rescue cage overlaps solid terrain'):
            self.validate_bytes(self.payload.replace(raised, sunk))

    def test_forcing_rambro_is_rejected(self):
        random_bro = struct.pack('<i', 1000)
        self.assertEqual(self.payload.count(random_bro), 1)
        with self.assertRaisesRegex(AssertionError, 'Global bro forcing'):
            self.validate_bytes(self.payload.replace(random_bro, struct.pack('<i', 0)))

    def test_visible_spawn_cages_are_rejected(self):
        invisible = struct.pack('<iii?', 4, 36, 1, False) + bytes([0, 35, 0])
        visible = struct.pack('<iii?', 4, 36, 0, False) + bytes([0, 35, 0])
        self.assertEqual(self.payload.count(invisible), 1)
        with self.assertRaisesRegex(AssertionError, 'SpawnPoint variation 1'):
            self.validate_bytes(self.payload.replace(invisible, visible))

    def test_published_header_has_campaign_metadata(self):
        package = (ROOT / 'library/levels/high-ground/The High Ground.bfg').read_bytes()
        header, encrypted = package.split(bytes([31]), 1)
        root = ElementTree.fromstring(header)
        self.assertEqual(root.tag, 'CampaignHeader')
        self.assertEqual(root.findtext('name'), 'The High Ground')
        self.assertEqual(root.findtext('author'), 'Jai')
        self.assertEqual(root.findtext('length'), '1')
        self.assertEqual(root.findtext('gameMode'), 'Campaign')
        self.assertIsNone(root.find('isPublished'))  # native XmlIgnore; loader sets runtime state
        self.assertEqual(len(root.findtext('md5')), 32)
        self.assertTrue(encrypted)


if __name__ == '__main__':
    unittest.main()
