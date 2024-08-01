let co2Values = [];
let tvocValues = [];
let timestamp = [];

let chartCO2, chartTVOC;

function formatDate(dateString) {
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function initializeChart(pollutant, values, containerId) {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const options = {
        chart: {
            type: 'line',
            height: 350,
            animations: {
                enabled: false,
            },
            toolbar: styleToolbar
        },
        series: [{
            name: pollutant.toUpperCase(),
            data: values
        }],
        xaxis: {
            categories: timestamp,
            title: {
                text: 'Date',
                style: styleAxis
            },
            labels: {
                formatter: function(value) {
                    return value;
                },
                rotate: 0,
                style: styleTicks
            },
            tooltip: {
                enabled: false
            },
            tickAmount: 10
        },
        yaxis: {
            title: {
                text: `Concentration of ${pollutant.toUpperCase()}`,
                style: styleAxis
            },
            min: minValue,
            max: maxValue + 5,
            labels: {
                formatter: function(value) {
                    return `${value.toFixed(2)} ppm`;
                },
                style: styleTicks
            },
            tickAmount: 6,
        },
        stroke: styleStroke,
        markers: styleMarker,
        tooltip: {
            shared: true,
            intersect: false,
            fillSeriesColor: false,
        },
    };

    const chart = new ApexCharts(document.querySelector(containerId), options);
    chart.render();
    return chart;
}

fetch('/get_data_wb_device_latest', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(response => {
    if (!response.ok) {
        throw new Error('Network response was not ok ' + response.statusText);
    }
    return response.json();
})
.then(data => {
    timestamp = data.index.map(formatDate);

    data.attributes.forEach(attribute => {
        if (attribute.attrName === 'tvoc') {
            tvocValues = attribute.values;
        }
        if (attribute.attrName === 'co2') {
            co2Values = attribute.values;
        }
    });

    chartCO2 = initializeChart('CO2', co2Values, '#index-chart-co2');
    chartTVOC = initializeChart('TVOC', tvocValues, '#index-chart-tvoc');

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

    if (sensorData.co2 !== undefined) {
        co2Values.push(sensorData.co2);
    }
    if (sensorData.tvoc !== undefined) {
        tvocValues.push(sensorData.tvoc);
    }
    if (sensorData.observationDateTime !== undefined) {
        timestamp.push(formatDate(sensorData.observationDateTime));
    }

    updateCharts();
});

function updateCharts() {
    // Calculate min and max values for each dataset
    const co2MinValue = Math.min(...co2Values);
    const co2MaxValue = Math.max(...co2Values);

    const tvocMinValue = Math.min(...tvocValues);
    const tvocMaxValue = Math.max(...tvocValues);

    if (chartCO2) {
        chartCO2.updateSeries([
            {
                name: 'CO2',
                data: co2Values
            }
        ]);
        chartCO2.updateOptions({
            xaxis: {
                categories: timestamp,
                title: {
                    text: 'Date',
                    style: styleAxis
                },
                labels: {
                    formatter: function(value) {
                        return value;
                    },
                    rotate: 0,
                    style: styleTicks
                },
                tooltip: {
                    enabled: false
                },
                tickAmount: 10
            },
            yaxis: {
                title: {
                    text: 'Concentration of CO2',
                    style: styleAxis
                },
                min: co2MinValue,
                max: co2MaxValue + 5,
                labels: {
                    formatter: function(value) {
                        return `${value.toFixed(2)} ppm`;
                    },
                    style: styleTicks
                },
                tickAmount: 6,
            },
            stroke: styleStroke,
            markers: {
                size: 2
            },
            tooltip: {
                shared: true,
                intersect: false,
                fillSeriesColor: false,
            },
        });
    }

    if (chartTVOC) {
        chartTVOC.updateSeries([
            {
                name: 'TVOC',
                data: tvocValues
            }
        ]);
        chartTVOC.updateOptions({
            xaxis: {
                categories: timestamp,
                title: {
                    text: 'Date',
                    style: styleAxis
                },
                labels: {
                    formatter: function(value) {
                        return value;
                    },
                    rotate: 0,
                    style: styleTicks
                },
                tooltip: {
                    enabled: false
                },
                tickAmount: 10
            },
            yaxis: {
                title: {
                    text: 'Concentration of TVOC',
                    style: styleAxis
                },
                min: tvocMinValue,
                max: tvocMaxValue + 5,
                labels: {
                    formatter: function(value) {
                        return `${value.toFixed(2)} ppm`;
                    },
                    style: styleTicks
                },
                tickAmount: 6,
            },
            stroke: styleStroke,
            markers: {
                size: 2
            },
            tooltip: {
                shared: true,
                intersect: false,
                fillSeriesColor: false,
            },
        });
    }
}
