async function getPM25Prediction(pm25values) {
    try {
        const response = await fetch('/predict_pm25', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequence: pm25values })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Prediction request failed');
        }

        const data = await response.json();
        const roundedPrediction = data.prediction !== undefined ? Math.round(data.prediction * 100) / 100 : null;

        // Update the DOM:
        const span = document.getElementById('pm25-pred');
        if (span && roundedPrediction !== null) {
            span.textContent = `${roundedPrediction} μg/m³`;
        } else if (span) {
            span.textContent = 'N/A';
        }

        return roundedPrediction;
    } catch (error) {
        const span = document.getElementById('pm25-pred');
        if (span) {
            span.textContent = 'Error';
        }
        console.error('Prediction error:', error);
        return null;
    }
}