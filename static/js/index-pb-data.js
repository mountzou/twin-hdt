// ================== DASHBOARD CONFIGURATION ==================

const POLLUTANT_UNITS = {
    CO2: 'ppm',
    TVOC: null,
    PM25: 'µg/m³'
};

const DASHBOARD_BOOTSTRAP_ENDPOINT = '/get_init_pb_data';
const IAQ_AVG_ENDPOINT = '/calculate/iaq/avg';
const PREDICTIONS_ENDPOINT = '/calculate/predictions';
const SOCKET_EVENT_NAME = 'new_mqtt_message';
const LIVE_SERIES_CAP = 120;

const INDEX_CHART_CONFIGS = [
    {
        key: 'co2',
        label: 'CO2',
        containerId: '#index-chart-co2',
        stripContainerId: '#index-chart-co2-strip',
        threshold: 1000,
        unit: POLLUTANT_UNITS.CO2,
        maxValue: 2000,
        cfdKey: 'co2',
        breakpointLines: (window.IAQ_BREAKPOINTS && window.IAQ_BREAKPOINTS.co2) || []
    },
    {
        key: 'pm25',
        label: 'PM2.5',
        containerId: '#index-chart-pm25',
        stripContainerId: '#index-chart-pm25-strip',
        threshold: 35,
        unit: POLLUTANT_UNITS.PM25,
        maxValue: 50,
        cfdKey: 'pm25',
        breakpointLines: (window.IAQ_BREAKPOINTS && window.IAQ_BREAKPOINTS.pm25) || []
    },
    {
        key: 'tvoc',
        label: 'TVOC',
        containerId: '#index-chart-tvoc',
        stripContainerId: '#index-chart-tvoc-strip',
        threshold: 500,
        unit: POLLUTANT_UNITS.TVOC,
        maxValue: 300,
        breakpointLines: (window.IAQ_BREAKPOINTS && window.IAQ_BREAKPOINTS.tvoc) || []
    }
];

const chartConfigByKey = Object.fromEntries(
    INDEX_CHART_CONFIGS.map(config => [config.key, config])
);


// ================== DASHBOARD STATE ==================

const dashboardState = {
    chartInstances: {},
    series: {
        co2: [],
        tvoc: [],
        pm25: []
    },
    cfd: {
        co2: [],
        pm25: []
    },
    // Forecast bars appended to each pollutant chart.
    forecast: {
        co2:  { values: [], timestamps: [] },
        pm25: { values: [], timestamps: [] },
        tvoc: { values: [], timestamps: [] }
    },
    hourlyIaq: [],
    timestamps: [],
    latestMeasurementDateTime: null
};

// Live MQTT handler must wait until dashboard charts exist (not until every
// slow follow-up request finishes — `await updateAllIaqPanels()` could block
// `finally` and leave this promise pending forever).
let resolveDashboardLiveReady;
const dashboardLiveReady = new Promise(resolve => {
    resolveDashboardLiveReady = resolve;
});

function signalDashboardLiveReady() {
    if (typeof resolveDashboardLiveReady === 'function') {
        resolveDashboardLiveReady();
        resolveDashboardLiveReady = null;
    }
}


// ================== PAYLOAD HELPERS ==================

function getChartStyles() {
    return {
        toolbar: styleToolbar,
        axis: styleAxis,
        ticks: styleTicks,
        stroke: styleStroke,
        marker: styleMarker
    };
}

function getAttributeValues(payload, attrName, maxValue) {
    const attribute = (payload.attributes || []).find(attr => attr.attrName === attrName);
    if (!attribute) return [];

    return (attribute.values || []).map(value => Math.min(value, maxValue));
}

function setSeriesStateFromHistoricalData(payload) {
    const historicalIndex = payload.index || [];
    dashboardState.timestamps = historicalIndex.map(formatDate).slice(0, -1);

    const latestHistoricalTimestamp = historicalIndex.length > 0
        ? historicalIndex[historicalIndex.length - 1]
        : null;
    dashboardState.latestMeasurementDateTime = latestHistoricalTimestamp || null;

    INDEX_CHART_CONFIGS.forEach(config => {
        dashboardState.series[config.key] = getAttributeValues(payload, config.key, config.maxValue).slice(0, -1);
    });
}

function renderDashboardUpdateTime(dateValue) {
    const updateTimeElement = document.getElementById('updateTime');
    if (!updateTimeElement || !dateValue) return;

    const measurementDate = new Date(dateValue);
    if (Number.isNaN(measurementDate.getTime())) return;

    const options = {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    };

    updateTimeElement.textContent = measurementDate.toLocaleString('en-US', options);
}

function setCfdState(cfdPayload) {
    dashboardState.cfd.co2 = cfdPayload.co2 || [];
    dashboardState.cfd.pm25 = cfdPayload.pm25 || [];
}

function applyBootstrapPayload(payload) {
    setSeriesStateFromHistoricalData(payload.historical_chart_data || {});
    setCfdState(payload.cfd || {});
    dashboardState.hourlyIaq = Array.isArray(payload.hourly_iaq) ? payload.hourly_iaq : [];
}

function renderDashboardHourlyStrips() {
    if (typeof window.renderHourlyStrips !== 'function') return;
    window.renderHourlyStrips(INDEX_CHART_CONFIGS, dashboardState.hourlyIaq || []);
}

function setDashboardChartLoading(isLoading) {
    INDEX_CHART_CONFIGS.forEach(config => {
        const chartId = (config.containerId || '').replace('#', '');
        if (!chartId) return;

        const shell = document.querySelector(`[data-chart-shell="${chartId}"]`);
        if (!shell) return;

        shell.classList.toggle('is-loading', isLoading);
    });
}


// ================== CHART LIFECYCLE ==================

function initializeDashboardCharts() {
    initializeCharts(
        INDEX_CHART_CONFIGS,
        dashboardState.chartInstances,
        dashboardState.series,
        dashboardState.timestamps,
        getChartStyles(),
        dashboardState.cfd,
        dashboardState.forecast
    );
}

async function updateDashboardCharts() {
    await updateCharts(
        INDEX_CHART_CONFIGS,
        dashboardState.chartInstances,
        dashboardState.series,
        dashboardState.timestamps,
        getChartStyles(),
        dashboardState.cfd,
        dashboardState.forecast
    );
}

function pushAndTrimSeries(series, value, cap) {
    series.push(Math.min(value, cap));
    if (series.length > LIVE_SERIES_CAP) {
        series.shift();
    }
}

function applyLiveSensorData(sensorData) {
    const hasPollutant =
        sensorData.co2 !== undefined ||
        sensorData.pm25 !== undefined ||
        sensorData.tvoc !== undefined;

    // One timestamp row must add one point to each series so lengths stay aligned
    // with `dashboardState.timestamps` (see util-chart `pairLen` trimming).
    if (sensorData.observationDateTime !== undefined) {
        dashboardState.latestMeasurementDateTime = sensorData.observationDateTime;
        dashboardState.timestamps.push(formatDate(sensorData.observationDateTime));
        if (dashboardState.timestamps.length > LIVE_SERIES_CAP) {
            dashboardState.timestamps.shift();
        }

        const appendWithCarry = (key, field) => {
            const cap = chartConfigByKey[key].maxValue;
            const series = dashboardState.series[key];
            const incoming = sensorData[field];
            if (incoming !== undefined) {
                pushAndTrimSeries(series, incoming, cap);
            } else if (series.length > 0) {
                pushAndTrimSeries(series, series[series.length - 1], cap);
            } else {
                pushAndTrimSeries(series, 0, cap);
            }
        };

        appendWithCarry('co2', 'co2');
        appendWithCarry('pm25', 'pm25');
        appendWithCarry('tvoc', 'tvoc');
        return;
    }

    if (!hasPollutant) {
        return;
    }

    const patchLast = (key, field) => {
        if (sensorData[field] === undefined) return;
        const cap = chartConfigByKey[key].maxValue;
        const series = dashboardState.series[key];
        const v = Math.min(sensorData[field], cap);
        if (series.length > 0) {
            series[series.length - 1] = v;
        } else {
            pushAndTrimSeries(series, v, cap);
        }
    };

    patchLast('co2', 'co2');
    patchLast('pm25', 'pm25');
    patchLast('tvoc', 'tvoc');
}


// ================== FORECAST RENDERING ==================

// Horizon definitions: which prediction keys to plot for each pollutant,
// and how many minutes ahead each key represents.
const FORECAST_HORIZONS = {
    co2: [
        { key: 'co2_pred_1min',  minutes: 1  },
        { key: 'co2_pred_5min',  minutes: 5  },
        { key: 'co2_pred_10min', minutes: 10 },
        { key: 'co2_pred_15min', minutes: 15 }
    ],
    pm25: [
        { key: 'pm25_pred_5min', minutes: 5 }
    ]
};

// Populate dashboardState.forecast from a predictions payload.
// Future timestamps are derived from the most recent measurement time.
function setForecastFromPredictions(predictionsPayload) {
    const baseTime = dashboardState.latestMeasurementDateTime
        ? new Date(dashboardState.latestMeasurementDateTime)
        : new Date();

    const newForecast = {
        co2:  { values: [], timestamps: [] },
        pm25: { values: [], timestamps: [] },
        tvoc: { values: [], timestamps: [] }
    };

    ['co2', 'pm25'].forEach(pollutant => {
        const preds    = predictionsPayload[pollutant] || {};
        const horizons = FORECAST_HORIZONS[pollutant] || [];

        horizons.forEach(({ key, minutes }) => {
            const pred = preds[key];
            if (pred && pred.value != null && Number.isFinite(Number(pred.value))) {
                newForecast[pollutant].values.push(Number(pred.value));
                const futureTime = new Date(baseTime.getTime() + minutes * 60_000);
                newForecast[pollutant].timestamps.push(formatDate(futureTime.toISOString()));
            }
        });
    });

    dashboardState.forecast = newForecast;
}

function updateForecasts(predictionsPayload) {
    const co2Predictions  = predictionsPayload.co2 || {};
    const pm25Predictions = predictionsPayload.pm25 || {};

    renderCO2Predictions(co2Predictions, POLLUTANT_UNITS.CO2);
    renderPm25Predictions(pm25Predictions, POLLUTANT_UNITS.PM25);
    setForecastFromPredictions(predictionsPayload);
}

// Fetch fresh predictions from the server and update forecast state + text labels.
// Chart re-render is left to the caller so it can batch with sensor updates.
async function refreshPredictions() {
    const response = await fetch(PREDICTIONS_ENDPOINT, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`Predictions request failed: ${response.statusText}`);
    }

    const predictionsPayload = await response.json();
    updateForecasts(predictionsPayload);
}


// ================== IAQ PANELS ==================

function tierDotClassName(policyColor) {
    const tier = window.hdtIaqTheme && typeof window.hdtIaqTheme.policyColorToTier === 'function'
        ? window.hdtIaqTheme.policyColorToTier(policyColor)
        : 'grey';
    return `status-dot iaq-tier-dot iaq-tier-dot--${tier}`;
}

function renderIaqPanel(panelId, data, pollutantKey, displayName, _dotClass, unit) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const last1h = data.last_1h || {};
    const last8h = data.last_8h || {};
    const v1h = last1h[pollutantKey];
    const v8h = last8h[pollutantKey];

    // Keep the side panel visible even when the API temporarily returns
    // missing IAQ windows (e.g. after refresh/race conditions).
    panel.classList.remove('d-none');

    const formatVal = obj => {
        if (!obj || obj.value == null) return 'n/a';
        const rounded = Math.round(obj.value * 10) / 10;
        return unit ? `${rounded} ${unit}` : `${rounded}`;
    };

    const capitalizeLabel = label => {
        if (!label) return '';
        return label.charAt(0).toUpperCase() + label.slice(1);
    };

    const block1h = panel.querySelector('.iaq-1h');
    const block8h = panel.querySelector('.iaq-8h');
    const label1h = v1h ? capitalizeLabel(v1h.label) : 'No data';
    const label8h = v8h ? capitalizeLabel(v8h.label) : 'No data';
    const value1h = formatVal(v1h);
    const value8h = formatVal(v8h);

    if (block1h) {
        const dot1 = block1h.querySelector('.status-dot');
        const name1 = block1h.querySelector('.iaq-display-name');
        const labelEl1 = block1h.querySelector('.iaq-label');
        const valueEl1 = block1h.querySelector('.iaq-value');

        if (dot1) dot1.className = v1h && v1h.color ? tierDotClassName(v1h.color) : 'status-dot iaq-tier-dot iaq-tier-dot--grey';
        if (name1) name1.textContent = displayName;
        if (labelEl1) labelEl1.textContent = label1h;
        if (valueEl1) valueEl1.textContent = value1h;
    }

    if (block8h) {
        const dot8 = block8h.querySelector('.status-dot');
        const name8 = block8h.querySelector('.iaq-display-name');
        const labelEl8 = block8h.querySelector('.iaq-label');
        const valueEl8 = block8h.querySelector('.iaq-value');

        if (dot8) dot8.className = v8h && v8h.color ? tierDotClassName(v8h.color) : 'status-dot iaq-tier-dot iaq-tier-dot--grey';
        if (name8) name8.textContent = displayName;
        if (labelEl8) labelEl8.textContent = label8h;
        if (valueEl8) valueEl8.textContent = value8h;
    }
}

function renderAllIaqPanels(data) {
    renderIaqPanel('index-chart-co2-status', data, 'co2', 'CO₂', 'bg-primary', POLLUTANT_UNITS.CO2);
    renderIaqPanel('index-chart-pm25-status', data, 'pm25', 'PM2.5', 'bg-azure', POLLUTANT_UNITS.PM25);
    renderIaqPanel('index-chart-tvoc-status', data, 'tvoc', 'TVOC', 'bg-green', POLLUTANT_UNITS.TVOC || '');
}

function hasIaqWindowData(windowData) {
    if (!windowData) return false;

    return Object.values(windowData).some(value => value && typeof value === 'object');
}

function hasIaqData(data) {
    return hasIaqWindowData(data?.last_1h) || hasIaqWindowData(data?.last_8h);
}

async function updateAllIaqPanels() {
    try {
        const response = await fetch(IAQ_AVG_ENDPOINT, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`IAQ status request failed: ${response.statusText}`);
        }

        const data = await response.json();
        renderAllIaqPanels(data);
        if (typeof window.renderIaqCards === 'function') {
            window.renderIaqCards(data);
        }
        document.dispatchEvent(new CustomEvent('hdt:iaq-ready', {
            detail: data || {}
        }));
    } catch (error) {
        console.error('Error updating IAQ panels:', error);
    }
}


// ================== BOOTSTRAP FLOW ==================

async function fetchDashboardBootstrap() {
    const response = await fetch(DASHBOARD_BOOTSTRAP_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Dashboard bootstrap request failed: ${response.statusText}`);
    }

    return response.json();
}

async function initializeDashboard() {
    setDashboardChartLoading(true);

    try {
        const payload = await fetchDashboardBootstrap();
        const iaqPayload = payload.iaq || {};

        applyBootstrapPayload(payload);
        renderDashboardUpdateTime(dashboardState.latestMeasurementDateTime);
        // Populate forecast state BEFORE charts are initialised so the first
        // render already includes the forecast bars.
        updateForecasts(payload.predictions || {});
        initializeDashboardCharts();
        renderDashboardHourlyStrips();
        signalDashboardLiveReady();

        if (hasIaqData(iaqPayload)) {
            renderAllIaqPanels(iaqPayload);
            if (typeof window.renderIaqCards === 'function') {
                window.renderIaqCards(iaqPayload);
            }
            document.dispatchEvent(new CustomEvent('hdt:iaq-ready', {
                detail: iaqPayload
            }));
        } else {
            await updateAllIaqPanels();
        }

        console.log('CFD CO2 values loaded:', dashboardState.cfd.co2);
        console.log('CFD PM2.5 values loaded:', dashboardState.cfd.pm25);
    } finally {
        setDashboardChartLoading(false);
        signalDashboardLiveReady();
    }
}


// ================== LIVE UPDATES ==================

async function refreshLiveDerivedData() {
    await updateDashboardCharts();
}

function extractSensorPayload(message) {
    const jsonStartIndex = message.indexOf('{');
    if (jsonStartIndex === -1) {
        throw new Error('MQTT message does not contain a JSON payload.');
    }

    return JSON.parse(message.substring(jsonStartIndex));
}

async function handleLiveSensorMessage(data) {
    await dashboardLiveReady;

    try {
        console.log('[hdt] MQTT → Socket.IO payload:', data);

        const sensorData = extractSensorPayload(data.message);
        applyLiveSensorData(sensorData);
        renderDashboardUpdateTime(dashboardState.latestMeasurementDateTime);

        // Charts + forecasts must not wait on IAQ `/calculate/iaq/avg` (can be slow
        // or stall); that previously blocked every live bar update.
        try {
            await refreshPredictions();
        } catch (error) {
            console.error('Error refreshing predictions:', error);
        }

        await refreshLiveDerivedData();

        void updateAllIaqPanels().catch(error => {
            console.error('Error updating IAQ panels (non-blocking):', error);
        });
    } catch (error) {
        console.error('Live sensor handling failed:', error);
    }
}

function initializeLiveUpdates() {
    const socket = io({
        transports: ['polling', 'websocket'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 2000
    });
    socket.on('connect_error', err => {
        console.error('[hdt] Socket.IO connect_error:', err && err.message ? err.message : err);
    });
    socket.on(SOCKET_EVENT_NAME, handleLiveSensorMessage);
}


// ================== ENTRYPOINT ==================
// `base.html` loads this script on every route; only the portable IAQ dashboard
// Legacy dashboard chart hooks (`#index-chart-co2`) — only on pages that include them.
// must not run bootstrap / Socket.IO listeners or they connect with no charts.
function isPortableIaqDashboardPage() {
    return Boolean(document.querySelector('#index-chart-co2'));
}

if (isPortableIaqDashboardPage()) {
    initializeDashboard().catch(error => {
        console.error('There is a problem with dashboard initialization:', error);
    });

    initializeLiveUpdates();
}
