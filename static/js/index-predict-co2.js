/**
 * CO2 Forecast Module - Handles CO2 prediction functionality
 */

/**
 * Calculates statistics needed for CO2 prediction
 * @param {number[]} co2Values - Array of CO2 values
 * @param {Date[]} timestamps - Array of timestamps as Date objects
 * @returns {Object} Statistics object for prediction
 */
function calculateCO2Statistics(co2Values, timestamps) {
    // Return early if no data
    if (!co2Values.length) {
        return {
            co2_mean: 0,
            co2_std: 0,
            co2_diff: 0,
            co2_latest: null
        };
    }

    // Calculate difference between last two values directly
    const co2_diff = co2Values.length >= 2
        ? parseFloat((co2Values[co2Values.length - 1] - co2Values[co2Values.length - 2]).toFixed(2))
        : 0;

    // Get latest CO2 value
    const co2_latest = co2Values[co2Values.length - 1];

    // Get values from the last 15 minutes - optimized implementation
    let co2RecentValues = [];

    if (timestamps.length > 0) {
        const latestTimestamp = timestamps[timestamps.length - 1];
        const fifteenMinutesAgo = new Date(latestTimestamp.getTime() - 15 * 60 * 1000);

        // Start from the end and work backwards to find the cutoff point
        // This is more efficient for time-ordered data where we mostly care about recent values
        let i = timestamps.length - 1;
        while (i >= 0 && timestamps[i] >= fifteenMinutesAgo) {
            co2RecentValues.unshift(co2Values[i]); // Add to the beginning of our array
            i--;
        }
    }

    // Calculate statistics on recent values
    let co2_15min_mean = 0;
    let co2_15min_std = 0;

    if (co2RecentValues.length > 0) {
        // Calculate mean
        const sum = co2RecentValues.reduce((acc, val) => acc + val, 0);
        co2_15min_mean = parseFloat((sum / co2RecentValues.length).toFixed(2));

        // Calculate standard deviation
        if (co2RecentValues.length > 1) {
            const squaredDiffs = co2RecentValues.map(val => Math.pow(val - co2_15min_mean, 2));
            const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / co2RecentValues.length;
            co2_15min_std = parseFloat(Math.sqrt(avgSquaredDiff).toFixed(2));
        }
    }

    return {
        co2_mean: co2_15min_mean,
        co2_std: co2_15min_std,
        co2_diff: co2_diff,
        co2_latest: co2_latest
    };
}

/**
 * Fetches CO2 prediction from the server
 * @param {Object} statistics - CO2 statistics object
 * @returns {Promise} Promise resolving to prediction result
 */
function predictCO2(statistics) {
    return fetch('/predict_co2/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(statistics)
    })
    .then(response => response.json())
    .then(data => {
        return data.predicted_co2;
    });
}

/**
 * Updates the CO2 prediction display element
 * @param {number|null} predictedValue - The predicted CO2 value
 * @param {string} elementId - ID of the element to update (default: 'co2-pred')
 */
function updateCO2PredictionDisplay(predictedValue, elementId = 'co2-pred') {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (predictedValue !== undefined && !isNaN(predictedValue)) {
        element.textContent = `${predictedValue.toFixed(2)} +/- 40.19 ppm`;
    } else {
        element.textContent = 'Prediction unavailable';
    }
}

/**
 * Complete forecast process - calculate statistics, get prediction, update display
 * @param {number[]} co2Values - Array of CO2 values
 * @param {Date[]} timestamps - Array of timestamps
 * @param {string} elementId - ID of element to update with prediction
 * @returns {Promise} Promise resolving after the forecast process is complete
 */
function processCO2Forecast(co2Values, timestamps, elementId = 'co2-pred') {
    // Calculate statistics
    const statistics = calculateCO2Statistics(co2Values, timestamps);

    // Log statistics for debugging
    console.log('CO2 Mean (Last 15 min):', statistics.co2_mean);
    console.log('CO2 STD (Last 15 min):', statistics.co2_std);

    // Get and display prediction
    return predictCO2(statistics)
        .then(predictedValue => {
            updateCO2PredictionDisplay(predictedValue, elementId);
            return predictedValue;
        })
        .catch(error => {
            console.error('Error in CO2 prediction:', error);
            updateCO2PredictionDisplay(null, elementId);
            return null;
        });
}