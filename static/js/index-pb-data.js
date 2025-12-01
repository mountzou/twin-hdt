// ================== GLOBAL STATE ==================

// Initialize arrays for air pollutants and climatic conditions
let co2Values  = [];
let tvocValues = [];
let pm25Values = [];
let tempValues = [];
let rhumValues = [];
let timestamp  = [];

// CFD baseline arrays
let co2CFDValues  = [];
let pm25CFDValues = [];

// Stats for CO2 band estimation
let co2_mean = 0;
let co2_std  = 0;
let co2_diff = 0;

// Dynamic CFD window sizes (for POST requests on each MQTT update)
let cfdCo2LastN  = 21;   // initial value matches Flask default
let cfdPm25LastN = 25;   // initial value matches Flask default

// Define threshold values for each pollutant (these values are examples)
const co2Threshold  = 1000;   // ppm
const tvocThreshold = 500;    // ppb
const pm25Threshold = 35;     // µg/m³
const tempThreshold = 35;     // °C
const rhumThreshold = 35;     // % (example)

const POLLUTANT_UNITS = {
    CO2:  'ppm',
    TVOC: null,
    PM25: 'µg/m³',
    TEMP: '°C',
    RHUM: '%'
};

let chartCO2, chartTVOC, chartPM25, chartTemp, chartRHum;


// ================== FORECAST LABEL HELPERS ==================

function formatCo2Prediction(pred) {
    if (!pred) return null;
    const unit  = POLLUTANT_UNITS.CO2 || 'ppm';
    const value = Number(pred.value).toFixed(2);
    const lower = Number(pred.lower).toFixed(2);
    const upper = Number(pred.upper).toFixed(2);
    return `${value} ${unit} (95% CI: ${lower}–${upper} ${unit})`;
}

function updateCo2ForecastDom(pred5, pred10, pred15) {
    const el5  = document.getElementById("co2-pred-5");
    const el10 = document.getElementById("co2-pred-10");
    const el15 = document.getElementById("co2-pred-15");

    if (el5 && pred5)   el5.textContent  = formatCo2Prediction(pred5);
    if (el10 && pred10) el10.textContent = formatCo2Prediction(pred10);
    if (el15 && pred15) el15.textContent = formatCo2Prediction(pred15);
}

function formatPm25Prediction(pred) {
    if (!pred) return null;
    const unit  = POLLUTANT_UNITS.PM25 || 'µg/m³';
    const value = Number(pred.value).toFixed(2);
    const lower = Number(pred.lower).toFixed(2);
    const upper = Number(pred.upper).toFixed(2);
    return `${value} ${unit} (95% CI: ${lower}–${upper} ${unit})`;
}

function updatePm25ForecastDom(pred5) {
    const el5 = document.getElementById("pm25-pred-5");
    if (el5 && pred5) {
        el5.textContent = formatPm25Prediction(pred5);
    }
}


// ================== IAQ PANELS ==================

function renderIaqPanel(panelId, data, pollutantKey, displayName, dotClass, unit) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const last1h = data.last_1h || {};
    const last8h = data.last_8h || {};

    const v1h = last1h[pollutantKey];
    const v8h = last8h[pollutantKey];

    // If no data at all, you can hide the panel or show n/a
    if (!v1h && !v8h) {
        panel.classList.add("d-none");
        return;
    } else {
        panel.classList.remove("d-none");
    }

    const formatVal = (obj) => {
        if (!obj || obj.value == null) return "n/a";
        const rounded = Math.round(obj.value * 10) / 10;
        return unit ? `${rounded} ${unit}` : `${rounded}`;
    };

    const capitalizeLabel = (label) => {
        if (!label) return "";
        return label.charAt(0).toUpperCase() + label.slice(1);
    };

    const label1h = v1h ? capitalizeLabel(v1h.label) : "—";
    const label8h = v8h ? capitalizeLabel(v8h.label) : "—";
    const v1Text  = formatVal(v1h);
    const v8Text  = formatVal(v8h);

    const block1h = panel.querySelector(".iaq-1h");
    const block8h = panel.querySelector(".iaq-8h");

    if (block1h) {
        const dot1     = block1h.querySelector(".status-dot");
        const name1    = block1h.querySelector(".iaq-display-name");
        const labelEl1 = block1h.querySelector(".iaq-label");
        const valueEl1 = block1h.querySelector(".iaq-value");

        if (dot1)      dot1.className      = `status-dot ${dotClass}`;
        if (name1)     name1.textContent   = displayName;
        if (labelEl1)  labelEl1.textContent = label1h;
        if (valueEl1)  valueEl1.textContent = v1Text;
    }

    if (block8h) {
        const dot8     = block8h.querySelector(".status-dot");
        const name8    = block8h.querySelector(".iaq-display-name");
        const labelEl8 = block8h.querySelector(".iaq-label");
        const valueEl8 = block8h.querySelector(".iaq-value");

        if (dot8)      dot8.className      = `status-dot ${dotClass}`;
        if (name8)     name8.textContent   = displayName;
        if (labelEl8)  labelEl8.textContent = label8h;
        if (valueEl8)  valueEl8.textContent = v8Text;
    }
}

async function updateAllIaqPanels() {
    try {
        const res = await fetch("/calculate/iaq/avg", {
            method: "GET",
            credentials: "include"
        });

        if (!res.ok) {
            throw new Error("IAQ status request failed: " + res.statusText);
        }

        const data = await res.json();

        // CO₂ panel
        renderIaqPanel(
            "index-chart-co2-status",
            data,
            "co2",
            "CO₂",
            "bg-primary",
            POLLUTANT_UNITS.CO2
        );

        // PM2.5 panel
        renderIaqPanel(
            "index-chart-pm25-status",
            data,
            "pm25",
            "PM2.5",
            "bg-azure",
            POLLUTANT_UNITS.PM25
        );

        // TVOC panel
        renderIaqPanel(
            "index-chart-tvoc-status",
            data,
            "tvoc",
            "TVOC",
            "bg-green",
            POLLUTANT_UNITS.TVOC || ""
        );

    } catch (err) {
        console.error("Error updating IAQ panels:", err);
    }
}


// ================== INITIAL HISTORICAL DATA & CFD LOAD ==================

fetch('/init_mqtt_queue', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lastN: 20 })
})
.then(response => {
    if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
    }
    return response.json();
})
.then(data => {
    let rawTimestamps = data.index.map(ts => new Date(ts));
    timestamp = data.index.map(formatDate).slice(0, -1);

    const tvocAttribute = data.attributes.find(attr => attr.attrName === 'tvoc');
    const co2Attribute  = data.attributes.find(attr => attr.attrName === 'co2');
    const pm25Attribute = data.attributes.find(attr => attr.attrName === 'pm25');
    const tempAttribute = data.attributes.find(attr => attr.attrName === 'temperature');
    const rhumAttribute = data.attributes.find(attr => attr.attrName === 'relativeHumidity');

    const co2MaxValue = 2000;
    co2Values = co2Attribute
        ? co2Attribute.values.map(value => Math.min(value, co2MaxValue))
        : [];

    const tvocMaxValue = 300;
    tvocValues = tvocAttribute
        ? tvocAttribute.values.map(value => Math.min(value, tvocMaxValue))
        : [];

    const pm25MaxValue = 50;
    pm25Values = pm25Attribute
        ? pm25Attribute.values.map(value => Math.min(value, pm25MaxValue))
        : [];

    const tempMaxValue = 50;
    tempValues = tempAttribute
        ? tempAttribute.values.map(value => Math.min(value, tempMaxValue))
        : [];

    const rhumMaxValue = 100;
    rhumValues = rhumAttribute
        ? rhumAttribute.values.map(value => Math.min(value, rhumMaxValue))
        : [];

    // Drop the latest value from all pollutant arrays (keep lastN-1)
    co2Values  = co2Values.slice(0, -1);
    tvocValues = tvocValues.slice(0, -1);
    pm25Values = pm25Values.slice(0, -1);
    tempValues = tempValues.slice(0, -1);
    rhumValues = rhumValues.slice(0, -1);

    // Simple CO2 band estimation
    if (co2Values.length > 0) {
        const win    = co2Values.slice(-10);
        const latest = win[win.length - 1];

        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
        const std = Math.sqrt(variance);

        const band = Math.round(std * 2);
        document.getElementById("co2-pred-1").textContent =
            `${Math.round(latest)} ${POLLUTANT_UNITS.CO2} ± ${band} ${POLLUTANT_UNITS.CO2}`;
    }

    const chartStyles = {
        toolbar: styleToolbar,
        axis:    styleAxis,
        ticks:   styleTicks,
        stroke:  styleStroke,
        marker:  styleMarker
    };

    // ---- FIRST: fetch BOTH CFD series (initial baseline, using backend defaults via GET) ----
    return Promise.all([
        fetch('/api/cfd/co2', {
            method: "GET",
            credentials: "include"
        }),
        fetch('/api/cfd/pm25', {
            method: "GET",
            credentials: "include"
        })
    ]).then(([cfdCo2Res, cfdPm25Res]) => {
        if (!cfdCo2Res.ok) {
            throw new Error("CFD CO2 request failed: " + cfdCo2Res.statusText);
        }
        if (!cfdPm25Res.ok) {
            throw new Error("CFD PM2.5 request failed: " + cfdPm25Res.statusText);
        }
        return Promise.all([cfdCo2Res.json(), cfdPm25Res.json()]);
    }).then(([cfdCo2Data, cfdPm25Data]) => {
        co2CFDValues  = cfdCo2Data;
        pm25CFDValues = cfdPm25Data;

        console.log("CFD CO₂ values loaded:", co2CFDValues);
        console.log("CFD PM2.5 values loaded:", pm25CFDValues);

        // Initialize charts, now with CFD lines for CO₂ and PM2.5
        chartCO2  = initializeChart(
            'CO2',
            co2Values,
            '#index-chart-co2',
            co2Threshold,
            timestamp,
            chartStyles,
            POLLUTANT_UNITS.CO2,
            co2CFDValues
        );

        chartTVOC = initializeChart(
            'TVOC',
            tvocValues,
            '#index-chart-tvoc',
            tvocThreshold,
            timestamp,
            chartStyles,
            POLLUTANT_UNITS.TVOC
        );

        chartPM25 = initializeChart(
            'PM2.5',
            pm25Values,
            '#index-chart-pm25',
            pm25Threshold,
            timestamp,
            chartStyles,
            POLLUTANT_UNITS.PM25,
            pm25CFDValues
        );

        updateAllIaqPanels();

        // Chain prediction requests
        return Promise.all([
            fetch('/pred/co2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lastN: 10 })
            }),
            fetch('/pred/pm25', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lastN: 10 })
            })
        ]);
    });
})
.then(([co2Resp, pm25Resp]) => {
    if (!co2Resp.ok) {
        throw new Error('CO2 prediction request failed: ' + co2Resp.statusText);
    }
    if (!pm25Resp.ok) {
        throw new Error('PM2.5 prediction request failed: ' + pm25Resp.statusText);
    }
    return Promise.all([co2Resp.json(), pm25Resp.json()]);
})
.then(([co2PredData, pm25PredData]) => {
    const pred5  = co2PredData.co2_pred_5min  || null;
    const pred10 = co2PredData.co2_pred_10min || null;
    const pred15 = co2PredData.co2_pred_15min || null;
    updateCo2ForecastDom(pred5, pred10, pred15);

    const pm25Pred5 = pm25PredData.pm25_pred_5min || null;
    updatePm25ForecastDom(pm25Pred5);
})
.catch(error => {
    console.error('There is a problem with fetching historical data or predictions:', error);
});


// ================== REAL-TIME MQTT UPDATES ==================

var socket = io();

socket.on('new_mqtt_message', function(data) {
    let message = data.message;

    console.log('Received MQTT message:', data);

    let jsonStringStart = message.indexOf('{');
    let jsonString = message.substring(jsonStringStart);

    let sensorData = JSON.parse(jsonString);

    // Add value with capping, then remove oldest if length > 10
    function pushAndTrim(array, value, cap) {
        array.push(Math.min(value, cap));
        if (array.length > 10) array.shift();
    }

    if (sensorData.co2 !== undefined) {
        pushAndTrim(co2Values, sensorData.co2, 2000);
    }
    if (sensorData.tvoc !== undefined) {
        pushAndTrim(tvocValues, sensorData.tvoc, 300);
    }
    if (sensorData.pm25 !== undefined) {
        pushAndTrim(pm25Values, sensorData.pm25, 50);
    }
    if (sensorData.temperature !== undefined) {
        pushAndTrim(tempValues, sensorData.temperature, 50);
    }
    if (sensorData.relativeHumidity !== undefined) {
        pushAndTrim(rhumValues, sensorData.relativeHumidity, 100);
    }
    if (sensorData.observationDateTime !== undefined) {
        timestamp.push(formatDate(sensorData.observationDateTime));
        if (timestamp.length > 10) timestamp.shift();
    }

    // IAQ panels can update immediately from sensor data
    updateAllIaqPanels();

    // ---------- Refresh CFD baselines for CO2 & PM2.5 with dynamic lastN ----------
    Promise.all([
        fetch('/api/cfd/co2', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastN: cfdCo2LastN })
        }),
        fetch('/api/cfd/pm25', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastN: cfdPm25LastN })
        })
    ])
    .then(([cfdCo2Res, cfdPm25Res]) => {
        if (!cfdCo2Res.ok) throw new Error('CFD CO2 request failed: ' + cfdCo2Res.statusText);
        if (!cfdPm25Res.ok) throw new Error('CFD PM2.5 request failed: ' + cfdPm25Res.statusText);

        return Promise.all([cfdCo2Res.json(), cfdPm25Res.json()]);
    })
    .then(([cfdCo2Data, cfdPm25Data]) => {
        co2CFDValues  = cfdCo2Data;
        pm25CFDValues = cfdPm25Data;

        console.log('Updated CFD CO₂ values:', co2CFDValues);
        console.log('Updated CFD PM2.5 values:', pm25CFDValues);

        // Increase the request window for next iteration
        cfdCo2LastN++;
        cfdPm25LastN++;

        // Now update charts with BOTH new sensor and new CFD values
        updateCharts();
    })
    .catch(err => {
        console.error('Error updating CFD baselines:', err);
    });

    // ---------- Refresh CO2 ARIMA forecasts ----------
    fetch('/pred/co2', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lastN: 10 })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('CO2 prediction request failed: ' + response.statusText);
        }
        return response.json();
    })
    .then(predData => {
        const pred5  = predData.co2_pred_5min  || null;
        const pred10 = predData.co2_pred_10min || null;
        const pred15 = predData.co2_pred_15min || null;

        updateCo2ForecastDom(pred5, pred10, pred15);
    })
    .catch(err => {
        console.error('Error updating CO2 forecasts:', err);
    });
});