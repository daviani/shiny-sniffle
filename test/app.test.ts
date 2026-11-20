import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";

import { buildApp } from "../src/app.js";

const openedApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openedApps.splice(0).map((app) => app.close()));
});

function testApp(): FastifyInstance {
  let nextId = 0;
  const app = buildApp({ idFactory: () => `intervention-${++nextId}` });
  openedApps.push(app);
  return app;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    siteId: "site-a",
    equipment: "pump-7",
    technicianId: "tech-1",
    startsAtParis: "2026-01-15T09:00",
    description: "Inspect the feed pump",
    ...overrides,
  };
}

async function createIntervention(
  app: FastifyInstance,
  actorId = "tech-1",
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/interventions",
    headers: { "x-actor-id": actorId },
    payload: validBody(overrides),
  });
}

describe("identity and site access", () => {
  test.each([undefined, "unknown"])(
    "rejects missing or unknown actor %s",
    async (actorId) => {
      const app = testApp();

      const response = await app.inject({
        method: "GET",
        url: "/sites/site-a/interventions",
        ...(actorId === undefined
          ? {}
          : { headers: { "x-actor-id": actorId } }),
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    },
  );

  test("a technician cannot create or list on another site", async () => {
    const app = testApp();

    const creation = await createIntervention(app, "tech-1", {
      siteId: "site-b",
      technicianId: "tech-2",
    });
    const listing = await app.inject({
      method: "GET",
      url: "/sites/site-b/interventions",
      headers: { "x-actor-id": "tech-1" },
    });

    expect(creation.statusCode).toBe(403);
    expect(listing.statusCode).toBe(403);
  });

  test("site authorization precedes unrelated creation validation", async () => {
    const app = testApp();

    const response = await app.inject({
      method: "POST",
      url: "/interventions",
      headers: { "x-actor-id": "tech-1" },
      payload: {
        siteId: "site-b",
        equipment: "pump-7",
        technicianId: "tech-2",
        startsAtParis: "2026-01-15T09:00",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  test.each(["interventions", "interventions.csv"])(
    "site authorization precedes invalid filters on %s",
    async (resource) => {
      const app = testApp();

      const response = await app.inject({
        method: "GET",
        url: `/sites/site-b/${resource}?status=INVALID`,
        headers: { "x-actor-id": "tech-1" },
      });

      expect(response.statusCode).toBe(403);
    },
  );

  test("a technician cannot mutate an intervention on another site", async () => {
    const app = testApp();
    const creation = await createIntervention(app, "manager-1", {
      siteId: "site-b",
      technicianId: "tech-2",
    });

    const response = await app.inject({
      method: "POST",
      url: `/interventions/${creation.json().id}/start`,
      headers: { "x-actor-id": "tech-1" },
    });

    expect(response.statusCode).toBe(403);
  });

  test("intervention authorization precedes duration payload validation", async () => {
    const app = testApp();
    const creation = await createIntervention(app, "manager-1", {
      siteId: "site-b",
      technicianId: "tech-2",
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/interventions/${creation.json().id}/duration`,
      headers: { "x-actor-id": "tech-1" },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("intervention workflow", () => {
  test("creates and lists an intervention with Paris output", async () => {
    const app = testApp();

    const creation = await createIntervention(app);
    const listing = await app.inject({
      method: "GET",
      url: "/sites/site-a/interventions",
      headers: { "x-actor-id": "tech-1" },
    });

    expect(creation.statusCode).toBe(201);
    expect(creation.json()).toMatchObject({
      id: "intervention-1",
      siteId: "site-a",
      startsAtParis: "2026-01-15T09:00:00+01:00",
      status: "OUVERTE",
    });
    expect(listing.statusCode).toBe(200);
    expect(listing.json()).toEqual([creation.json()]);
  });

  test("runs the duration, start, close, and manager correction workflow", async () => {
    const app = testApp();
    const creation = await createIntervention(app);
    const id = creation.json().id as string;

    const refusedClosure = await app.inject({
      method: "POST",
      url: `/interventions/${id}/close`,
      headers: { "x-actor-id": "tech-1" },
    });
    expect(refusedClosure.statusCode).toBe(409);

    const duration = await app.inject({
      method: "PATCH",
      url: `/interventions/${id}/duration`,
      headers: { "x-actor-id": "tech-1" },
      payload: { durationHours: 1.5 },
    });
    expect(duration.statusCode).toBe(200);
    expect(duration.json().durationHours).toBe(1.5);

    const started = await app.inject({
      method: "POST",
      url: `/interventions/${id}/start`,
      headers: { "x-actor-id": "tech-1" },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().status).toBe("EN_COURS");

    const closed = await app.inject({
      method: "POST",
      url: `/interventions/${id}/close`,
      headers: { "x-actor-id": "tech-1" },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().status).toBe("CLOSE");

    const technicianCorrection = await app.inject({
      method: "PATCH",
      url: `/interventions/${id}/duration`,
      headers: { "x-actor-id": "tech-1" },
      payload: { durationHours: 2 },
    });
    expect(technicianCorrection.statusCode).toBe(403);

    const managerCorrection = await app.inject({
      method: "PATCH",
      url: `/interventions/${id}/duration`,
      headers: { "x-actor-id": "manager-1" },
      payload: { durationHours: 2 },
    });
    expect(managerCorrection.statusCode).toBe(200);
    expect(managerCorrection.json()).toMatchObject({
      status: "CLOSE",
      durationHours: 2,
    });
  });

  test("lists with status and inclusive Paris period filters", async () => {
    const app = testApp();
    await createIntervention(app, "tech-1", {
      startsAtParis: "2026-01-15T09:00",
    });
    const included = await createIntervention(app, "tech-1", {
      startsAtParis: "2026-01-15T10:00",
    });
    await app.inject({
      method: "POST",
      url: `/interventions/${included.json().id}/start`,
      headers: { "x-actor-id": "tech-1" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/sites/site-a/interventions?status=EN_COURS&from=2026-01-15T10%3A00&to=2026-01-15T10%3A00",
      headers: { "x-actor-id": "tech-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: included.json().id,
        startsAtParis: "2026-01-15T10:00:00+01:00",
        status: "EN_COURS",
      }),
    ]);
  });

  test("rejects a malformed creation payload", async () => {
    const app = testApp();

    const response = await app.inject({
      method: "POST",
      url: "/interventions",
      headers: { "x-actor-id": "tech-1" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION" });
  });

  test("preserves Fastify's bad-request status for invalid JSON", async () => {
    const app = testApp();

    const response = await app.inject({
      method: "POST",
      url: "/interventions",
      headers: {
        "content-type": "application/json",
        "x-actor-id": "tech-1",
      },
      payload: '{"siteId":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  test("preserves Fastify's unsupported-media-type status", async () => {
    const app = testApp();

    const response = await app.inject({
      method: "POST",
      url: "/interventions",
      headers: {
        "content-type": "application/xml",
        "x-actor-id": "tech-1",
      },
      payload: "<intervention />",
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });
});

describe("CSV export", () => {
  test("exports the filtered period with stable columns and escaped fields", async () => {
    const app = testApp();
    await createIntervention(app, "tech-1", {
      startsAtParis: "2026-01-15T09:00",
      description: "Outside period",
    });
    await createIntervention(app, "tech-1", {
      startsAtParis: "2026-01-15T10:00",
      durationHours: 1.5,
      description: "Inspect, \"urgent\"\nline",
    });

    const response = await app.inject({
      method: "GET",
      url: "/sites/site-a/interventions.csv?from=2026-01-15T10%3A00&to=2026-01-15T10%3A00",
      headers: { "x-actor-id": "tech-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="interventions-site-a.csv"',
    );
    expect(response.body).toBe(
      "id,siteId,equipment,technicianId,startsAtParis,durationHours,description,status\r\n" +
        'intervention-2,site-a,pump-7,tech-1,2026-01-15T10:00:00+01:00,1.5,"Inspect, ""urgent""\nline",OUVERTE\r\n',
    );
  });

  test("rejects an export from a technician outside the site", async () => {
    const app = testApp();

    const response = await app.inject({
      method: "GET",
      url: "/sites/site-b/interventions.csv",
      headers: { "x-actor-id": "tech-1" },
    });

    expect(response.statusCode).toBe(403);
  });
});
