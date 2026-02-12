// Formatting utilities for time, trip names, etc.

export type TranslateFn = (key: string) => string;

/**
 * Format seconds as HH:MM:SS
 */
export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format a trip name from trip data (date + optional spot name)
 */
export function formatTripName(trip: any, translate?: TranslateFn): string {
  const dt = trip?.start_ts ? new Date(trip.start_ts) : null;
  const dateStr =
    dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleDateString()
      : translate
      ? translate("unknownDate")
      : "Ukendt dato";

  const spotName =
    typeof trip?.spot_name === "string" && trip.spot_name.trim()
      ? trip.spot_name.trim()
      : null;

  return spotName ? `${dateStr} · ${spotName}` : dateStr;
}

/**
 * Get date and spot name parts from a trip
 */
export function getTripTitleParts(
  trip: any,
  translate?: TranslateFn
): { dateStr: string; spotName: string | null } {
  const dt = trip?.start_ts ? new Date(trip.start_ts) : null;
  const dateStr: string =
    dt && !Number.isNaN(dt.getTime())
      ? dt.toLocaleDateString()
      : translate
      ? translate("unknownDate")
      : "Ukendt dato";

  const spotName: string | null =
    typeof trip?.spot_name === "string" && trip.spot_name.trim()
      ? trip.spot_name.trim()
      : null;

  return { dateStr, spotName };
}
