#!/usr/bin/env python3
"""Executable consistency and interruption check for the phase-state contract."""

from dataclasses import dataclass, replace
from pathlib import Path


PHASES = (
    "DEFINITION",
    "IMPLEMENTATION",
    "TESTING/TDD",
    "VERIFICATION",
    "EVIDENCE/DELIVERY",
)
DONE = "DONE"
BLOCKED = "BLOCKED"
ACTIVE = "ACTIVE"
BLOCKED_APPROVAL = "BLOCKED: requires approval"
REQUIRED_HANDOFF_FIELDS = (
    "current phase",
    "completed work",
    "exact next action",
    "branch",
    "commit",
    "verification evidence",
    "evidence to resume",
)


class TransitionError(ValueError):
    pass


@dataclass(frozen=True)
class PhaseState:
    status: str
    current_phase: str
    completed_work: str
    exact_next_action: str
    branch: str
    commit: str
    verification_evidence: str
    required_resume_evidence: str
    phase_complete: bool = False
    resume_phase: str = ""
    blocker: str = ""
    dod_complete: bool = False
    review_approved: bool = False


def initial_state():
    return PhaseState(
        status=ACTIVE,
        current_phase=PHASES[0],
        completed_work="No phase completed",
        exact_next_action="Record the problem, scope, acceptance criteria, dependencies, and plan",
        branch="feat/28-phase-progress",
        commit="WIP",
        verification_evidence="Not yet run: definition is in progress",
        required_resume_evidence="Acceptance criteria, scope, dependencies, and plan",
    )


def complete_phase(
    state,
    completed_work,
    verification_evidence,
    dod_complete=False,
    review_approved=False,
):
    if state.status != ACTIVE:
        raise TransitionError("only active work can complete a phase")
    if state.current_phase not in PHASES:
        raise TransitionError("invalid active phase")
    if not completed_work or not verification_evidence:
        raise TransitionError("completed work and verification evidence are required")

    if state.current_phase == PHASES[-1]:
        if not (dod_complete and review_approved):
            raise TransitionError("EVIDENCE/DELIVERY requires DoD and review gates")
        return replace(
            state,
            completed_work=completed_work,
            exact_next_action="Transition the task to DONE",
            verification_evidence=verification_evidence,
            required_resume_evidence="Final tracker update and closure evidence",
            phase_complete=True,
            dod_complete=True,
            review_approved=True,
        )

    next_phase = PHASES[PHASES.index(state.current_phase) + 1]
    return replace(
        state,
        current_phase=next_phase,
        completed_work=completed_work,
        exact_next_action="Complete %s" % next_phase,
        verification_evidence=verification_evidence,
        required_resume_evidence="Evidence that %s is complete" % next_phase,
        phase_complete=False,
    )


def mark_done(state):
    if state.current_phase != PHASES[-1] or not state.phase_complete:
        raise TransitionError("DONE requires completed EVIDENCE/DELIVERY")
    if not (state.dod_complete and state.review_approved):
        raise TransitionError("DONE requires DoD and review gates")
    return replace(
        state,
        status=DONE,
        current_phase=DONE,
        exact_next_action="No action: task is complete",
        required_resume_evidence="None: task is complete",
    )


def block(state, blocker, approval=False):
    if state.status != ACTIVE or state.current_phase not in PHASES:
        raise TransitionError("only active work can be blocked")
    if not blocker:
        raise TransitionError("a blocker is required")
    return replace(
        state,
        status=BLOCKED_APPROVAL if approval else BLOCKED,
        current_phase=BLOCKED,
        exact_next_action="Resolve blocker: %s" % blocker,
        required_resume_evidence="Evidence that the blocker is resolved",
        resume_phase=state.current_phase,
        blocker=blocker,
    )


def resume(state, resolution_evidence):
    if state.status not in (BLOCKED, BLOCKED_APPROVAL) or not state.resume_phase:
        raise TransitionError("only blocked work can resume")
    if not resolution_evidence:
        raise TransitionError("resolution evidence is required")
    return replace(
        state,
        status=ACTIVE,
        current_phase=state.resume_phase,
        exact_next_action="Continue %s" % state.resume_phase,
        verification_evidence=resolution_evidence,
        required_resume_evidence="Evidence that %s is complete" % state.resume_phase,
        resume_phase="",
        blocker="",
    )


def render_handoff(state):
    return "\n".join(
        (
            "## Phase state",
            "- Status: `%s`" % state.status,
            "- Current phase: `%s`" % state.current_phase,
            "- Completed work: %s" % state.completed_work,
            "- Exact next action: %s" % state.exact_next_action,
            "- Branch: `%s`" % state.branch,
            "- Commit: `%s`" % state.commit,
            "- Verification evidence: %s" % state.verification_evidence,
            "- Required evidence to resume: %s" % state.required_resume_evidence,
            "- Resume phase when blocked: `%s`" % (state.resume_phase or "NOT BLOCKED"),
            "- Blocker or approval needed: %s" % (state.blocker or "NOT BLOCKED"),
        )
    )


def parse_handoff(text):
    result = {}
    for line in text.splitlines():
        if not line.startswith("- ") or ": " not in line:
            continue
        key, value = line[2:].split(": ", 1)
        result[key] = value.strip("`")
    return result


class DurableTracker:
    def __init__(self, provider):
        self.provider = provider
        self.issue_handoff = ""
        self.issue_state = None
        self.project_item = None
        self.bound_state = None

    def persist(self, state):
        self.issue_handoff = render_handoff(state)
        self.issue_state = {"status": state.status, "handoff": self.issue_handoff}
        if self.provider == "github-projects":
            self.project_item = {
                "status": "Done" if state.status == DONE else "In Progress",
                "current_phase": state.current_phase,
            }
        self.bound_state = {
            "status": state.status,
            "current_phase": state.current_phase,
            "completed_work": state.completed_work,
            "exact_next_action": state.exact_next_action,
            "branch": state.branch,
            "commit": state.commit,
            "verification_evidence": state.verification_evidence,
            "required_resume_evidence": state.required_resume_evidence,
        }

    def cold_read(self):
        return parse_handoff(self.issue_handoff)


def assert_handoff_is_resumable(tracker, state, expected_phase=None):
    record = tracker.cold_read()
    assert record["Status"] == state.status, record
    assert record["Current phase"] == (expected_phase or state.current_phase), record
    assert record["Completed work"] == state.completed_work, record
    assert record["Exact next action"], record
    assert record["Branch"] == state.branch, record
    assert record["Commit"] == state.commit, record
    assert record["Verification evidence"], record
    assert record["Required evidence to resume"], record
    assert tracker.bound_state["current_phase"] == state.current_phase, (
        tracker.bound_state
    )
    assert tracker.issue_state["handoff"] == tracker.issue_handoff, tracker.issue_state
    if tracker.provider == "github-projects":
        assert tracker.project_item["current_phase"] == state.current_phase, (
            tracker.project_item
        )
    return record


def assert_documents_are_consistent(root):
    documents = [
        root / "AGENT.md",
        root / "templates" / "agent-runbook.md",
        root / "templates" / "handoff.md",
        root / "providers" / "task" / "github-issues.md",
        root / "providers" / "task" / "github-projects.md",
    ]
    for path in documents:
        text = path.read_text(encoding="utf-8").lower()
        for phase in PHASES:
            assert phase.lower() in text, "%s misses %s" % (path, phase)
        for field in REQUIRED_HANDOFF_FIELDS:
            assert field in text, "%s misses %s" % (path, field)
    handoff = (root / "templates" / "handoff.md").read_text(encoding="utf-8")
    assert "BLOCKED: requires approval" in handoff
    assert "Definition of Done" in (root / "AGENT.md").read_text(encoding="utf-8")


def run():
    root = Path(__file__).resolve().parents[1]
    assert_documents_are_consistent(root)

    for provider in ("github-issues", "github-projects"):
        tracker = DurableTracker(provider)
        state = initial_state()
        tracker.persist(state)

        for index, phase in enumerate(PHASES[:-1]):
            state = complete_phase(
                state,
                "Completed %s" % phase,
                "phase-state check: %s persisted" % phase,
            )
            tracker.persist(state)
            assert_handoff_is_resumable(tracker, state, PHASES[index + 1])

        try:
            mark_done(state)
        except TransitionError:
            pass
        else:
            raise AssertionError("DONE bypassed EVIDENCE/DELIVERY gates")

        state = complete_phase(
            state,
            "Recorded evidence and delivery readiness",
            "phase-state check: verification and review evidence passed",
            dod_complete=True,
            review_approved=True,
        )
        tracker.persist(state)
        record = assert_handoff_is_resumable(tracker, state)
        assert record["Exact next action"] == "Transition the task to DONE", record

        state = mark_done(state)
        tracker.persist(state)
        assert_handoff_is_resumable(tracker, state)

        blocked = block(initial_state(), "publish release", approval=True)
        tracker.persist(blocked)
        record = assert_handoff_is_resumable(tracker, blocked)
        assert record["Status"] == BLOCKED_APPROVAL, record
        assert record["Resume phase when blocked"] == "DEFINITION", record
        resumed = resume(blocked, "approval decision recorded by a human")
        assert resumed.status == ACTIVE and resumed.current_phase == "DEFINITION", (
            resumed
        )

    print("phase-state check OK")


if __name__ == "__main__":
    run()
