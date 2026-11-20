export type InterventionStatus = "OUVERTE" | "EN_COURS" | "CLOSE";

export type ActorRole = "TECHNICIEN" | "RESPONSABLE_EXPLOITATION";

export interface Actor {
  id: string;
  role: ActorRole;
  siteIds: string[];
}

export interface Intervention {
  id: string;
  siteId: string;
  equipment: string;
  technicianId: string;
  startsAtUtc: string;
  durationHours?: number;
  description: string;
  status: InterventionStatus;
}

export interface CreateInterventionInput {
  siteId: string;
  equipment: string;
  technicianId: string;
  startsAtParis: string;
  durationHours?: number;
  description: string;
}

export interface ListInterventionsFilters {
  status?: InterventionStatus;
  fromParis?: string;
  toParis?: string;
}
