#!/usr/bin/env python3
"""Check that the delegated-delivery contract and approval gates stay aligned."""

from copy import deepcopy
import json
from pathlib import Path
import re
import tempfile


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_FILES = (
    ROOT / "AGENT.md",
    ROOT / "templates" / "agent-runbook.md",
    ROOT / "docs" / "bindings.md",
    ROOT / "providers" / "task" / "_contract.md",
    ROOT / "providers" / "secrets" / "_contract.md",
    ROOT / "providers" / "code-intel" / "_contract.md",
    ROOT / "ci" / "_contract.md",
    ROOT / "ci" / "recipes.json",
)
PROVIDER_DIRS = {
    "task": "task",
    "secrets": "secrets",
    "code-intel": "code-intel",
}
DOCUMENT_SECTIONS = {
    "AGENT.md": (
        "Project coordinates",
        "Archetype documents",
        "Operating rules",
        "Protected `status:approved` gate",
        "Bindings (provider contract)",
        "Reading order for a cold agent",
    ),
    "agent-runbook.md": (
        "Why this is a contract, not a runner",
        "Convergence rules",
        "Principle: the session is disposable",
        "Session cycle",
        "Approval boundaries",
        "Guardrails",
    ),
    "bindings.md": ("Protected `status:approved` gate",),
}
CONTRACT_INSTANCE = re.compile(
    r"Contract\s+instance\s*:\s*\*{0,2}\s*\[[^]]+\]\(([^)]+)\)", re.IGNORECASE
)
LOCAL_LINK = re.compile(r"\[[^]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)")
CODE_INTEL_NONE_MARKERS = ("intentional minimal", "default", "no dependency")
CI_RECIPE_MARKER = "# Instance of ci/_contract.md"
SECTION_ALIASES = {
    "how the agent interacts": ("agent interaction",),
    "how the agent resolves secrets": ("agent interaction", "agent resolution"),
    "rules and limitations": ("rules",),
    "prohibitions": ("prohibition",),
    "protected `status:approved` gate": ("protected approval",),
}


def _display(path, root):
    path = Path(path)
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.name


def _headings(text):
    return tuple(
        match.group(1).strip().rstrip("#").rstrip()
        for match in re.finditer(r"^#{2,6}\s+(.+?)\s*$", text, re.MULTILINE)
    )


def _section_key(section):
    return section.lower().split(" (", 1)[0].strip()


def _field(text, name):
    for line in text.splitlines():
        line = re.sub(r"^\s*[-*>]\s*", "", line).replace("**", "")
        match = re.match(r"^\s*([^:*]+?)\s*:\s*(.*?)\s*$", line)
        if match and match.group(1).strip().lower() == name.lower():
            return match.group(2).strip()
    return ""


def _section_present(text, section):
    sections = {_section_key(heading) for heading in _headings(text)}
    wanted = _section_key(section)
    if wanted in sections:
        return True
    labels = {
        _section_key(match.group(1))
        for match in re.finditer(r"^\s*(?:[-*>]\s*)?\*\*(.+?):\*\*", text, re.MULTILINE)
    }
    if wanted in labels:
        return True
    if wanted == "identity" and all(
        _field(text, field) for field in ("Contract instance", "Capability", "Provider")
    ):
        return True
    return any(alias in labels for alias in SECTION_ALIASES.get(wanted, ()))


def _provider_files(root):
    for capability, directory in PROVIDER_DIRS.items():
        provider_dir = root / "providers" / directory
        for path in sorted(provider_dir.glob("*.md")):
            if path.name != "_contract.md":
                yield capability, path


def _check_links(path, text, root, errors):
    for target in LOCAL_LINK.findall(text):
        target = target.strip("<>")
        if (
            not target
            or target.startswith("#")
            or re.match(r"^[a-z][a-z0-9+.-]*:", target, re.IGNORECASE)
        ):
            continue
        destination = (path.parent / target.split("#", 1)[0]).resolve()
        if not destination.exists():
            errors.append("%s broken link: %s" % (_display(path, root), target))


def _check_document(path, text, root, errors):
    required = DOCUMENT_SECTIONS.get(path.name, ())
    headings = {_section_key(heading) for heading in _headings(text)}
    for section in required:
        if _section_key(section) not in headings:
            errors.append("%s missing section: ## %s" % (_display(path, root), section))
    if path.name == "bindings.md":
        linked = {
            (path.parent / target.split("#", 1)[0]).resolve()
            for target in LOCAL_LINK.findall(text)
        }
        for relative in (
            "providers/task/_contract.md",
            "providers/secrets/_contract.md",
            "providers/code-intel/_contract.md",
            "ci/_contract.md",
        ):
            if (root / relative).resolve() not in linked:
                errors.append(
                    "%s missing contract link: %s" % (_display(path, root), relative)
                )


def _check_provider(capability, path, contract_path, contract_text, text, root, errors):
    label = _display(path, root)
    required = _headings(contract_text)
    for section in required:
        if not _section_present(text, section):
            errors.append("%s missing contract section: ## %s" % (label, section))

    instance = CONTRACT_INSTANCE.search(text)
    expected = contract_path.resolve()
    if not instance:
        errors.append("%s missing Contract instance link" % label)
    else:
        linked = (path.parent / instance.group(1).split("#", 1)[0]).resolve()
        if linked != expected:
            errors.append(
                "%s Contract instance link must resolve to %s"
                % (label, _display(contract_path, root))
            )

    expected_capability = (
        "code-intelligence" if capability == "code-intel" else capability
    )
    if _field(text, "Capability").strip("`").lower() != expected_capability:
        errors.append("%s must declare Capability: %s" % (label, expected_capability))
    provider = _field(text, "Provider").strip("`")
    if not provider:
        errors.append("%s must declare a Provider" % label)
    elif path.stem != "custom" and provider.lower() != path.stem.lower():
        errors.append("%s Provider must match selectable name %r" % (label, path.stem))

    if capability == "code-intel" and path.stem == "none":
        lowered = text.lower()
        missing = [
            marker for marker in CODE_INTEL_NONE_MARKERS if marker not in lowered
        ]
        if missing:
            errors.append(
                "%s missing explicit intentional-minimal none contract: %s"
                % (label, ", ".join(missing))
            )


def _check_ci(path, root, errors):
    label = _display(path, root)
    try:
        recipes = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        errors.append("%s invalid CI recipes: %s" % (label, error.__class__.__name__))
        return
    if not isinstance(recipes, dict) or not recipes:
        errors.append("%s must contain at least one CI recipe" % label)
        return
    for name, job in sorted(recipes.items()):
        if name == "_contract":
            errors.append("%s must not select _contract" % label)
            continue
        if not isinstance(job, str):
            errors.append("%s recipe %r must be a YAML job string" % (label, name))
            continue
        if CI_RECIPE_MARKER not in job:
            errors.append("%s recipe %r missing %s" % (label, name, CI_RECIPE_MARKER))
        if not re.search(r"(?m)^\s{2}%s:\s*$" % re.escape(name), job):
            errors.append(
                "%s recipe %r must expose its recipe key as the job" % (label, name)
            )
        for required in ("runs-on:", "actions/checkout@", "steps:", "run:"):
            if required not in job:
                errors.append("%s recipe %r missing %s" % (label, name, required))


def _all_paths(root):
    required = [root / path.relative_to(ROOT) for path in CONTRACT_FILES]
    return required + [path for _, path in _provider_files(root)]


def _infer_root(paths, root):
    if root != ROOT:
        return root
    for path in paths:
        path = Path(path)
        if (
            path.parent.name in PROVIDER_DIRS.values()
            and path.parent.parent.name == "providers"
        ):
            return path.parent.parent.parent.resolve()
    return root


def check(paths=None, root=ROOT):
    """Return deterministic structural contract errors for the selected files."""
    root = Path(root).resolve()
    default_paths = paths is None
    if not default_paths:
        paths = list(paths)
        root = _infer_root(paths, root)
    paths = [
        path if Path(path).is_absolute() else root / path
        for path in (_all_paths(root) if default_paths else paths)
    ]
    errors = []
    present = []
    for path in paths:
        path = Path(path)
        if not path.exists():
            errors.append("required file missing: %s" % _display(path, root))
            continue
        present.append(path)

    for path in present:
        if path.suffix.lower() == ".md":
            text = path.read_text(encoding="utf-8")
            _check_links(path, text, root, errors)
            _check_document(path, text, root, errors)

    contracts = {}
    for capability, directory in PROVIDER_DIRS.items():
        contract_path = root / "providers" / directory / "_contract.md"
        if contract_path.exists():
            contracts[capability] = (
                contract_path,
                contract_path.read_text(encoding="utf-8"),
            )

    provider_paths = list(_provider_files(root)) if default_paths else []
    if not default_paths:
        # Explicit fixture paths are intentionally handled separately from the real tree.
        for capability, directory in PROVIDER_DIRS.items():
            for path in paths:
                path = Path(path)
                if (
                    path.parent == root / "providers" / directory
                    and path.name != "_contract.md"
                ):
                    provider_paths.append((capability, path))

    for capability, path in provider_paths:
        contract = contracts.get(capability)
        if not contract or not path.exists():
            continue
        contract_path, contract_text = contract
        _check_provider(
            capability,
            path,
            contract_path,
            contract_text,
            path.read_text(encoding="utf-8"),
            root,
            errors,
        )

    recipes = root / "ci" / "recipes.json"
    if recipes in present:
        _check_ci(recipes, root, errors)
    return errors


APPROVAL_ACTION = "add status:approved"
ALLOWED_PRINCIPAL_ROLES = ("MAINTAINER", "AUTHORIZED_APPROVER")
ALLOWED_ACTOR_CAPABILITIES = ("MAINTAIN", "ADMIN")


def delegated_approval_errors(evidence, target_issue):
    """Return failures for one structured, target-bound approval attempt."""
    instruction = evidence.get("instruction", {})
    principal = evidence.get("principal", {})
    actor = evidence.get("actor", {})
    operation = evidence.get("operation", {})
    readback = evidence.get("readback", {})
    errors = []

    if instruction.get("source") != "direct-human":
        errors.append("instruction must be direct human input")
    if instruction.get("current") is not True:
        errors.append("instruction must be current")
    if instruction.get("issue") != target_issue:
        errors.append("instruction must name the exact target issue")
    if instruction.get("action") != APPROVAL_ACTION:
        errors.append("instruction must name the exact approval action")
    if principal.get("evidence_source") != "target-host":
        errors.append("principal authority must come from the target host")
    if principal.get("role") not in ALLOWED_PRINCIPAL_ROLES:
        errors.append("principal lacks target-host maintainer authority")
    if instruction.get("principal") != principal.get("subject"):
        errors.append("instruction principal is not bound to target-host evidence")
    if actor.get("subject") != principal.get("subject"):
        errors.append("authenticated actor is not the authorized principal")
    if actor.get("capability") not in ALLOWED_ACTOR_CAPABILITIES:
        errors.append("actor lacks MAINTAIN or ADMIN capability")
    if (
        operation.get("issue") != target_issue
        or operation.get("label") != "status:approved"
    ):
        errors.append("operation is not scoped to the exact issue and label")
    if operation.get("attempts") != 1:
        errors.append("operation must have exactly one add attempt")
    if operation.get("sequence") != ["add", "readback"]:
        errors.append("readback must immediately follow the one add attempt")
    if operation.get("result") != "added":
        errors.append("mutation must succeed with a known added result")
    if readback.get("issue") != target_issue or "status:approved" not in readback.get(
        "labels", []
    ):
        errors.append("target-host readback does not confirm the approval")
    return errors


def delegated_approval_allowed(evidence, target_issue):
    """Return True only when every delegated-approval condition is proven."""
    return not delegated_approval_errors(evidence, target_issue)


def approval_self_check():
    valid = {
        "instruction": {
            "source": "direct-human",
            "current": True,
            "issue": 32,
            "action": APPROVAL_ACTION,
            "principal": "human-1",
        },
        "principal": {
            "evidence_source": "target-host",
            "subject": "human-1",
            "role": "MAINTAINER",
        },
        "actor": {"subject": "human-1", "capability": "ADMIN"},
        "operation": {
            "issue": 32,
            "label": "status:approved",
            "attempts": 1,
            "result": "added",
            "sequence": ["add", "readback"],
        },
        "readback": {"issue": 32, "labels": ["status:approved"]},
    }
    assert delegated_approval_allowed(valid, 32)

    for field, value in (
        (("instruction", "issue"), 31),
        (("instruction", "current"), False),
        (("instruction",), {}),
        (("principal", "role"), "CONTRIBUTOR"),
        (("actor", "capability"), "TRIAGE"),
        (("operation", "result"), "unknown"),
        (("readback", "labels"), []),
    ):
        rejected = deepcopy(valid)
        if len(field) == 2:
            rejected[field[0]][field[1]] = value
        else:
            rejected[field[0]] = value
        assert not delegated_approval_allowed(rejected, 32), field

    print("approval self-check OK")


def self_check():
    errors = check()
    assert not errors, "\n".join(errors)

    with tempfile.TemporaryDirectory() as directory:
        fixture_root = Path(directory)
        missing = fixture_root / "missing.md"
        assert check([missing], root=fixture_root) == [
            "required file missing: missing.md"
        ]

        code_dir = fixture_root / "providers" / "code-intel"
        code_dir.mkdir(parents=True)
        contract = """# Abstract contract

## Identity
## Binding
## How the agent interacts
## Rules and limitations
## Prohibitions
"""
        contract_path = code_dir / "_contract.md"
        contract_path.write_text(contract, encoding="utf-8")
        incomplete = code_dir / "incomplete.md"
        incomplete.write_text(
            "> **Contract instance:** [`_contract.md`](./_contract.md)\n"
            "> **Capability:** `code-intelligence`\n"
            "> **Provider:** `incomplete`\n\n## Identity\n",
            encoding="utf-8",
        )
        incomplete_errors = check([contract_path, incomplete], root=fixture_root)
        assert any(
            "incomplete.md missing contract section" in error
            for error in incomplete_errors
        ), incomplete_errors

        valid = code_dir / "valid.md"
        valid_text = """## Valid provider

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `code-intelligence`
> **Provider:** `valid`

## Identity
## Binding
The provider is available for structural navigation.
## How the agent interacts
Use the documented query mechanism.
## Rules and limitations
Use native tools when unavailable.
## Prohibitions
Do not bypass repository policy.
"""
        valid.write_text(valid_text, encoding="utf-8")
        broken = valid_text.replace("./_contract.md", "./missing-contract.md")
        valid.write_text(broken, encoding="utf-8")
        broken_errors = check([contract_path, valid], root=fixture_root)
        assert any("valid.md broken link" in error for error in broken_errors), (
            broken_errors
        )
        assert all(str(fixture_root) not in error for error in broken_errors), (
            broken_errors
        )

        valid.write_text(valid_text, encoding="utf-8")
        assert check([contract_path, valid], root=fixture_root) == [], check(
            [contract_path, valid], root=fixture_root
        )

    approval_self_check()
    print("self-check OK")


if __name__ == "__main__":
    import sys

    if "--approval-self-check" in sys.argv:
        approval_self_check()
    else:
        self_check()
