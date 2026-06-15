"""
Central IAQ tier colors (good / moderate / poor).

Keep hex values in sync with :root --iaq-severity-* in static/css/twinair.css.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

IAQ_SEVERITY_HEX: Dict[str, str] = {
    "good": "#24c19a",
    "moderate": "#fbbf23",
    "poor": "#f5785c",
}

IAQ_HEX_NO_DATA = "#dadfe5"
IAQ_HEX_NEUTRAL = "#929dab"

_POLICY_COLOR_TO_HEX = {
    "green": IAQ_SEVERITY_HEX["good"],
    "yellow": IAQ_SEVERITY_HEX["moderate"],
    "orange": IAQ_SEVERITY_HEX["poor"],
    "red": IAQ_SEVERITY_HEX["poor"],
    "grey": IAQ_HEX_NEUTRAL,
}


def heatmap_hex_for_breakpoint(
    level_styles: Dict[str, Any],
    breakpoint_label: Optional[str],
) -> str:
    """Resolve heatmap cell / range color for a policy breakpoint row."""
    key = (breakpoint_label or "").strip().lower().replace(" ", "_")
    if key in IAQ_SEVERITY_HEX:
        return IAQ_SEVERITY_HEX[key]

    meta = (level_styles or {}).get(key) or {}
    color_name = meta.get("color") if isinstance(meta, dict) else None
    if isinstance(color_name, str):
        return _POLICY_COLOR_TO_HEX.get(color_name.lower(), IAQ_HEX_NEUTRAL)
    return IAQ_HEX_NEUTRAL


def iaq_tier_key_from_payload(pollutant_data: Optional[Dict[str, Any]]) -> str:
    """UI tier slug for templates/CSS: good | moderate | poor | grey."""
    if not pollutant_data:
        return "grey"

    label = (pollutant_data.get("label") or "").strip().lower()
    if label == "good":
        return "good"
    if label == "moderate":
        return "moderate"
    if label == "poor":
        return "poor"

    color = (pollutant_data.get("color") or "").strip().lower()
    return {
        "green": "good",
        "yellow": "moderate",
        "orange": "poor",
        "red": "poor",
    }.get(color, "grey")
