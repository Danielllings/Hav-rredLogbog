// shared/components/WindOverlay.tsx
// Animated wind visualization using Leaflet-velocity in a WebView
// Uses real DMI EDR data (HARMONIE model) with circular compass cursor

import React, { useRef, useEffect, useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ForecastSlider, getForecastValue } from "./ForecastSlider";
import { useTheme } from "../../lib/theme";
import { fetchWindGrid } from "../../lib/openMeteoGrid";

interface Props {
  visible: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  language?: "da" | "en";
}

// Open-Meteo grid fetch (erstatter DMI EDR proxy)

// OPTIMIZED: Memory cache for wind overlay data
const windDataCache = new Map<string, { velocityData: any[]; windGrid: any; seaGrid: any; ts: number }>();
const WIND_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Convert wind speed + direction to u/v components for leaflet-velocity
function windToVelocityData(
  speeds: number[],
  directions: number[],
  bounds: { west: number; east: number; south: number; north: number },
  nx: number,
  ny: number
): any[] | null {
  try {
    if (speeds.length === 0 || speeds.length !== directions.length) return null;

    const lo1 = bounds.west;
    const lo2 = bounds.east;
    const la1 = bounds.north;
    const la2 = bounds.south;
    const dx = nx > 1 ? (lo2 - lo1) / (nx - 1) : 0.1;
    const dy = ny > 1 ? (la1 - la2) / (ny - 1) : 0.1;

    const uData: number[] = [];
    const vData: number[] = [];

    // leaflet-velocity expects data ordered north-to-south (la1=north first)
    // but Open-Meteo grid is south-to-north, so iterate rows in reverse
    for (let j = ny - 1; j >= 0; j--) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const speed = speeds[idx] ?? 0;
        const dir = directions[idx] ?? 0;

        if (speed === null || isNaN(speed) || dir === null || isNaN(dir)) {
          uData.push(0);
          vData.push(0);
        } else {
          // Wind direction is "from" direction, convert to radians
          // and get u/v components (direction wind is going TO)
          const dirRad = ((dir + 180) % 360) * Math.PI / 180;
          const u = speed * Math.sin(dirRad);
          const v = speed * Math.cos(dirRad);
          uData.push(u);
          vData.push(v);
        }
      }
    }

    return [
      {
        header: {
          parameterCategory: 2,
          parameterNumber: 2,
          parameterNumberName: "eastward_wind",
          parameterUnit: "m.s-1",
          lo1, lo2, la1, la2, nx, ny, dx, dy,
          refTime: new Date().toISOString()
        },
        data: uData
      },
      {
        header: {
          parameterCategory: 2,
          parameterNumber: 3,
          parameterNumberName: "northward_wind",
          parameterUnit: "m.s-1",
          lo1, lo2, la1, la2, nx, ny, dx, dy,
          refTime: new Date().toISOString()
        },
        data: vData
      }
    ];
  } catch (e) {
    console.error("Error converting wind data:", e);
    return null;
  }
}

export function WindOverlay({
  visible,
  onClose,
  initialLat = 55.5,
  initialLng = 11.0,
  initialZoom = 6,
  language = "da",
}: Props) {
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [velocityData, setVelocityData] = useState<any[] | null>(null);
  const [windGridData, setWindGridData] = useState<{
    speeds: number[];
    directions: number[];
    bounds: any;
    nx: number;
    ny: number;
    yAxisNorthToSouth: boolean;
  } | null>(null);
  const [seaGridData, setSeaGridData] = useState<{
    speeds: number[];
    directions: number[];
    bounds: any;
    nx: number;
    ny: number;
    yAxisNorthToSouth: boolean;
  } | null>(null);
  const [forecastHourIndex, setForecastHourIndex] = useState(() => Math.min(1, 168));

  const accentColor = theme.primary;

  // Parse CoverageJSON wind data
  const parseCoverageJson = (json: any): {
    speeds: number[];
    directions: number[];
    bounds: any;
    nx: number;
    ny: number;
    yAxisNorthToSouth: boolean;
  } | null => {
    try {
      const domain = json.domain;
      const ranges = json.ranges;

      if (!domain || !ranges) {
        console.log("No domain or ranges in response");
        return null;
      }

      console.log("Available range keys:", Object.keys(ranges));

      const xAxisDef = domain.axes.x || domain.axes.lon || domain.axes.longitude;
      const yAxisDef = domain.axes.y || domain.axes.lat || domain.axes.latitude;

      if (!xAxisDef || !yAxisDef) {
        console.log("No x/y axis definition");
        return null;
      }

      let xAxis: number[] = [];
      let yAxis: number[] = [];

      if (xAxisDef.values) {
        xAxis = xAxisDef.values;
      } else if (xAxisDef.start !== undefined && xAxisDef.stop !== undefined && xAxisDef.num) {
        for (let i = 0; i < xAxisDef.num; i++) {
          xAxis.push(xAxisDef.start + i * (xAxisDef.stop - xAxisDef.start) / (xAxisDef.num - 1));
        }
      }

      if (yAxisDef.values) {
        yAxis = yAxisDef.values;
      } else if (yAxisDef.start !== undefined && yAxisDef.stop !== undefined && yAxisDef.num) {
        for (let i = 0; i < yAxisDef.num; i++) {
          yAxis.push(yAxisDef.start + i * (yAxisDef.stop - yAxisDef.start) / (yAxisDef.num - 1));
        }
      }

      if (xAxis.length === 0 || yAxis.length === 0) {
        console.log("Empty x or y axis");
        return null;
      }

      // Determine if y-axis goes north to south (first value > last value)
      const yAxisNorthToSouth = yAxis[0] > yAxis[yAxis.length - 1];
      console.log("Y-axis direction:", yAxisNorthToSouth ? "North to South" : "South to North", "first:", yAxis[0], "last:", yAxis[yAxis.length - 1]);

      // Get wind data - try different parameter names
      const speedData = ranges["wind-speed"]?.values ||
                        ranges["wind_speed"]?.values ||
                        ranges["ws"]?.values || [];
      const dirData = ranges["wind-dir"]?.values ||
                      ranges["wind_direction"]?.values ||
                      ranges["wind-direction"]?.values ||
                      ranges["wd"]?.values || [];
      const gustData = ranges["wind-gusts"]?.values ||
                       ranges["wind_gusts_10m"]?.values || [];


      const nx = xAxis.length;
      const ny = yAxis.length;

      // Check if we have valid non-null data
      const validSpeeds = speedData.filter((v: any) => v !== null && !isNaN(v) && v >= 0);
      const validDirs = dirData.filter((v: any) => v !== null && !isNaN(v));

      console.log(`Parsed: speeds=${speedData.length} (valid: ${validSpeeds.length}), dirs=${dirData.length} (valid: ${validDirs.length})`);
      console.log(`Sample speeds:`, speedData.slice(0, 5));
      console.log(`Sample dirs:`, dirData.slice(0, 5));

      // If most data is invalid, return null
      if (validSpeeds.length < speedData.length * 0.1) {
        console.log("Too few valid speed values");
        return null;
      }

      return {
        speeds: speedData,
        directions: dirData,
        gusts: gustData,
        bounds: {
          west: Math.min(...xAxis),
          east: Math.max(...xAxis),
          south: Math.min(...yAxis),
          north: Math.max(...yAxis)
        },
        nx,
        ny,
        yAxisNorthToSouth
      };
    } catch (e) {
      console.error("Error parsing wind CoverageJSON:", e);
      return null;
    }
  };

  // Fetch wind data from Open-Meteo (~400ms)
  const fetchWindData = useCallback(async (hourIndex: number) => {
    const datetime = hourIndex > 0 ? getForecastValue("hourly", hourIndex, 168) : undefined;
    const cacheKey = `wind_${datetime || "now"}`;

    // Check cache first
    const cached = windDataCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < WIND_CACHE_TTL) {
      setVelocityData(cached.velocityData);
      setWindGridData(cached.windGrid);
      setSeaGridData(cached.seaGrid);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const grid = await fetchWindGrid(
        { minLat: 54.0, maxLat: 58.5, minLng: 7.5, maxLng: 16.0 },
        20,
        datetime
      );

      if (grid) {
        const parsed = parseCoverageJson(grid);

        if (parsed && parsed.speeds.length > 0) {
          const velocityToUse = windToVelocityData(
            parsed.speeds, parsed.directions, parsed.bounds, parsed.nx, parsed.ny
          );

          if (velocityToUse) {
            windDataCache.set(cacheKey, {
              velocityData: velocityToUse,
              windGrid: parsed,
              seaGrid: parsed,
              ts: Date.now(),
            });

            setVelocityData(velocityToUse);
            setWindGridData(parsed);
            setSeaGridData(parsed);
            setError(null);
          } else {
            setError(language === "da" ? "Ingen vinddata tilgængelig" : "No wind data available");
          }
        } else {
          setError(language === "da" ? "Ingen vinddata tilgængelig" : "No wind data available");
        }
      } else {
        setError(language === "da" ? "Ingen vinddata tilgængelig" : "No wind data available");
      }
    } catch (e: any) {
      setError(language === "da" ? "Fejl ved hentning af data" : "Error fetching data");
      console.error("Wind fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    if (visible) {
      fetchWindData(forecastHourIndex);
    }
  }, [visible, forecastHourIndex, fetchWindData]);

  const onWebViewLoad = useCallback(() => {
    if (velocityData && webViewRef.current) {
      const script = `
        if (window.updateWindData) {
          window.updateWindData(
            ${JSON.stringify(velocityData)},
            ${JSON.stringify(windGridData)},
            ${JSON.stringify(seaGridData)}
          );
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [velocityData, windGridData, seaGridData]);

  useEffect(() => {
    if (velocityData && webViewRef.current) {
      onWebViewLoad();
    }
  }, [velocityData, windGridData, seaGridData, onWebViewLoad]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready' && velocityData) {
        onWebViewLoad();
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [velocityData, onWebViewLoad]);

  if (!visible) return null;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${language === "da" ? "Vind" : "Wind"}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #0a0a12;
      overflow: hidden;
      touch-action: manipulation;
    }
    #map {
      width: 100%;
      height: 100%;
      background: #0a0a12;
    }
    .leaflet-container {
      background: #0a0a12 !important;
    }
    .leaflet-tile-pane {
      opacity: 0.85;
    }
    .loading-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      z-index: 2000;
      text-align: center;
      background: rgba(0,0,0,0.8);
      padding: 20px 30px;
      border-radius: 12px;
    }
    .loading-overlay .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: ${accentColor};
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Wind legend */
    .wind-legend {
      position: absolute;
      bottom: 135px;
      left: 12px;
      background: rgba(10,10,18,0.9);
      padding: 10px 12px;
      border-radius: 10px;
      z-index: 1000;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
    .wind-legend-gradient {
      width: 10px;
      height: 100px;
      border-radius: 5px;
      background: linear-gradient(to top,
        #3B82F6, #06B6D4, #22C55E, #84CC16,
        #EAB308, #F97316, #EF4444, #DC2626
      );
    }
    .wind-legend-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100px;
      color: rgba(255,255,255,0.7);
      font-size: 10px;
    }
    .wind-legend-labels span {
      line-height: 1;
    }

    /* Circular compass cursor - Windy style */
    .wind-compass {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      pointer-events: none;
    }
    .compass-circle {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.25);
      background: transparent;
      position: relative;
    }
    .compass-tick {
      position: absolute;
      width: 2px;
      height: 6px;
      background: rgba(255,255,255,0.3);
      left: 50%;
      top: 0;
      transform-origin: center 70px;
    }
    .compass-tick.major {
      height: 10px;
      width: 2px;
      background: rgba(255,255,255,0.5);
    }
    .compass-label {
      position: absolute;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .compass-label.n { top: 16px; left: 50%; transform: translateX(-50%); }
    .compass-label.s { bottom: 16px; left: 50%; transform: translateX(-50%); }
    .compass-label.e { right: 16px; top: 50%; transform: translateY(-50%); }
    .compass-label.w { left: 16px; top: 50%; transform: translateY(-50%); }

    /* Wind arrow - clean white */
    .wind-arrow {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 5px;
      height: 65px;
      background: linear-gradient(to top, rgba(255,255,255,0.2), rgba(255,255,255,0.9));
      transform-origin: center bottom;
      transform: translate(-50%, -100%) rotate(0deg);
      border-radius: 3px;
      transition: transform 0.3s ease;
      z-index: 5;
    }
    .wind-arrow::before {
      content: '';
      position: absolute;
      top: -9px;
      left: 50%;
      transform: translateX(-50%);
      border-left: 9px solid transparent;
      border-right: 9px solid transparent;
      border-bottom: 12px solid rgba(255,255,255,0.9);
    }

    /* Wind info panel — below compass */
    .wind-info {
      position: absolute;
      top: calc(50% + 80px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10,10,18,0.8);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 6px 12px;
      z-index: 1000;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      pointer-events: none;
    }
    .wind-info-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    .wind-info-row + .wind-info-row {
      margin-top: 2px;
    }
    .wind-info-label {
      font-size: 9px;
      font-weight: 600;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .wind-info-value {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
    .wind-info-value .unit {
      font-size: 9px;
      font-weight: 500;
      color: rgba(255,255,255,0.4);
      margin-left: 1px;
    }
    .wind-info-dir {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      text-align: center;
      margin-top: 2px;
    }


    /* Center dot */
    .compass-center {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 8px;
      background: rgba(255,255,255,0.9);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      z-index: 15;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <div id="loading-text">${language === "da" ? "Indlæser vind..." : "Loading wind..."}</div>
  </div>

  <!-- Circular compass cursor - Windy style -->
  <div class="wind-compass">
    <div class="compass-circle">
      <!-- Ticks -->
      <div class="compass-tick major" style="transform: translateX(-50%) rotate(0deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(30deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(60deg);"></div>
      <div class="compass-tick major" style="transform: translateX(-50%) rotate(90deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(120deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(150deg);"></div>
      <div class="compass-tick major" style="transform: translateX(-50%) rotate(180deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(210deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(240deg);"></div>
      <div class="compass-tick major" style="transform: translateX(-50%) rotate(270deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(300deg);"></div>
      <div class="compass-tick" style="transform: translateX(-50%) rotate(330deg);"></div>

      <!-- Cardinal labels -->
      <span class="compass-label n">N</span>
      <span class="compass-label s">S</span>
      <span class="compass-label e">E</span>
      <span class="compass-label w">W</span>

      <!-- Wind arrow -->
      <div id="wind-arrow" class="wind-arrow"></div>

      <!-- Center dot -->
      <div class="compass-center"></div>
    </div>
    <!-- Wind info below compass -->
    <div class="wind-info" id="wind-info">
      <div class="wind-info-row">
        <span class="wind-info-label">${language === "da" ? "Vind" : "Wind"}</span>
        <span class="wind-info-value"><span id="wind-speed">--</span><span class="unit">m/s</span></span>
      </div>
      <div class="wind-info-row">
        <span class="wind-info-label">${language === "da" ? "Stød" : "Gust"}</span>
        <span class="wind-info-value"><span id="gust-speed">--</span><span class="unit">m/s</span></span>
      </div>
      <div class="wind-info-dir" id="wind-dir-label">--</div>
    </div>
  </div>

  <div class="wind-legend">
    <div class="wind-legend-gradient"></div>
    <div class="wind-legend-labels">
      <span>25+</span>
      <span>20</span>
      <span>15</span>
      <span>10</span>
      <span>5</span>
      <span>0 m/s</span>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-velocity@2.1.2/dist/leaflet-velocity.min.js"></script>
  <script>
    const i18n = ${JSON.stringify(language === "da" ? {
      wind: "Vind", gust: "Stød", loading: "Indlæser vind...",
      noData: "Ingen vinddata", error: "Fejl ved visning",
      fetchingData: "Henter vinddata...", tryAgain: "Prøv igen", close: "Luk"
    } : {
      wind: "Wind", gust: "Gust", loading: "Loading wind...",
      noData: "No wind data", error: "Display error",
      fetchingData: "Fetching wind data...", tryAgain: "Try again", close: "Close"
    })};

    const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 18
    });

    const labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 18,
      opacity: 0.6
    });

    const map = L.map('map', {
      center: [${initialLat}, ${initialLng}],
      zoom: ${initialZoom},
      zoomControl: false,
      attributionControl: false,
      layers: [darkTiles]
    });
    labels.addTo(map);

    let velocityLayer = null;
    const loadingEl = document.getElementById('loading');
    const windArrowEl = document.getElementById('wind-arrow');
    const windSpeedEl = document.getElementById('wind-speed');
    const gustSpeedEl = document.getElementById('gust-speed');
    const windDirLabelEl = document.getElementById('wind-dir-label');

    let landGridData = null;  // HARMONIE - covers both land AND sea
    let seaGridData = null;   // WAM - fallback (wave model, may not have wind data)

    // Get wind data from a single grid - handles null values
    function getWindFromGrid(gridData, lat, lng) {
      if (!gridData) return null;

      const { speeds, directions, gusts, bounds, nx, ny, yAxisNorthToSouth } = gridData;
      if (!speeds || speeds.length === 0) return null;

      // Check if point is within bounds (with small margin for edge cases)
      const margin = 0.5;
      if (lng < bounds.west - margin || lng > bounds.east + margin ||
          lat < bounds.south - margin || lat > bounds.north + margin) {
        return null;
      }

      // Clamp to actual bounds for interpolation
      const clampedLng = Math.max(bounds.west, Math.min(bounds.east, lng));
      const clampedLat = Math.max(bounds.south, Math.min(bounds.north, lat));

      // Calculate grid position using clamped coordinates
      const xRatio = (clampedLng - bounds.west) / (bounds.east - bounds.west);

      // Y-axis: if data is north-to-south, invert the ratio
      // North-to-south: yRatio=0 at north (top of data), yRatio=1 at south (bottom)
      // South-to-north: yRatio=0 at south (top of data), yRatio=1 at north (bottom)
      let yRatio;
      if (yAxisNorthToSouth) {
        // Data goes from north (index 0) to south (index ny-1)
        yRatio = (bounds.north - clampedLat) / (bounds.north - bounds.south);
      } else {
        // Data goes from south (index 0) to north (index ny-1)
        yRatio = (clampedLat - bounds.south) / (bounds.north - bounds.south);
      }

      const x = xRatio * (nx - 1);
      const y = yRatio * (ny - 1);

      const x0 = Math.floor(x);
      const x1 = Math.min(x0 + 1, nx - 1);
      const y0 = Math.floor(y);
      const y1 = Math.min(y0 + 1, ny - 1);

      // Get indices for the 4 corners
      const idx00 = y0 * nx + x0;
      const idx01 = y0 * nx + x1;
      const idx10 = y1 * nx + x0;
      const idx11 = y1 * nx + x1;

      // Get values - handle null
      const s00 = speeds[idx00];
      const s01 = speeds[idx01];
      const s10 = speeds[idx10];
      const s11 = speeds[idx11];

      // Find valid values and their weights
      const xFrac = x - x0;
      const yFrac = y - y0;

      const corners = [
        { s: s00, d: directions[idx00], w: (1 - xFrac) * (1 - yFrac) },
        { s: s01, d: directions[idx01], w: xFrac * (1 - yFrac) },
        { s: s10, d: directions[idx10], w: (1 - xFrac) * yFrac },
        { s: s11, d: directions[idx11], w: xFrac * yFrac }
      ];

      // Filter to only valid corners - null/undefined/NaN are invalid
      const validCorners = corners.filter(c =>
        c.s !== null && c.s !== undefined && !isNaN(c.s)
      );

      // If no valid corners, return 0 (calm) instead of null - we're within bounds
      if (validCorners.length === 0) {
        return { speed: 0, dir: 0, gust: 0 };
      }

      // Normalize weights for valid corners only
      const totalWeight = validCorners.reduce((sum, c) => sum + c.w, 0);

      // Interpolate speed
      let speed = 0;
      for (const c of validCorners) {
        speed += c.s * (c.w / totalWeight);
      }

      // Interpolate gust
      let gust = 0;
      if (gusts && gusts.length > 0) {
        const g00 = gusts[idx00];
        const g01 = gusts[idx01];
        const g10 = gusts[idx10];
        const g11 = gusts[idx11];
        const gustCorners = [
          { g: g00, w: (1 - xFrac) * (1 - yFrac) },
          { g: g01, w: xFrac * (1 - yFrac) },
          { g: g10, w: (1 - xFrac) * yFrac },
          { g: g11, w: xFrac * yFrac }
        ].filter(c => c.g !== null && c.g !== undefined && !isNaN(c.g));
        if (gustCorners.length > 0) {
          const gustTotal = gustCorners.reduce((sum, c) => sum + c.w, 0);
          for (const c of gustCorners) {
            gust += c.g * (c.w / gustTotal);
          }
        }
      }

      // Use nearest valid direction
      let dir = validCorners[0].d ?? 0;
      // Find the corner with highest weight
      let maxWeight = 0;
      for (const c of validCorners) {
        if (c.w > maxWeight && c.d !== null && c.d !== undefined) {
          maxWeight = c.w;
          dir = c.d;
        }
      }

      return { speed, dir, gust };
    }

    // Get wind data at position - HARMONIE covers both land AND sea
    function getWindAt(lat, lng) {
      // Try HARMONIE first - it covers entire Denmark including surrounding seas
      let wind = getWindFromGrid(landGridData, lat, lng);
      if (wind && wind.speed >= 0) {
        return wind;
      }

      // Fallback to WAM sea grid if available
      wind = getWindFromGrid(seaGridData, lat, lng);
      if (wind && wind.speed >= 0) {
        return wind;
      }

      return null;
    }

    // Update compass display
    function updateCompass() {
      const center = map.getCenter();
      const wind = getWindAt(center.lat, center.lng);

      if (wind && wind.speed >= 0) {
        // Wind direction is "from" direction - arrow points where wind blows TO
        const blowingTo = (wind.dir + 180) % 360;
        windArrowEl.style.transform = 'translate(-50%, -100%) rotate(' + blowingTo + 'deg)';

        // Update info panel
        windSpeedEl.textContent = wind.speed.toFixed(1);
        gustSpeedEl.textContent = (wind.gust && wind.gust > 0) ? wind.gust.toFixed(1) : '--';

        // Cardinal direction label (FROM direction)
        var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
        var dirIdx = Math.round(wind.dir / 22.5) % 16;
        windDirLabelEl.textContent = dirs[dirIdx] + ' ' + Math.round(wind.dir) + '°';
      } else {
        windSpeedEl.textContent = '--';
        gustSpeedEl.textContent = '--';
        windDirLabelEl.textContent = '--';
      }
    }

    map.on('move', updateCompass);
    map.on('moveend', updateCompass);

    window.updateWindData = function(velocityData, landGrid, seaGrid) {
      loadingEl.style.display = 'none';
      landGridData = landGrid;
      seaGridData = seaGrid;

      console.log('WebView received - velocity:', velocityData ? velocityData.length : 0);
      console.log('WebView received - landGrid:', landGrid ? 'yes' : 'no', landGrid ? landGrid.bounds : null, 'yAxisNorthToSouth:', landGrid ? landGrid.yAxisNorthToSouth : null);
      console.log('WebView received - seaGrid:', seaGrid ? 'yes' : 'no', seaGrid ? seaGrid.bounds : null, 'yAxisNorthToSouth:', seaGrid ? seaGrid.yAxisNorthToSouth : null);

      if (seaGrid) {
        // Find first non-null value to verify data exists
        let firstValid = -1;
        for (let i = 0; i < seaGrid.speeds.length; i++) {
          if (seaGrid.speeds[i] !== null && !isNaN(seaGrid.speeds[i])) {
            firstValid = i;
            break;
          }
        }
        console.log('SeaGrid first valid index:', firstValid, 'value:', firstValid >= 0 ? seaGrid.speeds[firstValid] : 'none');
      }

      if (!velocityData || velocityData.length === 0) {
        loadingEl.innerHTML = '<div style="color:#ff6b6b;">' + i18n.noData + '</div>';
        loadingEl.style.display = 'block';
        return;
      }

      if (velocityLayer) {
        map.removeLayer(velocityLayer);
      }

      try {
        velocityLayer = L.velocityLayer({
          displayValues: false,
          data: velocityData,
          velocityScale: 0.008,
          maxVelocity: 25,
          colorScale: [
            '#3B82F6', '#0EA5E9', '#06B6D4', '#14B8A6',
            '#22C55E', '#84CC16', '#EAB308', '#F59E0B',
            '#F97316', '#EF4444', '#DC2626', '#B91C1C'
          ],
          lineWidth: 1.5,
          particleAge: 60,
          particleMultiplier: 0.003,
          frameRate: 20
        });

        velocityLayer.addTo(map);
        console.log('Velocity layer added');
        updateCompass();

        // Fix pan drift
        const canvas = document.querySelector('.leaflet-overlay-pane canvas');
        if (canvas) {
          canvas.style.transition = 'opacity 0.15s ease';
          map.on('movestart', function() {
            canvas.style.opacity = '0.3';
          });
          map.on('moveend', function() {
            setTimeout(function() {
              if (velocityLayer) {
                map.removeLayer(velocityLayer);
                velocityLayer.addTo(map);
                const newCanvas = document.querySelector('.leaflet-overlay-pane canvas');
                if (newCanvas) {
                  newCanvas.style.opacity = '1';
                  newCanvas.style.transition = 'opacity 0.15s ease';
                }
              }
            }, 50);
          });
        }
      } catch (e) {
        console.error('Error creating velocity layer:', e);
        loadingEl.innerHTML = '<div style="color:#ff6b6b;">' + i18n.error + '</div>';
        loadingEl.style.display = 'block';
      }
    };

    // Notify React Native that we're ready
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  </script>
</body>
</html>
`;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        onLoad={onWebViewLoad}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.loadingText}>{language === "da" ? "Henter vinddata..." : "Fetching wind data..."}</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtons}>
            <Pressable style={styles.retryButton} onPress={() => fetchWindData(forecastHourIndex)}>
              <Text style={styles.retryButtonText}>{language === "da" ? "Prøv igen" : "Try again"}</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{language === "da" ? "Luk" : "Close"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ForecastSlider
        mode="hourly"
        value={forecastHourIndex}
        onValueChange={setForecastHourIndex}
        color={accentColor}
        language={language}
        maxHours={168}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0a12",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0a0a12",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,18,0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  loadingText: {
    color: "#fff",
    fontSize: 14,
    marginTop: 12,
    fontWeight: "500",
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,18,0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  errorButtons: {
    flexDirection: "row",
    gap: 12,
  },
  retryButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  closeButton: {
    backgroundColor: "rgba(255,107,107,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  closeButtonText: {
    color: "#ff6b6b",
    fontSize: 14,
    fontWeight: "500",
  },
});

export default WindOverlay;
