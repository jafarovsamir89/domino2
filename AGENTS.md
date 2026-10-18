# Domino remediation handoff

Before continuing this remediation, read these files in order:

1. `docs/remediation/AGENT_JOURNAL.md` — current state, decisions and exact next action.
2. `docs/remediation/WORK_LOG.md` — append-only work/check history.
3. `docs/audit/REMEDIATION_PLAN.md` — 42 task IDs, dependencies and acceptance.

The game is deployed and the owner reports about 50 users as of 2026-10-18. Prepare and verify changes locally on a feature branch. Production deploys, production migrations, live wallet edits and changes to the published Android package require a direct user instruction for those actions. A later direct instruction is authorization; do not repeatedly ask for the same approval. Continue independent local work without waiting for unrelated external checks.

Keep the two remediation journals useful for another agent: record task IDs, branch, decisions, changed files, commands/results, evidence paths, remaining risks and a concrete next action. Update the short agent journal after each meaningful milestone and before handing back. Preserve historical audit evidence; distinguish original failures from current results. Do not mark a task complete just because a test was excluded or its assertion weakened.

Use synthetic local identities and explicitly local DB/API/Redis endpoints for checks. Do not print or commit `.env`, real tokens, signing keys or production data. Do not install Codex plugins without the user's confirmation; existing tools and ordinary declared project dependencies are available for the authorized work.

The root and `server/` have separate lockfiles. Consult the current work log before repeating dependency installation or long test runs. Keep commits focused and never run deploy scripts as part of a local test/build check.
