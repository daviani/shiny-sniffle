import type { Intervention } from "./interventions/model.js";
import { utcToParis } from "./time/paris.js";

const HEADER = [
  "id",
  "siteId",
  "equipment",
  "technicianId",
  "startsAtParis",
  "durationHours",
  "description",
  "status",
];

export function toInterventionsCsv(interventions: Intervention[]): string {
  const rows = interventions.map((intervention) =>
    [
      intervention.id,
      intervention.siteId,
      intervention.equipment,
      intervention.technicianId,
      utcToParis(intervention.startsAtUtc),
      intervention.durationHours,
      intervention.description,
      intervention.status,
    ]
      .map(csvCell)
      .join(","),
  );

  return [HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
