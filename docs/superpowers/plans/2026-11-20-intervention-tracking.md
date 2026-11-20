# Intervention Tracking API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested TypeScript API for maintenance interventions, including site authorization, Paris-time handling, state transitions, and CSV export.

**Architecture:** A domain service enforces business rules over an in-memory repository. Fastify is a thin transport adapter, while focused utilities convert Paris dates and serialize CSV.

**Tech Stack:** TypeScript, Node.js, Fastify, Vitest, Luxon, pnpm

**Spec:** `docs/superpowers/specs/2026-11-20-intervention-tracking-design.md`

## Global Constraints

- Work on `feat/intervention-api`, not `main`.
- Use in-memory persistence behind a repository interface.
- Interpret offset-free inputs as `Europe/Paris`; store UTC; return Paris values with offsets.
- Introduce production behavior only after observing its test fail.
- Keep commits atomic and the complete suite green at each feature commit.
- Never stage or commit `AGENTS.md`; use `AGENT_RULES.md` for the requested team deliverable.
- Do not push or publish.

## Review Focus

- A technician supplying an inaccessible site must receive `403` on create, list, mutation, and export; add route and service tests in Tasks 2 and 3.
- Missing, zero, negative, or non-finite duration must never permit closure; add domain tests in Task 2.
- A closed intervention must reject transitions and technician duration changes while accepting only a manager duration correction; add domain and route tests in Tasks 2 and 3.
- Winter and summer Paris inputs must round-trip with `+01:00` and `+02:00`; add domain/API tests in Tasks 2 and 3.
- CSV descriptions containing commas, quotes, or newlines must remain one valid field; add a literal-output test in Task 3.

---

### Task 1: Project foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `pnpm-lock.yaml` through dependency installation

**Interfaces:**
- Consumes: none
- Produces: scripts `dev`, `start`, `test`, `typecheck`, and `check`; strict ESM TypeScript configuration

- [ ] **Step 1: Create package and TypeScript configuration**

Declare runtime dependencies `fastify` and `luxon`, and development dependencies `@types/luxon`, `@types/node`, `tsx`, `typescript`, and `vitest`.

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`

Expected: exit `0` and a new `pnpm-lock.yaml`.

- [ ] **Step 3: Verify the configuration**

Run: `pnpm typecheck`

Expected: exit `0` with no TypeScript errors.

- [ ] **Step 4: Commit**

Commit: `chore: initialize TypeScript service`

### Task 2: Domain rules and Paris time

**Files:**
- Create: `src/interventions/model.ts`
- Create: `src/interventions/errors.ts`
- Create: `src/interventions/repository.ts`
- Create: `src/interventions/service.ts`
- Create: `src/time/paris.ts`
- Create: `test/intervention-service.test.ts`

**Interfaces:**
- Consumes: strict TypeScript and Vitest from Task 1
- Produces: `InterventionService`, `InMemoryInterventionRepository`, domain types, `parisLocalToUtc()`, and `utcToParis()` for Task 3

- [ ] **Step 1: Write failing access tests**

Test that `tech-1` can create/list on `site-a`, is rejected on `site-b`, and a manager can access both.

- [ ] **Step 2: Run the access tests and verify RED**

Run: `pnpm test -- test/intervention-service.test.ts`

Expected: FAIL because domain modules do not exist.

- [ ] **Step 3: Implement minimal model, repository, and access-aware service**

Create `InterventionService.create(actor, input)` and `listBySite(actor, siteId, filters)` using an injected repository and ID factory.

- [ ] **Step 4: Run the access tests and verify GREEN**

Run: `pnpm test -- test/intervention-service.test.ts`

Expected: PASS for access tests.

- [ ] **Step 5: Add one failing test at a time for duration, closure, immutability, and manager correction**

Cover `setDuration(actor, id, hours)`, `start(actor, id)`, and `close(actor, id)`. Run each new test before its minimal implementation and confirm the expected business failure.

- [ ] **Step 6: Add failing Paris-time and inclusive-filter tests**

Use literal expectations: winter `2026-01-15T09:00` → `2026-01-15T08:00:00Z` and summer `2026-07-15T09:00` → `2026-07-15T07:00:00Z`. Verify formatted offsets `+01:00` and `+02:00`.

- [ ] **Step 7: Implement minimal Paris conversion and filtering**

Add `parisLocalToUtc(value: string): string` and `utcToParis(value: string): string`; reject invalid local values and invalid ranges.

- [ ] **Step 8: Verify Task 2**

Run: `pnpm check`

Expected: all domain tests pass and type checking exits `0`.

- [ ] **Step 9: Commit**

Commit: `feat: enforce intervention business rules`

### Task 3: HTTP API and CSV export

**Files:**
- Create: `src/actors.ts`
- Create: `src/csv.ts`
- Create: `src/app.ts`
- Create: `src/server.ts`
- Create: `test/app.test.ts`

**Interfaces:**
- Consumes: `InterventionService`, domain types, `utcToParis()` from Task 2
- Produces: `buildApp()`, executable server, JSON routes, and CSV export

- [ ] **Step 1: Write failing HTTP tests for identity, create, transitions, duration, and list filters**

Use Fastify injection and the real in-memory repository. Include inaccessible-site responses and the closed manager correction exception.

- [ ] **Step 2: Run HTTP tests and verify RED**

Run: `pnpm test -- test/app.test.ts`

Expected: FAIL because `buildApp()` does not exist.

- [ ] **Step 3: Implement actors, serializers, error mapping, and JSON routes**

Resolve only `x-actor-id`, return Paris timestamps with offsets, and map domain errors to the documented HTTP statuses.

- [ ] **Step 4: Run HTTP tests and verify GREEN**

Run: `pnpm test -- test/app.test.ts`

Expected: JSON route tests pass.

- [ ] **Step 5: Write failing CSV tests**

Assert the literal header order, Paris timestamp, CRLF rows, escaped comma/quote/newline content, attachment content type, and site authorization.

- [ ] **Step 6: Implement `toInterventionsCsv()` and the CSV route**

Reuse `listBySite()` so JSON and CSV authorization/filter behavior cannot diverge.

- [ ] **Step 7: Verify Task 3**

Run: `pnpm check`

Expected: all tests pass and type checking exits `0`.

- [ ] **Step 8: Commit**

Commit: `feat: expose intervention API and CSV`

### Task 4: Handoff documentation

**Files:**
- Create: `README.md`
- Create: `AGENT_RULES.md`
- Create: `PROMPTS.md`

**Interfaces:**
- Consumes: the verified commands, endpoints, assumptions, and limitations from Tasks 1–3
- Produces: a short evaluator-facing handoff and representative agent prompts

- [ ] **Step 1: Write the short README**

Document prerequisites, install/run/test commands, actor IDs, endpoint examples, decisions, assumptions, limitations, and the one-day extension.

- [ ] **Step 2: Write team-facing agent rules and representative prompts**

Explain that `AGENT_RULES.md` is the versioned handoff because inherited local policy forbids committing `AGENTS.md`. Identify generated work, corrections, and rejected scope.

- [ ] **Step 3: Verify commands from a clean user perspective**

Run: `pnpm check`

Expected: all tests pass and type checking exits `0`.

- [ ] **Step 4: Commit**

Commit: `docs: explain setup and agent workflow`

### Task 5: Whole-branch verification and review

**Files:**
- Modify only when a verified Critical or Important review finding requires a fix

**Interfaces:**
- Consumes: the complete branch and test suite
- Produces: fresh verification evidence and an independent code review

- [ ] **Step 1: Run complete verification**

Run: `pnpm check`

Expected: exit `0`, all tests passing, no TypeScript errors.

- [ ] **Step 2: Review every requirement against code and tests**

Confirm rules 2, 3, 4/5, and 6 are directly tested and every required endpoint exists.

- [ ] **Step 3: Request a fresh whole-branch code review**

Review the entire tree against this plan and the design spec. Fix Critical and Important findings through a failing regression test followed by a green suite.

- [ ] **Step 4: Inspect final Git state**

Run: `git status --short --branch`

Expected: clean `feat/intervention-api` branch with local commits and no push.
