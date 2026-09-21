"""Node-backed release-reference validation for Python release consumers."""
import json
from pathlib import Path
from subprocess import TimeoutExpired, run


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "release-ref.mjs"
ERROR_MESSAGE = "tag must be a safe non-empty Git ref"


def validate_tag(tag):
    try:
        result = run(
            ["node", str(VALIDATOR), "--json", json.dumps(tag)],
            text=True, capture_output=True, timeout=5, check=False,
        )
    except (OSError, TimeoutExpired) as error:
        raise ValueError(ERROR_MESSAGE) from error
    if result.returncode:
        raise ValueError(result.stderr.strip() or ERROR_MESSAGE)
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ValueError(ERROR_MESSAGE) from error
    if not isinstance(value, dict) or not isinstance(value.get("tag"), str):
        raise ValueError(ERROR_MESSAGE)
    return value["tag"]
