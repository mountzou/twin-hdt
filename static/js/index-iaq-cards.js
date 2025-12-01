document.addEventListener('DOMContentLoaded', () => {

    /* Perform a GET request on endpoint `/calculate/iaq/avg` */
    fetch('/calculate/iaq/avg', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    /* CASE 1: Request on `/calculate/iaq/avg` was NOT OK */
    .then(response => {
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        return response.json();
    })
    /* CASE 2: Request on `/calculate/iaq/avg` was OK */
    .then(data => {

        const last1h = data.last_1h;
        const timeLabel = "1-hour average";

        function createIAQCard(pollutantNameText, pollutantNameHtml, unit, timeLabel, pObj) {
            if (!pObj) {
                return {
                    text: `The ${timeLabel} for ${pollutantNameText} was not available.`,
                    html: `The ${timeLabel} for ${pollutantNameHtml} was not available.`
                };
            }

            const value = pObj.value ?? pObj.avg ?? pObj.mean ?? 'N/A';
            const action = pObj.action ??
                (Array.isArray(pObj.actions) && pObj.actions.length > 0
                    ? pObj.actions[0]
                    : '');
            const effect = pObj.effect || '';

            let baseText = `The ${timeLabel} for ${pollutantNameText} was ${value}${unit ? ' ' + unit : ''}.`;
            let baseHtml = `The ${timeLabel} for ${pollutantNameHtml} was <b>${value}${unit ? ' ' + unit : ''}</b>.`;

            if (action) {
                const aText = action.endsWith('.') ? action : action + '.';
                baseText += ` ${aText}`;
                baseHtml += ` ${aText}`;
            }

            if (effect) {
                const eText = effect.endsWith('.') ? effect : effect + '.';
                baseText += ` ${eText}`;
                baseHtml += ` ${eText}`;
            }

            return { text: baseText, html: baseHtml };
        }

        function updateCard(pollutantNames, pObj, cardIndex) {
            const cards = document.querySelectorAll('.card');

            const card = cards[cardIndex];
            if (!card) return;

            const titleEl = card.querySelector('h3.card-title');
            const pEl     = card.querySelector('.card-body p');
            const iconBox = card.querySelector('.card-stamp-icon');
            const iconImg = iconBox ? iconBox.querySelector('img.icon') : null;

            if (!titleEl || !pEl) return;

            const { text: msgText, html: msgHtml } = createIAQCard(
                pollutantNames.text,
                pollutantNames.html,
                pollutantNames.unit,
                timeLabel,
                pObj
            );

            pEl.innerHTML = msgHtml;

            const rawLabel = pObj.label ?? "Within Safe Range";
            const statusLabel =
                rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

            titleEl.innerHTML = `${pollutantNames.html} Levels | ${statusLabel}`;

            if (pObj.icon && iconImg) {
                iconImg.src = `/static/icons/${pObj.icon}`;
            }

            if (pObj.color && iconBox) {
                const color = pObj.color;

                const textClassesToRemove = [
                    'text-success', 'text-green', 'text-red',
                    'text-yellow', 'text-orange', 'text-danger', 'text-grey'
                ];
                textClassesToRemove.forEach(cls => titleEl.classList.remove(cls));
                titleEl.classList.add(`text-${color}`);

                const bgClassesToRemove = [
                    'bg-success', 'bg-green', 'bg-red',
                    'bg-yellow', 'bg-orange', 'bg-danger', 'bg-grey'
                ];
                bgClassesToRemove.forEach(cls => iconBox.classList.remove(cls));
                iconBox.classList.add(`bg-${color}`);
            }
        }

        // Update IAQ card for 1-h C02 average conditions
        updateCard(
            { text: 'CO2', html: 'CO<sub>2</sub>', unit: 'ppm' },
            last1h.co2,
            0
        );

        // Update IAQ card for 1-h PM2.5 average conditions
        updateCard(
            { text: 'PM2.5', html: 'PM<sub>2.5</sub>', unit: 'µg/m³' },
            last1h.pm25,
            1
        );

        console.log("Update complete.");
    })
    .catch(error => {
        console.error("Error fetching IAQ AVG:", error);
    });
});