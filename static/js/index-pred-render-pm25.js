// Format PM2.5 prediction entries for display.
function formatPm25Prediction(prediction, unit = 'µg/m³') {
  if (!prediction) return null;

  const value = Number(prediction.value).toFixed(2);
  const lower = Number(prediction.lower).toFixed(2);
  const upper = Number(prediction.upper).toFixed(2);
  return `${value} ${unit} (95% CI: ${lower}–${upper} ${unit})`;
}

// Render PM2.5 prediction slots on the dashboard.
function renderPm25Predictions(predictions, unit = 'µg/m³') {
  const pm25Predictions = predictions || {};
  const pred5 = pm25Predictions.pm25_pred_5min || null;
  const el5 = document.getElementById('pm25-pred-5');

  if (el5 && pred5) {
    el5.textContent = formatPm25Prediction(pred5, unit);
  }
}
