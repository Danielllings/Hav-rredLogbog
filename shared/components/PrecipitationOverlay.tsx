// shared/components/PrecipitationOverlay.tsx
// Precipitation heatmap visualization using Leaflet.heat in a WebView

import React, { useRef, useEffect, useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ForecastSlider, getForecastValue } from "./ForecastSlider";
import { useTheme } from "../../lib/theme";
import { fetchPrecipitationGrid } from "../../lib/openMeteoGrid";

interface Props {
  visible: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  language?: "da" | "en";
}

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
      for (let i = 0; i < xAxisDef.num; i++) xAxis.push(xAxisDef.start + i * step);
    }

    if (yAxisDef.values) {
      yAxis = yAxisDef.values;
    } else if (yAxisDef.start !== undefined && yAxisDef.stop !== undefined && yAxisDef.num) {
      const step = (yAxisDef.stop - yAxisDef.start) / (yAxisDef.num - 1);
      for (let i = 0; i < yAxisDef.num; i++) yAxis.push(yAxisDef.start + i * step);
    }

    if (xAxis.length === 0 || yAxis.length === 0) return null;

    const precipData = ranges["precipitation"]?.values;
    if (!precipData || precipData.length === 0) return null;

    const nx = xAxis.length;
    const ny = yAxis.length;
    const points: [number, number, number][] = [];
    let min = Infinity;
    let max = -Infinity;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const precip = precipData[idx];
        if (precip !== null && precip !== undefined && !isNaN(precip) && precip > 0) {
          const lat = yAxis[j];
          const lng = xAxis[i];
          points.push([lat, lng, precip]);
          min = Math.min(min, precip);
          max = Math.max(max, precip);
        }
      }
    }

    return { points, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  } catch (e) {
    console.error("Error converting precipitation data:", e);
    return null;
  }
}

export function PrecipitationOverlay({
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
  const [heatmapData, setHeatmapData] = useState<{ points: [number, number, number][]; min: number; max: number } | null>(null);
  const [forecastHourIndex, setForecastHourIndex] = useState(1);

  const accentColor = theme.primary;

  const L = language === "da" ? {
    loadingWebview: "Indlaeser nedboer...",
    precipitation: "nedboer",
    none: "ingen nedboer",
    light: "let regn",
    moderate: "moderat regn",
    heavy: "kraftig regn",
    noData: "ingen data",
    noPrecipData: "Ingen nedboersdata",
    noPrecipDataAvailable: "Ingen nedboersdata tilgaengelig",
    errorFetching: "Fejl ved hentning af data",
    fetchingData: "Henter nedboersdata...",
    tryAgain: "Proev igen",
    close: "Luk",
  } : {
    loadingWebview: "Loading precipitation...",
    precipitation: "precipitation",
    none: "no precipitation",
    light: "light rain",
    moderate: "moderate rain",
    heavy: "heavy rain",
    noData: "no data",
    noPrecipData: "No precipitation data",
    noPrecipDataAvailable: "No precipitation data available",
    errorFetching: "Error fetching data",
    fetchingData: "Fetching precipitation data...",
    tryAgain: "Try again",
    close: "Close",
  };

  const fetchPrecipData = useCallback(async (hourIndex: number) => {
    const datetime = hourIndex > 0 ? getForecastValue("hourly", hourIndex, 168) : undefined;
    try {
      setLoading(true);
      setError(null);

      const grid = await fetchPrecipitationGrid(
        { minLat: 54.0, maxLat: 58.5, minLng: 7.5, maxLng: 16.0 },
        20,
        datetime
      );

      if (grid) {
        const converted = coverageJsonToHeatmapData(grid);
        if (converted) {
          setHeatmapData(converted);
        } else {
          // No precipitation = valid state (clear weather)
          setHeatmapData({ points: [], min: 0, max: 0 });
        }
      } else {
        setError(L.noPrecipDataAvailable);
      }
    } catch (e) {
      setError(L.errorFetching);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [L.noPrecipDataAvailable, L.errorFetching]);

  useEffect(() => {
    if (!visible) return;
    const timeoutId = setTimeout(() => { fetchPrecipData(forecastHourIndex); }, 300);
    return () => clearTimeout(timeoutId);
  }, [visible, forecastHourIndex, fetchPrecipData]);

  const onWebViewLoad = useCallback(() => {
    if (heatmapData && webViewRef.current) {
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
    if (heatmapData && webViewRef.current) { onWebViewLoad(); }
  }, [heatmapData, onWebViewLoad]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready' && heatmapData) { onWebViewLoad(); }
    } catch (e) {}
  }, [heatmapData, onWebViewLoad]);

  if (!visible) return null;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${L.precipitation}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #0a0a12; overflow: hidden; }
    #map { width: 100%; height: 100%; background: #0a0a12; }
    .leaflet-container { background: #0a0a12 !important; }
    .leaflet-tile-pane { opacity: 0.85; }

    .loading-overlay {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #fff; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px; z-index: 2000; text-align: center;
      background: rgba(0,0,0,0.8); padding: 20px 30px; border-radius: 12px;
    }
    .loading-overlay .spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(255,255,255,0.15);
      border-top-color: ${accentColor};
      border-radius: 50%; animation: spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .precip-legend {
      position: absolute; bottom: 135px; left: 12px;
      background: rgba(10,10,18,0.9); padding: 10px 12px; border-radius: 10px;
      z-index: 1000; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);
      display: flex; flex-direction: row; align-items: center; gap: 8px;
    }
    .precip-legend-gradient {
      width: 10px; height: 100px; border-radius: 5px;
      background: linear-gradient(to top,
        rgba(59,130,246,0.3), #3B82F6, #06B6D4, #22C55E,
        #EAB308, #F97316, #EF4444
      );
    }
    .precip-legend-labels {
      display: flex; flex-direction: column; justify-content: space-between;
      height: 100px; color: rgba(255,255,255,0.7); font-size: 10px;
    }
    .precip-legend-labels span { line-height: 1; }

    .center-crosshair {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%); z-index: 1000; pointer-events: none;
    }
    .crosshair-h, .crosshair-v { position: absolute; background: rgba(255,255,255,0.6); }
    .crosshair-h { width: 24px; height: 2px; left: -12px; top: -1px; }
    .crosshair-v { width: 2px; height: 24px; left: -1px; top: -12px; }
    .crosshair-dot {
      position: absolute; width: 6px; height: 6px; border-radius: 50%;
      background: ${accentColor}; border: 2px solid #fff;
      left: -5px; top: -5px; box-shadow: 0 0 8px ${accentColor}cc;
    }

    .center-precip {
      position: absolute; top: 50%; left: 50%;
      transform: translate(20px, -50%); z-index: 1000;
      background: rgba(10,10,18,0.95); padding: 8px 14px; border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      backdrop-filter: blur(10px); border: 1px solid ${accentColor}4d;
      pointer-events: none;
    }
    .center-precip-value { font-size: 22px; font-weight: 700; color: ${accentColor}; line-height: 1; }
    .center-precip-unit { font-size: 12px; color: rgba(255,255,255,0.6); margin-left: 2px; }
    .center-precip-label { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <div>${L.loadingWebview}</div>
  </div>

  <div class="center-crosshair">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
    <div class="crosshair-dot"></div>
  </div>

  <div id="center-precip" class="center-precip">
    <span id="precip-value" class="center-precip-value">--</span>
    <span class="center-precip-unit">mm</span>
    <div id="precip-label" class="center-precip-label">${L.precipitation}</div>
  </div>

  <div class="precip-legend">
    <div class="precip-legend-gradient"></div>
    <div class="precip-legend-labels">
      <span>10+</span>
      <span>5</span>
      <span>1</span>
      <span>0 mm</span>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
  <script>
    const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 18
    });
    const labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 18, opacity: 0.6
    });

    const map = L.map('map', {
      center: [${initialLat}, ${initialLng}],
      zoom: ${initialZoom},
      zoomControl: false, attributionControl: false,
      layers: [darkTiles]
    });
    labels.addTo(map);

    let heatLayer = null;
    const loadingEl = document.getElementById('loading');
    const precipValueEl = document.getElementById('precip-value');
    const precipLabelEl = document.getElementById('precip-label');
    let currentData = null;

    function getPrecipAt(lat, lng) {
      if (!currentData || !currentData.points || currentData.points.length === 0) return 0;
      let nearest = null;
      let minDist = Infinity;
      const maxDist = 0.3;
      for (const p of currentData.points) {
        const dist = Math.sqrt(Math.pow(p[0] - lat, 2) + Math.pow(p[1] - lng, 2));
        if (dist < minDist && dist < maxDist) { minDist = dist; nearest = p; }
      }
      return nearest ? nearest[2] : 0;
    }

    function updateCenterPrecip() {
      const center = map.getCenter();
      const precip = getPrecipAt(center.lat, center.lng);

      if (precip > 0.05) {
        precipValueEl.textContent = precip.toFixed(1);
        if (precip < 1) precipLabelEl.textContent = '${L.light}';
        else if (precip < 5) precipLabelEl.textContent = '${L.moderate}';
        else precipLabelEl.textContent = '${L.heavy}';
      } else {
        precipValueEl.textContent = '0';
        precipLabelEl.textContent = '${L.none}';
      }
    }

    map.on('move', updateCenterPrecip);
    map.on('moveend', updateCenterPrecip);

    window.updateHeatmapData = function(data) {
      loadingEl.style.display = 'none';
      currentData = data;

      if (heatLayer) { map.removeLayer(heatLayer); }

      if (!data || !data.points || data.points.length === 0) {
        // No precipitation = clear weather, just show empty map
        updateCenterPrecip();
        return;
      }

      const sampleRate = Math.max(1, Math.floor(data.points.length / 5000));
      const sampledPoints = data.points.filter(function(_, i) { return i % sampleRate === 0; });

      // Normalize: 0mm = 0, 10mm+ = 1
      const PRECIP_MAX = 10;
      const normalizedPoints = sampledPoints.map(function(p) {
        var intensity = Math.min(1, p[2] / PRECIP_MAX);
        return [p[0], p[1], intensity];
      });

      heatLayer = L.heatLayer(normalizedPoints, {
        radius: 18,
        blur: 15,
        maxZoom: 12,
        max: 0.6,
        gradient: {
          0.0: 'rgba(59,130,246,0.2)',
          0.1: '#3B82F6',
          0.3: '#06B6D4',
          0.5: '#22C55E',
          0.7: '#EAB308',
          0.85: '#F97316',
          1.0: '#EF4444'
        }
      });

      heatLayer.addTo(map);

      var canvas = document.querySelector('.leaflet-overlay-pane canvas');
      if (canvas) {
        canvas.style.transition = 'opacity 0.15s ease';
        map.on('movestart', function() { canvas.style.opacity = '0.2'; });
        map.on('moveend', function() {
          setTimeout(function() {
            if (heatLayer) {
              map.removeLayer(heatLayer);
              heatLayer.addTo(map);
              var newCanvas = document.querySelector('.leaflet-overlay-pane canvas');
              if (newCanvas) {
                newCanvas.style.opacity = '1';
                newCanvas.style.transition = 'opacity 0.15s ease';
              }
            }
          }, 10);
        });
      }

      updateCenterPrecip();
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
          <Text style={styles.loadingText}>{L.fetchingData}</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtons}>
            <Pressable style={styles.retryButton} onPress={() => fetchPrecipData(forecastHourIndex)}>
              <Text style={styles.retryButtonText}>{L.tryAgain}</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{L.close}</Text>
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
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0a0a12" },
  webview: { flex: 1, backgroundColor: "#0a0a12" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,18,0.95)",
    justifyContent: "center", alignItems: "center", zIndex: 200,
  },
  loadingText: { color: "#fff", fontSize: 14, marginTop: 12, fontWeight: "500" },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,18,0.95)",
    justifyContent: "center", alignItems: "center", zIndex: 200,
  },
  errorText: { color: "#ff6b6b", fontSize: 14, marginTop: 12, marginBottom: 16 },
  errorButtons: { flexDirection: "row", gap: 12 },
  retryButton: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  closeButton: { backgroundColor: "rgba(255,107,107,0.2)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  closeButtonText: { color: "#ff6b6b", fontSize: 14, fontWeight: "500" },
});

export default PrecipitationOverlay;
