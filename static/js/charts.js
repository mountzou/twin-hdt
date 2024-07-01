export function generateLineChart(seriesData, yAxisTitle, colors, chartTitle, formatterSuffix = ' μg/m³') {

    const axisStyle = {
        fontSize: '14px',
        fontFamily: 'Nunito Sans, sans-serif',
        fontWeight: 600,
        offsetX: 20
    };

    const titleStyle = {
        fontSize: '16px',
        fontFamily: 'Nunito Sans, sans-serif',
        fontWeight: 700,
        color: '#263238',
    };

    return {
        series: seriesData,
        chart: {
            height: 450,
            type: 'line',
            toolbar: {
                show: false
            },
            animations: {
                enabled: false
            },
            title: {
                text: chartTitle,
                align: 'center',
                style: titleStyle,
            },
        },
        xaxis: {
            type: 'category',
            labels: {
                formatter: function(val) {
                    return val + ':00';
                }
            },
            title: {
                text: 'Time',
                style: axisStyle,
            },
            tickAmount: 6
        },
        yaxis: {
            labels: {
                formatter: function(val) {
                    return val + formatterSuffix;
                },
            },
            title: {
                text: yAxisTitle,
                rotate: -90,
                style: axisStyle,
            },
            tickAmount: 6
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            width: 1.5
        },
        legend: {
            position: 'top',
            horizontalAlign: 'center'
        },
        colors: colors
    };
}

export function generateTimeLineChart(seriesData, chartTitle) {

    const axisStyle = {
        fontSize: '14px',
        fontFamily: 'Nunito Sans, sans-serif',
        fontWeight: 600,
    };

    const titleStyle = {
        fontSize: '16px',
        fontFamily: 'Nunito Sans, sans-serif',
        fontWeight: 700,
        color: '#263238',
    };

    return {
        series: seriesData,
        chart: {
            height: 450,
            toolbar: {
                show: false
            },
            type: 'rangeBar'
        },
        plotOptions: {
            bar: {
                horizontal: true,
                barHeight: '80%'
            }
        },
        title: {
            text: chartTitle,
            align: 'center',
            style: titleStyle,
        },
        xaxis: {
            type: 'datetime'
        },
        yaxis: {
            title: {
                text: 'Room',
                rotate: -90,
                style: axisStyle,
                offsetX: 10,
            },
            style: axisStyle,
            tickAmount: 6
        },
        stroke: {
            width: 0
        },
        fill: {
            type: 'solid',
            opacity: 0.5
        },
        legend: {
            position: 'top',
            horizontalAlign: 'left'
        }
    };
}