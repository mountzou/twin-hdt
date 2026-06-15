// Renders a 24-hour status strip beneath each dashboard chart.
//
// Inspired by the OpenAI status page: each thin vertical bar represents
// one hour and is coloured by the IAQ severity zone of that hour's mean
// value. If an hour has no measurement or no policy breakpoints exist for
// the pollutant, the bar is rendered in a neutral grey.

const HOURLY_STRIP_LABELS = {
    0: 'Good',
    1: 'Moderate',
    2: 'Poor',
    noData: 'No data',
    noPolicy: 'No policy'
};

// Classify an hourly value against the IAQ breakpoints list shared with
// the bar chart. Breakpoints are assumed sorted ascending by `value`; the
// implicit zone above the last finite breakpoint is severity 2.
function classifyHourlySeverity(value, breakpointLines) {
    if (!Number.isFinite(value)) return { severity: null, kind: 'noData' };
    if (!Array.isArray(breakpointLines) || breakpointLines.length === 0) {
        return { severity: null, kind: 'noPolicy' };
    }

    const sorted = breakpointLines
        .filter(bp => Number.isFinite(bp?.value))
        .sort((a, b) => a.value - b.value);

    for (const bp of sorted) {
        if (value <= bp.value) {
            return { severity: bp.severity, kind: 'severity' };
        }
    }
    return { severity: 2, kind: 'severity' };
}

function formatHourlyValue(value, unit) {
    if (!Number.isFinite(value)) return 'n/a';
    const rounded = Math.round(value * 10) / 10;
    return unit ? `${rounded} ${unit}` : `${rounded}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildHourlyStripTooltipHtml(hour, value, unit, classification, color) {
    const when = hour?.full_label || hour?.label || '';
    const reading = formatHourlyValue(value, unit);
    const status = classification.kind === 'severity'
        ? HOURLY_STRIP_LABELS[classification.severity] || 'Unknown'
        : HOURLY_STRIP_LABELS[classification.kind];

    return `
        <span class="hourly-strip-tooltip" role="tooltip">
            <span class="hourly-strip-tooltip-title">${escapeHtml(when)}</span>
            <span class="hourly-strip-tooltip-body">
                <span class="hourly-strip-tooltip-marker" style="background-color:${color};"></span>
                <span class="hourly-strip-tooltip-text">${escapeHtml(reading)} · ${escapeHtml(status)}</span>
            </span>
        </span>
    `;
}

function getHourlyStripColor(classification) {
    const theme = window.hdtIaqTheme;
    if (classification.kind === 'severity') {
        if (theme && typeof theme.getIaqSeverityHex === 'function') {
            return theme.getIaqSeverityHex(classification.severity);
        }
        if (classification.severity === 0) return '#24c19a';
        if (classification.severity === 1) return '#fbbf23';
        return '#f5785c';
    }
    if (classification.kind === 'noData') {
        return theme && typeof theme.readCssVar === 'function'
            ? theme.readCssVar('--iaq-no-data', '#dadfe5')
            : '#dadfe5';
    }
    return theme && typeof theme.readCssVar === 'function'
        ? theme.readCssVar('--iaq-strip-no-policy', '#cbd5e1')
        : '#cbd5e1';
}

function summarizeHourlyStrip(classifications) {
    const total = classifications.length;
    if (total === 0) return null;

    const good = classifications.filter(c => c.kind === 'severity' && c.severity === 0).length;
    const withPolicy = classifications.filter(c => c.kind === 'severity').length;

    if (withPolicy === 0) return null;
    return Math.round((good / withPolicy) * 100);
}

function buildHourlyStripPeriod(rows) {
    const first = rows[0]?.full_label || rows[0]?.label || '';
    const last = rows[rows.length - 1]?.full_label || rows[rows.length - 1]?.label || '';
    if (!first && !last) return '';
    if (!first) return last;
    if (!last) return first;
    return `${first} - ${last}`;
}

function buildHourlyStripAxis(rows) {
    const total = rows.length;
    if (total === 0) return '';

    // Each label is centered under the horizontal mid-point of its bar so
    // it visually aligns with the bar it represents, regardless of how
    // wide the bars render at the current container size.
    const labels = rows
        .map((hour, idx) => {
            if (idx % 2 !== 0) return '';
            const leftPct = ((idx + 0.5) / total) * 100;
            return `<span style="left:${leftPct.toFixed(3)}%;">${escapeHtml(hour?.label || '')}</span>`;
        })
        .filter(Boolean)
        .join('');

    return `<div class="hourly-strip-axis">${labels}</div>`;
}

// Render the strip for one pollutant inside the given container.
// `config` shape: { key, label, unit, breakpointLines, containerId }
function renderHourlyStrip(config, hourlyData) {
    if (!config || !config.containerId) return;
    const container = document.querySelector(config.containerId);
    if (!container) return;

    const rows = Array.isArray(hourlyData) ? hourlyData : [];
    if (rows.length === 0) {
        container.innerHTML = '';
        container.classList.add('is-empty');
        return;
    }
    container.classList.remove('is-empty');

    const breakpoints = Array.isArray(config.breakpointLines) ? config.breakpointLines : [];
    const classifications = rows.map(hour => classifyHourlySeverity(hour[config.key], breakpoints));

    const barsHtml = rows.map((hour, idx) => {
        const value = hour[config.key];
        const classification = classifications[idx];
        const color = getHourlyStripColor(classification);
        const tooltipHtml = buildHourlyStripTooltipHtml(hour, value, config.unit, classification, color);
        return `<span class="hourly-strip-bar" style="background-color:${color};">${tooltipHtml}</span>`;
    }).join('');

    const goodPercent = summarizeHourlyStrip(classifications);
    const period = buildHourlyStripPeriod(rows);
    const summaryHtml = goodPercent !== null
        ? `<span class="hourly-strip-summary">${goodPercent}% Good · ${escapeHtml(period)}</span>`
        : `<span class="hourly-strip-summary text-muted">No policy · ${escapeHtml(period)}</span>`;

    container.innerHTML = `
        <div class="hourly-strip-header pb-2">
            <span class="hourly-strip-title">${config.label} • Last 24 hours</span>
            ${summaryHtml}
        </div>
        <div class="hourly-strip-bars">${barsHtml}</div>
        ${buildHourlyStripAxis(rows)}
    `;
}

function renderHourlyStrips(configs, hourlyData) {
    configs.forEach(config => {
        if (!config.stripContainerId) return;
        renderHourlyStrip(
            { ...config, containerId: config.stripContainerId },
            hourlyData
        );
    });
}

window.renderHourlyStrip = renderHourlyStrip;
window.renderHourlyStrips = renderHourlyStrips;
