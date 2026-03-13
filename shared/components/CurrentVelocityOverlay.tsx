// shared/components/CurrentVelocityOverlay.tsx
// Animated ocean current visualization using Leaflet-velocity in a WebView
// Uses real DMI EDR data converted to leaflet-velocity format

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

// Convert CoverageJSON to leaflet-velocity format
function coverageJsonToVelocityData(coverageJson: any): any[] | null {
  try {
    const domain = coverageJson.domain;
    const ranges = coverageJson.ranges;

    if (!domain || !ranges) return null;

    // Get axes - CoverageJSON can have values array OR start/stop/num
    const xAxisDef = domain.axes.x || domain.axes.lon || domain.axes.longitude;
    const yAxisDef = domain.axes.y || domain.axes.lat || domain.axes.latitude;

    if (!xAxisDef || !yAxisDef) return null;

    // Generate axis values from start/stop/num if not provided as array
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

    // Get u and v data
    const uData = ranges["current-u"]?.values || ranges["sea-water-velocity-u"]?.values || [];
    const vData = ranges["current-v"]?.values || ranges["sea-water-velocity-v"]?.values || [];

    if (uData.length === 0 || vData.length === 0) return null;

    // Calculate grid parameters
    const lo1 = Math.min(...xAxis);
    const lo2 = Math.max(...xAxis);
    const nx = xAxis.length;
    const ny = yAxis.length;
    const dx = nx > 1 ? (lo2 - lo1) / (nx - 1) : 0.1;

    // Check if y-axis is south-to-north (increasing) or north-to-south (decreasing)
    const yIncreasing = yAxis[0] < yAxis[yAxis.length - 1];

    // leaflet-velocity expects: la1 = north, la2 = south, data ordered north-to-south
    const la1 = Math.max(...yAxis); // North
    const la2 = Math.min(...yAxis); // South
    const dy = ny > 1 ? (la1 - la2) / (ny - 1) : 0.1;

    // Reorganize data for leaflet-velocity
    // leaflet-velocity expects: row-major, north to south, west to east
    const uReorganized: number[] = [];
    const vReorganized: number[] = [];

    for (let j = 0; j < ny; j++) {
      // If y is increasing (south-to-north), reverse the row index
      const srcJ = yIncreasing ? (ny - 1 - j) : j;

      for (let i = 0; i < nx; i++) {
        const idx = srcJ * nx + i;
        const u = uData[idx];
        const v = vData[idx];
        // Replace null/NaN with 0 (land areas)
        uReorganized.push(u === null || u === undefined || isNaN(u) ? 0 : u);
        vReorganized.push(v === null || v === undefined || isNaN(v) ? 0 : v);
      }
    }

    return [
      {
        header: {
          parameterCategory: 2,
          parameterNumber: 2,
          parameterNumberName: "eastward_sea_water_velocity",
          parameterUnit: "m.s-1",
          lo1,
          lo2,
          la1,
          la2,
          nx,
          ny,
          dx,
          dy,
          refTime: new Date().toISOString()
        },
        data: uReorganized
      },
      {
        header: {
          parameterCategory: 2,
          parameterNumber: 3,
          parameterNumberName: "northward_sea_water_velocity",
          parameterUnit: "m.s-1",
          lo1,
          lo2,
          la1,
          la2,
          nx,
          ny,
          dx,
          dy,
          refTime: new Date().toISOString()
        },
        data: vReorganized
      }
    ];
  } catch (e) {
    console.error("Error converting CoverageJSON:", e);
    return null;
  }
}

export function CurrentVelocityOverlay({
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
  const [velocityData, setVelocityData] = useState<any[] | null>(null);
  const [forecastHourIndex, setForecastHourIndex] = useState(1); // Start at +1 hour

  // Theme color for cursor and UI elements
  const accentColor = theme.primary;

  // Fetch current data from DMI EDR API
  const fetchCurrentData = useCallback(async (hourIndex: number) => {
    if (!DMI_EDR_BASE_URL) {
      setError("DMI API ikke konfigureret");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch a larger area covering Danish waters
      const bbox = "7.5,54.0,16.0,58.5";

      // Use selected forecast time
      const datetime = getForecastValue("hourly", hourIndex) || new Date().toISOString();

      // Fetch from primary DKSS collection only (dkss_nsbs has best coverage)
      const collection = "dkss_nsbs";
      const allData: any[] = [];
      const query = `/collections/${collection}/cube?bbox=${bbox}&parameter-name=current-u,current-v&datetime=${datetime}/${datetime}&crs=crs84&f=CoverageJSON`;
      const proxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(query)}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(proxyUrl, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json();
          const converted = coverageJsonToVelocityData(json);
          if (converted) {
            allData.push(...converted);
          }
        } else {
          const text = await response.text();
          console.warn(`${collection} error response:`, text.substring(0, 200));
        }
      } catch (e) {
        console.warn(`Failed to fetch ${collection}:`, e);
      }

      if (allData.length > 0) {
        // Merge data from both collections (take first valid set)
        setVelocityData(allData.slice(0, 2));
      } else {
        setError("Ingen strømdata tilgængelig");
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
      fetchCurrentData(forecastHourIndex);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [visible, forecastHourIndex, fetchCurrentData]);

  // Send data to WebView when ready
  const onWebViewLoad = useCallback(() => {
    if (velocityData && webViewRef.current) {
      const script = `
        if (window.updateVelocityData) {
          window.updateVelocityData(${JSON.stringify(velocityData)});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  }, [velocityData]);

  useEffect(() => {
    if (velocityData && webViewRef.current) {
      onWebViewLoad();
    }
  }, [velocityData, onWebViewLoad]);

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
  <title>Havstrøm</title>
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

    .velocity-legend {
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
    .velocity-legend-gradient {
      width: 10px;
      height: 100px;
      border-radius: 5px;
      background: linear-gradient(to top,
        #2E5EAA, #3B7BBF, #4A9BD4, #5CBDE8,
        #7DD8B5, #A8E063, #D4E157, #FFEB3B,
        #FFB74D, #FF8A65, #E57373, #D32F2F
      );
    }
    .velocity-legend-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100px;
      color: rgba(255,255,255,0.7);
      font-size: 10px;
    }
    .velocity-legend-labels span {
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

    /* Center speed display */
    .center-speed {
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
    .center-speed-value {
      font-size: 22px;
      font-weight: 700;
      color: ${accentColor};
      line-height: 1;
    }
    .center-speed-unit {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-left: 2px;
    }
    .center-speed-dir {
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
    <div>Indlæser havstrøm...</div>
  </div>

  <!-- Center crosshair -->
  <div class="center-crosshair">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
    <div class="crosshair-dot"></div>
  </div>

  <!-- Center speed display -->
  <div id="center-speed" class="center-speed">
    <span id="speed-value" class="center-speed-value">--</span>
    <span class="center-speed-unit">m/s</span>
    <div id="speed-dir" class="center-speed-dir"></div>
  </div>

  <div class="velocity-legend">
    <div class="velocity-legend-gradient"></div>
    <div class="velocity-legend-labels">
      <span>1+</span>
      <span>0.5</span>
      <span>0 m/s</span>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-velocity@2.1.3/dist/leaflet-velocity.min.js"></script>
  <script>
    // High-quality dark map style
    const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '',
      subdomains: 'abcd',
      maxZoom: 18
    });

    // Water features layer
    const waterLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      attribution: '',
      subdomains: 'abcd',
      maxZoom: 18,
      opacity: 0.6
    });

    // Initialize map
    const map = L.map('map', {
      center: [${initialLat}, ${initialLng}],
      zoom: ${initialZoom},
      zoomControl: false,
      attributionControl: false,
      layers: [darkTiles]
    });

    // Add labels on top
    waterLabels.addTo(map);

    let velocityLayer = null;
    let currentData = null; // Store raw data for interpolation
    const loadingEl = document.getElementById('loading');

    // Premium color scale - smooth gradient
    const colorScale = [
      "rgb(46, 94, 170)",    // Deep blue - very slow
      "rgb(59, 123, 191)",
      "rgb(74, 155, 212)",
      "rgb(92, 189, 232)",
      "rgb(125, 216, 181)",  // Teal - slow
      "rgb(168, 224, 99)",
      "rgb(212, 225, 87)",
      "rgb(255, 235, 59)",   // Yellow - medium
      "rgb(255, 183, 77)",
      "rgb(255, 138, 101)",
      "rgb(229, 115, 115)",  // Red - fast
      "rgb(211, 47, 47)"     // Deep red - very fast
    ];

    // Update velocity data from React Native
    window.updateVelocityData = function(data) {
      loadingEl.style.display = 'none';

      if (!data || data.length < 2) {
        loadingEl.innerHTML = '<div style="color:#ff6b6b;">Ingen data tilgængelig</div>';
        loadingEl.style.display = 'block';
        return;
      }

      // Remove existing layer
      if (velocityLayer) {
        map.removeLayer(velocityLayer);
      }

      // Create velocity layer with high precision settings
      velocityLayer = L.velocityLayer({
        displayValues: false,
        data: data,
        minVelocity: 0,
        maxVelocity: 0.8,             // Max current speed in m/s
        velocityScale: 0.015,         // Particle speed (higher = faster particles)
        particleAge: 50,              // Shorter life = more responsive
        lineWidth: 1.2,               // Thinner lines for precision
        particleMultiplier: 1/100,    // More particles for detail
        frameRate: 30,                // Higher FPS for smooth animation
        colorScale: colorScale,
        opacity: 0.95
      });

      velocityLayer.addTo(map);

      // Store data for our own interpolation
      currentData = {
        header: data[0].header,
        uData: data[0].data,
        vData: data[1].data
      };

      // Fix overlay drift during panning
      // Get the canvas element that was just created
      const canvas = document.querySelector('.leaflet-overlay-pane canvas');
      if (canvas) {
        // Ensure smooth transitions
        canvas.style.transition = 'opacity 0.15s ease';

        map.on('movestart', function() {
          canvas.style.opacity = '0.2';
        });

        map.on('moveend', function() {
          // Force complete redraw by removing and re-adding the layer
          setTimeout(function() {
            if (velocityLayer) {
              map.removeLayer(velocityLayer);
              velocityLayer.addTo(map);
              // Re-get canvas and restore opacity
              const newCanvas = document.querySelector('.leaflet-overlay-pane canvas');
              if (newCanvas) {
                newCanvas.style.opacity = '1';
                newCanvas.style.transition = 'opacity 0.15s ease';
              }
            }
          }, 10);
        });
      }

      // Update center speed display
      updateCenterSpeed();
    };

    // Get the center speed display elements
    const speedValueEl = document.getElementById('speed-value');
    const speedDirEl = document.getElementById('speed-dir');

    // Bilinear interpolation for current speed at a point
    function getSpeedAt(lat, lng) {
      if (!currentData || !currentData.header) return null;

      const h = currentData.header;
      const { lo1, lo2, la1, la2, nx, ny } = h;

      // Check bounds
      if (lng < lo1 || lng > lo2 || lat < la2 || lat > la1) {
        return null;
      }

      // Calculate grid position
      const xPos = (lng - lo1) / (lo2 - lo1) * (nx - 1);
      const yPos = (la1 - lat) / (la1 - la2) * (ny - 1);

      // Get integer indices and fractions
      const x0 = Math.floor(xPos);
      const y0 = Math.floor(yPos);
      const x1 = Math.min(x0 + 1, nx - 1);
      const y1 = Math.min(y0 + 1, ny - 1);
      const xFrac = xPos - x0;
      const yFrac = yPos - y0;

      // Get u values at corners
      const u00 = currentData.uData[y0 * nx + x0] || 0;
      const u01 = currentData.uData[y0 * nx + x1] || 0;
      const u10 = currentData.uData[y1 * nx + x0] || 0;
      const u11 = currentData.uData[y1 * nx + x1] || 0;

      // Get v values at corners
      const v00 = currentData.vData[y0 * nx + x0] || 0;
      const v01 = currentData.vData[y0 * nx + x1] || 0;
      const v10 = currentData.vData[y1 * nx + x0] || 0;
      const v11 = currentData.vData[y1 * nx + x1] || 0;

      // Bilinear interpolation for u
      const u0 = u00 * (1 - xFrac) + u01 * xFrac;
      const u1 = u10 * (1 - xFrac) + u11 * xFrac;
      const u = u0 * (1 - yFrac) + u1 * yFrac;

      // Bilinear interpolation for v
      const v0 = v00 * (1 - xFrac) + v01 * xFrac;
      const v1 = v10 * (1 - xFrac) + v11 * xFrac;
      const v = v0 * (1 - yFrac) + v1 * yFrac;

      // Check if this is land (all corners are 0)
      if (u00 === 0 && u01 === 0 && u10 === 0 && u11 === 0 &&
          v00 === 0 && v01 === 0 && v10 === 0 && v11 === 0) {
        return null;
      }

      // Calculate speed and direction
      const speed = Math.sqrt(u * u + v * v);
      const dir = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;

      return { speed, dir, u, v };
    }

    // Update center speed based on map center
    function updateCenterSpeed() {
      if (!currentData) {
        speedValueEl.textContent = '--';
        speedDirEl.textContent = 'ingen data';
        return;
      }

      const center = map.getCenter();
      const h = currentData.header;

      // Debug: Check if we're within bounds
      if (!h || h.lo1 === undefined) {
        speedValueEl.textContent = '--';
        speedDirEl.textContent = 'header fejl';
        return;
      }

      const result = getSpeedAt(center.lat, center.lng);

      if (result && result.speed > 0.001) {
        const dirNames = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
        const dirName = dirNames[Math.round(result.dir / 45) % 8];

        speedValueEl.textContent = result.speed.toFixed(2);
        speedDirEl.textContent = 'mod ' + dirName + ' (' + Math.round(result.dir) + '°)';
      } else if (result === null) {
        // Check if outside bounds
        if (center.lng < h.lo1 || center.lng > h.lo2 || center.lat < h.la2 || center.lat > h.la1) {
          speedValueEl.textContent = '--';
          speedDirEl.textContent = 'uden for område';
        } else {
          speedValueEl.textContent = '--';
          speedDirEl.textContent = 'land';
        }
      } else {
        speedValueEl.textContent = '0.00';
        speedDirEl.textContent = 'stille';
      }
    }

    // Update center speed on map move
    map.on('move', updateCenterSpeed);
    map.on('moveend', updateCenterSpeed);

    // Notify React Native that WebView is ready
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
        onLoadEnd={() => {
          if (velocityData) {
            onWebViewLoad();
          }
        }}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.loadingText}>Henter strømdata fra DMI...</Text>
        </View>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtons}>
            <Pressable style={styles.retryButton} onPress={() => fetchCurrentData(forecastHourIndex)}>
              <Text style={styles.retryButtonText}>Prøv igen</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Luk</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Forecast time slider */}
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

export default CurrentVelocityOverlay;
