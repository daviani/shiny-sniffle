import { describe, expect, test } from "vitest";

import { DomainError } from "../src/interventions/errors.js";
import type {
  Actor,
  CreateInterventionInput,
} from "../src/interventions/model.js";
import { InMemoryInterventionRepository } from "../src/interventions/repository.js";
import { InterventionService } from "../src/interventions/service.js";
import { parisLocalToUtc, utcToParis } from "../src/time/paris.js";

const technicianA: Actor = {
  id: "tech-1",
  role: "TECHNICIEN",
  siteIds: ["site-a"],
};

const manager: Actor = {
  id: "manager-1",
  role: "RESPONSABLE_EXPLOITATION",
  siteIds: [],
};

function validInput(
  overrides: Partial<CreateInterventionInput> = {},
): CreateInterventionInput {
  return {
    siteId: "site-a",
    equipment: "pump-7",
    technicianId: "tech-1",
    startsAtParis: "2026-01-15T09:00",
    description: "Inspect the feed pump",
    ...overrides,
  };
}

function buildService(): InterventionService {
  let nextId = 0;
  return new InterventionService(
    new InMemoryInterventionRepository(),
    () => `intervention-${++nextId}`,
  );
}

function expectDomainError(
  action: () => unknown,
  code: DomainError["code"],
): void {
  try {
    action();
    throw new Error("Expected a DomainError");
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}

describe("site access", () => {
  test("a technician creates and lists interventions on one of their sites", () => {
    const service = buildService();

    const created = service.create(technicianA, validInput());

    expect(created).toMatchObject({
      id: "intervention-1",
      siteId: "site-a",
      status: "OUVERTE",
    });
    expect(service.listBySite(technicianA, "site-a", {})).toEqual([created]);
  });

  test("a technician cannot create or list on another site", () => {
    const service = buildService();

    expectDomainError(
      () => service.create(technicianA, validInput({ siteId: "site-b" })),
      "FORBIDDEN",
    );
    expectDomainError(
      () => service.listBySite(technicianA, "site-b", {}),
      "FORBIDDEN",
    );
  });

  test("a manager creates and lists interventions on every site", () => {
    const service = buildService();

    const created = service.create(
      manager,
      validInput({ siteId: "site-b", technicianId: "tech-2" }),
    );

    expect(service.listBySite(manager, "site-b", {})).toEqual([created]);
  });
});

describe("business rules", () => {
  test("an intervention without a duration cannot be closed", () => {
    const service = buildService();
    const intervention = service.create(technicianA, validInput());

    expectDomainError(
      () => service.close(technicianA, intervention.id),
      "CONFLICT",
    );
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "a stored invalid duration %s cannot permit closure",
    (durationHours) => {
      const repository = new InMemoryInterventionRepository();
      const service = new InterventionService(repository, () => "unused");
      repository.save({
        id: "corrupted-intervention",
        siteId: "site-a",
        equipment: "pump-7",
        technicianId: "tech-1",
        startsAtUtc: "2026-01-15T08:00:00Z",
        durationHours,
        description: "Imported legacy record",
        status: "OUVERTE",
      });

      expectDomainError(
        () => service.close(technicianA, "corrupted-intervention"),
        "CONFLICT",
      );
      expect(repository.findById("corrupted-intervention")?.status).toBe(
        "OUVERTE",
      );
    },
  );

  test("an authorized technician sets a positive duration before closure", () => {
    const service = buildService();
    const intervention = service.create(technicianA, validInput());

    const updated = service.setDuration(technicianA, intervention.id, 1.5);

    expect(updated.durationHours).toBe(1.5);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "duration %s is rejected",
    (durationHours) => {
      const service = buildService();
      const intervention = service.create(technicianA, validInput());

      expectDomainError(
        () =>
          service.setDuration(technicianA, intervention.id, durationHours),
        "VALIDATION",
      );
    },
  );

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "duration %s is rejected at creation",
    (durationHours) => {
      const service = buildService();

      expectDomainError(
        () => service.create(technicianA, validInput({ durationHours })),
        "VALIDATION",
      );
    },
  );

  test("an intervention with a duration can be closed", () => {
    const service = buildService();
    const intervention = service.create(
      technicianA,
      validInput({ durationHours: 2 }),
    );

    const closed = service.close(technicianA, intervention.id);

    expect(closed.status).toBe("CLOSE");
  });

  test("an open intervention can be started", () => {
    const service = buildService();
    const intervention = service.create(technicianA, validInput());

    const started = service.start(technicianA, intervention.id);

    expect(started.status).toBe("EN_COURS");
  });

  test.each(["start", "setDuration", "close"] as const)(
    "a technician cannot %s an intervention on another site",
    (operation) => {
      const service = buildService();
      const intervention = service.create(
        manager,
        validInput({
          siteId: "site-b",
          technicianId: "tech-2",
          durationHours: 1,
        }),
      );

      const action =
        operation === "setDuration"
          ? () => service.setDuration(technicianA, intervention.id, 2)
          : () => service[operation](technicianA, intervention.id);

      expectDomainError(action, "FORBIDDEN");
    },
  );

  test("a closed intervention cannot be started again", () => {
    const service = buildService();
    const intervention = service.create(
      technicianA,
      validInput({ durationHours: 1 }),
    );
    service.close(technicianA, intervention.id);

    expectDomainError(
      () => service.start(technicianA, intervention.id),
      "CONFLICT",
    );
  });

  test("a technician cannot change the duration after closure", () => {
    const service = buildService();
    const intervention = service.create(
      technicianA,
      validInput({ durationHours: 1 }),
    );
    service.close(technicianA, intervention.id);

    expectDomainError(
      () => service.setDuration(technicianA, intervention.id, 2),
      "FORBIDDEN",
    );
  });

  test("a manager can correct the duration after closure", () => {
    const service = buildService();
    const intervention = service.create(
      technicianA,
      validInput({ durationHours: 1 }),
    );
    service.close(technicianA, intervention.id);

    const corrected = service.setDuration(manager, intervention.id, 2.25);

    expect(corrected).toMatchObject({
      status: "CLOSE",
      durationHours: 2.25,
    });
  });

  test("a closed intervention cannot be closed again", () => {
    const service = buildService();
    const intervention = service.create(
      technicianA,
      validInput({ durationHours: 1 }),
    );
    service.close(technicianA, intervention.id);

    expectDomainError(
      () => service.close(technicianA, intervention.id),
      "CONFLICT",
    );
  });
});

describe("Paris time", () => {
  test.each([
    {
      local: "2026-01-15T09:00",
      utc: "2026-01-15T08:00:00Z",
      paris: "2026-01-15T09:00:00+01:00",
    },
    {
      local: "2026-07-15T09:00",
      utc: "2026-07-15T07:00:00Z",
      paris: "2026-07-15T09:00:00+02:00",
    },
  ])("converts $local using the applicable Paris offset", ({ local, utc, paris }) => {
    expect(parisLocalToUtc(local)).toBe(utc);
    expect(utcToParis(utc)).toBe(paris);
  });

  test("creation stores the Paris wall-clock value as a UTC instant", () => {
    const service = buildService();

    const intervention = service.create(technicianA, validInput());

    expect(intervention.startsAtUtc).toBe("2026-01-15T08:00:00Z");
  });

  test.each(["2026-03-29T02:30", "not-a-date"])(
    "rejects invalid Paris local time %s",
    (value) => {
      expectDomainError(() => parisLocalToUtc(value), "VALIDATION");
    },
  );
});

describe("listing filters", () => {
  test("filters interventions by status", () => {
    const service = buildService();
    service.create(technicianA, validInput());
    const inProgress = service.create(
      technicianA,
      validInput({ description: "In progress" }),
    );
    service.start(technicianA, inProgress.id);
    const closed = service.create(
      technicianA,
      validInput({ description: "Closed", durationHours: 1 }),
    );
    service.close(technicianA, closed.id);

    const interventions = service.listBySite(technicianA, "site-a", {
      status: "EN_COURS",
    });

    expect(interventions.map(({ id }) => id)).toEqual([inProgress.id]);
  });

  test("filters an inclusive period expressed in Paris time", () => {
    const service = buildService();
    service.create(
      technicianA,
      validInput({ startsAtParis: "2026-01-15T09:00" }),
    );
    const atStart = service.create(
      technicianA,
      validInput({ startsAtParis: "2026-01-15T10:00" }),
    );
    const atEnd = service.create(
      technicianA,
      validInput({ startsAtParis: "2026-01-15T11:00" }),
    );

    const interventions = service.listBySite(technicianA, "site-a", {
      fromParis: "2026-01-15T10:00",
      toParis: "2026-01-15T11:00",
    });

    expect(interventions.map(({ id }) => id)).toEqual([
      atStart.id,
      atEnd.id,
    ]);
  });
});
