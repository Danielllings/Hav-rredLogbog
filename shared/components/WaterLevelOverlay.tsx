// shared/components/WaterLevelOverlay.tsx
// Water level (sea surface height) heatmap visualization using Leaflet.heat in a WebView

import React, { useRef, useEffect, useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { ForecastSlider, getForecastValue } from "./ForecastSlider";
import { useTheme } from "../../lib/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
}

const extra = (Constants.expoConfig?.extra as any) || {};
const DMI_EDR_BASE_URL = (extra.dmiEdrUrl as string | undefined)?.replace(/\/$/, "") || "";

// Convert CoverageJSON water level data to heatmap points
function coverageJsonToHeatmapData(coverageJson: any): { points: [number, number, number][]; min: number; max: number } | null {
  try {
    const domain = coverageJson.domain;
    const ranges = coverageJson.ranges;

    if (!domain || !ranges) return null;

    const xAxisDef = domain.axes.x || domain.axes.lon || domain.axes.longitude;
    const yAxisDef = domain.axes.y || domain.axes.lat || domain.axes.latitude;

    if (!xAxisDef || !yAxisDef) return null;

    let xAxis: number[] = [];
    let yAxis: number[] = [];

    if (xAxisDef.values) {
      xAxis = xAxisDef.values;
    } else if (xAxisDef.start !== undefined && xAxisDef.stop !== undefined && xAxisDef.num) {
      const step = (xAxisDef.stop - xAxisDef.start) / (xAxisDef.num - 1);
      for (let i = 0; i < xAxisDef.num; i++) {
        xAxis.push(xAxisDef.start + i * step);
      }
    }

    if (yAxisDef.values) {
      yAxis = yAxisDef.values;
    } else if (yAxisDef.start !== undefined && yAxisDef.stop !== undefined && yAxisDef.num) {
      const step = (yAxisDef.stop - yAxisDef.start) / (yAxisDef.num - 1);
      for (let i = 0; i < yAxisDef.num; i++) {
        yAxis.push(yAxisDef.start + i * step);
      }
    }

    if (xAxis.length === 0 || yAxis.length === 0) return null;

    // Try different parameter names for water level (DMI uses sea-mean-deviation)
    const levelData = ranges["sea-mean-deviation"]?.values ||
                      ranges["82-0.0-1"]?.values ||
                      ranges["sea-surface-height"]?.values ||
                      ranges["ssh"]?.values ||
                      ranges["water-level"]?.values;

    if (!levelData || levelData.length === 0) {
      console.warn("No water level data found in ranges. Available:", Object.keys(ranges));
      return null;
    }

    const nx = xAxis.length;
    const ny = yAxis.length;
    const points: [number, number, number][] = [];
    let min = Infinity;
    let max = -Infinity;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const level = levelData[idx];

        if (level !== null && level !== undefined && !isNaN(level)) {
          const lat = yAxis[j];
          const lng = xAxis[i];
          points.push([lat, lng, level]);
          min = Math.min(min, level);
          max = Math.max(max, level);
        }
      }
    }

    console.log(`Water level conversion: ${points.length} points, min=${min.toFixed(2)}, max=${max.toFixed(2)} m`);
    return { points, min, max };
  } catch (e) {
    console.error("Error converting water level data:", e);
    return null;
  }
}

export function WaterLevelOverlay({
  visible,
  onClose,
  initialLat = 55.5,
  initialLng = 11.0,
  initialZoom = 6,
}: Props) {
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<{ points: [number, number, number][]; min: number; max: number } | null>(null);
  const [forecastHourIndex, setForecastHourIndex] = useState(1);

  const accentColor = theme.primary;

  // Fetch water level data from DMI EDR API
  const fetchWaterLevelData = useCallback(async (hourIndex: number) => {
    if (!DMI_EDR_BASE_URL) {
      setError("DMI API ikke konfigureret");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const datetime = getForecastValue("hourly", hourIndex) || new Date().toISOString();
      const bbox = "7.5,54.0,16.0,58.5";

      console.log(`Fetching water level for datetime: ${datetime}`);

      let allPoints: [number, number, number][] = [];
      let globalMin = Infinity;
      let globalMax = -Infinity;

      // Try CoverageJSON cube endpoint first (dkss_nsbs only has water level)
      const cubeCollections = ["dkss_nsbs"];
      for (const collection of cubeCollections) {
        const query = `/collections/${collection}/cube?bbox=${bbox}&parameter-name=sea-mean-deviation&datetime=${datetime}/${datetime}&crs=crs84&f=CoverageJSON`;
        const proxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(query)}`;

        console.log(`Water level cube query for ${collection}:`, query);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          console.log(`${collection} cube response status:`, response.status);

          if (response.ok) {
            const json = await response.json();
            console.log(`Water level ${collection} cube ranges:`, json.ranges ? Object.keys(json.ranges) : 'no ranges');
            const converted = coverageJsonToHeatmapData(json);
            console.log(`Water level ${collection} cube converted:`, converted ? `${converted.points.length} points` : 'null');
            if (converted && converted.points.length > 0) {
              allPoints = allPoints.concat(converted.points);
              globalMin = Math.min(globalMin, converted.min);
              globalMax = Math.max(globalMax, converted.max);
            }
          } else {
            const text = await response.text();
            console.warn(`${collection} cube error response:`, text.substring(0, 300));
          }
        } catch (e) {
          console.warn(`Failed to fetch ${collection} cube:`, e);
        }
      }

      // Fallback: Try GeoJSON area endpoint if cube didn't work
      if (allPoints.length === 0) {
        console.log("Cube endpoint returned no data, trying area endpoint...");
        const areaQuery = `/collections/dkss_nsbs/area?coords=POLYGON((7.5 54.0, 16.0 54.0, 16.0 58.5, 7.5 58.5, 7.5 54.0))&parameter-name=sea-mean-deviation&datetime=${datetime}/${datetime}&f=GeoJSON`;
        const areaProxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(areaQuery)}`;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(areaProxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          console.log(`Area endpoint response status:`, response.status);

          if (response.ok) {
            const geoJson = await response.json();
            console.log(`Area endpoint features:`, geoJson.features?.length || 0);

            // Convert GeoJSON to heatmap points
            if (geoJson.features && Array.isArray(geoJson.features)) {
              for (const feature of geoJson.features) {
                const coords = feature.geometry?.coordinates;
                const props = feature.properties || {};
                const level = props["sea-mean-deviation"] ?? props["82-0.0-1"];

                if (coords && typeof level === "number" && !isNaN(level)) {
                  const lng = coords[0];
                  const lat = coords[1];
                  allPoints.push([lat, lng, level]);
                  globalMin = Math.min(globalMin, level);
                  globalMax = Math.max(globalMax, level);
                }
              }
              console.log(`Converted ${allPoints.length} points from GeoJSON, range: ${globalMin.toFixed(2)}-${globalMax.toFixed(2)} m`);
            }
          } else {
            const text = await response.text();
            console.warn(`Area endpoint error:`, text.substring(0, 300));
          }
        } catch (e) {
          console.warn(`Failed to fetch area endpoint:`, e);
        }
      }

      if (allPoints.length > 0) {
        console.log(`Got ${allPoints.length} water level points, range: ${globalMin.toFixed(2)}-${globalMax.toFixed(2)} m`);
        setHeatmapData({ points: allPoints, min: globalMin, max: globalMax });
      } else {
        setError("Ingen vandstandsdata fra DMI");
      }
    } catch (e) {
      setError("Fejl ved hentning af data");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch data when visible or forecast hour changes (with debounce)
  useEffect(() => {
    if (!visible) return;

    const timeoutId = setTimeout(() => {
      fetchWaterLevelData(forecastHourIndex);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [visible, forecastHourIndex, fetchWaterLevelData]);

  const onWebViewLoad = useCallback(() => {
    if (heatmapData && webViewRef.current) {
      console.log(`Sending ${heatmapData.points.length} water level points to WebView, range: ${heatmapData.min}-${heatmapData.max}`);
      const script = `
        if (window.updateHeatmapData) {
          window.updateHeatmapData(${JSON.stringify(heatmapData)});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [heatmapData]);

  useEffect(() => {
    if (heatmapData && webViewRef.current) {
      onWebViewLoad();
    }
  }, [heatmapData, onWebViewLoad]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready' && heatmapData) {
        onWebViewLoad();
      }
    } catch (e) {
      // Ignore
    }
  }, [heatmapData, onWebViewLoad]);

  if (!visible) return null;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Vandstand</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #0a0a12;
      overflow: hidden;
    }
    #map {
      width: 100%;
      height: 100%;
      background: #0a0a12;
    }
    .leaflet-container { background: #0a0a12 !important; }
    .leaflet-tile-pane { opacity: 0.85; }

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

    .level-legend {
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
    .level-legend-gradient {
      width: 10px;
      height: 100px;
      border-radius: 5px;
      background: linear-gradient(to top,
        #3B82F6, #06B6D4, #22C55E, #84CC16,
        #EAB308, #F97316, #EF4444
      );
    }
    .level-legend-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100px;
      color: rgba(255,255,255,0.7);
      font-size: 10px;
    }
    .level-legend-labels span {
      line-height: 1;
    }

    /* Center crosshair */
    .center-crosshair {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      pointer-events: none;
    }
    .crosshair-h, .crosshair-v {
      position: absolute;
      background: rgba(255,255,255,0.6);
    }
    .crosshair-h {
      width: 24px;
      height: 2px;
      left: -12px;
      top: -1px;
    }
    .crosshair-v {
      width: 2px;
      height: 24px;
      left: -1px;
      top: -12px;
    }
    .crosshair-dot {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${accentColor};
      border: 2px solid #fff;
      left: -5px;
      top: -5px;
      box-shadow: 0 0 8px ${accentColor}cc;
    }

    /* Center water level display */
    .center-level {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(20px, -50%);
      z-index: 1000;
      background: rgba(10,10,18,0.95);
      padding: 8px 14px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      backdrop-filter: blur(10px);
      border: 1px solid ${accentColor}4d;
      pointer-events: none;
    }
    .center-level-value {
      font-size: 22px;
      font-weight: 700;
      color: ${accentColor};
      line-height: 1;
    }
    .center-level-unit {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-left: 2px;
    }
    .center-level-label {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <div>Indlæser vandstand...</div>
  </div>

  <!-- Center crosshair -->
  <div class="center-crosshair">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
    <div class="crosshair-dot"></div>
  </div>

  <!-- Center water level display -->
  <div id="center-level" class="center-level">
    <span id="level-value" class="center-level-value">--</span>
    <span class="center-level-unit">cm</span>
    <div id="level-label" class="center-level-label">vandstand</div>
  </div>

  <div class="level-legend">
    <div class="level-legend-gradient"></div>
    <div class="level-legend-labels">
      <span>+100</span>
      <span>0 cm</span>
      <span>-100</span>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
  <script>
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

    let heatLayer = null;
    const loadingEl = document.getElementById('loading');
    const levelValueEl = document.getElementById('level-value');
    const levelLabelEl = document.getElementById('level-label');

    let currentData = null;

    // Find nearest water level value
    function getLevelAt(lat, lng) {
      if (!currentData || !currentData.points || currentData.points.length === 0) {
        return null;
      }

      let nearest = null;
      let minDist = Infinity;
      const maxDist = 0.3;

      for (const p of currentData.points) {
        const dist = Math.sqrt(Math.pow(p[0] - lat, 2) + Math.pow(p[1] - lng, 2));
        if (dist < minDist && dist < maxDist) {
          minDist = dist;
          nearest = p;
        }
      }

      return nearest ? nearest[2] : null;
    }

    // Update center water level display
    function updateCenterLevel() {
      const center = map.getCenter();
      const level = getLevelAt(center.lat, center.lng);

      if (level !== null) {
        // Convert m to cm and show with + or - prefix
        const levelCm = Math.round(level * 100);
        const prefix = levelCm >= 0 ? '+' : '';
        levelValueEl.textContent = prefix + levelCm;
        if (levelCm < -20) {
          levelLabelEl.textContent = 'lavvande';
        } else if (levelCm < 20) {
          levelLabelEl.textContent = 'normal';
        } else {
          levelLabelEl.textContent = 'højvande';
        }
      } else {
        levelValueEl.textContent = '--';
        levelLabelEl.textContent = 'ingen data';
      }
    }

    map.on('move', updateCenterLevel);
    map.on('moveend', updateCenterLevel);

    window.updateHeatmapData = function(data) {
      loadingEl.style.display = 'none';
      currentData = data;

      if (!data || !data.points || data.points.length === 0) {
        loadingEl.innerHTML = '<div style="color:#ff6b6b;">Ingen vandstandsdata</div>';
        loadingEl.style.display = 'block';
        return;
      }

      if (heatLayer) {
        map.removeLayer(heatLayer);
      }

      // Sample points to avoid oversaturation
      const sampleRate = Math.max(1, Math.floor(data.points.length / 5000));
      const sampledPoints = data.points.filter((_, i) => i % sampleRate === 0);
      console.log('Sampled ' + sampledPoints.length + ' level points from ' + data.points.length);

      // Normalize water level to 0-1 (-1m to +1m range, 0 = normal)
      const LEVEL_MIN = -1;
      const LEVEL_MAX = 1;
      const normalizedPoints = sampledPoints.map(p => {
        const level = p[2];
        const intensity = Math.max(0, Math.min(1, (level - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN)));
        return [p[0], p[1], intensity];
      });

      heatLayer = L.heatLayer(normalizedPoints, {
        radius: 15,
        blur: 15,
        maxZoom: 12,
        max: 0.6,
        gradient: {
          0.0: '#3B82F6',   // Blue - low water
          0.3: '#06B6D4',
          0.5: '#22C55E',   // Green - normal
          0.7: '#EAB308',
          1.0: '#EF4444'    // Red - high water
        }
      });

      heatLayer.addTo(map);

      // Fix overlay drift during panning
      const canvas = document.querySelector('.leaflet-overlay-pane canvas');
      if (canvas) {
        canvas.style.transition = 'opacity 0.15s ease';

        map.on('movestart', function() {
          canvas.style.opacity = '0.2';
        });

        map.on('moveend', function() {
          setTimeout(function() {
            if (heatLayer) {
              map.removeLayer(heatLayer);
              heatLayer.addTo(map);
              const newCanvas = document.querySelector('.leaflet-overlay-pane canvas');
              if (newCanvas) {
                newCanvas.style.opacity = '1';
                newCanvas.style.transition = 'opacity 0.15s ease';
              }
            }
          }, 10);
        });
      }

      updateCenterLevel();
    };

    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
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
        onLoadEnd={() => heatmapData && onWebViewLoad()}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.loadingText}>Henter vandstandsdata...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtons}>
            <Pressable style={styles.retryButton} onPress={() => fetchWaterLevelData(forecastHourIndex)}>
              <Text style={styles.retryButtonText}>Prøv igen</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Luk</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ForecastSlider
        mode="hourly"
        value={forecastHourIndex}
        onValueChange={setForecastHourIndex}
        color={accentColor}
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

export default WaterLevelOverlay;
