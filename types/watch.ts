export type WatchTripStatus = {
  running: boolean;
  elapsedSec: number;
  distanceM: number;
  catchCount: number;
  spotName?: string;
  waterTemp?: number;
  windSpeed?: number;
};

export type WatchCatchEvent = {
  ts: number;
  condition?: {
    color?: "blank" | "farvet";
    seaLice?: "ingen" | "faa" | "mange";
    released?: boolean;
  };
};
