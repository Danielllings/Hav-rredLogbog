// lib/dmiConfig.ts
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra as any) || {};

export const DMI_CLIMATE_BASE_URL =
  (extra.dmiClimateUrl as string | undefined)?.replace(/\/$/, "") || "";
export const DMI_OCEAN_BASE_URL =
  (extra.dmiOceanUrl as string | undefined)?.replace(/\/$/, "") || "";
export const DMI_EDR_BASE_URL =
  (extra.dmiEdrUrl as string | undefined)?.replace(/\/$/, "") || "";
export const STAC_BASE_URL =
  (extra.stacUrl as string | undefined)?.replace(/\/$/, "") || "";

// NOTE: DMI removed API key requirements on Dec 2, 2025.
// All calls now go directly to opendataapi.dmi.dk without authentication.
// The proxy URLs above are kept as fallback but are no longer needed.

