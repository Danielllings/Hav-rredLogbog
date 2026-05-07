// lib/pdfReport.ts
// Premium PDF fishing report generator for Sea Trout Log

import { APP_LOGO_BASE64 } from "./pdfLogo";
import {
  renderBarChart,
  renderDonutChart,
  renderHorizontalBars,
  renderMiniStat,
  CHART_COLORS,
} from "./pdfCharts";
import {
  wrapHtml,
  renderHeader,
  renderFooter,
  renderSectionTitle,
} from "./pdfStyles";
import {
  type PatternGroup,
  type PatternReport,
  buildWeatherSummary,
  buildSpotSummary,
} from "./patternAnalysis";

import type { SeasonGoal, GoalType } from "../types/goals";

export type ReportChoice = "year" | "all" | "both";

// ─── Translation maps ────────────────────────────────────────

const groupTitleEN: Record<string, string> = {
  "Årstid": "Season",
  "Tid på dagen": "Time of Day",
  "Vandstand": "Water Level",
  "Havtemperatur": "Sea Temperature",
  "Lufttemperatur": "Air Temperature",
  "Vindstyrke": "Wind Speed",
  "Vindretning": "Wind Direction",
  "Vind ift. kyst": "Wind vs. Coast",
  "Turlængde": "Trip Duration",
  "Bevægelse": "Movement",
  "Spots med flest fisk": "Top Spots",
};

const labelEN: Record<string, string> = {
  // Seasons
  "Foråret": "Spring", "Sommeren": "Summer", "Efteråret": "Autumn", "Vinteren": "Winter",
  // Time of day
  "Morgenen": "Morning", "Formiddagen": "Late Morning", "Eftermiddagen": "Afternoon",
  "Aftenen": "Evening", "Natten": "Night",
  // Water level
  "Lavvande": "Low Tide", "Højvande": "High Tide", "Middel vandstand": "Medium Tide",
  "ukendt": "Unknown",
  // Wind speed
  "svag vind": "Light", "mild vind": "Mild", "frisk vind": "Fresh", "hård vind": "Strong",
  // Wind coast
  "fralandsvind": "Offshore", "pålandsvind": "Onshore", "sidevind": "Side Wind",
  // Wind directions
  "Nord": "N", "Nordøst": "NE", "Øst": "E", "Sydøst": "SE",
  "Syd": "S", "Sydvest": "SW", "Vest": "W", "Nordvest": "NW",
  // Duration
  "<2 timer": "<2h", "2-4 timer": "2-4h", "4-6 timer": "4-6h", "6+ timer": "6+h",
  // Movement
  "Stillestående/let bevægelse": "Stationary",
  "Affiskning af vand": "Covering Water",
  "Roligt tempo": "Slow Pace",
};

function translateGroupTitle(title: string, lang: string): string {
  return lang === "en" ? (groupTitleEN[title] || title) : title;
}

function translateLabel(label: string, lang: string): string {
  return lang === "en" ? (labelEN[label] || label) : label;
}

function translateLine(line: string, lang: string): string {
  if (lang === "da") return line;

  if (line.startsWith("Spot: ")) return "Spot: " + line.substring(6);

  const directMap: Record<string, string> = {
    "Lavvande": "Low Tide", "Højvande": "High Tide", "Middel vandstand": "Medium Tide",
    "Svag vindstyrke": "Light wind", "Mild vindstyrke": "Mild wind",
    "Frisk vindstyrke": "Fresh wind", "Hård vindstyrke": "Strong wind",
    "Ved fralandsvind": "Offshore wind", "Ved pålandsvind": "Onshore wind",
    "Ved sidevind": "Side wind",
    "Flest fisk ved affiskning af vand": "Most fish when covering water",
    "Flest fisk ved stillestående/rolig placering": "Most fish when stationary",
  };
  if (directMap[line]) return directMap[line];

  if (line.startsWith("Vindretning: ")) {
    const dir = line.substring(13);
    return "Wind direction: " + (labelEN[dir] || dir);
  }

  if (line.startsWith("Om ")) {
    const rest = line.substring(3);
    const todMap: Record<string, string> = {
      "morgenen": "In the morning", "formiddagen": "In late morning",
      "eftermiddagen": "In the afternoon", "aftenen": "In the evening",
      "natten": "At night", "foråret": "In spring", "sommeren": "In summer",
      "efteråret": "In autumn", "vinteren": "In winter",
    };
    if (todMap[rest]) return todMap[rest];
  }

  if (line.startsWith("Havtemperatur: ")) return "Sea temp: " + line.substring(15);
  if (line.startsWith("Lufttemperatur: ")) return "Air temp: " + line.substring(16);

  const sunMatch = line.match(/^Typisk (\d+) min (før|efter) (solopgang|solnedgang)$/);
  if (sunMatch) {
    const [, mins, dir, event] = sunMatch;
    return `Typically ${mins} min ${dir === "før" ? "before" : "after"} ${event === "solopgang" ? "sunrise" : "sunset"}`;
  }

  const durMatch = line.match(/^Turlængde: (.+) giver flest fisk$/);
  if (durMatch) return `Trip duration: ${translateLabel(durMatch[1], "en")} yields most fish`;

  if (line.startsWith("Flest fisk ved ")) {
    const rest = line.substring(15);
    return "Most fish with " + (labelEN[rest] || rest);
  }

  const progMatch = line.match(/^Prognose: kig efter (.+) for bedste match$/);
  if (progMatch) {
    const hints = progMatch[1].split(", ").map(h => labelEN[h] || h).join(", ");
    return `Forecast: look for ${hints} for best match`;
  }

  if (line.startsWith("Vind ift. kyst: ")) {
    return "Wind vs. coast: " + (labelEN[line.substring(16)] || line.substring(16));
  }

  return line;
}

// ─── Goals rendering ─────────────────────────────────────────

const goalTypeLabel: Record<GoalType, { da: string; en: string }> = {
  fish_count: { da: "Antal fisk", en: "Fish Count" },
  fish_size: { da: "Fiskestørrelse", en: "Fish Size" },
  fish_weight: { da: "Fiskevægt", en: "Fish Weight" },
  trip_count: { da: "Antal ture", en: "Trip Count" },
  hours_fished: { da: "Timer fisket", en: "Hours Fished" },
  spot_diversity: { da: "Spot diversitet", en: "Spot Diversity" },
  catch_rate: { da: "Fangstrate", en: "Catch Rate" },
};

function getGoalUnit(type: GoalType): string {
  switch (type) {
    case "fish_size": return "cm";
    case "fish_weight": return "kg";
    case "catch_rate": return "%";
    case "hours_fished": return "t";
    default: return "";
  }
}

function renderGoalProgressSvg(percent: number, completed: boolean): string {
  const size = 32;
  const sw = 3;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(percent, 1));
  const color = completed ? "#2D8B5F" : "#D4A04A";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${sw}"/>`;
  svg += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size/2} ${size/2})"/>`;
  if (completed) {
    svg += `<text x="${size/2}" y="${size/2+4}" text-anchor="middle" font-size="12" fill="${color}">✓</text>`;
  } else {
    svg += `<text x="${size/2}" y="${size/2+3}" text-anchor="middle" font-size="8" font-weight="700" fill="#1B2A4A">${Math.round(percent * 100)}%</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function buildGoalsSection(goals: SeasonGoal[], lang: string, year: number): string {
  if (goals.length === 0) return "";

  const title = lang === "da" ? `Sæsonmål ${year}` : `Season Goals ${year}`;
  const completedLabel = lang === "da" ? "Mål nået!" : "Goal Reached!";

  let html = renderSectionTitle(title);
  html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">`;

  for (const goal of goals) {
    const typeLabel = goalTypeLabel[goal.type]?.[lang as "da"|"en"] ?? goal.type;
    const unit = getGoalUnit(goal.type);
    const isCompleted = goal.status === "completed";
    const percent = goal.targetValue > 0 ? Math.min(1, goal.currentValue / goal.targetValue) : 0;
    const progressText = isCompleted
      ? completedLabel
      : `${goal.currentValue}${unit} / ${goal.targetValue}${unit}`;

    html += `<div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 14px;">`;
    html += renderGoalProgressSvg(percent, isCompleted);
    html += `<div style="flex:1;">`;
    html += `<div style="font-size:11px;font-weight:700;color:#1B2A4A;">${typeLabel}</div>`;
    html += `<div style="font-size:9px;color:${isCompleted ? '#2D8B5F' : '#64748B'};font-weight:${isCompleted ? '600' : '400'};">${progressText}</div>`;
    html += `</div>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ─── Helpers ─────────────────────────────────────────────────

const safe = (v: any, fallback = "0") =>
  v === null || v === undefined ? fallback : String(v);

// ─── Main report generator ──────────────────────────────────

export function generateReportHtml(options: {
  choice: ReportChoice;
  yearStats: any;
  allStats: any;
  yearTrips: any[];
  allTrips: any[];
  spots: any[];
  goals?: SeasonGoal[];
  language: "da" | "en";
  t: (key: any) => string;
  year: number;
}): string {
  const { choice, yearStats, allStats, yearTrips, allTrips, spots, goals, language, t, year } = options;
  const lang = language;
  const dateStr = new Date().toLocaleDateString(lang === "da" ? "da-DK" : "en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const txt = lang === "da" ? {
    title: "Havørred Logbog",
    subtitle: "Fiskerapport",
    generated: "Genereret",
    generatedBy: "Genereret af Havørred Logbog",
    statistics: "Statistik",
    allTimeStats: "All-Time Statistik",
    currentYear: "Indeværende år",
    allTime: "All-Time",
    total: "Samlet",
    totalTrips: "Ture i alt",
    catchTrips: "Fangstture",
    blankTrips: "Nulture",
    fishCaught: "Fisk fanget",
    kmFished: "Km fisket",
    hoursFished: "Timer fisket",
    catchRate: "Fangstrate",
    fishPerHour: "Fisk/time",
    multiCatch: "Multi-fangst",
    performance: "Overblik",
    spots: "Spots",
    visitedSpots: "Besøgte spots",
    mostVisited: "Mest besøgt",
    bestSpot: "Bedste spot",
    trips: "ture",
    fish: "fisk",
    fishPerTrip: "fisk/tur",
    patterns: "Fiskemønster",
    patternsDesc: "Du fanger flest fisk under disse forhold",
    noPatterns: "Ingen fiskemønstre endnu – fang flere fisk!",
    noSpots: "Ingen spot-data tilgængelig endnu.",
    catchVsBlank: "Fangst vs. Nul",
    keyMetrics: "Nøgletal",
  } : {
    title: "Havørred Logbog",
    subtitle: "Fishing Report",
    generated: "Generated",
    generatedBy: "Generated by Havørred Logbog",
    statistics: "Statistics",
    allTimeStats: "All-Time Statistics",
    currentYear: "Current Year",
    allTime: "All-Time",
    total: "Total",
    totalTrips: "Total Trips",
    catchTrips: "Catch Trips",
    blankTrips: "Blank Trips",
    fishCaught: "Fish Caught",
    kmFished: "Km Fished",
    hoursFished: "Hours Fished",
    catchRate: "Catch Rate",
    fishPerHour: "Fish/Hour",
    multiCatch: "Multi-catch",
    performance: "Overview",
    spots: "Spots",
    visitedSpots: "Visited Spots",
    mostVisited: "Most Visited",
    bestSpot: "Best Spot",
    trips: "trips",
    fish: "fish",
    fishPerTrip: "fish/trip",
    patterns: "Fishing Patterns",
    patternsDesc: "You catch most fish under these conditions",
    noPatterns: "No fishing patterns yet — catch more fish to see patterns!",
    noSpots: "No spot data available yet.",
    catchVsBlank: "Catch vs. Blank",
    keyMetrics: "Key Metrics",
  };

  // ── Build sections ──

  function buildStatsSection(
    stats: any,
    trips: any[],
    sectionTitle: string,
    badge: string,
    isAllTime: boolean
  ): string {
    const numTrips = safe(stats?.trips, "0");
    const numFish = safe(stats?.total_fish, "0");
    const numCatch = safe(stats?.catch_trips, "0");
    const numBlank = safe(stats?.null_trips, "0");
    const km = ((stats?.total_m ?? 0) / 1000).toFixed(1);
    const hours = ((stats?.total_sec ?? 0) / 3600).toFixed(1);
    const rate = safe(stats?.fangstrate ?? "0", "0");
    const fph = safe(stats?.fish_per_hour ?? "0", "0");
    const multi = stats?.multi_fish_rate != null ? `${stats.multi_fish_rate}%` : "0%";

    let html = `<section class="section${isAllTime && choice === "both" ? " page-break" : ""}">`;
    html += renderSectionTitle(sectionTitle, badge);

    // Stats grid
    html += `<div class="stats-grid">`;
    html += renderMiniStat(numTrips, txt.totalTrips, "hook");
    html += renderMiniStat(numFish, txt.fishCaught, "fish", true);
    html += renderMiniStat(numCatch, txt.catchTrips, "check");
    html += renderMiniStat(numBlank, txt.blankTrips, "circle");
    html += renderMiniStat(km, txt.kmFished, "pin");
    html += renderMiniStat(hours, txt.hoursFished, "clock");
    html += renderMiniStat(`${rate}%`, txt.catchRate, "chart", true);
    html += renderMiniStat(fph, txt.fishPerHour, "bolt");
    html += renderMiniStat(multi, txt.multiCatch, "flame");
    html += `</div>`;

    // Charts row: bar chart + donut
    const tripsNum = parseInt(numTrips) || 0;
    const fishNum = parseInt(numFish) || 0;
    const kmNum = parseFloat(km) || 0;
    const hoursNum = parseFloat(hours) || 0;
    const catchNum = parseInt(numCatch) || 0;
    const blankNum = parseInt(numBlank) || 0;

    html += `<div class="chart-row">`;

    // Bar chart - key metrics
    html += `<div class="chart-half">`;
    html += renderBarChart([
      { label: lang === "da" ? "Ture" : "Trips", value: tripsNum, color: "#1B2A4A" },
      { label: lang === "da" ? "Fisk" : "Fish", value: fishNum, color: "#D4A04A" },
      { label: "Km", value: Math.round(kmNum), color: "#2D8B5F" },
      { label: lang === "da" ? "Timer" : "Hours", value: Math.round(hoursNum), color: "#3B82F6" },
    ], { title: txt.keyMetrics, height: 220 });
    html += `</div>`;

    // Donut chart - catch rate
    html += `<div class="chart-half" style="display:flex;flex-direction:column;align-items:center;justify-content:center;">`;
    html += renderDonutChart([
      { label: txt.catchTrips, value: catchNum, color: "#2D8B5F" },
      { label: txt.blankTrips, value: blankNum, color: "#E2E8F0" },
    ], {
      title: txt.catchVsBlank,
      centerValue: `${rate}%`,
      centerLabel: txt.catchRate,
      size: 160,
      thickness: 26,
    });
    html += `</div>`;

    html += `</div>`;

    // Spot analysis
    const spotSummary = buildSpotSummary(trips, spots);
    if (spotSummary) {
      html += `<div class="info-card">`;
      html += `<div class="info-card-title">${txt.spots}${isAllTime ? ` (${txt.allTime})` : ` (${year})`}</div>`;
      html += `<ul>`;
      html += `<li><strong>${txt.visitedSpots}:</strong> ${spotSummary.totalSpots}</li>`;
      html += `<li><strong>${txt.mostVisited}:</strong> ${spotSummary.mostVisited.name} (${spotSummary.mostVisited.trips} ${txt.trips}, ${spotSummary.mostVisited.fish} ${txt.fish})</li>`;
      html += `<li><strong>${txt.bestSpot}:</strong> ${spotSummary.bestCatch.name} (${spotSummary.bestCatch.fish} ${txt.fish} / ${spotSummary.bestCatch.trips} ${txt.trips} = ${spotSummary.bestCatch.avg.toFixed(1)} ${txt.fishPerTrip})</li>`;
      html += `</ul></div>`;
    }

    // Fishing patterns
    const patternReport: PatternReport | null =
      trips.length > 0 ? buildWeatherSummary(trips, spots, t, language) : null;

    if (patternReport) {
      html += `<div class="pattern-section">`;
      html += renderSectionTitle(
        `${txt.patterns}${isAllTime ? ` (${txt.allTime})` : ` (${year})`}`,
      );

      // Summary lines
      if (patternReport.lines.length > 0) {
        html += `<div class="pattern-summary-box">`;
        html += `<div class="pattern-summary-title">${txt.patternsDesc}</div>`;
        html += `<ul>`;
        for (const line of patternReport.lines) {
          html += `<li>${translateLine(line, lang)}</li>`;
        }
        html += `</ul></div>`;
      } else {
        html += `<div class="pattern-empty">${txt.noPatterns}</div>`;
      }

      // Pattern distribution charts
      if (patternReport.groups.length > 0) {
        html += `<div class="pattern-grid">`;
        for (const group of patternReport.groups) {
          const totalFish = group.items.reduce((s, it) => s + it.fish, 0);
          html += `<div class="pattern-chart-card">`;
          html += renderHorizontalBars(
            group.items.map((item, idx) => ({
              label: translateLabel(item.label, lang),
              value: item.fish,
              total: totalFish,
              color: CHART_COLORS[idx % CHART_COLORS.length],
            })),
            { title: translateGroupTitle(group.title, lang) }
          );
          html += `</div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    }

    html += `</section>`;
    return html;
  }

  // ── Assemble ──

  let body = "";

  // Header
  body += renderHeader(
    APP_LOGO_BASE64,
    txt.title,
    txt.subtitle,
    txt.generated,
    dateStr
  );

  // Year section
  if (choice === "year" || choice === "both") {
    body += buildStatsSection(
      yearStats,
      yearTrips,
      `${txt.statistics} ${year}`,
      txt.currentYear,
      false
    );

    // Season goals (only for year section)
    if (goals && goals.length > 0) {
      body += `<section class="section">`;
      body += buildGoalsSection(goals, lang, year);
      body += `</section>`;
    }
  }

  // All-time section
  if (choice === "all" || choice === "both") {
    body += buildStatsSection(
      allStats,
      allTrips,
      txt.allTimeStats,
      txt.total,
      true
    );
  }

  // Footer
  body += renderFooter(`${txt.generatedBy} · ${dateStr}`);

  return wrapHtml(`${txt.title} – ${txt.subtitle}`, body);
}
