"""Verify the standalone Sprintique skill manifest; no network or execution of package files."""
from pathlib import Path, PurePosixPath
import hashlib
import re
import unittest

ROOT = Path(__file__).resolve().parent

class Manifest(unittest.TestCase):
    def test_integrity(self):
        expected = set()
        for line in (ROOT / 'MANIFEST.sha256').read_text().splitlines():
            match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
            self.assertIsNotNone(match)
            digest, name = match.groups()
            path = PurePosixPath(name)
            self.assertFalse(path.is_absolute() or '..' in path.parts or '\\' in name or name in expected)
            expected.add(name)
            file = ROOT / name
            self.assertTrue(file.is_file() and not file.is_symlink() and file.resolve().is_relative_to(ROOT))
            self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), digest, name)
        actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p.name != 'MANIFEST.sha256' and '__pycache__' not in p.parts}
        self.assertEqual(actual, expected)

if __name__ == '__main__':
    unittest.main()
