// lib/pdfStyles.ts
// Premium PDF report styles and HTML helpers for Sea Trout Log

export const PDF_CSS = `
@page {
  margin: 16mm 14mm;
  size: A4;
}
* {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  background: #fff;
  color: #1E293B;
  font-size: 11px;
  line-height: 1.5;
}

/* ── Header ── */
.report-header {
  display: flex;
  align-items: center;
  padding-bottom: 14px;
  margin-bottom: 6px;
}
.report-header-logo {
  width: 48px;
  height: 48px;
  margin-right: 14px;
  flex-shrink: 0;
}
.report-header-logo img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}
.report-header-text {
  flex: 1;
}
.report-header-text h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #1B2A4A;
}
.report-header-text .subtitle {
  font-size: 10px;
  color: #D4A04A;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-top: 2px;
  font-weight: 600;
}
.report-header-date {
  text-align: right;
  font-size: 10px;
  color: #64748B;
}
.report-header-date .date {
  font-weight: 700;
  color: #1B2A4A;
  font-size: 12px;
}
.header-divider {
  height: 3px;
  background: linear-gradient(90deg, #D4A04A 0%, #1B2A4A 100%);
  border: none;
  margin-bottom: 22px;
  border-radius: 2px;
}

/* ── Sections ── */
.section {
  margin-bottom: 24px;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 2px solid #E2E8F0;
}
.section-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #1B2A4A;
}
.section-badge {
  font-size: 8px;
  padding: 3px 10px;
  background: #1B2A4A;
  color: #fff;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}

/* ── Stats Grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.stat-card {
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  padding: 14px 12px 12px;
  text-align: center;
  background: #fff;
  page-break-inside: avoid;
}
.stat-card.highlight {
  border-left: 3px solid #D4A04A;
}
.stat-card .icon {
  margin-bottom: 4px;
  line-height: 0;
}
.stat-card .icon svg {
  display: inline-block;
  vertical-align: middle;
}
.stat-card .value {
  font-size: 22px;
  font-weight: 800;
  color: #1B2A4A;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  word-break: break-all;
  overflow-wrap: break-word;
}
.stat-card .label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748B;
  margin-top: 4px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Chart containers ── */
.chart-container {
  margin-bottom: 20px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.chart-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #1B2A4A;
  margin-bottom: 10px;
}
.chart-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  page-break-inside: avoid;
  align-items: flex-start;
}
.chart-half {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.chart-half svg {
  max-width: 100%;
  height: auto;
}

/* ── Info Card ── */
.info-card {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-left: 3px solid #1B2A4A;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 16px;
  page-break-inside: avoid;
}
.info-card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #1B2A4A;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #E2E8F0;
}
.info-card ul {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.8;
}
.info-card li {
  margin-bottom: 2px;
}
.info-card li strong {
  font-weight: 700;
  color: #1B2A4A;
}

/* ── Pattern section ── */
.pattern-section {
  margin-bottom: 16px;
  page-break-inside: avoid;
}
.pattern-summary-box {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.pattern-summary-title {
  font-size: 12px;
  font-weight: 700;
  color: #1B2A4A;
  margin-bottom: 4px;
}
.pattern-summary-subtitle {
  font-size: 10px;
  color: #64748B;
  margin-bottom: 8px;
}
.pattern-summary-box ul {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
}
.pattern-summary-box li {
  margin-bottom: 3px;
  color: #334155;
}
.pattern-empty {
  font-size: 10px;
  color: #94A3B8;
  font-style: italic;
  padding: 8px 0;
}
.pattern-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 10px;
}
.pattern-chart-card {
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  page-break-inside: avoid;
  break-inside: avoid;
  overflow: hidden;
}

/* ── Footer ── */
.report-footer {
  margin-top: 30px;
  padding-top: 12px;
  border-top: 2px solid #E2E8F0;
  font-size: 9px;
  color: #94A3B8;
  text-align: center;
  letter-spacing: 0.03em;
}
.report-footer strong {
  color: #64748B;
  font-weight: 700;
}

/* ── Utilities ── */
.page-break { page-break-before: always; }
.no-break { page-break-inside: avoid; break-inside: avoid; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.mb-sm { margin-bottom: 8px; }
.mb-md { margin-bottom: 16px; }
.mb-lg { margin-bottom: 24px; }

@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .section { break-inside: avoid; }
  .stat-card { break-inside: avoid; }
  .pattern-chart-card { break-inside: avoid; }
}
`;

export function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>${PDF_CSS}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

export function renderHeader(
  logoBase64: string,
  title: string,
  subtitle: string,
  dateLabel: string,
  dateStr: string
): string {
  return `
<div class="report-header">
  <div class="report-header-logo">
    <img src="${logoBase64}" alt="Logo" />
  </div>
  <div class="report-header-text">
    <h1>${title}</h1>
    <div class="subtitle">${subtitle}</div>
  </div>
  <div class="report-header-date">
    <div>${dateLabel}</div>
    <div class="date">${dateStr}</div>
  </div>
</div>
<div class="header-divider"></div>`;
}

export function renderSectionTitle(title: string, badge?: string): string {
  return `
<div class="section-header">
  <h2>${title}</h2>
  ${badge ? `<span class="section-badge">${badge}</span>` : ""}
</div>`;
}

export function renderFooter(text: string): string {
  return `<div class="report-footer"><strong>${text}</strong></div>`;
}
