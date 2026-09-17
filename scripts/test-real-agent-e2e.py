#!/usr/bin/env python3
"""Focused offline checks for the real-agent invocation contract."""

import importlib.util
import json
import os
import subprocess
import tempfile
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("real_agent", Path(__file__).with_name("real-agent-e2e.py"))
agent = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent)


def valid_decisions():
    return {
        "confirm": True,
        "decisions": {key: "explicit" for key in agent.DECISION_KEYS},
        "feature": {
            "slug": "small-feature", "title": "Small feature",
            "acceptance": ["It works"], "implementation_files": ["hello.py"],
        },
    }


def main():
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "decisions.json"
        data = valid_decisions()
        path.write_text(json.dumps(data), encoding="utf-8")
        assert agent.validate_decisions(path) == data
        data["confirm"] = False
        path.write_text(json.dumps(data), encoding="utf-8")
        try:
            agent.validate_decisions(path)
        except agent.JourneyError as error:
            assert error.code == "decision_missing"
        else:
            raise AssertionError("missing confirmation accepted")
    assert agent.event_kind(["python3 start.py"])[0] == "startup"
    assert agent.event_kind(["git commit -m 'feat: hello #7'"])[0] == "implementation"
    assert agent.event_kind(["gh issue create --label status:approved"])[0] == "gate"
    assert agent.event_kind(["python3 -m unittest test_hello.py", "exit_code=0"])[0] == "test"
    with tempfile.TemporaryDirectory() as directory:
        events, commands, successful = agent.parse_events(
            '{"type":"command_execution","command":"python3 -m unittest test_hello.py","exit_code":0}\n',
            Path(directory), [],
        )
        assert events and events[0]["kind"] == "test"
        assert successful and "test_hello.py" in successful[0]
        assert commands == ["python3 -m unittest test_hello.py"]
        try:
            agent.parse_events("not-json\n", Path(directory), [])
        except agent.JourneyError as error:
            assert error.code == "malformed_output"
        else:
            raise AssertionError("malformed agent output accepted")
        guard_dir = Path(directory) / "guards"
        guard_dir.mkdir()
        marker = Path(directory) / "blocked"
        real_gh, real_git, _ = agent.write_guards(guard_dir, marker)
        environment = dict(
            os.environ, PATH=str(guard_dir) + os.pathsep + os.environ.get("PATH", ""),
            REAL_AGENT_BLOCKED=str(marker), REAL_GH=real_gh, REAL_GIT=real_git,
        )
        blocked = subprocess.run(["gh", "issue", "edit", "1"], env=environment, capture_output=True)
        assert blocked.returncode == 126 and marker.exists()
    assert "secret" not in agent.redacted("password=secret")
    print("real-agent E2E focused checks OK")


if __name__ == "__main__":
    main()
