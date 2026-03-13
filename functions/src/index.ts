/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as functions from "firebase-functions";
import {defineString} from "firebase-functions/params";
import {onRequest} from "firebase-functions/https";

const DMI_CLIMATE_KEY = defineString("DMI_CLIMATE_KEY");
const DMI_OCEAN_KEY = defineString("DMI_OCEAN_KEY");
const DMI_EDR_KEY = defineString("DMI_EDR_KEY");
const STAC_KEY = defineString("STAC_KEY");

// Simple in-memory cache for EDR data (reduces DMI API calls)
interface CacheEntry {
  body: string;
  contentType: string;
  timestamp: number;
}
const edrCache = new Map<string, CacheEntry>();
const EDR_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (DMI updates hourly)
const MAX_CACHE_SIZE = 100;

function cleanOldCacheEntries() {
  const now = Date.now();
  for (const [key, entry] of edrCache.entries()) {
    if (now - entry.timestamp > EDR_CACHE_TTL) {
      edrCache.delete(key);
    }
  }
  // Limit cache size
  if (edrCache.size > MAX_CACHE_SIZE) {
    const oldest = [...edrCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, edrCache.size - MAX_CACHE_SIZE);
    oldest.forEach(([key]) => edrCache.delete(key));
  }
}

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
functions.setGlobalOptions({ maxInstances: 10 });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function handleCors(req: any, res: any): boolean {
  Object.entries(corsHeaders).forEach(([k, v]) => res.set(k, v));
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

function appendQueryParams(url: URL, query: Record<string, unknown>) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, String(v)));
    } else {
      url.searchParams.append(key, String(value));
    }
  }
}

async function forwardJson(url: URL, init?: any) {
  const upstreamRes = await fetch(url.toString(), init);
  const body = await upstreamRes.text();
  return { upstreamRes, body };
}

function sendPassthrough(res: any, upstreamRes: any, body: string) {
  const contentType =
    (upstreamRes.headers as any)?.get?.("content-type") ??
    upstreamRes.headers["content-type"] ??
    "application/json";
  res.status(upstreamRes.status).set("Content-Type", contentType).send(body);
}

export const getDmiClimate = onRequest(async (req, res) => {
  if (handleCors(req, res)) return;
  const apiKey = DMI_CLIMATE_KEY.value();
  if (!apiKey) {
    res.status(500).json({ error: "Missing functions config: dmi.climate" });
    return;
  }

  const url = new URL(
    "https://opendataapi.dmi.dk/v2/climateData/collections/stationValue/items"
  );
  const query = { ...req.query };
  appendQueryParams(url, query);
  url.searchParams.set("api-key", apiKey);
  functions.logger.info("getDmiClimate upstream", url.toString());

  const { upstreamRes, body } = await forwardJson(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  sendPassthrough(res, upstreamRes as unknown as Response, body);
});

export const getDmiOcean = onRequest(async (req, res) => {
  if (handleCors(req, res)) return;
  const apiKey = DMI_OCEAN_KEY.value();
  if (!apiKey) {
    res.status(500).json({ error: "Missing functions config: dmi.ocean" });
    return;
  }

  const url = new URL(
    "https://opendataapi.dmi.dk/v2/oceanObs/collections/observation/items"
  );
  const query = { ...req.query };
  appendQueryParams(url, query);
  url.searchParams.set("api-key", apiKey);
  functions.logger.info("getDmiOcean upstream", url.toString());

  const { upstreamRes, body } = await forwardJson(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  sendPassthrough(res, upstreamRes as unknown as Response, body);
});

export const getDmiEdr = onRequest(async (req, res) => {
  if (handleCors(req, res)) return;
  const apiKey = DMI_EDR_KEY.value();
  if (!apiKey) {
    res.status(500).json({ error: "Missing functions config: dmi.edr" });
    return;
  }

  const target = typeof req.query.target === "string" ? req.query.target : "";
  if (!target) {
    res.status(400).json({ error: "Missing target path/query" });
    return;
  }

  const basePath = "https://dmigw.govcloud.dk/v1/forecastedr";
  const cleanTarget = target.startsWith("/") ? target : `/${target}`;
  const url = new URL(`${basePath}${cleanTarget}`);
  const query = { ...req.query };
  delete (query as any).target;
  appendQueryParams(url, query);

  // Check cache first
  const cacheKey = url.toString();
  cleanOldCacheEntries();

  const cached = edrCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < EDR_CACHE_TTL) {
    functions.logger.info("getDmiEdr CACHE HIT", cacheKey.substring(0, 100));
    res.set("X-Cache", "HIT");
    res.status(200).set("Content-Type", cached.contentType).send(cached.body);
    return;
  }

  functions.logger.info("getDmiEdr upstream", url.toString());

  // Bestem Accept header baseret på format
  const format = url.searchParams.get("f") || "";
  let acceptHeader = "application/json";
  if (format.toLowerCase().includes("coverage")) {
    acceptHeader = "application/prs.coverage+json, application/json, */*";
  } else if (format.toLowerCase().includes("geojson")) {
    acceptHeader = "application/geo+json, application/json, */*";
  }

  const { upstreamRes, body } = await forwardJson(url, {
    method: "GET",
    headers: {
      Accept: acceptHeader,
      "X-Gravitee-Api-Key": apiKey,
    },
  });

  // Cache successful responses
  if (upstreamRes.status === 200) {
    const headers = upstreamRes.headers as any;
    const contentType =
      (typeof headers?.get === "function" ? headers.get("content-type") : null) ??
      "application/json";
    edrCache.set(cacheKey, {
      body,
      contentType,
      timestamp: Date.now(),
    });
    functions.logger.info("getDmiEdr CACHED", cacheKey.substring(0, 100));
    res.set("X-Cache", "MISS");
  }

  sendPassthrough(res, upstreamRes as unknown as Response, body);
});

export const getStac = onRequest(async (req, res) => {
  if (handleCors(req, res)) return;
  const apiKey = STAC_KEY.value();
  if (!apiKey) {
    res.status(500).json({ error: "Missing functions config: stac.key" });
    return;
  }

  const target = typeof req.query.target === "string" ? req.query.target : "";
  const basePath = "https://dmigw.govcloud.dk/v1/forecastdata";
  const cleanTarget = target.startsWith("/") ? target : `/${target}`;
  const url = new URL(`${basePath}${cleanTarget}`);
  const query = { ...req.query };
  delete (query as any).target;
  appendQueryParams(url, query);
  url.searchParams.set("f", url.searchParams.get("f") ?? "json");
  functions.logger.info("getStac upstream", url.toString());

  const { upstreamRes, body } = await forwardJson(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Gravitee-Api-Key": apiKey,
    },
  });
  sendPassthrough(res, upstreamRes as unknown as Response, body);
});

// ============================================================================
// Weather Alerts - Push notifications for good fishing conditions
// ============================================================================

export { checkWeatherAlerts, triggerWeatherCheck } from "./weatherAlerts";
