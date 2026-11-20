import type { Actor } from "./interventions/model.js";

const ACTORS: ReadonlyMap<string, Actor> = new Map([
  [
    "tech-1",
    { id: "tech-1", role: "TECHNICIEN", siteIds: ["site-a"] },
  ],
  [
    "tech-2",
    { id: "tech-2", role: "TECHNICIEN", siteIds: ["site-b"] },
  ],
  [
    "manager-1",
    {
      id: "manager-1",
      role: "RESPONSABLE_EXPLOITATION",
      siteIds: [],
    },
  ],
]);

export class UnauthorizedActorError extends Error {
  constructor() {
    super("A known x-actor-id header is required");
    this.name = "UnauthorizedActorError";
  }
}

export function resolveActor(actorId: string | string[] | undefined): Actor {
  if (typeof actorId !== "string") {
    throw new UnauthorizedActorError();
  }

  const actor = ACTORS.get(actorId);
  if (actor === undefined) {
    throw new UnauthorizedActorError();
  }

  return actor;
}
