"""The distribution writer must not hide drift or delete unrelated client files."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'agent-skills'
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('__pycache__'))
        self.client = Path(self.tmp.name) / 'client-skills'

    def tearDown(self):
        self.tmp.cleanup()

    def run_sync(self, *args):
        return subprocess.run([sys.executable, str(self.root / 'scripts/sync_bundle.py'),
                               '--client-root', str(self.client), *args], capture_output=True, text=True)

    def test_write_then_check_is_idempotent(self):
        self.assertEqual(self.run_sync('--write').returncode, 0)
        checked = self.run_sync('--check')
        self.assertEqual(checked.returncode, 0, checked.stderr + checked.stdout)
        self.assertEqual(json.loads(checked.stdout)['changed'], [])

    def test_default_check_does_not_repair_stale_client(self):
        self.assertEqual(self.run_sync('--write').returncode, 0)
        changed = self.client / 'iquipage-discovery' / 'SKILL.md'
        changed.write_text('LOCAL CHANGE')
        self.assertEqual(self.run_sync().returncode, 1)
        self.assertEqual(changed.read_text(), 'LOCAL CHANGE')

    def test_unknown_files_and_other_skill_are_preserved(self):
        self.assertEqual(self.run_sync('--write').returncode, 0)
        other = self.client / 'sprintique-work' / 'SKILL.md'
        other.parent.mkdir()
        other.write_text('UNRELATED SKILL')
        extra = self.client / 'iquipage-discovery' / 'local-note.md'
        extra.write_text('REVIEW BEFORE REMOVAL')
        self.assertEqual(self.run_sync('--write').returncode, 2)
        self.assertEqual(extra.read_text(), 'REVIEW BEFORE REMOVAL')
        self.assertEqual(other.read_text(), 'UNRELATED SKILL')


if __name__ == '__main__':
    unittest.main()
