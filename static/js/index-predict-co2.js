function getCO2Prediction(co2Values, rawTimestamps) {
  const body = JSON.stringify({ co2_values: co2Values, timestamps: rawTimestamps });
  const headers = { 'Content-Type': 'application/json' };

  const parse = async (res) => {
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Request failed');
    return (typeof json === 'number')
      ? json
      : (json.predicted_co2_15min ?? json.predicted_co2_10min ?? json.predicted_co2_5min);
  };

  const fmtWithPct = (v, pct) => {
    const val = Number(v);
    if (!Number.isFinite(val)) return '—';
    const margin = Math.abs(val * pct);
    return `${val.toFixed(2)} ± ${margin.toFixed(2)} ppm`;
  };

  const setEl = (id, text, val, pct) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (Number.isFinite(val)) {
      const low = (val * (1 - pct)).toFixed(2);
      const high = (val * (1 + pct)).toFixed(2);
      el.title = `~ ${low} – ${high} ppm`;
    }
  };

  Promise.all([
    fetch('/predict_co2_5min/',  { method: 'POST', headers, body }).then(parse),  // 0.5%
    fetch('/predict_co2_10min/', { method: 'POST', headers, body }).then(parse),  // 0.8%
    fetch('/predict_co2_15min/', { method: 'POST', headers, body }).then(parse),  // 1.0%
  ])
  .then(([pred5, pred10, pred15]) => {
    const p5  = Number(pred5),  t5  = fmtWithPct(p5, 0.005);
    const p10 = Number(pred10), t10 = fmtWithPct(p10, 0.008);
    const p15 = Number(pred15), t15 = fmtWithPct(p15, 0.010);

    setEl('co2-pred-5',  t5,  p5,  0.005);
    setEl('co2-pred-10', t10, p10, 0.008);
    setEl('co2-pred-15', t15, p15, 0.010);

    console.log('Predicted CO2 (5min):',  t5);
    console.log('Predicted CO2 (10min):', t10);
    console.log('Predicted CO2 (15min):', t15);
  })
  .catch((err) => console.error('Error:', err));
}