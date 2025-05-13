// Create a new file: static/js/util-statistics.js

/**
 * Calculates the mean (average) of an array of values
 * @param {number[]} values - Array of numeric values
 * @returns {number} The mean value
 */
function calculateMean(values) {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
}

/**
 * Calculates the standard deviation of an array of values
 * @param {number[]} values - Array of numeric values
 * @returns {number} The standard deviation
 */
function calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    const mean = calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
}