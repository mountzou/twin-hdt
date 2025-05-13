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
function initializeChart(pollutant, values, containerId, threshold, timestamps, styles, unit = null) {
    const minValue = Math.min(...values) - 0.1 * Math.min(...values);
    const maxValue = Math.max(...values) + 0.1 * Math.max(...values);

    // Create y-axis title based on whether a unit is provided
    const yAxisTitle = unit
        ? `${pollutant} (${unit})`
        : `${pollutant} Index`;

    // Create formatter function based on whether a unit is provided
    const valueFormatter = unit
        ? value => `${value.toFixed(2)} ${unit}`
        : value => value.toFixed(2);

    const options = {
        chart: {
            type: 'line',
            height: 350,
            animations: {
                enabled: false,
            },
            toolbar: styles.toolbar
        },
        series: [{
            name: pollutant,
            data: values
        }],
        xaxis: {
            categories: timestamps,
            title: {
                text: 'Date',
                style: styles.axis
            },
            labels: {
                formatter: function(value) {
                    return value;
                },
                rotate: 0,
                style: styles.ticks
            },
            tooltip: {
                enabled: false
            },
            tickAmount: 10,
        },
        yaxis: {
            title: {
                text: yAxisTitle,
                style: styles.axis
            },
            min: minValue,
            max: maxValue,
            labels: {
                formatter: valueFormatter,
                style: styles.ticks
            },
            tickAmount: 5,
        },
        stroke: styles.stroke,
        markers: styles.marker,
        tooltip: {
            shared: true,
            intersect: false,
            fillSeriesColor: false,
            y: {
                formatter: valueFormatter
            }
        },
    };

    const chart = new ApexCharts(document.querySelector(containerId), options);
    chart.render();
    return chart;
}

/**
 * Updates a specific chart with new data and options
 * @param {ApexCharts} chart - The chart to update
 * @param {string} name - Name of the data series
 * @param {number[]} values - Data values array
 * @param {string[]} timestamps - Formatted timestamps for x-axis
 * @param {number} threshold - Threshold value for annotations
 * @param {Object} styles - Chart styling options
 * @param {string|null} unit - Unit for measurement or null for index
 */
function updateChart(chart, name, values, timestamps, threshold, styles, unit = null) {
    if (!chart) return;

    // Calculate min and max values
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    // Create formatter function based on whether a unit is provided
    const valueFormatter = unit
        ? value => `${value.toFixed(2)} ${unit}`
        : value => value.toFixed(2);

    // Create title based on whether it's an index or has units
    const title = unit
        ? `${name} (${unit})`
        : `${name} Index`;

    chart.updateSeries([{
        name: name,
        data: values
    }]);

    chart.updateOptions({
        xaxis: {
            categories: timestamps,
            title: {
                text: 'Date',
                style: styles.axis
            },
            labels: {
                formatter: function(value) {
                    return value;
                },
                rotate: 0,
                style: styles.ticks
            },
            tooltip: {
                enabled: false
            },
            tickAmount: 10
        },
        yaxis: {
            title: {
                text: title,
                style: styles.axis
            },
            min: minValue,
            max: maxValue + 5,
            labels: {
                formatter: valueFormatter,
                style: styles.ticks
            },
            tickAmount: 6,
        },
        stroke: styles.stroke,
        markers: {
            size: 2
        },
        tooltip: {
            shared: true,
            intersect: false,
            fillSeriesColor: false,
            y: {
                formatter: valueFormatter
            }
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

/**
 * Updates all environmental parameter charts
 */
function updateCharts() {
    // Define all charts to update
    const chartData = [
        {
            chart: chartCO2,
            name: 'CO2',
            values: co2Values,
            threshold: co2Threshold,
            unit: POLLUTANT_UNITS.CO2
        },
        {
            chart: chartTVOC,
            name: 'TVOC',
            values: tvocValues,
            threshold: tvocThreshold,
            unit: POLLUTANT_UNITS.TVOC
        },
        {
            chart: chartPM25,
            name: 'PM2.5',
            values: pm25Values,
            threshold: pm25Threshold,
            unit: POLLUTANT_UNITS.PM25
        },
        {
            chart: chartTemp,
            name: 'Temperature',
            values: tempValues,
            threshold: tempThreshold,
            unit: POLLUTANT_UNITS.TEMP
        },
        {
            chart: chartRHum,
            name: 'Relative Humidity',
            values: rhumValues,
            threshold: rhumThreshold,
            unit: POLLUTANT_UNITS.RHUM
        }
    ];

    // Get chart styles
    const chartStyles = {
        toolbar: styleToolbar,
        axis: styleAxis,
        ticks: styleTicks,
        stroke: styleStroke,
        marker: styleMarker
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
            data.unit
        );
    });
}