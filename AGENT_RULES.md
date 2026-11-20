# Agent rules for this project

This is the versioned rules handoff that I would leave to the team. Local workstation policy keeps active files named `AGENTS.md` out of Git.

## Authority and scope

- Treat the exercise brief and documented business decisions as authoritative.
- Ask or document a decision when a requirement is ambiguous; do not silently invent business rules.
- Prefer a smaller verified scope over optional UI, infrastructure, or abstractions.
- Preserve existing work and unrelated changes.

## Workflow

- Work on a feature branch, never directly on `main`.
- Start with a read-only map of the repository and current tests.
- Use test-driven development for behavior: write one failing test, confirm the expected failure, add the minimum implementation, then run the full suite.
- Keep commits atomic and use imperative Conventional Commit titles under 72 characters.
- Run `pnpm check` before every feature commit.
- Never push, merge, publish, delete, or add dependencies without explicit authorization.

## Architecture

- Keep business rules in `InterventionService`; Fastify handlers translate HTTP only.
- Keep persistence behind `InterventionRepository`.
- Reuse `listBySite()` for JSON and CSV so authorization and filtering cannot diverge.
- Store timestamps as UTC instants. Parse and display wall-clock values explicitly with `Europe/Paris`.
- Do not use the host machine time zone implicitly.

## Business invariants

- Technicians may create, see, and mutate interventions only on their sites; managers may access every site.
- New interventions start as `OUVERTE`.
- Duration, when present, must be finite and greater than zero.
- An intervention without a duration cannot be closed.
- A closed intervention cannot transition or be generally edited.
- Only a manager may correct the duration after closure.
- Period bounds are inclusive and apply to the intervention start instant.

## Quality and communication

- Test observable behavior with real services and repositories; avoid mock-only assertions.
- Cover authorization, invalid transitions, Paris winter/summer offsets, period boundaries, and CSV escaping.
- Distinguish automated tests, type checking, and manual demonstration.
- Record important prompts and identify agent output that was corrected or rejected.
- Never present demonstration identity headers or in-memory storage as production-ready security or persistence.
