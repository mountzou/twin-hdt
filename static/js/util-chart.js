function getChartValueFormatter(unit) {
    return unit
        ? value => `${value.toFixed(1)} ${unit}`
        : value => value.toFixed(1);
}

function getChartBounds(values, cfdValues, fallbackValue = 0) {
    const baselineValues = Array.isArray(values) ? values : [];
    const comparisonValues = Array.isArray(cfdValues) ? cfdValues : [];
    const allValues = baselineValues.concat(comparisonValues).filter(Number.isFinite);
    const seed = allValues.length > 0 ? allValues : [fallbackValue];

    const minVal = Math.min(...seed);
    const maxVal = Math.max(...seed);

    return {
        min: minVal - 0.1 * Math.abs(minVal),
        max: maxVal + 0.1 * Math.abs(maxVal)
    };
}

function buildChartSeries(config, values, cfdValues) {
    const series = [
        {
            name: `${config.label} (Sensor)`,
            data: values
        }
    ];

    if (config.cfdKey && Array.isArray(cfdValues) && cfdValues.length > 0) {
        series.push({
            name: `${config.label} (CFD Baseline)`,
            data: cfdValues
        });
    }

    return series;
}

function buildChartOptions(config, values, timestamps, styles, cfdValues, tickAmount) {
    const bounds = getChartBounds(values, cfdValues, config.threshold);
    const valueFormatter = getChartValueFormatter(config.unit);
    const yAxisTitle = config.unit ? `${config.label} (${config.unit})` : config.label;

    return {
        series: buildChartSeries(config, values, cfdValues),
        colors: ['#206bc4', '#ee9b00'],
        xaxis: {
            categories: timestamps,
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
                y: config.threshold,
                borderColor: 'red',
                label: {
                    borderColor: 'red',
                    style: { color: '#fff', background: 'red' },
                    text: 'Upper Acceptable Threshold'
                }
            }]
        }
    };
}

function initializeChart(config, values, timestamps, styles, cfdValues = []) {
    const container = document.querySelector(config.containerId);
    if (!container) return null;

    const options = buildChartOptions(
        config,
        values,
        timestamps,
        styles,
        cfdValues,
        8
    );

    options.chart = {
        type: 'line',
        height: 350,
        animations: { enabled: false },
        toolbar: styles.toolbar
    };
    options.legend = {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        floating: false,
        offsetY: 65,
        offsetX: 85,
        fontSize: '12px',
        fontFamily: 'Nunito Sans',
        fontWeight: 500,
    };

    const chart = new ApexCharts(container, options);
    chart.render();
    return chart;
}

function updateChart(chart, config, values, timestamps, styles, cfdValues = []) {
    if (!chart) return;

    const options = buildChartOptions(
        config,
        values,
        timestamps,
        styles,
        cfdValues,
        9
    );

    chart.updateSeries(options.series);
    chart.updateOptions({
        xaxis: options.xaxis,
        yaxis: options.yaxis,
        stroke: options.stroke,
        markers: options.markers,
        tooltip: options.tooltip,
        annotations: options.annotations
    });
}

function initializeCharts(configs, chartInstances, seriesState, timestamps, styles, cfdState = {}) {
    configs.forEach(config => {
        chartInstances[config.key] = initializeChart(
            config,
            seriesState[config.key] || [],
            timestamps,
            styles,
            config.cfdKey ? (cfdState[config.cfdKey] || []) : []
        );
    });
}

function updateCharts(configs, chartInstances, seriesState, timestamps, styles, cfdState = {}) {
    configs.forEach(config => {
        updateChart(
            chartInstances[config.key],
            config,
            seriesState[config.key] || [],
            timestamps,
            styles,
            config.cfdKey ? (cfdState[config.cfdKey] || []) : []
        );
    });
}
