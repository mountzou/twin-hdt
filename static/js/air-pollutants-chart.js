// Get specific pollutant's name and units from the app.py route
var pollutantName = document.getElementById('air-pollutants-chart').getAttribute('data-pollutant');
var pollutantUnit = document.getElementById('air-pollutants-chart').getAttribute('data-unit');

// A generic .js method to implement an apexChart line chart.
function initializeChart(times, values) {
    // Get the minimum and maximum value of a pollutant
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    // Decide how many labels we want on the x-axis (e.g. ~8 visible labels)
    const labelStep = Math.max(1, Math.floor(times.length / 8));

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
        xaxis: {
            categories: times,
            title: {
                text: 'Date & Time',
                style: styleAxis
            },
            labels: {
                // value = category (ISO string or timestamp), index = position in categories
                formatter: function (value, timestamp, index) {
                    // hide most labels, keep only every labelStep-th
                    if (index % labelStep !== 0) {
                        return '';
                    }
                    const date = new Date(value);
                    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                },
                rotate: 0,
                style: styleTicks
            },
            tooltip: {
                enabled: false
            },
            // tickAmount is now more of a hint; labels formatter controls visibility
            tickAmount: 10
        },
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
        tooltip: styleTooltip,
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

                    // recompute labelStep for the new number of points
                    const labelStep = Math.max(1, Math.floor(times.length / 8));

                    window.chart.updateOptions({
                        xaxis: {
                            categories: times,
                            labels: {
                                formatter: function (value, timestamp, index) {
                                    if (index % labelStep !== 0) {
                                        return '';
                                    }
                                    const date = new Date(value);
                                    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                                },
                                style: styleTicks
                            },
                            tickAmount: 10
                        },
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