let co2Values  = [];
let tvocValues = [];
let pm25Values = [];
let tempValues = [];
let rhumValues = [];
let timestamp  = [];

let co2_mean = 0;
let co2_std = 0;
let co2_diff = 0;

// Define threshold values for each pollutant (these values are examples)
const co2Threshold = 1000;    // e.g., 1000 ppm for CO2
const tvocThreshold = 500;    // e.g., 500 ppb for TVOC (or adjust accordingly)
const pm25Threshold = 35;     // e.g., 35 µg/m³ for PM2.5
const tempThreshold = 35;     // e.g., 35 µg/m³ for PM2.5
const rhumThreshold = 35;     // e.g., 35 µg/m³ for PM2.5

const POLLUTANT_UNITS = {
    CO2: 'ppm',     // Parts per million
    TVOC: null,       // Parts per billion
    PM25: 'µg/m³',   // Micrograms per cubic meter
    TEMP: '°C',
    RHUM: '%'
};

let chartCO2, chartTVOC, chartPM25, chartTemp, chartRHum;

fetch('/get_data_wb_device_latest', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        lastN: 20
    })
})
.then(response => {
    if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
    }
    return response.json();
})
.then(data => {
    let rawTimestamps = data.index.map(ts => new Date(ts));  // for calculations
    timestamp = data.index.map(formatDate);                  // for display

    // Extract attribute values using find() - cleaner and more explicit
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

    const pm25MaxValue = 50; // Example: cap PM2.5 at 50 µg/m³
    pm25Values = pm25Attribute
        ? pm25Attribute.values.map(value => Math.min(value, pm25MaxValue))
        : [];

    const tempMaxValue = 50; // Example: cap PM2.5 at 50 µg/m³
    tempValues = tempAttribute
        ? tempAttribute.values.map(value => Math.min(value, tempMaxValue))
        : [];

    const rhumMaxValue = 100; // Example: cap PM2.5 at 50 µg/m³
    rhumValues = rhumAttribute
        ? rhumAttribute.values.map(value => Math.min(value, rhumMaxValue))
        : [];

    if (co2Values.length > 0) {
      const win = co2Values.slice(-10);
      const latest = win[win.length - 1];

      const mean = win.reduce((a, b) => a + b, 0) / win.length;
      const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
      const std = Math.sqrt(variance);

      const band = Math.round(std * 2);
      document.getElementById("co2-pred-1").textContent =
        `${Math.round(latest)} ${POLLUTANT_UNITS.CO2} ± ${band} ${POLLUTANT_UNITS.CO2}`;
    }

    getCO2Prediction(co2Values, rawTimestamps);

    getPM25Prediction(pm25Values)
    .then(pred => {
        if (pred !== null) {
            console.log('Predicted PM2.5:', pred);
        } else {
            console.log('Prediction failed.');
        }
    });

    const chartStyles = {
        toolbar: styleToolbar,
        axis: styleAxis,
        ticks: styleTicks,
        stroke: styleStroke,
        marker: styleMarker
    };

    chartCO2  = initializeChart('CO2', co2Values, '#index-chart-co2', co2Threshold, timestamp, chartStyles, POLLUTANT_UNITS.CO2);
    chartTVOC = initializeChart('TVOC', tvocValues, '#index-chart-tvoc', tvocThreshold, timestamp, chartStyles, POLLUTANT_UNITS.TVOC);
    chartPM25 = initializeChart('PM2.5', pm25Values, '#index-chart-pm25', pm25Threshold, timestamp, chartStyles, POLLUTANT_UNITS.PM25);
    chartTemp = initializeChart('Temperature', tempValues, '#index-chart-temp', tempThreshold, timestamp, chartStyles, POLLUTANT_UNITS.TEMP);
    chartRHum = initializeChart('Relative Humidity', rhumValues, '#index-chart-rhum', rhumThreshold, timestamp, chartStyles, POLLUTANT_UNITS.RHUM);

    function showChartStatus(chartId, statusText) {
        const statusDiv = document.getElementById(chartId + '-status');
        const labelSpan = document.getElementById(chartId + '-status-label');
        if (statusDiv) statusDiv.style.display = 'flex';
        if (labelSpan) labelSpan.innerText = statusText;
    }

    showChartStatus('index-chart-co2', 'Good');
    showChartStatus('index-chart-pm25', 'Good');

})
.catch(error => {
    console.error('There is a problem with fetching historical data for pollutants:', error);
});

var socket = io();

socket.on('new_mqtt_message', function(data) {
    let message = data.message;

    let jsonStringStart = message.indexOf('{');
    let jsonString = message.substring(jsonStringStart);

    let sensorData = JSON.parse(jsonString);

    // Apply cap values for each parameter
    if (sensorData.co2 !== undefined) {
        co2Values.push(Math.min(sensorData.co2, 2000)); // Cap at 2000ppm
    }
    if (sensorData.tvoc !== undefined) {
        tvocValues.push(Math.min(sensorData.tvoc, 300)); // Cap at 300
    }
    if (sensorData.pm25 !== undefined) {
        pm25Values.push(Math.min(sensorData.pm25, 50)); // Cap at 50 µg/m³
    }
    if (sensorData.temperature !== undefined) {
        tempValues.push(Math.min(sensorData.temperature, 50)); // Cap at 50°C
    }
    if (sensorData.relativeHumidity !== undefined) {
        rhumValues.push(Math.min(sensorData.relativeHumidity, 100)); // Cap at 100%
    }
    if (sensorData.observationDateTime !== undefined) {
        timestamp.push(formatDate(sensorData.observationDateTime));
    }

    updateCharts();
});