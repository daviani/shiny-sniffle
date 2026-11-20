import { DomainError } from "./errors.js";
import type {
  Actor,
  CreateInterventionInput,
  Intervention,
  ListInterventionsFilters,
} from "./model.js";
import type { InterventionRepository } from "./repository.js";
import { parisLocalToUtc } from "../time/paris.js";

export class InterventionService {
  constructor(
    private readonly repository: InterventionRepository,
    private readonly idFactory: () => string,
  ) {}

  create(actor: Actor, input: CreateInterventionInput): Intervention {
    this.assertSiteAccess(actor, input.siteId);
    if (input.durationHours !== undefined) {
      this.assertValidDuration(input.durationHours);
    }

    const intervention: Intervention = {
      id: this.idFactory(),
      siteId: input.siteId,
      equipment: input.equipment,
      technicianId: input.technicianId,
      startsAtUtc: parisLocalToUtc(input.startsAtParis),
      description: input.description,
      status: "OUVERTE",
      ...(input.durationHours === undefined
        ? {}
        : { durationHours: input.durationHours }),
    };

    return this.repository.save(intervention);
  }

  listBySite(
    actor: Actor,
    siteId: string,
    filters: ListInterventionsFilters,
  ): Intervention[] {
    this.assertSiteAccess(actor, siteId);
    const fromUtc =
      filters.fromParis === undefined
        ? undefined
        : parisLocalToUtc(filters.fromParis);
    const toUtc =
      filters.toParis === undefined
        ? undefined
        : parisLocalToUtc(filters.toParis);

    if (fromUtc !== undefined && toUtc !== undefined && fromUtc > toUtc) {
      throw new DomainError(
        "VALIDATION",
        "The period start must be before or equal to its end",
      );
    }

    return this.repository
      .listBySite(siteId)
      .filter(
        (intervention) =>
          filters.status === undefined || intervention.status === filters.status,
      )
      .filter(
        (intervention) =>
          fromUtc === undefined || intervention.startsAtUtc >= fromUtc,
      )
      .filter(
        (intervention) =>
          toUtc === undefined || intervention.startsAtUtc <= toUtc,
      );
  }

  close(actor: Actor, id: string): Intervention {
    const intervention = this.getById(id);
    this.assertSiteAccess(actor, intervention.siteId);

    if (intervention.status === "CLOSE") {
      throw new DomainError("CONFLICT", "Intervention is already closed");
    }

    if (!this.isValidDuration(intervention.durationHours)) {
      throw new DomainError(
        "CONFLICT",
        "An intervention needs a valid duration before it can be closed",
      );
    }

    return this.repository.save({ ...intervention, status: "CLOSE" });
  }

  start(actor: Actor, id: string): Intervention {
    const intervention = this.getById(id);
    this.assertSiteAccess(actor, intervention.siteId);

    if (intervention.status !== "OUVERTE") {
      throw new DomainError(
        "CONFLICT",
        "Only an open intervention can be started",
      );
    }

    return this.repository.save({ ...intervention, status: "EN_COURS" });
  }

  setDuration(actor: Actor, id: string, durationHours: number): Intervention {
    const intervention = this.getById(id);
    this.assertSiteAccess(actor, intervention.siteId);

    if (
      intervention.status === "CLOSE" &&
      actor.role !== "RESPONSABLE_EXPLOITATION"
    ) {
      throw new DomainError(
        "FORBIDDEN",
        "Only an operations manager can correct a closed intervention",
      );
    }

    this.assertValidDuration(durationHours);

    return this.repository.save({ ...intervention, durationHours });
  }

  private getById(id: string): Intervention {
    const intervention = this.repository.findById(id);
    if (intervention === undefined) {
      throw new DomainError("NOT_FOUND", `Unknown intervention ${id}`);
    }
    return intervention;
  }

  private assertValidDuration(durationHours: number): void {
    if (!this.isValidDuration(durationHours)) {
      throw new DomainError(
        "VALIDATION",
        "Duration must be a finite number greater than zero",
      );
    }
  }

  private isValidDuration(
    durationHours: number | undefined,
  ): durationHours is number {
    return (
      durationHours !== undefined &&
      Number.isFinite(durationHours) &&
      durationHours > 0
    );
  }

  assertInterventionAccess(actor: Actor, id: string): void {
    const intervention = this.getById(id);
    this.assertSiteAccess(actor, intervention.siteId);
  }

  assertSiteAccess(actor: Actor, siteId: string): void {
    if (
      actor.role === "TECHNICIEN" &&
      !actor.siteIds.includes(siteId)
    ) {
      throw new DomainError(
        "FORBIDDEN",
        `Actor ${actor.id} cannot access site ${siteId}`,
      );
    }
  }
}
