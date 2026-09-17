import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock


ROOT = os.path.dirname(os.path.abspath(__file__))
SPEC = importlib.util.spec_from_file_location("archetype_init", os.path.join(ROOT, "init.py"))
init = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(init)


class InitializerChecks(unittest.TestCase):
    def args(self, **overrides):
        values = {
            "set": ["PROJECT_NAME=Example", "TASK_TRACKER=custom"],
            "answers": None,
            "defaults": True,
            "confirm": False,
            "dry_run": False,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_existing_repository_metadata_must_match_origin(self):
        directory = tempfile.mkdtemp()
        try:
            with open(os.path.join(directory, "AGENT.md"), "w", encoding="utf-8") as f:
                f.write("- Name: Example - Repositories: `acme/stale`\n")
            with mock.patch.object(init, "_origin_url", return_value="git@github.com:acme/current.git"):
                self.assertIn("conflicts", init.repository_conflict(directory, ""))
                self.assertEqual(init.repository_conflict(directory, "acme/current"), "")
                self.assertTrue(init.apply_repository_metadata(directory, "acme/current"))
            with open(os.path.join(directory, "AGENT.md"), encoding="utf-8") as f:
                self.assertIn("Repositories: `acme/current`", f.read())
        finally:
            shutil.rmtree(directory)

    def test_local_github_directory_does_not_select_provider(self):
        directory = tempfile.mkdtemp()
        try:
            os.mkdir(os.path.join(directory, ".github"))
            with self.assertRaisesRegex(SystemExit, "TASK_TRACKER"):
                init.gather(init.load_manifest(), self.args(set=[], defaults=False),)
        finally:
            shutil.rmtree(directory)

    def test_noninteractive_run_requires_confirmation(self):
        args = self.args()
        values = init.gather(init.load_manifest(), args)
        with self.assertRaisesRegex(SystemExit, "--confirm"):
            init.confirm_configuration(init.load_manifest(), values, args, display=False)

    def test_answers_file_can_confirm_the_final_configuration(self):
        directory = tempfile.mkdtemp()
        try:
            answers_path = os.path.join(directory, "answers.json")
            with open(answers_path, "w", encoding="utf-8") as f:
                json.dump({"PROJECT_NAME": "Example", "TASK_TRACKER": "custom", "confirm": True}, f)
            args = self.args(set=[], answers=answers_path, defaults=False)
            values = init.gather(init.load_manifest(), args)
            init.confirm_configuration(init.load_manifest(), values, args, display=False)
        finally:
            shutil.rmtree(directory)


if __name__ == "__main__":
    unittest.main()
