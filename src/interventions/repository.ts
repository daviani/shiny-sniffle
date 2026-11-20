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
    const stored = copyIntervention(intervention);
    this.interventions.set(stored.id, stored);
    return copyIntervention(stored);
  }

  findById(id: string): Intervention | undefined {
    const intervention = this.interventions.get(id);
    return intervention === undefined
      ? undefined
      : copyIntervention(intervention);
  }

  listBySite(siteId: string): Intervention[] {
    return [...this.interventions.values()]
      .filter((intervention) => intervention.siteId === siteId)
      .map(copyIntervention);
  }
}

function copyIntervention(intervention: Intervention): Intervention {
  return { ...intervention };
}
