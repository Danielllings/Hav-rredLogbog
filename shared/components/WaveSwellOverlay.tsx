// shared/components/WaveSwellOverlay.tsx
// Animated swell wave visualization using Leaflet-velocity in a WebView
// Converts swell height + direction to u/v components for particle animation

import React, { useRef, useEffect, useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { ForecastSlider, getForecastValue } from "./ForecastSlider";
import { useTheme } from "../../lib/theme";

const extra = (Constants.expoConfig?.extra as any) || {};
const DMI_EDR_BASE_URL = (extra.dmiEdrUrl as string | undefined)?.replace(/\/$/, "") || "";

interface Props {
  visible: boolean;
  onClose: () => void;
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
}

// Convert wave height + direction to leaflet-velocity format
// Returns velocity data for animation + raw heights for display
function swellToVelocityData(
  heights: number[],
  directions: number[],
  bounds: { west: number; east: number; south: number; north: number },
  nx: number,
  ny: number
): any[] | null {
  try {
    if (heights.length === 0) return null;

    const { west, east, south, north } = bounds;
    const dx = (east - west) / (nx - 1);
    const dy = (north - south) / (ny - 1);

    // Convert height + direction to u/v components for animation
    // Direction is "from" direction in degrees, so we need to reverse it
    const uData: number[] = [];
    const vData: number[] = [];

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const height = heights[idx];
        const dirDeg = directions[idx] ?? 270; // Default westerly if no direction

        if (height === null || height === undefined || isNaN(height)) {
          uData.push(0);
          vData.push(0);
          continue;
        }

        // Convert direction from degrees to radians
        // Direction is "from", so add 180 to get "to" direction
        const dirRad = ((dirDeg + 180) % 360) * Math.PI / 180;

        // Scale for animation (visual only, not for height display)
        // Use sqrt to make small waves more visible
        const animScale = Math.min(Math.sqrt(height) * 0.5, 1);
        const u = animScale * Math.sin(dirRad);
        const v = animScale * Math.cos(dirRad);

        uData.push(u);
        vData.push(v);
      }
    }

    return [
      {
        header: {
          parameterCategory: 2,
          parameterNumber: 2,
          parameterNumberName: "wave_u",
          parameterUnit: "m.s-1",
          lo1: west,
          lo2: east,
          la1: north,
          la2: south,
          nx,
          ny,
          dx,
          dy,
          refTime: new Date().toISOString()
        },
        data: uData
      },
      {
        header: {
          parameterCategory: 2,
          parameterNumber: 3,
          parameterNumberName: "wave_v",
          parameterUnit: "m.s-1",
          lo1: west,
          lo2: east,
          la1: north,
          la2: south,
          nx,
          ny,
          dx,
          dy,
          refTime: new Date().toISOString()
        },
        data: vData
      },
      // Third element: raw heights for display interpolation
      {
        header: {
          parameterCategory: 0,
          parameterNumber: 0,
          parameterNumberName: "wave_height",
          parameterUnit: "m",
          lo1: west,
          lo2: east,
          la1: north,
          la2: south,
          nx,
          ny,
          dx,
          dy
        },
        data: heights.map(h => (h === null || h === undefined || isNaN(h)) ? 0 : h)
      }
    ];
  } catch (e) {
    console.error("Error converting wave data:", e);
    return null;
  }
}

export function WaveSwellOverlay({
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
  const [forecastHourIndex, setForecastHourIndex] = useState(1);

  // Theme color for cursor and UI elements
  const accentColor = theme.primary;

  // Convert CoverageJSON to swell height + direction arrays
  const parseCoverageJson = (json: any): { heights: number[]; directions: number[]; bounds: any; nx: number; ny: number } | null => {
    try {
      const domain = json.domain;
      const ranges = json.ranges;
      if (!domain || !ranges) return null;

      const xAxisDef = domain.axes.x || domain.axes.lon || domain.axes.longitude;
      const yAxisDef = domain.axes.y || domain.axes.lat || domain.axes.latitude;
      if (!xAxisDef || !yAxisDef) return null;

      let xAxis: number[] = [];
      let yAxis: number[] = [];

      if (xAxisDef.values) xAxis = xAxisDef.values;
      else if (xAxisDef.start !== undefined && xAxisDef.stop !== undefined && xAxisDef.num) {
        for (let i = 0; i < xAxisDef.num; i++) {
          xAxis.push(xAxisDef.start + i * (xAxisDef.stop - xAxisDef.start) / (xAxisDef.num - 1));
        }
      }

      if (yAxisDef.values) yAxis = yAxisDef.values;
      else if (yAxisDef.start !== undefined && yAxisDef.stop !== undefined && yAxisDef.num) {
        for (let i = 0; i < yAxisDef.num; i++) {
          yAxis.push(yAxisDef.start + i * (yAxisDef.stop - yAxisDef.start) / (yAxisDef.num - 1));
        }
      }

      if (xAxis.length === 0 || yAxis.length === 0) return null;

      // Try various parameter names for wave height and direction (DMI WAM uses significant-wave-height)
      const heightData = ranges["significant-wave-height"]?.values ||
                         ranges["hs"]?.values ||
                         ranges["swh"]?.values ||
                         ranges["VHM0"]?.values ||
                         ranges["wave-height"]?.values ||
                         ranges["sea-surface-wave-significant-height"]?.values || [];
      const dirData = ranges["mean-wave-direction"]?.values ||
                      ranges["mwd"]?.values ||
                      ranges["VMDR"]?.values ||
                      ranges["wave-direction"]?.values ||
                      ranges["sea-surface-wave-from-direction"]?.values || [];

      const nx = xAxis.length;
      const ny = yAxis.length;

      return {
        heights: heightData,
        directions: dirData,
        bounds: {
          west: Math.min(...xAxis),
          east: Math.max(...xAxis),
          south: Math.min(...yAxis),
          north: Math.max(...yAxis)
        },
        nx,
        ny
      };
    } catch (e) {
      console.error("Error parsing CoverageJSON:", e);
      return null;
    }
  };

  // Fetch swell data from DMI EDR API
  const fetchSwellData = useCallback(async (hourIndex: number) => {
    try {
      setLoading(true);
      setError(null);

      const datetime = getForecastValue("hourly", hourIndex) || new Date().toISOString();
      const bbox = "7.5,54.0,16.0,58.5";

      let converted: any[] | null = null;

      // Try DMI EDR API first - use WAM collections for waves
      if (DMI_EDR_BASE_URL) {
        // WAM collections for wave data
        const waveCollections = ["wam_nsb", "wam_dw"];

        for (const collection of waveCollections) {
          // Fetch wave height from WAM model (direction may not be available)
          const query = `/collections/${collection}/cube?bbox=${bbox}&parameter-name=significant-wave-height&datetime=${datetime}/${datetime}&crs=crs84&f=CoverageJSON`;
          const proxyUrl = `${DMI_EDR_BASE_URL}?target=${encodeURIComponent(query)}`;

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
              const json = await response.json();
              console.log(`WAM ${collection} response:`, JSON.stringify(json).substring(0, 500));
              const parsed = parseCoverageJson(json);

              if (parsed && parsed.heights.length > 0) {
                // If no direction data, generate default westerly direction
                if (parsed.directions.length === 0) {
                  parsed.directions = parsed.heights.map(() => 270);
                }
                converted = swellToVelocityData(
                  parsed.heights,
                  parsed.directions,
                  parsed.bounds,
                  parsed.nx,
                  parsed.ny
                );
                if (converted) {
                  console.log(`Got wave data from ${collection}: ${parsed.heights.length} points`);
                  break;
                }
              }
            } else {
              const text = await response.text();
              console.warn(`${collection} error:`, text.substring(0, 200));
            }
          } catch (e) {
            console.warn(`Failed to fetch ${collection}:`, e);
          }
        }
      }

      if (converted) {
        setVelocityData(converted);
      } else {
        setError("Ingen bølgedata fra DMI");
      }
    } catch (e) {
      setError("Fejl ved hentning af data");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchSwellData(forecastHourIndex);
    }
  }, [visible, forecastHourIndex, fetchSwellData]);

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
  <title>Dønninger</title>
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

    .wave-legend {
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
    .wave-legend-gradient {
      width: 10px;
      height: 100px;
      border-radius: 5px;
      background: linear-gradient(to top,
        #164E63, #0E7490, #06B6D4, #22D3EE,
        #67E8F9, #A5F3FC, #CFFAFE, #ECFEFF
      );
    }
    .wave-legend-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100px;
      color: rgba(255,255,255,0.7);
      font-size: 10px;
    }
    .wave-legend-labels span {
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
      box-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
    }

    /* Center height display */
    .center-height {
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
      border: 1px solid rgba(6, 182, 212, 0.3);
      pointer-events: none;
    }
    .center-height-value {
      font-size: 22px;
      font-weight: 700;
      color: ${accentColor};
      line-height: 1;
    }
    .center-height-unit {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-left: 2px;
    }
    .center-height-label {
      font-size: 10px;
      color: rgba(255,255,255,0.5);
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <div>Indlæser dønninger...</div>
  </div>

  <!-- Center crosshair -->
  <div class="center-crosshair">
    <div class="crosshair-h"></div>
    <div class="crosshair-v"></div>
    <div class="crosshair-dot"></div>
  </div>

  <!-- Center height display -->
  <div id="center-height" class="center-height">
    <span id="height-value" class="center-height-value">--</span>
    <span class="center-height-unit">m</span>
    <div class="center-height-label">bølgehøjde</div>
  </div>

  <div class="wave-legend">
    <div class="wave-legend-gradient"></div>
    <div class="wave-legend-labels">
      <span>2+</span>
      <span>1</span>
      <span>0 m</span>
    </div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-velocity@2.1.3/dist/leaflet-velocity.min.js"></script>
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

    let velocityLayer = null;
    let waveData = null; // Store wave data for interpolation
    const loadingEl = document.getElementById('loading');
    const heightValueEl = document.getElementById('height-value');

    // Cyan/teal color scale for waves
    const colorScale = [
      "rgb(22, 78, 99)",
      "rgb(14, 116, 144)",
      "rgb(6, 182, 212)",
      "rgb(34, 211, 238)",
      "rgb(103, 232, 249)",
      "rgb(165, 243, 252)",
      "rgb(207, 250, 254)",
      "rgb(236, 254, 255)"
    ];

    // Interpolate wave height at a given lat/lng using raw height data
    function getHeightAt(lat, lng) {
      if (!waveData || !waveData.heightData) return null;
      const { lo1, lo2, la1, la2, nx, ny } = waveData.header;

      // Check bounds
      if (lng < lo1 || lng > lo2 || lat < la2 || lat > la1) return null;

      // Calculate grid position
      const x = (lng - lo1) / (lo2 - lo1) * (nx - 1);
      const y = (la1 - lat) / (la1 - la2) * (ny - 1);

      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, nx - 1);
      const y1 = Math.min(y0 + 1, ny - 1);

      const xFrac = x - x0;
      const yFrac = y - y0;

      // Bilinear interpolation on raw heights
      const idx00 = y0 * nx + x0;
      const idx01 = y0 * nx + x1;
      const idx10 = y1 * nx + x0;
      const idx11 = y1 * nx + x1;

      const h00 = waveData.heightData[idx00] || 0;
      const h01 = waveData.heightData[idx01] || 0;
      const h10 = waveData.heightData[idx10] || 0;
      const h11 = waveData.heightData[idx11] || 0;

      // Bilinear interpolation
      const h0 = h00 * (1 - xFrac) + h01 * xFrac;
      const h1 = h10 * (1 - xFrac) + h11 * xFrac;
      const height = h0 * (1 - yFrac) + h1 * yFrac;

      return height;
    }

    // Update center height display
    function updateCenterHeight() {
      const center = map.getCenter();
      const height = getHeightAt(center.lat, center.lng);

      if (height !== null && height > 0.01) {
        heightValueEl.textContent = height.toFixed(1);
      } else {
        heightValueEl.textContent = '--';
      }
    }

    // Update on map move
    map.on('move', updateCenterHeight);
    map.on('moveend', updateCenterHeight);

    window.updateVelocityData = function(data) {
      loadingEl.style.display = 'none';

      if (!data || data.length < 3) {
        loadingEl.innerHTML = '<div style="color:#ff6b6b;">Ingen data</div>';
        loadingEl.style.display = 'block';
        return;
      }

      // Store data for interpolation (third element contains raw heights)
      waveData = {
        header: data[0].header,
        uData: data[0].data,
        vData: data[1].data,
        heightData: data[2] ? data[2].data : null
      };

      if (velocityLayer) {
        map.removeLayer(velocityLayer);
      }

      velocityLayer = L.velocityLayer({
        displayValues: false,
        data: data,
        minVelocity: 0,
        maxVelocity: 1.0,
        velocityScale: 0.008,
        particleAge: 70,
        lineWidth: 1.5,
        particleMultiplier: 1/150,
        frameRate: 20,
        colorScale: colorScale,
        opacity: 0.9
      });

      velocityLayer.addTo(map);

      // Fix overlay drift during panning
      const canvas = document.querySelector('.leaflet-overlay-pane canvas');
      if (canvas) {
        canvas.style.transition = 'opacity 0.15s ease';

        map.on('movestart', function() {
          canvas.style.opacity = '0.2';
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
          }, 10);
        });
      }

      // Initial update
      updateCenterHeight();
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
        onLoadEnd={() => velocityData && onWebViewLoad()}
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
          <Text style={styles.loadingText}>Henter bølgedata...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorOverlay}>
          <Ionicons name="warning" size={32} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtons}>
            <Pressable style={styles.retryButton} onPress={() => fetchSwellData(forecastHourIndex)}>
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

export default WaveSwellOverlay;
