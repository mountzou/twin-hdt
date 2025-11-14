# iaq_policy_loader.py

import json
from functools import lru_cache
from typing import Dict, Any, Optional

DURATION_MAP = {
    "last_1h": "1h",
    "last_1d": "24h",
    "last_8h": "8h",
}

POLLUTANTS = ("co2", "pm25", "tvoc")


# Load and cache the pollutants dictionary from the "IAQ_breakpoints.json"
@lru_cache(maxsize=1)
def load_policy(path: str = "IAQ_breakpoints.json") -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# Return the pollutants dictionary (e.g. "co2", "pm25") from the "IAQ_breakpoints.json", or None if not found
def _return_pollutants_dictionary(policy: Dict[str, Any], pollutant_id: str) -> Optional[Dict[str, Any]]:
    for p in policy.get("pollutants", []):
        if p.get("id") == pollutant_id:
            return p
    return None


# Return the pollutants dictionary (e.g. "co2", "pm25") from the "IAQ_breakpoints.json", or None if not found
def _return_pollutant_breakpoint(bp_list, value: float):
    for row in bp_list:
        if value <= row["le"]:
            return row["label"], row["severity"]
    last = bp_list[-1]
    return last["label"], last["severity"]


def iaq_classification(policy: Dict[str, Any], pollutant_id: str, duration: str, value: Optional[float]) -> Optional[Dict[str, Any]]:
    if value is None:
        return None
    node = _return_pollutants_dictionary(policy, pollutant_id)
    if not node:
        return None
    bps = node["breakpoints"].get(duration)
    if not bps:
        return None

    label, severity = _return_pollutant_breakpoint(bps, value)
    eff = (node.get("effects") or {}).get(label, {})
    styles = (policy.get("level_styles") or {}).get(label, {})

    return {
        "value": value,
        "label": label,
        "severity": severity,
        "effect": eff.get("effect"),
        "action": eff.get("action"),
        "color": styles.get("color"),
        "icon": styles.get("icon"),
    }


def aggregate_overall(policy: Dict[str, Any], per_pollutant: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    valid = {k: v for k, v in per_pollutant.items() if isinstance(v, dict)}
    if not valid:
        return None
    max_sev = max(v["severity"] for v in valid.values())
    reasons = [k for k, v in valid.items() if v["severity"] == max_sev]

    labels_list = policy.get("labels", ["good", "moderate", "unhealthy", "very_unhealthy"])
    severity_to_label = {i: lab for i, lab in enumerate(labels_list)}
    overall_label = severity_to_label.get(max_sev, labels_list[min(max_sev, len(labels_list) - 1)])

    actions = []
    for r in reasons:
        act = valid[r].get("action")
        if act and act not in actions:
            actions.append(act)

    style = (policy.get("level_styles") or {}).get(overall_label, {})
    return {
        "overall_severity": max_sev,
        "overall_label": overall_label,
        "reasons": reasons,
        "actions": actions,
        "overall_color": style.get("color"),
        "overall_icon": style.get("icon"),
    }


def apply_iaq_policy(iaq_averages: Dict[str, Any], policy: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for period_key, vals in iaq_averages.items():
        if vals is None:
            out[period_key] = None
            continue
        duration = DURATION_MAP.get(period_key)
        per = {}
        for pol in POLLUTANTS:
            per[pol]   = iaq_classification(policy, pol, duration, vals.get(pol))
        per["overall"] = aggregate_overall(policy, {k: v for k, v in per.items() if v})
        out[period_key] = per
    return out
