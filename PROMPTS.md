# Representative agent prompts

These are the two main prompts retained for the method review. They summarize the working instructions without including private recruitment context.

## Prompt 1 — design and scope

> Design a TypeScript backend for maintenance interventions. Use Fastify, Vitest, Luxon, and an in-memory repository. Keep business rules outside HTTP handlers. Cover site-scoped technician access, manager-wide access, closure requiring a duration, closed immutability with the manager duration exception, Europe/Paris input/output, filtered listing, and CSV export. No UI, database, ORM, or production authentication. State every assumption and produce an implementation plan with atomic commits.

## Prompt 2 — implementation and controls

> Execute the approved plan on a feature branch. For each behavior, write and run a failing test before the minimum implementation, then run the complete type check and test suite. Use the same domain service for JSON and CSV. Keep the README short, preserve representative prompts, document generated work and corrections, and do not push.

## Agent contribution and human control

The agent generated:

- the design and task plan;
- TypeScript project configuration;
- domain, Paris-time, Fastify, and CSV implementations;
- automated tests and handoff documentation.

Generated work that was corrected:

- a temporary empty TypeScript module was added only to verify the initial configuration, then removed when real source files existed;
- an HTTP filter test originally compared a current intervention to its stale creation response; the expectation was corrected to assert the transitioned state.

Suggestions deliberately rejected from the 25-minute scope:

- optional interface;
- database, ORM, and migrations;
- JSON Web Token authentication or a user-management subsystem;
- OpenAPI generation, deployment files, audit log, and pagination;
- a third-party CSV library for a fixed eight-column export.

Human decisions retained in the implementation:

- TypeScript was selected for the exercise;
- commits must remain atomic;
- work stays local until explicit authorization to share it.
