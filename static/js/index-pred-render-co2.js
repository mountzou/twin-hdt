// Format ARIMA-style CO2 prediction entries for display.
function formatCo2Prediction(prediction, unit = 'ppm') {
  if (!prediction) return null;

  const value = Number(prediction.value).toFixed(2);
  const lower = Number(prediction.lower).toFixed(2);
  const upper = Number(prediction.upper).toFixed(2);
  return `${value} ${unit} (95% CI: ${lower}–${upper} ${unit})`;
}

// Render all CO2 prediction slots on the dashboard.
function renderCO2Predictions(predictions, unit = 'ppm') {
  const co2Predictions = predictions || {};
  const pred1  = co2Predictions.co2_pred_1min || null;
  const pred5  = co2Predictions.co2_pred_5min || null;
  const pred10 = co2Predictions.co2_pred_10min || null;
  const pred15 = co2Predictions.co2_pred_15min || null;

  const el1  = document.getElementById('co2-pred-1');
  const el5  = document.getElementById('co2-pred-5');
  const el10 = document.getElementById('co2-pred-10');
  const el15 = document.getElementById('co2-pred-15');

  if (el1 && pred1) {
    const value = Number(pred1.value).toFixed(0);
    const band = Number(pred1.band).toFixed(0);
    el1.textContent = `${value} ${unit} ± ${band} ${unit}`;
  }
  if (el5 && pred5) el5.textContent = formatCo2Prediction(pred5, unit);
  if (el10 && pred10) el10.textContent = formatCo2Prediction(pred10, unit);
  if (el15 && pred15) el15.textContent = formatCo2Prediction(pred15, unit);
}
