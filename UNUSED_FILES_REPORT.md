# Unused Files Report — Twin-HDT

Generated from a project-wide check of imports, `render_template` calls, and static asset references.

---

## Summary

| Category | Unused count |
|----------|--------------|
| **Templates** | 1 |
| **Static JS** | 6 |
| **Static CSS** | 3 |
| **Static icons** | 11 |
| **Static libs** | ~~entire `static/libs/` tree~~ *(deleted)* |
| **Config/data** | 3 |

**Note:** All root-level Python modules are used (imported from `app.py` or each other). `data/IAQ_breakpoints.json` and `data/pollutants_info.json` are used.

---

## 1. Templates (unused)

| File | Reason |
|------|--------|
| `templates/index_wearable.html` | Never passed to `render_template`; never included elsewhere. |

---

## 2. Static JavaScript (`static/js/`)

| File | Reason |
|------|--------|
| `static/js/charts.js` | Not referenced in any template or other JS. |
| `static/js/tabler.js` | Templates load `demo.min.js`, not this. |
| `static/js/tabler.min.js` | Same. |
| `static/js/demo.js` | Templates use `demo.min.js`. |
| `static/js/demo-theme.js` | Templates use `demo-theme.min.js`. |
| `static/js/index-wb-physiological.js` | Only referenced by unused `index_wearable.html`. |

---

## 3. Static CSS (`static/css/`)

| File | Reason |
|------|--------|
| `static/css/demo.css` | Only `demo.min.css` is used (error pages). |
| `static/css/tabler.css` | Only `tabler.min.css` is used. |
| `static/css/tabler-vendors.css` | Only `tabler-vendors.min.css` is used. |

---

## 4. Static Icons (`static/icons/`)

**Used in templates:** `iaq-good.svg`, `arrow-back-white.svg`.

**Unused:**

| File |
|------|
| `add-white.svg` |
| `brain-black.svg` (only in a commented-out line in `_header.html`) |
| `home.svg` |
| `iaq-moderate.svg` |
| `iaq-unhealthy.svg` |
| `iaq-very-good.svg` |
| `iaq-very-unhealthy.svg` |
| `notification.svg` |
| `pencil.svg` |
| `star.svg` |
| `user.svg` |

---

## 5. Static libs (`static/libs/`)

**Deleted.** The directory was removed; the app uses assets under `static/js/` and `static/css/` only.

---

## 6. Config / data (unused)

| File | Reason |
|------|--------|
| `models_ml/co2_5min/config.json` | Not loaded by any Python code; `utils_pred.py` uses a fixed ARIMA order. |
| `models_ml/co2_10min/config.json` | Same. |
| `models_ml/co2_15min/config.json` | Same. |

---

## Recommendation

- **Safe to remove** (if you do not plan to use them): the files and directories listed above. *(static/libs/ has been deleted.)*
- **Fix:** None required (unused virtual-sensing template was removed).
