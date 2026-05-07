// lib/pdfCharts.ts
// Pure SVG chart generators for HTML-to-PDF rendering (expo-print)

export const CHART_COLORS = [
  "#1B2A4A", "#D4A04A", "#2D8B5F", "#E8634A",
  "#3B82F6", "#8B5CF6", "#64748B", "#0EA5E9",
];

// ─── Bar Chart ───────────────────────────────────────────────

type BarChartData = { label: string; value: number; color?: string };
type BarChartOptions = {
  width?: number;
  height?: number;
  title?: string;
  unit?: string;
  showValues?: boolean;
};

export function renderBarChart(
  data: BarChartData[],
  options?: BarChartOptions
): string {
  const w = options?.width ?? 500;
  const h = options?.height ?? 240;
  const showValues = options?.showValues !== false;
  const unit = options?.unit ?? "";
  const padLeft = 42;
  const padRight = 10;
  const padTop = 30;
  const padBottom = 40;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barGap = 12;
  const barW = Math.min(
    60,
    (chartW - barGap * (data.length + 1)) / data.length
  );

  // Y-axis ticks (4 lines)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    val: Math.round(maxVal * p),
    y: padTop + chartH - chartH * p,
  }));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="font-family:-apple-system,'Segoe UI',sans-serif;">`;

  // Grid lines + y labels
  for (const tick of ticks) {
    svg += `<line x1="${padLeft}" y1="${tick.y}" x2="${w - padRight}" y2="${tick.y}" stroke="#E2E8F0" stroke-width="1"/>`;
    svg += `<text x="${padLeft - 6}" y="${tick.y + 3}" text-anchor="end" font-size="9" fill="#94A3B8">${tick.val}${unit}</text>`;
  }

  // Bars
  data.forEach((d, i) => {
    const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
    const barH = (d.value / maxVal) * chartH;
    const x =
      padLeft + barGap + i * (barW + barGap) + (chartW - data.length * (barW + barGap)) / 2;
    const y = padTop + chartH - barH;
    const r = 4;

    // Bar with rounded top
    if (barH > r) {
      svg += `<path d="M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${padTop + chartH} L${x},${padTop + chartH} Z" fill="${color}"/>`;
    } else if (barH > 0) {
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"/>`;
    }

    // Value on top
    if (showValues) {
      svg += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="#1E293B">${d.value}${unit}</text>`;
    }

    // X label
    svg += `<text x="${x + barW / 2}" y="${padTop + chartH + 18}" text-anchor="middle" font-size="9" fill="#64748B">${d.label}</text>`;
  });

  svg += `</svg>`;

  let html = "";
  if (options?.title) {
    html += `<div class="chart-title">${options.title}</div>`;
  }
  html += svg;
  return html;
}

// ─── Donut Chart ─────────────────────────────────────────────

type DonutSegment = { label: string; value: number; color: string };
type DonutChartOptions = {
  size?: number;
  thickness?: number;
  title?: string;
  centerLabel?: string;
  centerValue?: string;
};

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export function renderDonutChart(
  segments: DonutSegment[],
  options?: DonutChartOptions
): string {
  const size = options?.size ?? 170;
  const thickness = options?.thickness ?? 28;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;

  // Background ring
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${thickness}"/>`;

  let startAngle = 0;
  for (const seg of segments) {
    const angle = (seg.value / total) * 360;
    if (angle < 0.5) { startAngle += angle; continue; }
    const endAngle = startAngle + angle;
    // For near-full circle, use two arcs
    if (angle >= 359.5) {
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}"/>`;
    } else {
      svg += `<path d="${describeArc(cx, cy, r, startAngle, endAngle)}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-linecap="round"/>`;
    }
    startAngle = endAngle;
  }

  // Center text
  if (options?.centerValue) {
    svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="800" fill="#1B2A4A" font-family="-apple-system,'Segoe UI',sans-serif">${options.centerValue}</text>`;
  }
  if (options?.centerLabel) {
    svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="#64748B" font-family="-apple-system,'Segoe UI',sans-serif" text-transform="uppercase">${options.centerLabel}</text>`;
  }

  svg += `</svg>`;

  // Legend
  let legend = `<div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;justify-content:center;">`;
  for (const seg of segments) {
    const pct = ((seg.value / total) * 100).toFixed(0);
    legend += `<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:#334155;">
      <div style="width:10px;height:10px;border-radius:3px;background:${seg.color};"></div>
      <span>${seg.label}: <strong>${seg.value}</strong> (${pct}%)</span>
    </div>`;
  }
  legend += `</div>`;

  let html = "";
  if (options?.title) {
    html += `<div class="chart-title">${options.title}</div>`;
  }
  html += `<div style="text-align:center;">${svg}</div>${legend}`;
  return html;
}

// ─── Horizontal Bars ─────────────────────────────────────────

type HBarData = { label: string; value: number; total: number; color?: string };
type HBarOptions = { width?: number; title?: string; showPercentage?: boolean };

export function renderHorizontalBars(
  data: HBarData[],
  options?: HBarOptions
): string {
  const showPct = options?.showPercentage !== false;

  let html = "";
  if (options?.title) {
    html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#1B2A4A;margin-bottom:8px;">${options.title}</div>`;
  }

  data.forEach((d, i) => {
    const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
    const pct = d.total > 0 ? Math.round((d.value / d.total) * 100) : 0;
    const barPct = d.total > 0 ? Math.max(2, (d.value / d.total) * 100) : 2;

    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:9px;">
      <div style="width:80px;text-align:right;color:#334155;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;line-height:1.2;">${d.label}</div>
      <div style="flex:1;height:14px;background:#E2E8F0;border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${barPct}%;background:${color};border-radius:4px;"></div>
      </div>
      ${showPct ? `<div style="width:28px;text-align:right;color:#64748B;font-weight:600;font-variant-numeric:tabular-nums;font-size:9px;">${pct}%</div>` : ""}
    </div>`;
  });

  return html;
}

// ─── Inline SVG Icons (monochrome, 18×18) ───────────────────

const SVG_ICONS: Record<string, string> = {
  hook: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l4 4"/><path d="M7 3L3 7"/><path d="M7 7l9.5 9.5a3.5 3.5 0 0 0 5-5L12 2"/><path d="M16.5 16.5L19 19"/></svg>`,
  fish: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6-3.56 0-7.56-2.54-8.5-6z"/><path d="M2 12s1.5-2 3-2c0 0-1.5 2-1.5 2s1.5 2 1.5 2c-1.5 0-3-2-3-2z"/><circle cx="18" cy="12" r="1"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  circle: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`,
  pin: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  chart: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  bolt: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2A4A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 3-7 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.5-2.24 1.5-3"/></svg>`,
};

export { SVG_ICONS };

// ─── Mini Stat Card ──────────────────────────────────────────

export function renderMiniStat(
  value: string,
  label: string,
  icon?: string,
  highlight?: boolean
): string {
  const iconSvg = icon && SVG_ICONS[icon] ? SVG_ICONS[icon] : "";
  return `<div class="stat-card${highlight ? " highlight" : ""}">
    ${iconSvg ? `<div class="icon">${iconSvg}</div>` : ""}
    <div class="value">${value}</div>
    <div class="label">${label}</div>
  </div>`;
}
