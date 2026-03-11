// ================== DASHBOARD CONFIGURATION ==================

const POLLUTANT_UNITS = {
    CO2: 'ppm',
    TVOC: null,
    PM25: 'µg/m³'
};

const DASHBOARD_BOOTSTRAP_ENDPOINT = '/get_init_pb_data';
const IAQ_AVG_ENDPOINT = '/calculate/iaq/avg';
const SOCKET_EVENT_NAME = 'new_mqtt_message';
const LIVE_SERIES_CAP = 10;

const INDEX_CHART_CONFIGS = [
    {
        key: 'co2',
        label: 'CO2',
        containerId: '#index-chart-co2',
        threshold: 1000,
        unit: POLLUTANT_UNITS.CO2,
        maxValue: 2000,
        cfdKey: 'co2'
    },
    {
        key: 'pm25',
        label: 'PM2.5',
        containerId: '#index-chart-pm25',
        threshold: 35,
        unit: POLLUTANT_UNITS.PM25,
        maxValue: 50,
        cfdKey: 'pm25'
    },
    {
        key: 'tvoc',
        label: 'TVOC',
        containerId: '#index-chart-tvoc',
        threshold: 500,
        unit: POLLUTANT_UNITS.TVOC,
        maxValue: 300
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
    timestamps: []
};


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
    dashboardState.timestamps = (payload.index || []).map(formatDate).slice(0, -1);

    INDEX_CHART_CONFIGS.forEach(config => {
        dashboardState.series[config.key] = getAttributeValues(payload, config.key, config.maxValue).slice(0, -1);
    });
}

function setCfdState(cfdPayload) {
    dashboardState.cfd.co2 = cfdPayload.co2 || [];
    dashboardState.cfd.pm25 = cfdPayload.pm25 || [];
}

function applyBootstrapPayload(payload) {
    setSeriesStateFromHistoricalData(payload.historical_chart_data || {});
    setCfdState(payload.cfd || {});
}


// ================== CHART LIFECYCLE ==================

function initializeDashboardCharts() {
    initializeCharts(
        INDEX_CHART_CONFIGS,
        dashboardState.chartInstances,
        dashboardState.series,
        dashboardState.timestamps,
        getChartStyles(),
        dashboardState.cfd
    );
}

function updateDashboardCharts() {
    updateCharts(
        INDEX_CHART_CONFIGS,
        dashboardState.chartInstances,
        dashboardState.series,
        dashboardState.timestamps,
        getChartStyles(),
        dashboardState.cfd
    );
}

function pushAndTrimSeries(series, value, cap) {
    series.push(Math.min(value, cap));
    if (series.length > LIVE_SERIES_CAP) {
        series.shift();
    }
}

function applyLiveSensorData(sensorData) {
    if (sensorData.co2 !== undefined) {
        pushAndTrimSeries(dashboardState.series.co2, sensorData.co2, chartConfigByKey.co2.maxValue);
    }
    if (sensorData.tvoc !== undefined) {
        pushAndTrimSeries(dashboardState.series.tvoc, sensorData.tvoc, chartConfigByKey.tvoc.maxValue);
    }
    if (sensorData.pm25 !== undefined) {
        pushAndTrimSeries(dashboardState.series.pm25, sensorData.pm25, chartConfigByKey.pm25.maxValue);
    }
    if (sensorData.observationDateTime !== undefined) {
        dashboardState.timestamps.push(formatDate(sensorData.observationDateTime));
        if (dashboardState.timestamps.length > LIVE_SERIES_CAP) {
            dashboardState.timestamps.shift();
        }
    }
}


// ================== FORECAST RENDERING ==================

function updateForecasts(predictionsPayload) {
    const co2Predictions  = predictionsPayload.co2 || {};
    const pm25Predictions = predictionsPayload.pm25 || {};

    renderCO2Predictions(co2Predictions, POLLUTANT_UNITS.CO2);
    renderPm25Predictions(pm25Predictions, POLLUTANT_UNITS.PM25);
}


// ================== IAQ PANELS ==================

function renderIaqPanel(panelId, data, pollutantKey, displayName, dotClass, unit) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const last1h = data.last_1h || {};
    const last8h = data.last_8h || {};
    const v1h = last1h[pollutantKey];
    const v8h = last8h[pollutantKey];

    if (!v1h && !v8h) {
        panel.classList.add('d-none');
        return;
    }
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
    const label1h = v1h ? capitalizeLabel(v1h.label) : '—';
    const label8h = v8h ? capitalizeLabel(v8h.label) : '—';
    const value1h = formatVal(v1h);
    const value8h = formatVal(v8h);

    if (block1h) {
        const dot1 = block1h.querySelector('.status-dot');
        const name1 = block1h.querySelector('.iaq-display-name');
        const labelEl1 = block1h.querySelector('.iaq-label');
        const valueEl1 = block1h.querySelector('.iaq-value');

        if (dot1) dot1.className = `status-dot ${dotClass}`;
        if (name1) name1.textContent = displayName;
        if (labelEl1) labelEl1.textContent = label1h;
        if (valueEl1) valueEl1.textContent = value1h;
    }

    if (block8h) {
        const dot8 = block8h.querySelector('.status-dot');
        const name8 = block8h.querySelector('.iaq-display-name');
        const labelEl8 = block8h.querySelector('.iaq-label');
        const valueEl8 = block8h.querySelector('.iaq-value');

        if (dot8) dot8.className = `status-dot ${dotClass}`;
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
    const payload = await fetchDashboardBootstrap();
    const iaqPayload = payload.iaq || {};

    applyBootstrapPayload(payload);
    initializeDashboardCharts();
    updateForecasts(payload.predictions || {});

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
}


// ================== LIVE UPDATES ==================

async function refreshLiveDerivedData() {
    updateDashboardCharts();
}

function extractSensorPayload(message) {
    const jsonStartIndex = message.indexOf('{');
    if (jsonStartIndex === -1) {
        throw new Error('MQTT message does not contain a JSON payload.');
    }

    return JSON.parse(message.substring(jsonStartIndex));
}

function handleLiveSensorMessage(data) {
    console.log('Received MQTT message:', data);

    const sensorData = extractSensorPayload(data.message);
    applyLiveSensorData(sensorData);
    updateAllIaqPanels();

    refreshLiveDerivedData().catch(error => {
        console.error('Error refreshing live chart state:', error);
    });
}

function initializeLiveUpdates() {
    const socket = io();
    socket.on(SOCKET_EVENT_NAME, handleLiveSensorMessage);
}


// ================== ENTRYPOINT ==================

initializeDashboard().catch(error => {
    console.error('There is a problem with dashboard initialization:', error);
});

initializeLiveUpdates();
