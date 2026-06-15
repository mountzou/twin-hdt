# Health-recommendations IAQ scoring (PM2.5 + CO2, MAX composite).

from typing import Any, Dict, List, Optional, Tuple

STATUS_BY_SCORE = {
    1: "Good",
    2: "Moderate",
    3: "High Risk",
}

ADVICE_BY_SCORE = {
    1: "Ideal air quality. Enjoy activities.",
    2: (
        "Reduce sources of pollution. Cut back or reschedule strenuous activities "
        "indoors. Ventilate if possible."
    ),
    3: (
        "Avoid all physical activities. Use central air filtration systems in case "
        "of particulate pollution or increase ventilation for high carbon dioxide levels."
    ),
}

TIER_BY_SCORE = {
    1: "good",
    2: "moderate",
    3: "poor",
}

ICON_BY_TIER = {
    "good": "iaq-good.svg",
    "moderate": "iaq-moderate.svg",
    "poor": "iaq-unhealthy.svg",
    "grey": "iaq-good.svg",
}


def score_pm25(value: Optional[float]) -> Optional[int]:
    if value is None:
        return None
    v = float(value)
    if v <= 8:
        return 1
    if v <= 35:
        return 2
    return 3


def score_co2(value: Optional[float]) -> Optional[int]:
    if value is None:
        return None
    v = float(value)
    if v < 400:
        return 1
    if v <= 850:
        return 1
    if v <= 1400:
        return 2
    return 3


def composite_from_scores(
    pm25_score: Optional[int],
    co2_score: Optional[int],
) -> Tuple[Optional[int], Optional[str]]:
    scores = [s for s in (pm25_score, co2_score) if s is not None]
    if not scores:
        return None, None

    overall = max(scores)
    drivers = []
    if pm25_score == overall:
        drivers.append("pm25")
    if co2_score == overall:
        drivers.append("co2")

    if len(drivers) == 2:
        primary_driver = "Both"
    elif drivers[0] == "pm25":
        primary_driver = "PM2.5"
    else:
        primary_driver = "CO2"

    return overall, primary_driver


def status_and_advice(overall_score: Optional[int]) -> Tuple[Optional[str], Optional[str]]:
    if overall_score is None:
        return None, None
    return STATUS_BY_SCORE.get(overall_score), ADVICE_BY_SCORE.get(overall_score)


def advice_for_score(score: Optional[int]) -> Optional[str]:
    if score is None:
        return None
    return ADVICE_BY_SCORE.get(score)


def tier_for_score(overall_score: Optional[int]) -> str:
    if overall_score is None:
        return "grey"
    return TIER_BY_SCORE.get(overall_score, "grey")


def evaluate_hour(
    pm25: Optional[float],
    co2: Optional[float],
    *,
    bucket: Optional[int] = None,
    label: Optional[str] = None,
    full_label: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pm25_score = score_pm25(pm25)
    co2_score = score_co2(co2)
    overall_score, primary_driver = composite_from_scores(pm25_score, co2_score)
    if overall_score is None:
        return None

    status, advice = status_and_advice(overall_score)
    tier = tier_for_score(overall_score)

    payload: Dict[str, Any] = {
        "co2": co2,
        "pm25": pm25,
        "pm25_score": pm25_score,
        "co2_score": co2_score,
        "pm25_status": STATUS_BY_SCORE.get(pm25_score) if pm25_score else None,
        "co2_status": STATUS_BY_SCORE.get(co2_score) if co2_score else None,
        "pm25_advice": advice_for_score(pm25_score),
        "co2_advice": advice_for_score(co2_score),
        "pm25_tier": tier_for_score(pm25_score),
        "co2_tier": tier_for_score(co2_score),
        "overall_score": overall_score,
        "status": status,
        "advice": advice,
        "primary_driver": primary_driver,
        "tier": tier,
        "icon": ICON_BY_TIER.get(tier, ICON_BY_TIER["grey"]),
        "pm25_icon": ICON_BY_TIER.get(tier_for_score(pm25_score), ICON_BY_TIER["grey"]),
        "co2_icon": ICON_BY_TIER.get(tier_for_score(co2_score), ICON_BY_TIER["grey"]),
    }
    if bucket is not None:
        payload["bucket"] = bucket
    if label is not None:
        payload["label"] = label
    if full_label is not None:
        payload["full_label"] = full_label
    return payload


def _hour_has_reading(hour: Dict[str, Any]) -> bool:
    return hour.get("co2") is not None or hour.get("pm25") is not None


def pick_latest_hour(hourly_rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for hour in reversed(hourly_rows):
        if not _hour_has_reading(hour):
            continue
        evaluated = evaluate_hour(
            hour.get("pm25"),
            hour.get("co2"),
            bucket=hour.get("bucket"),
            label=hour.get("label"),
            full_label=hour.get("full_label"),
        )
        if evaluated:
            return evaluated
    return None


def pick_worst_hours(hourly_rows: List[Dict[str, Any]], count: int = 2) -> List[Dict[str, Any]]:
    evaluated_hours: List[Dict[str, Any]] = []
    for hour in hourly_rows:
        if not _hour_has_reading(hour):
            continue
        evaluated = evaluate_hour(
            hour.get("pm25"),
            hour.get("co2"),
            bucket=hour.get("bucket"),
            label=hour.get("label"),
            full_label=hour.get("full_label"),
        )
        if evaluated:
            evaluated_hours.append(evaluated)

    evaluated_hours.sort(
        key=lambda row: (-row["overall_score"], -(row.get("bucket") or 0)),
    )

    worst_hours: List[Dict[str, Any]] = []
    seen_buckets = set()
    for evaluated in evaluated_hours:
        bucket = evaluated.get("bucket")
        if bucket is not None and bucket in seen_buckets:
            continue
        if bucket is not None:
            seen_buckets.add(bucket)
        worst_hours.append(evaluated)
        if len(worst_hours) >= count:
            break
    return worst_hours


def build_hourly_strip_payload(hourly_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    strip = []
    for hour in hourly_rows:
        evaluated = evaluate_hour(
            hour.get("pm25"),
            hour.get("co2"),
            bucket=hour.get("bucket"),
            label=hour.get("label"),
            full_label=hour.get("full_label"),
        )
        if evaluated:
            strip.append(evaluated)
        else:
            strip.append({
                "bucket": hour.get("bucket"),
                "label": hour.get("label"),
                "full_label": hour.get("full_label"),
                "co2": hour.get("co2"),
                "pm25": hour.get("pm25"),
                "overall_score": None,
                "status": None,
                "tier": "grey",
            })
    return strip


def evaluate_from_last_1h(last_1h: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not last_1h:
        return None
    return evaluate_hour(last_1h.get("pm25"), last_1h.get("co2"))


def build_health_iaq_payload(
    hourly_rows: List[Dict[str, Any]],
    *,
    entity_id: str,
    hours_total: int = 168,
    last_1h_fallback: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    latest = pick_latest_hour(hourly_rows)
    if latest is None and last_1h_fallback:
        latest = evaluate_from_last_1h(last_1h_fallback)

    worst_7d = pick_worst_hours(hourly_rows, count=2)
    hourly_strip = build_hourly_strip_payload(hourly_rows)
    hours_with_data = sum(1 for h in hourly_rows if _hour_has_reading(h))

    return {
        "entity_id": entity_id,
        "latest": latest,
        "worst_7d": worst_7d,
        "hourly": hourly_strip,
        "coverage": {
            "hours_with_data": hours_with_data,
            "hours_total": hours_total,
        },
    }
