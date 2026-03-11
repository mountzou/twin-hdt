document.addEventListener('DOMContentLoaded', () => {
    if (!window.hdtSession || !window.hdtSession.requiresWearableSelection) {
        return;
    }

    const modalEl = document.getElementById('wearableSelectionModal');
    const selectEl = document.getElementById('wearableSelectionInput');
    const submitEl = document.getElementById('wearableSelectionSubmit');
    const errorEl = document.getElementById('wearableSelectionError');

    if (!modalEl || !selectEl || !submitEl || !errorEl) {
        return;
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    submitEl.addEventListener('click', async () => {
        const wearableId = selectEl.value;
        errorEl.classList.add('d-none');
        errorEl.textContent = '';

        if (!wearableId) {
            errorEl.textContent = 'Select a wearable device before continuing.';
            errorEl.classList.remove('d-none');
            return;
        }

        submitEl.disabled = true;

        try {
            const response = await fetch('/session/wearable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ wearable_id: wearableId })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || 'Unable to store the wearable selection.');
            }

            window.location.reload();
        } catch (error) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('d-none');
            submitEl.disabled = false;
        }
    });
});
