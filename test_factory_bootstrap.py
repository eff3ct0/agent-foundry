#!/usr/bin/env python3
"""Focused offline checks for factory_bootstrap.py."""
import contextlib
import importlib.util
import io
import sys
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location("factory_bootstrap", "factory_bootstrap.py")
factory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(factory)


class Result:
    def __init__(self, returncode, stderr="", stdout=""):
        self.returncode = returncode
        self.stderr = stderr
        self.stdout = stdout


class FactoryBootstrapChecks(unittest.TestCase):
    def test_lookup_success_and_confirmed_absence(self):
        with mock.patch.object(factory, "_gh", return_value=Result(0)):
            self.assertEqual(factory._lookup("acme/factory"), (factory.LOOKUP_EXISTS, ""))
        with mock.patch.object(
            factory, "_gh", return_value=Result(1, "GraphQL: Could not resolve to a Repository")
        ):
            self.assertEqual(factory._lookup("acme/factory")[0], factory.LOOKUP_MISSING)

    def test_failed_lookup_is_indeterminate(self):
        for message in (
            "authentication required (401)",
            "permission denied (403)",
            "network timeout",
            "API rate limit exceeded (429)",
            "unexpected GitHub failure",
        ):
            with self.subTest(message=message), mock.patch.object(
                factory, "_gh", return_value=Result(1, message)
            ):
                self.assertEqual(factory._lookup("acme/factory")[0], factory.LOOKUP_INDETERMINATE)

    def test_indeterminate_lookup_blocks_all_creation_even_with_yes(self):
        results = iter((
            Result(1, "Could not resolve to a Repository"),
            Result(1, "permission denied (403)"),
        ))
        with mock.patch.object(factory, "_preflight"), mock.patch.object(
            factory, "_gh", side_effect=lambda *args: next(results)
        ) as gh:
            self.assertEqual(factory.ensure("acme", "factory", "private", False, True), 1)
        self.assertEqual([call.args[:2] for call in gh.call_args_list], [("repo", "view"), ("repo", "view")])

    def test_plan_requires_org(self):
        output = io.StringIO()
        error = io.StringIO()
        with mock.patch.object(sys, "argv", ["factory_bootstrap.py", "--plan"]), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            with self.assertRaises(SystemExit) as raised:
                factory.main()
        self.assertEqual(raised.exception.code, 2)
        self.assertIn("--org is required", error.getvalue())
        self.assertNotIn("None/.github", output.getvalue())

    def test_consent_creates_confirmed_missing_repositories(self):
        with mock.patch.object(factory, "_preflight"), mock.patch.object(
            factory, "_gh", side_effect=[
                Result(1, "404 Not Found"), Result(1, "404 Not Found"),
                Result(0), Result(0),
            ]
        ), mock.patch("builtins.input", return_value="y") as prompt:
            self.assertEqual(factory.ensure("acme", "factory", "private", False, False), 0)
        self.assertEqual(prompt.call_count, 2)

    def test_idempotent_reruns(self):
        created = set()

        def fake_gh(*args):
            target = args[2]
            if args[:2] == ("repo", "view"):
                return Result(0) if target in created else Result(1, "404 Not Found")
            created.add(target)
            return Result(0)

        with mock.patch.object(factory, "_preflight"), mock.patch.object(factory, "_gh", side_effect=fake_gh):
            self.assertEqual(factory.ensure("acme", "factory", "private", False, True), 0)
            self.assertEqual(factory.ensure("acme", "factory", "private", False, True), 0)
        self.assertEqual(created, {"acme/.github", "acme/factory"})


if __name__ == "__main__":
    unittest.main()
