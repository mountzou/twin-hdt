// Central IAQ tier colors: read from :root in static/css/twinair.css
// (must match iaq_theme.py IAQ_SEVERITY_HEX).

(function (global) {
    const FALLBACK_SEVERITY = ['#24c19a', '#fbbf23', '#f5785c'];

    function readCssVar(name, fallback) {
        if (typeof document === 'undefined' || !document.documentElement) {
            return fallback;
        }
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }

    function getIaqSeverityHex(severity) {
        const n = Number(severity);
        const idx = n === 0 ? 0 : n === 1 ? 1 : 2;
        const names = ['--iaq-severity-good', '--iaq-severity-moderate', '--iaq-severity-poor'];
        return readCssVar(names[idx], FALLBACK_SEVERITY[idx]);
    }

    /** Map policy API `color` (green / yellow / orange / …) to CSS tier slug. */
    function policyColorToTier(policyColor) {
        const c = String(policyColor || '').toLowerCase();
        const map = {
            green: 'good',
            yellow: 'moderate',
            orange: 'poor',
            red: 'poor',
            grey: 'grey'
        };
        return map[c] || 'grey';
    }

    global.hdtIaqTheme = {
        readCssVar,
        getIaqSeverityHex,
        policyColorToTier
    };
})(typeof window !== 'undefined' ? window : globalThis);
