/**
 * Initializes a line chart for a pollutant
 * @param {string} pollutant - The name of the pollutant (e.g., 'CO2')
 * @param {number[]} values - Array of pollutant values
 * @param {string} containerId - DOM selector for chart container
 * @param {number} threshold - Threshold value for pollutant
 * @param {string[]} timestamps - Array of formatted timestamp labels
 * @param {Object} styles - Chart styling options
 * @param {string|null} unit - Unit of measurement (e.g., 'ppm', 'ppb', 'µg/m³') or null if no unit
 * @returns {ApexCharts} The initialized chart object
 */
function initializeChart(pollutant, values, containerId, threshold, timestamps, styles, unit = null, cfdValues=null) {
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);

    if (cfdValues && Array.isArray(cfdValues) && cfdValues.length > 0) {
        minVal = Math.min(minVal, ...cfdValues);
        maxVal = Math.max(maxVal, ...cfdValues);
    }

    const minValue = minVal - 0.1 * Math.abs(minVal);
    const maxValue = maxVal + 0.1 * Math.abs(maxVal);

    const yAxisTitle = unit ? `${pollutant} (${unit})` : `${pollutant}`;

    const valueFormatter = unit
        ? value => `${value.toFixed(1)} ${unit}`
        : value => value.toFixed(1);

    const series = [
        {
            name: `Actual ${pollutant}`,
            data: values
        }
    ];

    if (cfdValues && Array.isArray(cfdValues) && cfdValues.length > 0) {
        series.push({
            name: `Estimated inhaled ${pollutant} (Human CFD)`,
            data: cfdValues
        });
    }

    const options = {
        chart: {
            type: 'line',
            height: 350,
            animations: { enabled: false },
            toolbar: styles.toolbar
        },
        series: series,
        colors: ['#206bc4', '#ee9b00'],  // sensor, CFD (or keep your palette)
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'left',
            floating: false,
            offsetY: 65,
            offsetX: 85,
            fontSize: '12px',
            fontFamily: 'Nunito Sans',
            fontWeight: 500,
        },
        xaxis: {
            categories: timestamps,
            title: { text: '', style: styles.axis },
            labels: {
                formatter: value => value,
                rotate: 0,
                style: styles.ticks
            },
            tooltip: { enabled: false },
            tickAmount: 8,
        },
        yaxis: {
            title: { text: yAxisTitle, style: styles.axis },
            min: minValue,
            max: maxValue,
            labels: { formatter: valueFormatter, style: styles.ticks },
            tickAmount: 5,
        },
        stroke: styles.stroke,
        markers: styles.marker,
        tooltip: {
            shared: true,
            intersect: false,
            fillSeriesColor: false,
            y: { formatter: valueFormatter }
        },
    };

    const chart = new ApexCharts(document.querySelector(containerId), options);
    chart.render();
    return chart;
}

/**
 * Updates a specific chart with new data and options
 * @param {ApexCharts} chart - The chart to update
 * @param {string} name - Name of the data series (pollutant)
 * @param {number[]} values - Sensor values
 * @param {string[]} timestamps - X-axis labels
 * @param {number} threshold - Threshold value for annotations
 * @param {Object} styles - Chart styling options
 * @param {string|null} unit - Unit for measurement or null for index
 * @param {number[]|null} cfdValues - Optional CFD baseline values
 */
function updateChart(chart, name, values, timestamps, threshold, styles, unit = null, cfdValues = null) {
    if (!chart) return;

    // Base min/max from sensor values
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);

    // Extend min/max if CFD baseline is present
    if (cfdValues && Array.isArray(cfdValues) && cfdValues.length > 0) {
        minVal = Math.min(minVal, ...cfdValues);
        maxVal = Math.max(maxVal, ...cfdValues);
    }

    const yMin = minVal - 0.1 * Math.abs(minVal);
    const yMax = maxVal + 0.1 * Math.abs(maxVal);

    const valueFormatter = unit
        ? value => `${value.toFixed(1)} ${unit}`
        : value => value.toFixed(1);

    const title = unit ? `${name} (${unit})` : `${name} Index`;

    // Build series: sensor + optional CFD
    const series = [
        {
            name: `${name} (Sensor)`,
            data: values
        }
    ];

    if (cfdValues && Array.isArray(cfdValues) && cfdValues.length > 0) {
        series.push({
            name: `${name} (CFD Baseline)`,
            data: cfdValues
        });
    }

    chart.updateSeries(series);

    chart.updateOptions({
        xaxis: {
            categories: timestamps,
            title: { text: '', style: styles.axis },
            labels: { formatter: v => v, rotate: 0, style: styles.ticks },
            tooltip: { enabled: false },
            tickAmount: 9,
        },
        yaxis: {
            title: { text: title, style: styles.axis },
            min: yMin,
            max: yMax,
            labels: { formatter: valueFormatter, style: styles.ticks },
            tickAmount: 5,
        },
        stroke: styles.stroke,
        markers: styles.marker,
        tooltip: {
            shared: true,
            intersect: false,
            fillSeriesColor: false,
            y: { formatter: valueFormatter }
        },
        annotations: {
            yaxis: [{
                y: threshold,
                borderColor: 'red',
                label: {
                    borderColor: 'red',
                    style: { color: '#fff', background: 'red' },
                    text: 'Upper Acceptable Threshold'
                }
            }]
        }
    });
}

function updateCharts() {
    // Define all charts to update
    const chartData = [
        {
            chart: chartCO2,
            name: 'CO2',
            values: co2Values,
            threshold: co2Threshold,
            unit: POLLUTANT_UNITS.CO2,
            cfdValues: co2CFDValues
        },
        {
            chart: chartTVOC,
            name: 'TVOC',
            values: tvocValues,
            threshold: tvocThreshold,
            unit: POLLUTANT_UNITS.TVOC,
            cfdValues: null
        },
        {
            chart: chartPM25,
            name: 'PM2.5',
            values: pm25Values,
            threshold: pm25Threshold,
            unit: POLLUTANT_UNITS.PM25,
            cfdValues: pm25CFDValues
        },
        {
            chart: chartTemp,
            name: 'Temperature',
            values: tempValues,
            threshold: tempThreshold,
            unit: POLLUTANT_UNITS.TEMP,
            cfdValues: null
        },
        {
            chart: chartRHum,
            name: 'Relative Humidity',
            values: rhumValues,
            threshold: rhumThreshold,
            unit: POLLUTANT_UNITS.RHUM,
            cfdValues: null
        }
    ];

    // Get chart styles
    const chartStyles = {
        toolbar: styleToolbar,
        axis:    styleAxis,
        ticks:   styleTicks,
        stroke:  styleStroke,
        marker:  styleMarker,
    };

    // Update each chart
    chartData.forEach(data => {
        updateChart(
            data.chart,
            data.name,
            data.values,
            timestamp,
            data.threshold,
            chartStyles,
            data.unit,
            data.cfdValues
        );
    });
}