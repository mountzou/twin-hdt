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

    const sliders = [
        {selector: "#indoor_temp", min: 16, max: 26, from: 17, postfix: " °C"},
        {selector: "#indoor_hum", min: 10, max: 100, from: 40, postfix: " %"},
        {selector: "#indoor_tvoc", min: 10, max: 100, from: 40, postfix: " %"},
        {selector: "#indoor_co2", min: 200, max: 2000, from: 300, postfix: " ppm"},
        {selector: "#indoor_pm1", min: 10, max: 100, from: 40, postfix: " μg/m³"},
        {selector: "#indoor_pm25", min: 10, max: 100, from: 40, postfix: " μg/m³"},
        {selector: "#indoor_pm10", min: 10, max: 100, from: 40, postfix: " μg/m³"},
        {selector: "#indoor_nox", min: 10, max: 100, from: 40, postfix: " μg/m³"}
    ];

    sliders.forEach(slider => {
        initIonRangeSlider(slider.selector, slider.min, slider.max, slider.from, slider.postfix);
    });
});
