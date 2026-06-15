(function () {
    const TIER_TEXT = ['iaq-tier-text--good', 'iaq-tier-text--moderate', 'iaq-tier-text--poor', 'iaq-tier-text--grey'];
    const TIER_BG = ['iaq-tier-bg--good', 'iaq-tier-bg--moderate', 'iaq-tier-bg--poor', 'iaq-tier-bg--grey'];
    const TIER_BADGE = ['iaq-tier-badge-lt--good', 'iaq-tier-badge-lt--moderate', 'iaq-tier-badge-lt--poor', 'iaq-tier-badge-lt--grey'];

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function setAdviceHtml(el, text) {
        if (!el) return;
        const message = (text || '').trim();
        if (!message) {
            el.textContent = '';
            return;
        }
        el.innerHTML = `<i class="fa-solid fa-bullhorn me-2" aria-hidden="true"></i>${escapeHtml(message)}`;
    }

    function formatValue(value, unit) {
        if (!Number.isFinite(value)) return 'n/a';
        const rounded = Math.round(value * 10) / 10;
        return unit ? `${rounded} ${unit}` : `${rounded}`;
    }

    function formatOneHourAverageHtml(value, unit) {
        return `1-hour average: <strong>${formatValue(value, unit)}</strong>`;
    }

    function formatPollutantReadingHtml(label, value, unit) {
        return `${label}: <strong>${formatValue(value, unit)}</strong>`;
    }

    function formatWorstHourValuesHtml(hour) {
        const pm25 = formatPollutantReadingHtml('PM<sub>2.5</sub>', hour.pm25, 'µg/m³');
        const co2 = formatPollutantReadingHtml('CO<sub>2</sub>', hour.co2, 'ppm');
        return `${pm25} · ${co2}`;
    }

    function applyTierClasses(el, tier) {
        if (!el) return;
        TIER_TEXT.forEach(c => el.classList.remove(c));
        el.classList.add(`iaq-tier-text--${tier || 'grey'}`);
    }

    function applyTierToStamp(stampEl, tier) {
        if (!stampEl) return;
        TIER_BG.forEach(c => stampEl.classList.remove(c));
        stampEl.classList.add(`iaq-tier-bg--${tier || 'grey'}`);
    }

    function applyTierBadge(el, tier) {
        if (!el) return;
        TIER_BADGE.forEach(c => el.classList.remove(c));
        el.classList.add(`iaq-tier-badge-lt--${tier || 'grey'}`);
    }

    function tierToSeverityIndex(tier) {
        if (tier === 'good') return 0;
        if (tier === 'moderate') return 1;
        if (tier === 'poor') return 2;
        return null;
    }

    function getStripColor(tier) {
        const theme = window.hdtIaqTheme;
        const idx = tierToSeverityIndex(tier);
        if (idx !== null && theme && typeof theme.getIaqSeverityHex === 'function') {
            return theme.getIaqSeverityHex(idx);
        }
        if (theme && typeof theme.readCssVar === 'function') {
            return theme.readCssVar('--iaq-no-data', '#dadfe5');
        }
        return '#dadfe5';
    }

    function iconUrl(filename) {
        return `/static/icons/${filename || 'iaq-good.svg'}`;
    }

    function setVisible(el, show) {
        if (!el) return;
        el.classList.toggle('d-none', !show);
    }

    function renderCompositeCard(latest) {
        const statusEl = document.getElementById('hr-composite-status');
        const adviceEl = document.getElementById('hr-composite-advice');
        const driverEl = document.getElementById('hr-composite-driver');
        const stampEl = document.getElementById('hr-composite-stamp');
        const iconEl = document.getElementById('hr-composite-icon');

        const tier = latest.tier || 'grey';
        const status = latest.status || '—';

        if (statusEl) {
            applyTierClasses(statusEl, tier);
            statusEl.textContent = status;
        }
        setAdviceHtml(adviceEl, latest.advice);
        if (driverEl) {
            applyTierBadge(driverEl, tier);
            driverEl.textContent = `Primary driver: ${latest.primary_driver || '—'}`;
        }
        applyTierToStamp(stampEl, tier);
        if (iconEl) iconEl.src = iconUrl(latest.icon);
    }

    function renderPollutantCard(prefix, unit, latest) {
        const statusEl = document.getElementById(`hr-${prefix}-status`);
        const valueEl = document.getElementById(`hr-${prefix}-value`);
        const adviceEl = document.getElementById(`hr-${prefix}-advice`);
        const stampEl = document.getElementById(`hr-${prefix}-stamp`);
        const iconEl = document.getElementById(`hr-${prefix}-icon`);

        const score = latest[`${prefix}_score`];
        const status = latest[`${prefix}_status`];
        const advice = latest[`${prefix}_advice`];
        const tier = latest[`${prefix}_tier`] || 'grey';
        const value = latest[prefix];

        if (statusEl) {
            applyTierClasses(statusEl, tier);
            statusEl.textContent = score != null && status
                ? `Score ${score} (${status})`
                : '—';
        }
        if (valueEl) {
            valueEl.innerHTML = formatOneHourAverageHtml(value, unit);
        }
        setAdviceHtml(
            adviceEl,
            advice || (Number.isFinite(value) ? '' : 'No measurement for this period.')
        );
        applyTierToStamp(stampEl, tier);
        if (iconEl) iconEl.src = iconUrl(latest[`${prefix}_icon`]);
    }

    function renderWorstHourCard(index, hour) {
        const col = document.getElementById(`hr-worst-col-${index}`);
        const statusEl = document.getElementById(`hr-worst-status-${index}`);
        const timeEl = document.getElementById(`hr-worst-time-${index}`);
        const valuesEl = document.getElementById(`hr-worst-values-${index}`);
        const adviceEl = document.getElementById(`hr-worst-advice-${index}`);
        const driverEl = document.getElementById(`hr-worst-driver-${index}`);

        if (!hour) {
            setVisible(col, false);
            return;
        }

        setVisible(col, true);
        const tier = hour.tier || 'grey';

        if (statusEl) {
            applyTierClasses(statusEl, tier);
            statusEl.textContent = hour.status || '—';
        }
        if (timeEl) {
            timeEl.textContent = hour.full_label || hour.label || '—';
        }
        if (valuesEl) {
            valuesEl.innerHTML = formatWorstHourValuesHtml(hour);
        }
        setAdviceHtml(adviceEl, hour.advice);
        if (driverEl) {
            applyTierBadge(driverEl, tier);
            driverEl.textContent = `Primary driver: ${hour.primary_driver || '—'}`;
        }
    }

    function renderWorstHours(worstList, latest) {
        const row = document.getElementById('hr-worst-row');
        const hours = Array.isArray(worstList) ? worstList : (worstList ? [worstList] : []);

        const displayHours = hours.filter(hour => {
            if (!hour || !latest) return true;
            const sameHour = hour.bucket != null && latest.bucket === hour.bucket;
            const sameScore = hour.overall_score === latest.overall_score;
            return !(sameHour && sameScore);
        });

        if (!displayHours.length) {
            setVisible(row, false);
            return;
        }

        setVisible(row, true);
        renderWorstHourCard(0, displayHours[0]);
        renderWorstHourCard(1, displayHours[1] || null);
    }

    function buildStripAxis(rows) {
        const total = rows.length;
        if (total === 0) return '';
        const step = Math.max(1, Math.floor(total / 12));
        const labels = rows
            .map((hour, idx) => {
                if (idx % step !== 0 && idx !== total - 1) return '';
                const leftPct = ((idx + 0.5) / total) * 100;
                return `<span style="left:${leftPct.toFixed(3)}%;">${escapeHtml(hour.label || '')}</span>`;
            })
            .filter(Boolean)
            .join('');
        return `<div class="hourly-strip-axis">${labels}</div>`;
    }

    function renderCompositeHourlyStrip(containerId, hourly) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const rows = Array.isArray(hourly) ? hourly : [];
        if (rows.length === 0) {
            container.innerHTML = '';
            container.classList.add('is-empty');
            return;
        }
        container.classList.remove('is-empty');

        const barsHtml = rows.map(hour => {
            const tier = hour.tier || 'grey';
            const color = getStripColor(tier);
            return `<span class="hourly-strip-bar" style="background-color:${color};"></span>`;
        }).join('');

        container.innerHTML = `
            <div class="hourly-strip-bars">${barsHtml}</div>
            ${buildStripAxis(rows)}
        `;
    }

    function showState(state) {
        setVisible(document.getElementById('hr-loading'), state === 'loading');
        setVisible(document.getElementById('hr-empty-state'), state === 'empty');
        setVisible(document.getElementById('hr-content'), state === 'ready');
    }

    function renderPayload(payload) {
        const latest = payload.latest;
        if (!latest) {
            showState('empty');
            return;
        }

        showState('ready');
        renderCompositeCard(latest);
        renderPollutantCard('pm25', 'µg/m³', latest);
        renderPollutantCard('co2', 'ppm', latest);
        renderWorstHours(payload.worst_7d, latest);
        renderCompositeHourlyStrip('hr-7d-strip', payload.hourly);
    }

    async function loadHealthIaq() {
        showState('loading');
        try {
            const response = await fetch('/api/health-recommendations/iaq', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) {
                showState('empty');
                return;
            }
            const payload = await response.json();
            if (payload.error) {
                showState('empty');
                return;
            }
            renderPayload(payload);
        } catch (err) {
            console.error('health-recommendations IAQ load failed', err);
            showState('empty');
        }
    }

    document.addEventListener('DOMContentLoaded', loadHealthIaq);
    window.renderCompositeHourlyStrip = renderCompositeHourlyStrip;
})();
