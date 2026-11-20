# Intervention Tracking API — Design

## Intent

Build a small, demonstrable backend for maintenance interventions on anaerobic-digestion sites. The exercise is time-boxed, so the design prioritizes explicit business rules, automated tests, and explainable trade-offs over infrastructure breadth.

## Goals

- Create, start, close, list, filter, and export interventions.
- Enforce technician site access and manager-wide access.
- Enforce closure and post-closure immutability rules, including the manager duration exception.
- Treat entered and returned dates as Europe/Paris wall-clock time.
- Keep every business rule independently testable without HTTP.
- Leave a short operational README, representative prompts, and agent rules for the team.

## Non-goals

- User authentication, identity provisioning, or authorization tokens.
- A user interface.
- Durable persistence, migrations, or deployment packaging.
- CRUD endpoints for sites, equipment, or technicians.
- Production observability, rate limiting, or audit trails.

## Anti-goals

- Hiding business rules in HTTP handlers.
- Adding an ORM or database only to appear production-like.
- Claiming production security from the demonstration identity mechanism.
- Using the host machine time zone as an implicit Paris conversion.

## Constraints

- TypeScript implementation.
- Fastify HTTP API, Vitest tests, Luxon date handling, pnpm package management.
- In-memory persistence, justified by the 25-minute exercise and isolated behind a repository.
- No project UI.
- Work on `feat/intervention-api`, never directly on `main`.
- Local atomic commits; no push without explicit authorization.
- Do not version `AGENTS.md`. Deliver the requested team-facing rules as `AGENT_RULES.md`.

## Approaches considered

1. **TypeScript + Fastify + Vitest + Luxon** — selected. It matches a Web TypeScript context, Fastify can exercise routes without a listening socket, and Luxon makes Europe/Paris behavior explicit.
2. **Node built-ins only** — fewer dependencies but more bespoke routing, validation, and HTTP test code, which distracts from the domain under a short time limit.
3. **Python + FastAPI** — concise and offers native zone handling, but switching language would make live explanation and review less natural.

## Domain decisions

- New interventions always start as `OUVERTE`.
- `durationHours` is optional at creation and must be a finite number greater than zero when present.
- Before closure, an authorized technician or manager may set the duration.
- After closure, only a manager may correct the duration. No other field has an update operation.
- Closure is allowed from `OUVERTE` or `EN_COURS`, because the brief states only the duration precondition.
- Starting is allowed only from `OUVERTE`.
- Technicians may act on every intervention belonging to one of their sites; the brief does not restrict them to interventions assigned to themselves.
- Managers may act on all sites.
- Period filters are inclusive and apply to the intervention start instant.
- Site and technician references are strings. Referential integrity is out of scope because no source of truth was supplied.

## Identity and authorization

Requests provide `x-actor-id`. The server resolves that identifier from a demonstration directory:

- `tech-1`: technician for `site-a`;
- `tech-2`: technician for `site-b`;
- `manager-1`: operations manager with access to every site.

Unknown actors receive `401`. Site membership is never accepted from request headers. The README will state that production would replace this directory with authenticated identity claims and server-side memberships.

## Time model

Inputs use the local format `yyyy-MM-dd'T'HH:mm` with no offset and are interpreted in `Europe/Paris`. The domain stores UTC ISO instants. API and CSV outputs convert those instants back to Paris and include the applicable offset. Invalid local values, including nonexistent spring-forward times and ambiguous autumn fallback times, are rejected.

## API

- `POST /interventions`
- `POST /interventions/:id/start`
- `PATCH /interventions/:id/duration`
- `POST /interventions/:id/close`
- `GET /sites/:siteId/interventions?status=&from=&to=`
- `GET /sites/:siteId/interventions.csv?status=&from=&to=`
- `GET /health`

Expected status mapping:

- invalid input: `400`;
- missing or unknown actor: `401`;
- unauthorized site or post-close correction: `403`;
- unknown intervention: `404`;
- invalid state transition or missing duration: `409`.

## Architecture

`InterventionService` owns authorization, state transitions, filtering, and invariants. `InMemoryInterventionRepository` owns storage. Paris conversion and CSV serialization are focused utilities. Fastify handlers resolve the actor, parse transport input, call the service, and serialize responses.

## Test strategy

- Domain tests cover unauthorized sites, manager access, missing duration, closed immutability/manager exception, state transitions, Paris winter/summer offsets, and inclusive filters.
- HTTP tests use Fastify injection with the real service and repository.
- CSV tests cover authorization, Paris output, stable headers, and escaping.
- Each behavior is introduced test-first and each feature commit ends with the full suite green.

## One-day extension

Add durable SQLite/PostgreSQL storage, real authentication, server-side site membership, an audit trail for manager corrections, pagination, OpenAPI documentation, structured logging, and deployment packaging.
