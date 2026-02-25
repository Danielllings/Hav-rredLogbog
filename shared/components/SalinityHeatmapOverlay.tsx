// shared/components/SalinityHeatmapOverlay.tsx
// Animated salinity heatmap visualization using Leaflet.heat in a WebView

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

// Convert CoverageJSON salinity data to heatmap points
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

    // Get salinity data - DMI uses "salinity" as parameter name
    const salinityData = ranges["salinity"]?.values;
    if (!salinityData || salinityData.length === 0) {
      console.warn("No salinity data found in ranges. Available:", Object.keys(ranges));
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
        const salinity = salinityData[idx];

        if (salinity !== null && salinity !== undefined && !isNaN(salinity) && salinity > 0) {
          const lat = yAxis[j];
          const lng = xAxis[i];
          points.push([lat, lng, salinity]);
          min = Math.min(min, salinity);
          max = Math.max(max, salinity);
        }
      }
    }

    console.log(`Salinity conversion: ${points.length} points, min=${min.toFixed(2)}, max=${max.toFixed(2)} PSU`);
    return { points, min, max };
  } catch (e) {
    console.error("Error converting salinity data:", e);
    return null;
  }
}

export function SalinityHeatmapOverlay({
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
  const [forecastHourIndex, setForecastHourIndex] = useState(1); // Start at +1 hour like other overlays

  // Theme color for UI elements
  const accentColor = theme.primary;

  // Fetch salinity data from DMI EDR API
  const fetchSalinityData = useCallback(async (hourIndex: number) => {
    if (!DMI_EDR_BASE_URL) {
      setError("DMI API ikke konfigureret");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use hourly forecast time like other overlays
      const datetime = getForecastValue("hourly", hourIndex) || new Date().toISOString();
      const bbox = "7.5,54.0,16.0,58.5";

      const collections = ["dkss_idw", "dkss_nsbs"];
      let allPoints: [number, number, number][] = [];
      let globalMin = Infinity;
      let globalMax = -Infinity;

      console.log(`Fetching salinity for datetime: ${datetime}`);

      for (const collection of collections) {
        const query = `/collections/${collection}/cube?bbox=${bbox}&parameter-name=salinity&datetime=${datetime}/${datetime}&crs=crs84&f=CoverageJSON`;
        const proxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(query)}`;

        console.log(`Salinity query for ${collection}:`, query);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          console.log(`${collection} response status:`, response.status);

          if (response.ok) {
            const json = await response.json();
            console.log(`Salinity ${collection} response:`, JSON.stringify(json).substring(0, 500));
            console.log(`Salinity ${collection} ranges:`, json.ranges ? Object.keys(json.ranges) : 'no ranges');
            const converted = coverageJsonToHeatmapData(json);
            console.log(`Salinity ${collection} converted:`, converted ? `${converted.points.length} points` : 'null');
            if (converted) {
              allPoints = allPoints.concat(converted.points);
              globalMin = Math.min(globalMin, converted.min);
              globalMax = Math.max(globalMax, converted.max);
            }
          } else {
            const text = await response.text();
            console.warn(`${collection} error response:`, text.substring(0, 300));
          }
        } catch (e) {
          console.warn(`Failed to fetch ${collection}:`, e);
        }
      }

      if (allPoints.length > 0) {
        console.log(`Got ${allPoints.length} salinity points, range: ${globalMin.toFixed(1)}-${globalMax.toFixed(1)} PSU`);

        // Check if data range is suspiciously narrow (all similar values)
        const range = globalMax - globalMin;
        if (range < 2) {
          console.warn(`Salinity range is very narrow: ${range.toFixed(2)} PSU - data may be incomplete`);
        }

        // Check if all values are very high (open sea only)
        if (globalMin > 28) {
          console.warn(`All salinity values are high (${globalMin.toFixed(1)}-${globalMax.toFixed(1)} PSU) - only open sea data available`);
        }

        setHeatmapData({ points: allPoints, min: globalMin, max: globalMax });
      } else {
        setError("Ingen salinitetdata fra DMI");
      }
    } catch (e) {
      setError("Fejl ved hentning af data");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const _unusedGenerateSyntheticData = () => {
    // Removed - only use real DMI data
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      fetchSalinityData(forecastHourIndex);
    }
  }, [visible, forecastHourIndex, fetchSalinityData]);

  const onWebViewLoad = useCallback(() => {
    if (heatmapData && webViewRef.current) {
      console.log(`Sending ${heatmapData.points.length} salinity points to WebView, range: ${heatmapData.min}-${heatmapData.max}`);
      const script = `
        if (window.updateHeatmapData) {
          window.updateHeatmapData(${JSON.stringify(heatmapData)});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    } else {
      console.log('onWebViewLoad called but no data:', { heatmapData: !!heatmapData, webViewRef: !!webViewRef.current });
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
  <title>Salinitet</title>
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
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: ${accentColor};
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .salinity-legend {
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
    .salinity-legend-gradient {
      width: 10px;
      height: 100px;
      border-radius: 5px;
      background: linear-gradient(to top,
        #22C55E, #84CC16, #EAB308, #F97316,
        #EF4444, #DC2626, #B91C1C
      );
    }
    .salinity-legend-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100px;
      color: rgba(255,255,255,0.7);
      font-size: 10px;
    }
    .salinity-legend-labels span {
      line-height: 1;
    }

    .salinity-info {
      position: absolute;
      bottom: 140px;
      right: 12px;
      background: rgba(10,10,18,0.9);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      z-index: 1000;
      display: none;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
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

    /* Center salinity display */
    .center-salinity {
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
    .center-salinity-value {
      font-size: 22px;
      font-weight: 700;
      color: ${accentColor};
      line-height: 1;
    }
    .center-salinity-unit {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-left: 2px;
    }
    .center-salinity-label {
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
    <div>Indlæser salinitet...</div>
  </div>

  <!-- Center crosshair -->
  <div class="center-crosshair">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
    <div class="crosshair-dot"></div>
  </div>

  <!-- Center salinity display -->
  <div id="center-salinity" class="center-salinity">
    <span id="salinity-value" class="center-salinity-value">--</span>
    <span class="center-salinity-unit">PSU</span>
    <div id="salinity-label" class="center-salinity-label">salinitet</div>
  </div>

  <div class="salinity-legend">
    <div class="salinity-legend-gradient"></div>
    <div class="salinity-legend-labels">
      <span>35</span>
      <span>20</span>
      <span>5 PSU</span>
    </div>
  </div>

  <div id="salinity-info" class="salinity-info"></div>

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
    const infoEl = document.getElementById('salinity-info');
    const salinityValueEl = document.getElementById('salinity-value');
    const salinityLabelEl = document.getElementById('salinity-label');

    // Store data for click queries and interpolation
    let currentData = null;

    // Find nearest salinity value to a point
    function getSalinityAt(lat, lng) {
      if (!currentData || !currentData.points || currentData.points.length === 0) {
        return null;
      }

      // Find nearest point within a reasonable distance
      let nearest = null;
      let minDist = Infinity;
      const maxDist = 0.3; // Max distance in degrees

      for (const p of currentData.points) {
        const dist = Math.sqrt(Math.pow(p[0] - lat, 2) + Math.pow(p[1] - lng, 2));
        if (dist < minDist && dist < maxDist) {
          minDist = dist;
          nearest = p;
        }
      }

      return nearest ? nearest[2] : null;
    }

    // Update center salinity display
    function updateCenterSalinity() {
      const center = map.getCenter();
      const salinity = getSalinityAt(center.lat, center.lng);

      if (salinity !== null) {
        salinityValueEl.textContent = salinity.toFixed(1);
        // Add description based on salinity level
        if (salinity < 10) {
          salinityLabelEl.textContent = 'brakvand';
        } else if (salinity < 20) {
          salinityLabelEl.textContent = 'lavt salt';
        } else if (salinity < 30) {
          salinityLabelEl.textContent = 'medium salt';
        } else {
          salinityLabelEl.textContent = 'havvand';
        }
      } else {
        salinityValueEl.textContent = '--';
        salinityLabelEl.textContent = 'ingen data';
      }
    }

    // Update on map move
    map.on('move', updateCenterSalinity);
    map.on('moveend', updateCenterSalinity);

    window.updateHeatmapData = function(data) {
      loadingEl.style.display = 'none';
      currentData = data;

      if (!data || !data.points || data.points.length === 0) {
        loadingEl.innerHTML = '<div style="color:#ff6b6b;">Ingen data for denne dag</div>';
        loadingEl.style.display = 'block';
        return;
      }

      // Check if all data is high salinity (open sea only)
      if (data.min > 28) {
        console.warn('Only open sea data available (all values > 28 PSU)');
      }

      if (heatLayer) {
        map.removeLayer(heatLayer);
      }

      // Sample points to avoid oversaturation (too many overlapping points = all red)
      // Take every Nth point based on total count
      const sampleRate = Math.max(1, Math.floor(data.points.length / 5000));
      const sampledPoints = data.points.filter((_, i) => i % sampleRate === 0);
      console.log('Sampled ' + sampledPoints.length + ' points from ' + data.points.length + ' (rate: 1/' + sampleRate + ')');

      // Normalize salinity values to 0-1 range using fixed scale (0-35 PSU)
      const SALINITY_MIN = 0;   // Fresh water
      const SALINITY_MAX = 35;  // Full seawater
      const normalizedPoints = sampledPoints.map(p => {
        const salinity = p[2];
        const intensity = Math.max(0, Math.min(1, (salinity - SALINITY_MIN) / (SALINITY_MAX - SALINITY_MIN)));
        return [p[0], p[1], intensity];
      });

      heatLayer = L.heatLayer(normalizedPoints, {
        radius: 15,
        blur: 15,
        maxZoom: 12,
        max: 0.6,  // Lower max to prevent oversaturation
        gradient: {
          0.0: '#22C55E',
          0.15: '#84CC16',
          0.3: '#EAB308',
          0.5: '#F97316',
          0.7: '#EF4444',
          0.85: '#DC2626',
          1.0: '#B91C1C'
        }
      });

      heatLayer.addTo(map);

      // Show salinity value on click
      map.on('click', function(e) {
        if (!currentData) return;

        // Find nearest point
        let nearest = null;
        let minDist = Infinity;

        currentData.points.forEach(p => {
          const dist = Math.sqrt(Math.pow(p[0] - e.latlng.lat, 2) + Math.pow(p[1] - e.latlng.lng, 2));
          if (dist < minDist && dist < 0.2) {
            minDist = dist;
            nearest = p;
          }
        });

        if (nearest) {
          infoEl.innerHTML = '<div style="font-size:18px;font-weight:700;color:${accentColor};">' + nearest[2].toFixed(1) + ' PSU</div>';
          infoEl.style.display = 'block';
        } else {
          infoEl.style.display = 'none';
        }
      });

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

      // Initial center salinity update
      updateCenterSalinity();
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
          <Text style={styles.loadingText}>Henter salinitetdata...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtons}>
            <Pressable style={styles.retryButton} onPress={() => fetchSalinityData(forecastHourIndex)}>
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

export default SalinityHeatmapOverlay;
