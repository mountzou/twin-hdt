// Get specific pollutant's name and units from the app.py route
var pollutantName = document.getElementById('air-pollutants-chart').getAttribute('data-pollutant');
var pollutantUnit = document.getElementById('air-pollutants-chart').getAttribute('data-unit');

function xAxisLabelStep(pointCount) {
    return Math.max(1, Math.floor(pointCount / 8));
}

function formatXAxisDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}-${month} ${hours}:${minutes}`;
}

function resolveCategoryTimestamp(val, opts, times) {
    const fromGlobals = opts?.w?.globals?.categoryLabels?.[opts.dataPointIndex];
    if (fromGlobals) {
        return fromGlobals;
    }
    if (typeof val === 'string' && (val.includes('T') || val.includes('-'))) {
        return val;
    }
    const index = Number(val);
    if (Number.isInteger(index) && index >= 0 && times[index]) {
        return times[index];
    }
    return null;
}

function buildTooltipOptions(times) {
    return {
        ...styleTooltip,
        x: {
            formatter: function (val, opts) {
                const timestamp = resolveCategoryTimestamp(val, opts, times);
                return timestamp ? formatXAxisDateLabel(timestamp) : '';
            }
        }
    };
}

function buildXAxisOptions(times) {
    const labelStep = xAxisLabelStep(times.length);

    return {
        categories: times,
        title: {
            show: false
        },
        labels: {
            show: true,
            rotate: 0,
            style: styleTicks,
            formatter: function (value) {
                const index = times.indexOf(value);
                if (index < 0 || index % labelStep !== 0) {
                    return '';
                }
                return formatXAxisDateLabel(value);
            }
        },
        axisTicks: {
            show: true,
            color: '#90A4AE',
            height: 8
        },
        axisBorder: {
            show: true,
            color: '#CFD8DC'
        },
        tooltip: {
            enabled: false
        },
        tickAmount: 10
    };
}

// A generic .js method to implement an apexChart line chart.
function initializeChart(times, values) {
    // Get the minimum and maximum value of a pollutant
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    // Set the configuration options of the apexChart line chart.
    var options = {
        chart: {
            type: 'line',
            height: 550,
            animations: {
                enabled: false,
            },
            toolbar: styleToolbar,
        },
        series: [{
            name: pollutantName,
            data: values
        }],
        xaxis: buildXAxisOptions(times),
        yaxis: {
            title: {
                text: `Concentration of ${pollutantName.toUpperCase()}`,
                style: styleAxis
            },
            min: minValue,
            max: maxValue,
            labels: {
                formatter: function (value) {
                    return `${value.toFixed(2)} ${pollutantUnit}`;
                },
                style: styleTicks
            },
            tickAmount: 6,
        },
        tooltip: buildTooltipOptions(times),
        stroke: styleStroke,
        markers: styleMarker,
    };

    window.chart = new ApexCharts(document.querySelector("#air-pollutants-chart"), options);
    window.chart.render();
}

$(document).ready(function () {
    let chartInitialized = false;

    // Calculate the default date range: from previous day 00:00 to previous day 23:00
    const now = new Date();

    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(now.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(now);
    endOfYesterday.setDate(now.getDate() - 1);
    endOfYesterday.setHours(23, 0, 0, 0);

    // Initialize Flatpickr for datetime range picker
    const datePicker = flatpickr("#date-picker", {
        mode: "range",
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        defaultDate: [startOfYesterday, endOfYesterday]
    });

    $('#sensor-data-form').on('submit', function (event) {
        event.preventDefault();

        const fromDate = datePicker.selectedDates[0].toISOString();
        const toDate = datePicker.selectedDates[1].toISOString();
        const attrs = pollutantName;
        const type = $('#type').val();
        const aggrMethod = $('#aggrMethod').val();
        const aggrPeriod = $('#aggrPeriod').val();
        const sensorID = $('#sensor-id').val();

        const params = {
            type: type,
            fromDate: fromDate,
            toDate: toDate,
            attrs: attrs,
            aggrPeriod: aggrPeriod,
            aggrMethod: aggrMethod,
            sensorID: sensorID
        };

        $.ajax({
            url: '/get_pollutants_historical_data',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(params),
            success: function (response) {
                console.log('Response:', response);

                const times = response.index;
                const values = response.attributes[0].values;

                $('#air-pollutants-chart').show();
                $('#waiting-message').hide();

                if (!chartInitialized) {
                    initializeChart(times, values);
                    chartInitialized = true;
                } else {
                    const minValue = Math.min(...values);
                    const maxValue = Math.max(...values);

                    window.chart.updateOptions({
                        xaxis: buildXAxisOptions(times),
                        tooltip: buildTooltipOptions(times),
                        series: [{
                            name: pollutantName,
                            data: values
                        }],
                        yaxis: {
                            title: {
                                text: `Concentration of ${pollutantName.toUpperCase()}`,
                                style: styleAxis
                            },
                            min: minValue,
                            max: maxValue,
                            labels: {
                                formatter: function (value) {
                                    return `${value.toFixed(2)} ${pollutantUnit}`;
                                },
                                style: styleTicks
                            },
                            tickAmount: 6,
                        },
                    });
                }
            },
            error: function (error) {
                console.error('Error:', error);
            }
        });
    });
});