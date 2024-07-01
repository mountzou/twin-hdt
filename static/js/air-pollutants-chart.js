// Get pollutant's name and unit from the app.py route
var pollutantName = document.getElementById('air-pollutants-chart').getAttribute('data-pollutant');
var pollutantUnit = document.getElementById('air-pollutants-chart').getAttribute('data-unit');

function initializeChart(times, values) {
    // Get the minimum and maximum value of a pollutant
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    var options = {
        chart: {
            type: 'line',
            height: 450,
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
                text: 'Date',
                style: styleAxis
            },
            labels: {
                formatter: function(value, timestamp) {
                    const date = new Date(value);
                    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                },
                rotate: 0,
                style: styleTicks
            },
            tooltip: {
              enabled: false
            },
            tickAmount: 10
        },
        stroke: {
            curve: 'smooth',
            width: 2,
            dashArray: 10,
            lineCap: 10,
        },
        markers: {
            size: 2
        },
        yaxis: {
            title: {
                text: `Concentration of ${pollutantName.toUpperCase()}`,
                style: styleAxis
            },
            min: 0,
            max: maxValue + 5,
            labels: {
                formatter: function(value) {
                    return `${value.toFixed(2)} ${pollutantUnit}`;
                },
                style: styleTicks
            },
            tickAmount: 6,
        },
        tooltip: styleTooltip,
        annotations: {
            yaxis: [{
                y: 1000,
                borderColor: '#2F3645',
                label: {
                    borderColor: '#2F3645',
                    style: {
                        color: '#ffffff',
                        background: 'rgba(47, 54, 69, 0.15)'
                    },
                    text: 'Good conditions'
                }
            }]
        }
    };

    window.chart = new ApexCharts(document.querySelector("#air-pollutants-chart"), options);
    window.chart.render();
}

$(document).ready(function() {
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

    $('#sensor-data-form').on('submit', function(event) {
        event.preventDefault();

        const sensor_id = 'urn:ngsi-ld:hwsensors:16869';
        const attrs = 'airTemperature';

        const selectedDates = datePicker.selectedDates;
        if (selectedDates.length === 2) {
            const from_date = selectedDates[0].toISOString();
            const to_date = selectedDates[1].toISOString();

            const sensor_type = $('#sensor-type').val();
            const aggregation_method = $('#aggregation-method').val();
            const aggregation_period = $('#aggregation-period').val();
            const limit = $('#limit').val();

            const params = {
                sensor_id: sensor_id,
                sensor_type: sensor_type,
                from_date: from_date,
                to_date: to_date,
                limit: limit,
                attrs: pollutantName,
                aggr_period: aggregation_period,
                aggr_method: aggregation_method,
            };

            $.ajax({
                url: '/get_pollutants_historical_data',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(params),
                success: function(response) {
                    console.log('Response:', response);

                    const times = response.index.map(timestamp => {
                        return new Date(timestamp).getTime();
                    });
                    const values = response.attributes[0].values;

                    console.log('Times:', times);
                    console.log('Values:', values);

                    $('#air-pollutants-chart').show();
                    $('#waiting-message').hide();

                    if (!chartInitialized) {
                        initializeChart(times, values);
                        chartInitialized = true;
                    } else {
                        window.chart.updateOptions({
                            xaxis: {
                                categories: times,
                                title: {
                                    text: 'Date',
                                },
                                labels: {
                                    formatter: function(value, timestamp) {
                                        const date = new Date(value);
                                        return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                                    },
                                    rotate: 0
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
                                    style: {
                                        fontSize: '14px',
                                        fontFamily: 'Nunito Sans, sans-serif',
                                        fontWeight: 600,
                                        offsetX: 30
                                    }
                                },
                                min: Math.min(...values) - 5,
                                max: Math.max(...values) + 5,
                                labels: {
                                    formatter: function(value) {
                                        return `${value.toFixed(2)} ppm`;
                                    }
                                },
                                tickAmount: 6,
                            },
                        });
                    }
                },
                error: function(error) {
                    console.error('Error:', error);
                }
            });

            console.log('Form submitted with params:', params);
        } else {
            alert("Please select a valid date range.");
        }
    });
});
