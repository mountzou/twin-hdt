// Initialize arrays for air pollutants and climatic conditions
let co2Values  = [];
let tvocValues = [];
let pm25Values = [];
let tempValues = [];
let rhumValues = [];
let timestamp  = [];

let co2_mean = 0;
let co2_std  = 0;
let co2_diff = 0;

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
    timestamp = data.index.map(formatDate).slice(0, -1);;

    // Get the latest 10 values for each pollutant and climatic condition
    const tvocAttribute = data.attributes.find(attr => attr.attrName === 'tvoc');
    const co2Attribute  = data.attributes.find(attr => attr.attrName === 'co2');
    const pm25Attribute = data.attributes.find(attr => attr.attrName === 'pm25');
    const tempAttribute = data.attributes.find(attr => attr.attrName === 'temperature');
    const rhumAttribute = data.attributes.find(attr => attr.attrName === 'relativeHumidity');

    // Cap CO2 values at 2000ppm
    const co2MaxValue = 2000;
    co2Values = co2Attribute
        ? co2Attribute.values.map(value => Math.min(value, co2MaxValue))
        : [];

    // Cap TVOC values at 300ppb
    const tvocMaxValue = 300;
    tvocValues = tvocAttribute
        ? tvocAttribute.values.map(value => Math.min(value, tvocMaxValue))
        : [];

    // Cap PM2.5 values
    const pm25MaxValue = 50;
    pm25Values = pm25Attribute
        ? pm25Attribute.values.map(value => Math.min(value, pm25MaxValue))
        : [];

    // Cap Temperature
    const tempMaxValue = 50;
    tempValues = tempAttribute
        ? tempAttribute.values.map(value => Math.min(value, tempMaxValue))
        : [];

    // Cap Relative Humidity
    const rhumMaxValue = 100;
    rhumValues = rhumAttribute
        ? rhumAttribute.values.map(value => Math.min(value, rhumMaxValue))
        : [];

    // Drop the latest value from all pollutant arrays
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

    chartCO2  = initializeChart('CO2',               co2Values,  '#index-chart-co2',  co2Threshold,  timestamp, chartStyles, POLLUTANT_UNITS.CO2);
    chartTVOC = initializeChart('TVOC',              tvocValues, '#index-chart-tvoc', tvocThreshold, timestamp, chartStyles, POLLUTANT_UNITS.TVOC);
    chartPM25 = initializeChart('PM2.5',             pm25Values, '#index-chart-pm25', pm25Threshold, timestamp, chartStyles, POLLUTANT_UNITS.PM25);
    chartTemp = initializeChart('Temperature',       tempValues, '#index-chart-temp', tempThreshold, timestamp, chartStyles, POLLUTANT_UNITS.TEMP);
    chartRHum = initializeChart('Relative Humidity', rhumValues, '#index-chart-rhum', rhumThreshold, timestamp, chartStyles, POLLUTANT_UNITS.RHUM);

    // ---------- IAQ SIDE PANELS (PER POLLUTANT, 1h + 8h) ----------

    function capitalizeLabel(label) {
        if (!label) return "";
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    /**
     * Render a single pollutant block into a given panel.
     * Example: panel "index-chart-co2-status" → only CO₂ (1h & 8h).
     */
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
        const v1Text = formatVal(v1h);
        const v8Text = formatVal(v8h);

        // Grab elements inside this panel
        const block1h = panel.querySelector(".iaq-1h");
        const block8h = panel.querySelector(".iaq-8h");

        if (block1h) {
            const dot1 = block1h.querySelector(".status-dot");
            const name1 = block1h.querySelector(".iaq-display-name");
            const labelEl1 = block1h.querySelector(".iaq-label");
            const valueEl1 = block1h.querySelector(".iaq-value");

            if (dot1)  dot1.className = `status-dot ${dotClass}`;
            if (name1) name1.textContent = displayName;
            if (labelEl1) labelEl1.textContent = label1h;
            if (valueEl1) valueEl1.textContent = v1Text;
        }

        if (block8h) {
            const dot8 = block8h.querySelector(".status-dot");
            const name8 = block8h.querySelector(".iaq-display-name");
            const labelEl8 = block8h.querySelector(".iaq-label");
            const valueEl8 = block8h.querySelector(".iaq-value");

            if (dot8)  dot8.className = `status-dot ${dotClass}`;
            if (name8) name8.textContent = displayName;
            if (labelEl8) labelEl8.textContent = label8h;
            if (valueEl8) valueEl8.textContent = v8Text;
        }
    }

    /**
     * Fetch IAQ once and update all panels:
     * - CO₂ panel (next to CO₂ chart)
     * - PM2.5 panel (next to PM2.5 chart)
     * - TVOC panel (next to TVOC chart)
     */
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

    // Populate all IAQ side panels once on load
    updateAllIaqPanels();

})
    .catch(error => {
    console.error('There is a problem with fetching historical data for pollutants:', error);
});

var socket = io();

socket.on('new_mqtt_message', function(data) {
    let message = data.message;

    console.log('Received MQTT message:', data);

    let jsonStringStart = message.indexOf('{');
    let jsonString = message.substring(jsonStringStart);

    let sensorData = JSON.parse(jsonString);

    // Add value with capping, then remove oldest if length > MAX_POINTS
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

    console.log(timestamp);

    updateCharts();
});