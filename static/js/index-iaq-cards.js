// Build the message shown inside a single IAQ summary card.
function createIaqCardsContent(pollutantNameText, pollutantNameHtml, unit, timeLabel, pollutantData) {
    if (!pollutantData) {
        return {
            text: `The ${timeLabel} for ${pollutantNameText} was not available.`,
            html: `The ${timeLabel} for ${pollutantNameHtml} was not available.`
        };
    }

    const value = pollutantData.value ?? pollutantData.avg ?? pollutantData.mean ?? 'N/A';
    const action = pollutantData.action ??
        (Array.isArray(pollutantData.actions) && pollutantData.actions.length > 0
            ? pollutantData.actions[0]
            : '');
    const effect = pollutantData.effect || '';

    let baseText = `The ${timeLabel} for ${pollutantNameText} was ${value}${unit ? ` ${unit}` : ''}.`;
    let baseHtml = `The ${timeLabel} for ${pollutantNameHtml} was <b>${value}${unit ? ` ${unit}` : ''}</b>.`;

    if (action) {
        const formattedAction = action.endsWith('.') ? action : `${action}.`;
        baseText += ` ${formattedAction}`;
        baseHtml += ` ${formattedAction}`;
    }

    if (effect) {
        const formattedEffect = effect.endsWith('.') ? effect : `${effect}.`;
        baseText += ` ${formattedEffect}`;
        baseHtml += ` ${formattedEffect}`;
    }

    return { text: baseText, html: baseHtml };
}

// Render a single pollutant card from the IAQ payload.
function addIaqCardsContent(pollutantNames, pollutantData, cardIndex) {
    const cards = document.querySelectorAll('.card');
    const card = cards[cardIndex];

    if (!card) return;

    const titleEl = card.querySelector('h3.card-title');
    const paragraphEl = card.querySelector('.card-body p');
    const iconBox = card.querySelector('.card-stamp-icon');
    const iconImg = iconBox ? iconBox.querySelector('img.icon') : null;

    if (!titleEl || !paragraphEl) return;

    const { html } = createIaqCardsContent(
        pollutantNames.text,
        pollutantNames.html,
        pollutantNames.unit,
        '1-hour average',
        pollutantData
    );

    paragraphEl.innerHTML = html;

    const rawLabel = pollutantData?.label ?? 'Within Safe Range';
    const statusLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    titleEl.innerHTML = `${pollutantNames.html} Levels | ${statusLabel}`;

    if (pollutantData?.icon && iconImg) {
        iconImg.src = `/static/icons/${pollutantData.icon}`;
    }

    if (pollutantData?.color && iconBox) {
        const color = pollutantData.color;

        [
            'text-success', 'text-green', 'text-red',
            'text-yellow', 'text-orange', 'text-danger', 'text-grey'
        ].forEach(cssClass => titleEl.classList.remove(cssClass));
        titleEl.classList.add(`text-${color}`);

        [
            'bg-success', 'bg-green', 'bg-red',
            'bg-yellow', 'bg-orange', 'bg-danger', 'bg-grey'
        ].forEach(cssClass => iconBox.classList.remove(cssClass));
        iconBox.classList.add(`bg-${color}`);
    }
}

// Render the dashboard IAQ summary cards.
function renderIaqCards(data) {
    const last1h = data.last_1h || {};

    addIaqCardsContent(
        { text: 'CO2', html: 'CO<sub>2</sub>', unit: 'ppm' },
        last1h.co2,
        0
    );

    addIaqCardsContent(
        { text: 'PM2.5', html: 'PM<sub>2.5</sub>', unit: 'µg/m³' },
        last1h.pm25,
        1
    );
}

// Expose function `renderIaqCards` on `window` so other scripts can call it.
window.renderIaqCards = renderIaqCards;

// Listen for published IAQ payloads and update the cards with `event.detail`.
document.addEventListener('hdt:iaq-ready', event => {
    renderIaqCards(event.detail || {});
});
