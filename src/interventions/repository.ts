import type { Intervention } from "./model.js";

export interface InterventionRepository {
  save(intervention: Intervention): Intervention;
  findById(id: string): Intervention | undefined;
  listBySite(siteId: string): Intervention[];
}

export class InMemoryInterventionRepository
  implements InterventionRepository
{
  private readonly interventions = new Map<string, Intervention>();

  save(intervention: Intervention): Intervention {
    this.interventions.set(intervention.id, intervention);
    return intervention;
  }

  findById(id: string): Intervention | undefined {
    return this.interventions.get(id);
  }

  listBySite(siteId: string): Intervention[] {
    return [...this.interventions.values()].filter(
      (intervention) => intervention.siteId === siteId,
    );
  }
}
