import { DateTime } from "luxon";

import { DomainError } from "../interventions/errors.js";

const PARIS_ZONE = "Europe/Paris";
const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function parisLocalToUtc(value: string): string {
  if (!LOCAL_DATE_TIME.test(value)) {
    throw invalidDate(value);
  }

  const paris = DateTime.fromFormat(value, LOCAL_FORMAT, {
    zone: PARIS_ZONE,
    setZone: true,
  });

  if (!paris.isValid || paris.toFormat(LOCAL_FORMAT) !== value) {
    throw invalidDate(value);
  }

  if (paris.getPossibleOffsets().length !== 1) {
    throw invalidDate(value);
  }

  const utc = paris.toUTC().toISO({ suppressMilliseconds: true });
  if (utc === null) {
    throw invalidDate(value);
  }
  return utc;
}

export function utcToParis(value: string): string {
  const instant = DateTime.fromISO(value, { setZone: true });
  if (!instant.isValid) {
    throw invalidDate(value);
  }

  const paris = instant
    .setZone(PARIS_ZONE)
    .toISO({ suppressMilliseconds: true });
  if (paris === null) {
    throw invalidDate(value);
  }
  return paris;
}

function invalidDate(value: string): DomainError {
  return new DomainError(
    "VALIDATION",
    `Invalid date ${value}; expected a valid Paris time as yyyy-MM-ddTHH:mm`,
  );
}
