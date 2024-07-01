import { generateLineChart, generateTimeLineChart } from '../charts.js';

function generateData(count, yrange) {
    return Array.from({ length: count }, (_, i) => ({
        x: (i + 1).toString(),
        y: Math.floor(Math.random() * ((Math.max(yrange.max, 0) - Math.max(yrange.min, 0)) + 1)) + Math.max(yrange.min, 0)
    }));
}

var optionsLineChartPM = generateLineChart([
    { name: 'PM1', data: generateData(24, { min: 0, max: 55 }) },
    { name: 'PM2.5', data: generateData(24, { min: 0, max: 55 }) },
    { name: 'PM10', data: generateData(24, { min: 0, max: 55 }) }
], 'Concentration of Particle Matters (PMs)', ['#D04848', '#FBA834', '#40679E'], 'Daily Concentration of PMs');
new ApexCharts(document.querySelector("#hourly-air-pollutants-pm"), optionsLineChartPM).render();

var optionsLineChartNOx = generateLineChart([
    { name: 'NOx', data: generateData(24, { min: 0, max: 100 }) }
], 'NOx Index', ['#FF4560'], '');
new ApexCharts(document.querySelector("#hourly-air-pollutants-nox"), optionsLineChartNOx).render();

var optionsLineChartVOCs = generateLineChart([
    { name: 'VOCs', data: generateData(24, { min: 0, max: 100 }) }
], 'VOCs Index', ['#00E396'], '');
new ApexCharts(document.querySelector("#hourly-air-pollutants-vocs"), optionsLineChartVOCs).render();