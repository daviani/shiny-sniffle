# Maintenance interventions API

Small TypeScript API for tracking maintenance interventions on anaerobic-digestion sites. The implementation favors explicit business rules, automated tests, and a narrow demonstrable scope.

## Run it

Tested locally with Node.js 25.9.0 and pnpm 10.33.0.

```bash
pnpm install
pnpm check
pnpm start
```

The server listens on `http://localhost:3000` by default. Set `PORT` to use another port.

## Demonstration identities

Requests use the `x-actor-id` header:

| Actor | Role | Sites |
| --- | --- | --- |
| `tech-1` | Technician | `site-a` |
| `tech-2` | Technician | `site-b` |
| `manager-1` | Operations manager | All sites |

This is deliberately not an authentication system. Production code would resolve an authenticated identity and its site memberships server-side.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/interventions` | Create an open intervention |
| `POST` | `/interventions/:id/start` | Move an open intervention to in progress |
| `PATCH` | `/interventions/:id/duration` | Set duration, or correct it as manager after closure |
| `POST` | `/interventions/:id/close` | Close an intervention that has a duration |
| `GET` | `/sites/:siteId/interventions` | List with optional `status`, `from`, and `to` filters |
| `GET` | `/sites/:siteId/interventions.csv` | Export the same filtered selection as CSV |
| `GET` | `/health` | Health check |

Create an intervention:

```bash
curl -sS http://localhost:3000/interventions \
  -H 'content-type: application/json' \
  -H 'x-actor-id: tech-1' \
  -d '{
    "siteId": "site-a",
    "equipment": "pump-7",
    "technicianId": "tech-1",
    "startsAtParis": "2026-11-20T09:00",
    "description": "Inspect the feed pump"
  }'
```

Dates are entered as `yyyy-MM-ddTHH:mm` in `Europe/Paris`. Responses and CSV contain the Paris offset applicable to that date. Period bounds are inclusive.

Example filters:

```bash
curl -sS 'http://localhost:3000/sites/site-a/interventions?status=OUVERTE&from=2026-11-20T08%3A00&to=2026-11-20T18%3A00' \
  -H 'x-actor-id: tech-1'

curl -sS 'http://localhost:3000/sites/site-a/interventions.csv?from=2026-11-20T08%3A00&to=2026-11-20T18%3A00' \
  -H 'x-actor-id: manager-1'
```

## Technical choices and assumptions

- Fastify provides a small HTTP layer that can be tested without opening a socket.
- `InterventionService` contains authorization and state rules; handlers contain transport concerns only.
- The in-memory repository is intentional for the 25-minute scope. Restarting the process clears data.
- Luxon converts Paris wall-clock values to UTC for storage and back to Paris for output.
- Closure is allowed from `OUVERTE` or `EN_COURS`; the brief only requires a duration.
- Before closure, an authorized technician or manager may set the duration. After closure, only a manager may correct it.
- No general update endpoint exists, so closed fields other than the manager duration exception are immutable.
- A technician may act on interventions for their sites, not only those assigned to their own identifier; the brief defines site scope rather than ownership scope.
- `AGENT_RULES.md` is the versioned team handoff. The active local policy forbids committing files named `AGENTS.md`.

## With one more day

I would add PostgreSQL or SQLite persistence, real authentication and server-side memberships, an audit trail for post-closure corrections, pagination, OpenAPI documentation, structured logging, rate limiting, and deployment packaging. An interface would remain secondary until those backend guarantees were in place.
