"""Check portable paths, metadata and the installed project copy; no network or credentials."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'sprintique-work'
COPY = ROOT.parents[2] / '.agents' / 'skills' / 'sprintique-work'

class PortableSkill(unittest.TestCase):
    def test_portable_links_and_exact_project_copy(self):
        for source in SOURCE.rglob('*'):
            if not source.is_file():
                continue
            relative = source.relative_to(SOURCE)
            self.assertEqual(source.read_bytes(), (COPY / relative).read_bytes(), str(relative))
            if source.suffix == '.md':
                for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)', source.read_text()):
                    if re.match(r'^[a-z]+:', link) or link.startswith('#'):
                        continue
                    dest = (source.parent / link.split('#')[0]).resolve()
                    self.assertTrue(dest.is_relative_to(SOURCE.resolve()) and dest.is_file(), link)
        text = (SOURCE / 'SKILL.md').read_text()
        self.assertRegex(text, r'^---\nname: sprintique-work\n')
        self.assertIn('version: "1.0.0"', text)
        self.assertLess(len(text.splitlines()), 100)
        self.assertIn('allow_implicit_invocation: true', (SOURCE / 'agents' / 'openai.yaml').read_text())

if __name__ == '__main__':
    unittest.main()
