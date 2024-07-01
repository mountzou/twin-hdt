$(document).ready(function() {
    function initIonRangeSlider(selector, min, max, from, postfix) {
        $(selector).ionRangeSlider({
            type: "single",
            grid: true,
            min: min,
            max: max,
            from: from,
            postfix: postfix
        });
    }

    initIonRangeSlider("#indoor_temperature", 16, 26, 17, " °C");
    initIonRangeSlider("#indoor_humidity", 10, 100, 40, " %");
    initIonRangeSlider("#indoor_tvoc", 10, 100, 40, " %");
    initIonRangeSlider("#indoor_co2", 200, 2000, 300, " ppm");
    initIonRangeSlider("#indoor_pm25", 10, 100, 40, " μg/m³");
    initIonRangeSlider("#indoor_pm1", 10, 100, 40, " μg/m³");
    initIonRangeSlider("#indoor_pm10", 10, 100, 40, " μg/m³");
});


