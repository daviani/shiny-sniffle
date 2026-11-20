import { randomUUID } from "node:crypto";

import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
} from "fastify";

import { resolveActor, UnauthorizedActorError } from "./actors.js";
import { toInterventionsCsv } from "./csv.js";
import { DomainError } from "./interventions/errors.js";
import type {
  CreateInterventionInput,
  Intervention,
  InterventionStatus,
  ListInterventionsFilters,
} from "./interventions/model.js";
import { InMemoryInterventionRepository } from "./interventions/repository.js";
import { InterventionService } from "./interventions/service.js";
import { utcToParis } from "./time/paris.js";

interface BuildAppOptions {
  idFactory?: () => string;
}

interface InterventionParams {
  id: string;
}

interface SiteParams {
  siteId: string;
}

interface ListQuery {
  status?: string;
  from?: string;
  to?: string;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const repository = new InMemoryInterventionRepository();
  const service = new InterventionService(
    repository,
    options.idFactory ?? randomUUID,
  );
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/interventions", async (request, reply) => {
    const actor = actorFrom(request);
    const body = requiredObject(request.body);
    service.assertSiteAccess(actor, requiredString(body, "siteId"));
    const intervention = service.create(actor, parseCreateInput(body));
    return reply.code(201).send(toResponse(intervention));
  });

  app.post<{ Params: InterventionParams }>(
    "/interventions/:id/start",
    async (request) =>
      toResponse(service.start(actorFrom(request), request.params.id)),
  );

  app.patch<{ Params: InterventionParams }>(
    "/interventions/:id/duration",
    async (request) => {
      const actor = actorFrom(request);
      service.assertInterventionAccess(actor, request.params.id);
      return toResponse(
        service.setDuration(
          actor,
          request.params.id,
          requiredNumber(requiredObject(request.body), "durationHours"),
        ),
      );
    },
  );

  app.post<{ Params: InterventionParams }>(
    "/interventions/:id/close",
    async (request) =>
      toResponse(service.close(actorFrom(request), request.params.id)),
  );

  app.get<{ Params: SiteParams; Querystring: ListQuery }>(
    "/sites/:siteId/interventions",
    async (request) => {
      const actor = actorFrom(request);
      service.assertSiteAccess(actor, request.params.siteId);
      return service
        .listBySite(
          actor,
          request.params.siteId,
          parseFilters(request.query),
        )
        .map(toResponse);
    },
  );

  app.get<{ Params: SiteParams; Querystring: ListQuery }>(
    "/sites/:siteId/interventions.csv",
    async (request, reply) => {
      const actor = actorFrom(request);
      service.assertSiteAccess(actor, request.params.siteId);
      const interventions = service.listBySite(
        actor,
        request.params.siteId,
        parseFilters(request.query),
      );
      const safeSiteId = request.params.siteId.replace(/[^a-zA-Z0-9_-]/g, "_");

      return reply
        .type("text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="interventions-${safeSiteId}.csv"`,
        )
        .send(toInterventionsCsv(interventions));
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof UnauthorizedActorError) {
      return reply.code(401).send({
        code: "UNAUTHORIZED",
        message: error.message,
      });
    }

    if (error instanceof DomainError) {
      return reply.code(statusFor(error.code)).send({
        code: error.code,
        message: error.message,
      });
    }

    if (isHttpClientError(error)) {
      return reply.code(error.statusCode).send({
        code:
          error.statusCode === 415
            ? "UNSUPPORTED_MEDIA_TYPE"
            : "BAD_REQUEST",
        message: error.message,
      });
    }

    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    });
  });

  return app;
}

function actorFrom(request: FastifyRequest) {
  return resolveActor(request.headers["x-actor-id"]);
}

function parseCreateInput(body: unknown): CreateInterventionInput {
  const value = requiredObject(body);
  const base = {
    siteId: requiredString(value, "siteId"),
    equipment: requiredString(value, "equipment"),
    technicianId: requiredString(value, "technicianId"),
    startsAtParis: requiredString(value, "startsAtParis"),
    description: requiredString(value, "description"),
  };
  const durationHours = optionalNumber(value, "durationHours");
  return durationHours === undefined ? base : { ...base, durationHours };
}

function parseFilters(query: ListQuery): ListInterventionsFilters {
  const filters: ListInterventionsFilters = {};
  if (query.status !== undefined) {
    filters.status = parseStatus(query.status);
  }
  if (query.from !== undefined) {
    filters.fromParis = query.from;
  }
  if (query.to !== undefined) {
    filters.toParis = query.to;
  }
  return filters;
}

function parseStatus(value: string): InterventionStatus {
  if (value === "OUVERTE" || value === "EN_COURS" || value === "CLOSE") {
    return value;
  }
  throw new DomainError("VALIDATION", `Unknown status ${value}`);
}

function requiredObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("VALIDATION", "A JSON object is required");
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: Record<string, unknown>,
  field: string,
): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new DomainError("VALIDATION", `${field} must be a non-empty string`);
  }
  return candidate;
}

function requiredNumber(
  value: Record<string, unknown>,
  field: string,
): number {
  const candidate = value[field];
  if (typeof candidate !== "number") {
    throw new DomainError("VALIDATION", `${field} must be a number`);
  }
  return candidate;
}

function optionalNumber(
  value: Record<string, unknown>,
  field: string,
): number | undefined {
  return value[field] === undefined ? undefined : requiredNumber(value, field);
}

function toResponse(intervention: Intervention) {
  return {
    id: intervention.id,
    siteId: intervention.siteId,
    equipment: intervention.equipment,
    technicianId: intervention.technicianId,
    startsAtParis: utcToParis(intervention.startsAtUtc),
    description: intervention.description,
    status: intervention.status,
    ...(intervention.durationHours === undefined
      ? {}
      : { durationHours: intervention.durationHours }),
  };
}

function statusFor(code: DomainError["code"]): 400 | 403 | 404 | 409 {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
  }
}

function isHttpClientError(
  error: unknown,
): error is Error & { statusCode: number } {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}
