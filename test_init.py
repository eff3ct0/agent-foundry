import importlib.util
import json
import os
import re
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

    def test_factory_assets_relocate_without_moving_root_entrypoints(self):
        directory = tempfile.mkdtemp()
        try:
            shutil.copy(
                os.path.join(ROOT, "archetype-ownership.json"),
                os.path.join(directory, "archetype-ownership.json"),
            )
            for relative, content in {
                "start.py": "print('start')\n",
                "AGENT.md": "See [workflow](docs/workflow.md) and [runbook](templates/agent-runbook.md).\n",
                "README.md": "Run `python3 scripts/check-determinism.py`.\n",
                ".github/workflows/governance.yml": "run: node scripts/check-pr-governance.mjs\n",
                "docs/workflow.md": "Use [ticket](../templates/ticket.md).\nRun `python3 scripts/check-determinism.py`.\n",
                "docs/bindings.md": "# Generated bindings\n",
                "templates/agent-runbook.md": "runbook\n",
                "templates/ticket.md": "ticket\n",
                "checks/phase_state_check.py": "check\n",
                "hooks/README.md": "hooks\n",
                "scripts/check-determinism.py": "check\n",
            }.items():
                path = os.path.join(directory, relative)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as target:
                    target.write(content)

            moved = init.relocate_factory_assets(directory)

            self.assertIn(".factory/docs/workflow.md", moved)
            self.assertTrue(os.path.isfile(os.path.join(directory, "start.py")))
            self.assertTrue(os.path.isfile(os.path.join(directory, ".factory", "docs", "workflow.md")))
            self.assertTrue(os.path.isfile(os.path.join(directory, "docs", "bindings.md")))
            self.assertTrue(os.path.isdir(os.path.join(directory, ".factory", "checks")))
            self.assertFalse(os.path.exists(os.path.join(directory, "templates")))
            with open(os.path.join(directory, ".factory", "docs", "workflow.md"), encoding="utf-8") as source:
                self.assertIn("../templates/ticket.md", source.read())
            with open(os.path.join(directory, "AGENT.md"), encoding="utf-8") as source:
                self.assertIn(".factory/docs/workflow.md", source.read())
            with open(os.path.join(directory, "README.md"), encoding="utf-8") as source:
                self.assertIn(".factory/scripts/check-determinism.py", source.read())
            with open(os.path.join(directory, ".github", "workflows", "governance.yml"), encoding="utf-8") as source:
                self.assertIn(".factory/scripts/check-pr-governance.mjs", source.read())
            self.assertEqual(init.relocate_factory_assets(directory), [])
        finally:
            shutil.rmtree(directory)

    def test_feature_issue_form_has_required_product_fields(self):
        path = os.path.join(ROOT, ".github", "ISSUE_TEMPLATE", "feature.yml")
        with open(path, encoding="utf-8") as source:
            form = source.read()

        self.assertIn("name: Feature request", form)
        self.assertIn("  - type:feature", form)
        blocks = re.split(r"^  - type: ", form, flags=re.MULTILINE)[1:]
        controls = []
        for block in blocks:
            identifier = re.search(r"^    id: (.+)$", block, re.MULTILINE)
            label = re.search(r"^      label: (.+)$", block, re.MULTILINE)
            required = re.search(r"^      required: true$", block, re.MULTILINE)
            self.assertIsNotNone(identifier)
            self.assertIsNotNone(label)
            self.assertIsNotNone(required)
            controls.append((identifier.group(1), label.group(1)))

        self.assertEqual(controls, [
            ("problem", "Problem"),
            ("desired-outcome", "Desired outcome"),
            ("scope", "Scope"),
            ("acceptance", "Acceptance criteria"),
            ("constraints", "Constraints"),
            ("verification", "Verification"),
        ])


if __name__ == "__main__":
    unittest.main()
