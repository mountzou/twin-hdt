function getChartValueFormatter(unit) {
    return unit
        ? value => `${value.toFixed(1)} ${unit}`
        : value => value.toFixed(1);
}

function getChartTickFormatter(unit) {
    return unit
        ? value => `${Math.round(value)} ${unit}`
        : value => `${Math.round(value)}`;
}

function getChartBounds(values, fallbackValue = 0) {
    const baselineValues = Array.isArray(values) ? values : [];
    const finiteValues = baselineValues.filter(Number.isFinite);
    const seed = finiteValues.length > 0 ? finiteValues : [fallbackValue];

    const maxVal = Math.max(...seed);
    const minVal = Math.min(...seed, 0);

    return {
        // Bars grow from a 0 baseline; keeping min at 0 avoids visually
        // exaggerating small variations.
        min: minVal > 0 ? 0 : minVal,
        max: maxVal + 0.1 * Math.abs(maxVal),
        dataMax: maxVal
    };
}

function getSeverityColor(severity) {
    if (window.hdtIaqTheme && typeof window.hdtIaqTheme.getIaqSeverityHex === 'function') {
        return window.hdtIaqTheme.getIaqSeverityHex(severity);
    }
    if (severity === 0) return '#24c19a';
    if (severity === 1) return '#fbbf23';
    return '#f5785c';
}

// Map a single numeric value to its IAQ severity colour.
function getIaqColorForValue(value, breakpoints) {
    const sorted = [...breakpoints]
        .filter(bp => Number.isFinite(bp?.value))
        .sort((a, b) => a.value - b.value);

    for (const bp of sorted) {
        if (value <= bp.value) return getSeverityColor(bp.severity);
    }
    return getSeverityColor(2);
}

function buildBreakpointAnnotations(config) {
    const breakpoints = Array.isArray(config.breakpointLines) ? config.breakpointLines : [];
    if (breakpoints.length === 0) return [];

    return breakpoints
        .filter(bp => Number.isFinite(bp?.value))
        .map(bp => ({
            y: bp.value,
            borderColor: getSeverityColor(bp.severity),
            strokeDashArray: 4
        }));
}

// Kept for compatibility – not used inside buildChartOptions any more (replaced by
// the per-datapoint `colors` function), but may be referenced elsewhere.
function buildBarColorRanges(config) {
    const breakpoints = Array.isArray(config.breakpointLines) ? config.breakpointLines : [];
    const sorted = breakpoints
        .filter(bp => Number.isFinite(bp?.value))
        .sort((a, b) => a.value - b.value);

    if (sorted.length === 0) {
        return [];
    }

    const EPSILON = 0.0001;
    const ranges = [];
    let lowerBound = -Number.MAX_VALUE;

    sorted.forEach(bp => {
        ranges.push({
            from: lowerBound,
            to: bp.value,
            color: getSeverityColor(bp.severity)
        });
        lowerBound = bp.value + EPSILON;
    });

    ranges.push({
        from: lowerBound,
        to: Number.MAX_VALUE,
        color: getSeverityColor(2)
    });

    return ranges;
}

// Apex `forecastDataPoints` applies dashed stroke + fill opacity to the last N bars.
// Forecast fill colour comes from the distributed `colors` array (grey slots).
function buildChartOptions(config, values, timestamps, styles, tickAmount, forecastData = null) {
    // Keep categories and sensor series aligned (bootstrap vs live paths can drift).
    const pairLen = Math.min(values.length, timestamps.length);
    const v = values.slice(0, pairLen);
    const t = timestamps.slice(0, pairLen);

    const hasForecast = forecastData &&
        Array.isArray(forecastData.values) &&
        forecastData.values.length > 0;

    const breakpoints = Array.isArray(config.breakpointLines) ? config.breakpointLines : [];
    const fallbackSorted = breakpoints
        .filter(bp => Number.isFinite(bp?.value))
        .sort((a, b) => a.value - b.value);
    const fallbackColor = fallbackSorted.length > 0
        ? getSeverityColor(fallbackSorted[0].severity)
        : '#2563eb';

    const valueFormatter = getChartValueFormatter(config.unit);
    const tickFormatter = getChartTickFormatter(config.unit);
    const yAxisTitle = config.unit ? `${config.label} (${config.unit})` : config.label;
    const breakpointAnnotations = buildBreakpointAnnotations(config);

    // ---------- With forecast: one merged series (full-width bars) + forecastDataPoints ----------
    if (hasForecast) {
        const forecastCount = forecastData.values.length;
        // ApexCharts infers series shape from data[0] only. If the first point is a
        // plain number, the whole series is parsed as 1D numbers — mixing in
        // `{ y, fillColor }` objects yields NaN and empty bars. Keep every point
        // numeric; use `colors` + `forecastDataPoints` for forecast styling.
        const mergedValues = [
            ...v.map(y => (Number.isFinite(y) ? Number(y) : null)),
            ...forecastData.values.map(y => {
                const n = Number(y);
                return Number.isFinite(n) ? n : null;
            })
        ];

        const allTimestamps = [...t, ...forecastData.timestamps];

        const mergedFinite = mergedValues.filter(Number.isFinite);
        const bounds = getChartBounds(mergedFinite, config.threshold);

        const mergedColors = v.map(val => (
            !Number.isFinite(val)
                ? fallbackColor
                : (breakpoints.length === 0 ? fallbackColor : getIaqColorForValue(val, breakpoints))
        ));
        forecastData.values.forEach(() => mergedColors.push('#dee2e6'));

        return {
            series: [{ name: config.label, data: mergedValues }],
            colors: mergedColors,
            fill: { opacity: 1 },
            stroke: { show: false },
            forecastDataPoints: {
                count: forecastCount,
                dashArray: 6,
                strokeWidth: 2,
                fillOpacity: 0.72
            },
            plotOptions: {
                bar: {
                    distributed: true,
                    columnWidth: '80%',
                    borderRadius: 2,
                    borderRadiusApplication: 'end'
                }
            },
            xaxis: {
                categories: allTimestamps,
                title: { text: '', style: styles.axis },
                labels: {
                    formatter: value => value,
                    rotate: 0,
                    style: styles.ticks
                },
                tooltip: { enabled: false },
                tickAmount: tickAmount,
            },
            yaxis: {
                title: { text: yAxisTitle, style: styles.axis },
                min: bounds.min,
                max: bounds.max,
                labels: { formatter: tickFormatter, style: styles.ticks },
                tickAmount: 4,
            },
            grid: {
                borderColor: 'rgba(58, 74, 89, 0.10)',
                yaxis: {
                    lines: { show: true }
                }
            },
            dataLabels: { enabled: false },
            tooltip: {
                shared: true,
                intersect: false,
                fillSeriesColor: false,
                y: {
                    formatter: valueFormatter,
                    title: { formatter: seriesName => seriesName }
                }
            },
            states: {
                hover: { filter: { type: 'lighten', value: 0.1 } },
                active: {
                    allowMultipleDataPointsSelection: false,
                    filter: { type: 'none' }
                }
            },
            annotations: {
                yaxis: breakpointAnnotations
            }
        };
    }

    // ---------- Sensor only: non-distributed, colour function per value ----------
    const bounds = getChartBounds(v.filter(Number.isFinite), config.threshold);

    const colorsFn = [
        function({ value }) {
            if (!Number.isFinite(value)) return fallbackColor;
            if (breakpoints.length === 0) return fallbackColor;
            return getIaqColorForValue(value, breakpoints);
        }
    ];

    return {
        series: [{ name: `${config.label} (Sensor)`, data: v }],
        colors: colorsFn,
        fill: { opacity: 1 },
        stroke: { show: false },
        forecastDataPoints: { count: 0, dashArray: 4, strokeWidth: 0, fillOpacity: 1 },
        plotOptions: {
            bar: {
                distributed: false,
                columnWidth: '80%',
                borderRadius: 2,
                borderRadiusApplication: 'end'
            }
        },
        xaxis: {
            categories: t,
            title: { text: '', style: styles.axis },
            labels: {
                formatter: value => value,
                rotate: 0,
                style: styles.ticks
            },
            tooltip: { enabled: false },
            tickAmount: tickAmount,
        },
        yaxis: {
            title: { text: yAxisTitle, style: styles.axis },
            min: bounds.min,
            max: bounds.max,
            labels: { formatter: tickFormatter, style: styles.ticks },
            tickAmount: 4,
        },
        grid: {
            borderColor: 'rgba(58, 74, 89, 0.10)',
            yaxis: {
                lines: { show: true }
            }
        },
        dataLabels: { enabled: false },
        tooltip: {
            shared: true,
            intersect: false,
            fillSeriesColor: false,
            y: {
                formatter: valueFormatter,
                title: { formatter: seriesName => seriesName }
            }
        },
        states: {
            hover: { filter: { type: 'lighten', value: 0.1 } },
            active: {
                allowMultipleDataPointsSelection: false,
                filter: { type: 'none' }
            }
        },
        annotations: {
            yaxis: breakpointAnnotations
        }
    };
}

function initializeChart(config, values, timestamps, styles, forecastData = null) {
    const container = document.querySelector(config.containerId);
    if (!container) return null;

    const options = buildChartOptions(config, values, timestamps, styles, 8, forecastData);

    options.chart = {
        type: 'bar',
        height: 275,
        animations: { enabled: false },
        toolbar: { show: false }
    };

    options.legend = { show: false };

    const chart = new ApexCharts(container, options);
    chart.render();
    return chart;
}

function updateChart(chart, config, values, timestamps, styles, forecastData = null) {
    if (!chart) return Promise.resolve();

    const options = buildChartOptions(config, values, timestamps, styles, 9, forecastData);

    const afterSeries = chart.updateSeries(options.series, false);
    const chain = afterSeries && typeof afterSeries.then === 'function'
        ? afterSeries
        : Promise.resolve();

    return chain.then(() => chart.updateOptions({
        colors: options.colors,
        fill: options.fill,
        stroke: options.stroke,
        forecastDataPoints: options.forecastDataPoints,
        plotOptions: options.plotOptions,
        xaxis: options.xaxis,
        yaxis: options.yaxis,
        tooltip: options.tooltip,
        annotations: options.annotations
    }, true, false));
}

function initializeCharts(configs, chartInstances, seriesState, timestamps, styles, _cfdState = {}, forecastState = {}) {
    configs.forEach(config => {
        chartInstances[config.key] = initializeChart(
            config,
            seriesState[config.key] || [],
            timestamps,
            styles,
            forecastState[config.key] || null
        );
    });
}

function updateCharts(configs, chartInstances, seriesState, timestamps, styles, _cfdState = {}, forecastState = {}) {
    return Promise.all(configs.map(config => updateChart(
        chartInstances[config.key],
        config,
        seriesState[config.key] || [],
        timestamps,
        styles,
        forecastState[config.key] || null
    )));
}
