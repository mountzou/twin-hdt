# utils_data.py
from datetime import datetime, timezone
from typing import Optional
import random
import requests

FIELDS = ["co2", "tvoc", "pm25", "temperature", "relativeHumidity"]
ACTIVITY_CLASS_LABELS = {
    0: "Rest",
    1: "Walking",
    2: "Exercise",
}

ACTIVITY_CLASS_COLORS = {
    "Rest": "#24c19a",
    "Walking": "#fbbf23",
    "Exercise": "#f5785c",
    "Unknown": "#aeb4bd",
}

ACTIVITY_CLASS_BG_COLORS = {
    "Rest": "#aaecdb",
    "Walking": "#fdeabb",
    "Exercise": "#f1bfb3",
    "Unknown": "#eef1f4",
}

SPO2_DISPLAY_MIN = 96.0
SPO2_DISPLAY_RANDOM_MIN = 96
SPO2_DISPLAY_RANDOM_MAX = 99


def normalize_spo2_display(value: Optional[float]) -> Optional[float]:
    """Clamp SpO2 for display: values below 96% are shown as a random integer 96–99%."""
    if value is None:
        return None
    numeric = float(value)
    if numeric < SPO2_DISPLAY_MIN:
        return float(random.randint(SPO2_DISPLAY_RANDOM_MIN, SPO2_DISPLAY_RANDOM_MAX))
    return numeric


WEARABLE_FIELDS = [
    "spo2",
    "heartRate",
    "activityClass",
    "spo2Confidence",
    "hrConfidence",
    "spo2_conf100",
    "heartRate_conf100",
]
IAQ_POLLUTANTS = ("co2", "pm25", "tvoc")
IAQ_BUCKET_MS = 60000
IAQ_HOUR_MS = 3600000
IAQ_DAY_MS = 86400000
IAQ_CADENCE_LOOKBACK = 20
IAQ_WINDOW_LOOKBACK_FACTOR = 3


def run_cratedb_query(sql: str, auth_token: str, url: str) -> dict:
    if not auth_token:
        raise ValueError("CrateDB AUTH token is missing")

    headers = {"X-Auth-Token": auth_token, "Content-Type": "application/json"}

    try:
        resp = requests.post(url, headers=headers, json={"stmt": sql}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        raise RuntimeError("CrateDB request timed out")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("CrateDB connection failed")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"CrateDB HTTP error: {e.response.text}")
    except Exception as e:
        raise RuntimeError(f"CrateDB unexpected error: {e}")

    return data


def init_mqtt_portable(entity_id: str, limit: int, sql_runner, schema: str) -> dict:
    if not entity_id or not schema:
        raise ValueError("Missing entity_id or schema")

    sql = f"""
    SELECT
      entity_id,
      FLOOR(time_index / 60000) * 60000 AS bucket,
      AVG(co2)              AS co2,
      AVG(tvoc)             AS tvoc,
      AVG(pm25)             AS pm25,
      AVG(temperature)      AS temperature,
      AVG(relativeHumidity) AS relativeHumidity
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
    GROUP BY entity_id, bucket
    ORDER BY bucket DESC
    LIMIT {limit}
    """

    data = sql_runner(sql)
    rows = (data.get("rows") or [])[::-1]

    index_iso = [
        datetime.fromtimestamp(r[1] / 1000, tz=timezone.utc).isoformat()
        for r in rows
    ]

    attributes = [
        {
            "attrName": f,
            "values": [(round(r[i], 2) if r[i] is not None else None) for r in rows],
        }
        for i, f in enumerate(FIELDS, start=2)
    ]

    return {"index": index_iso, "attributes": attributes}


def init_mqtt_wearable(entity_id: str, limit: int, sql_runner, schema: str) -> dict:
    if not entity_id or not schema:
        raise ValueError("Missing entity_id or schema")

    sql = f"""
    SELECT
      entity_id,
      FLOOR(time_index / 60000) * 60000 AS bucket,
      AVG(spo2)       AS spo2,
      AVG(heartRate)  AS heartRate,
      CAST(ROUND(AVG(activityClass)) AS INTEGER) AS activityClass,
      AVG(spo2Confidence) AS spo2Confidence,
      AVG(hrConfidence) AS hrConfidence,
      AVG(CASE WHEN spo2Confidence > 90 THEN spo2 END) AS spo2_conf100,
      AVG(CASE WHEN hrConfidence > 90 THEN heartRate END) AS heartRate_conf100
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
    GROUP BY entity_id, bucket
    ORDER BY bucket DESC
    LIMIT {limit}
    """

    data = sql_runner(sql)
    rows = (data.get("rows") or [])[::-1]

    index_iso = [
        datetime.fromtimestamp(r[1] / 1000, tz=timezone.utc).isoformat()
        for r in rows
    ]

    attributes = []
    for i, field_name in enumerate(WEARABLE_FIELDS, start=2):
        if field_name == "activityClass":
            values = [
                int(round(r[i])) if r[i] is not None else None
                for r in rows
            ]
        else:
            values = [
                (round(r[i], 2) if r[i] is not None else None)
                for r in rows
            ]
            if field_name in ("spo2", "spo2_conf100"):
                values = [normalize_spo2_display(v) for v in values]
        attributes.append({"attrName": field_name, "values": values})

    return {"index": index_iso, "attributes": attributes}


def _resolve_scatter_window(
    entity_id: str,
    sql_runner,
    schema: str,
    *,
    hours: int,
) -> Optional[tuple[int, int]]:
    if not entity_id or not schema or hours <= 0:
        raise ValueError("Missing entity_id or schema")

    latest_bucket_sql = f"""
    SELECT FLOOR(MAX(time_index) / {IAQ_BUCKET_MS}) * {IAQ_BUCKET_MS}
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
    """
    latest_bucket = (sql_runner(latest_bucket_sql).get("rows") or [[None]])[0][0]
    if latest_bucket is None:
        return None

    window_start = latest_bucket - (hours * IAQ_HOUR_MS)
    return window_start, latest_bucket


def build_activity_class_bucket_modes(
    wearable_entity_id: str,
    sql_runner,
    schema: str,
    *,
    window_start: int,
    latest_bucket: int,
) -> dict[int, int]:
    if not wearable_entity_id or not schema:
        raise ValueError("Missing wearable_entity_id or schema")

    sql = f"""
    SELECT
      FLOOR(time_index / {IAQ_BUCKET_MS}) * {IAQ_BUCKET_MS} AS bucket,
      CAST(ROUND(activityClass) AS INTEGER) AS activity_class,
      COUNT(*) AS freq
    FROM {schema}.etwsensors
    WHERE entity_id = '{wearable_entity_id}'
      AND activityClass IS NOT NULL
      AND time_index >= {window_start}
      AND time_index <= {latest_bucket + IAQ_BUCKET_MS - 1}
    GROUP BY bucket, activity_class
    ORDER BY bucket, freq DESC, activity_class
    """

    bucket_counts: dict[int, list[tuple[int, int]]] = {}
    for bucket, activity_class, freq in sql_runner(sql).get("rows") or []:
        if bucket is None or activity_class is None:
            continue
        bucket_counts.setdefault(bucket, []).append((int(activity_class), int(freq)))

    modes: dict[int, int] = {}
    for bucket, class_counts in bucket_counts.items():
        modes[bucket] = max(class_counts, key=lambda item: (item[1], -item[0]))[0]
    return modes


def build_portable_co2_pm25_scatter(
    portable_entity_id: str,
    wearable_entity_id: str,
    sql_runner,
    schema: str,
    *,
    hours: int = 24,
) -> list[dict]:
    window = _resolve_scatter_window(
        portable_entity_id,
        sql_runner,
        schema,
        hours=hours,
    )
    if window is None:
        return []

    window_start, latest_bucket = window
    activity_modes = build_activity_class_bucket_modes(
        wearable_entity_id,
        sql_runner,
        schema,
        window_start=window_start,
        latest_bucket=latest_bucket,
    )

    sql = f"""
    SELECT
      FLOOR(time_index / {IAQ_BUCKET_MS}) * {IAQ_BUCKET_MS} AS bucket,
      AVG(co2) AS co2,
      AVG(pm25) AS pm25
    FROM {schema}.etwsensors
    WHERE entity_id = '{portable_entity_id}'
      AND time_index >= {window_start}
      AND time_index <= {latest_bucket + IAQ_BUCKET_MS - 1}
    GROUP BY bucket
    ORDER BY bucket
    """

    points = []
    for bucket, co2, pm25 in sql_runner(sql).get("rows") or []:
        if co2 is None or pm25 is None:
            continue
        mode_code = activity_modes.get(bucket)
        if mode_code is None:
            continue
        activity_label = ACTIVITY_CLASS_LABELS.get(mode_code)
        if activity_label is None:
            continue

        bucket_dt = datetime.fromtimestamp(bucket / 1000, tz=timezone.utc)
        points.append({
            "x": round(co2, 2),
            "y": round(pm25, 2),
            "bucket_ms": bucket,
            "bucket_iso": bucket_dt.isoformat(),
            "bucket_display": bucket_dt.strftime("%Y-%m-%d %H:%M"),
            "activity_code": mode_code,
            "activity_label": activity_label,
            "color": ACTIVITY_CLASS_COLORS[activity_label],
        })

    return points


def _activity_pollutant_stats(values: list[float]) -> dict:
    if not values:
        return {"min": None, "max": None, "avg": None}
    return {
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "avg": round(sum(values) / len(values), 2),
    }


def build_activity_status_summary_cards(points: list[dict]) -> list[dict]:
    """Per-activity sample share and CO2/PM2.5 min-max-avg for activity-status side cards."""
    total = len(points)
    cards = []

    for label in ACTIVITY_CLASS_LABELS.values():
        class_points = [
            point for point in points if point.get("activity_label") == label
        ]
        count = len(class_points)
        percent = round(100 * count / total) if total else 0

        cards.append({
            "name": label,
            "color": ACTIVITY_CLASS_COLORS[label],
            "bg_color": ACTIVITY_CLASS_BG_COLORS[label],
            "percent": percent,
            "count": count,
            "co2": _activity_pollutant_stats([point["x"] for point in class_points]),
            "pm25": _activity_pollutant_stats([point["y"] for point in class_points]),
        })

    return cards


def build_portable_co2_pm25_scatter_series(points: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = {
        label: [] for label in ACTIVITY_CLASS_LABELS.values()
    }

    for point in points:
        label = point["activity_label"]
        buckets[label].append({
            "x": point["x"],
            "y": point["y"],
            "bucket_display": point["bucket_display"],
            "activity_label": label,
        })

    return [
        {
            "name": label,
            "data": data,
            "color": ACTIVITY_CLASS_COLORS[label],
        }
        for label, data in buckets.items()
        if data
    ]


def slice_payload_tail(payload: dict, limit: int) -> dict:
    if limit <= 0:
        return {"index": [], "attributes": []}

    return {
        "index": (payload.get("index") or [])[-limit:],
        "attributes": [
            {
                "attrName": attr.get("attrName"),
                "values": (attr.get("values") or [])[-limit:],
            }
            for attr in payload.get("attributes", [])
        ],
    }


def build_dashboard_bootstrap(
    recent_series: dict,
    chart_limit: int = 121,
    cfd_co2_limit: int = 21,
    cfd_pm25_limit: int = 25,
    prediction_limit: int = 10,
) -> dict:
    def get_attribute_values(payload: dict, attr_name: str) -> list:
        return next(
            (attr.get("values", []) for attr in payload.get("attributes", []) if attr.get("attrName") == attr_name),
            []
        )

    chart_payload = slice_payload_tail(recent_series, chart_limit)
    cfd_co2_payload = slice_payload_tail(recent_series, cfd_co2_limit)
    cfd_pm25_payload = slice_payload_tail(recent_series, cfd_pm25_limit)
    prediction_payload = slice_payload_tail(recent_series, prediction_limit)

    return {
        "historical_chart_data": chart_payload,
        "cfd": {
            "co2": get_attribute_values(cfd_co2_payload, "co2")[:-2],
            "pm25": get_attribute_values(cfd_pm25_payload, "pm25")[:-6],
        },
        "predictions": {
            "co2": prediction_payload,
            "pm25": prediction_payload,
        },
    }


def calculate_avg_iaq(entity_id: str, sql_runner, schema: str) -> dict:
    if not entity_id or not schema:
        raise ValueError("Missing entity_id or schema")

    latest_time_sql = f"""
    SELECT FLOOR(MAX(time_index) / {IAQ_BUCKET_MS}) * {IAQ_BUCKET_MS}
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
    """

    latest_bucket = (sql_runner(latest_time_sql).get("rows") or [[None]])[0][0]

    if latest_bucket is None:
        return {"last_1h": None, "last_8h": None, "last_24h": None}

    cadence_sql = f"""
    SELECT bucket
    FROM (
      SELECT FLOOR(time_index / {IAQ_BUCKET_MS}) * {IAQ_BUCKET_MS} AS bucket
      FROM {schema}.etwsensors
      WHERE entity_id = '{entity_id}'
    ) AS minute_measurements
    GROUP BY bucket
    ORDER BY bucket DESC
    LIMIT {IAQ_CADENCE_LOOKBACK}
    """
    recent_buckets = sorted(row[0] for row in (sql_runner(cadence_sql).get("rows") or []) if row[0] is not None)
    bucket_gaps = [
        recent_buckets[idx] - recent_buckets[idx - 1]
        for idx in range(1, len(recent_buckets))
        if recent_buckets[idx] > recent_buckets[idx - 1]
    ]
    cadence_ms = max(set(bucket_gaps), key=bucket_gaps.count) if bucket_gaps else IAQ_BUCKET_MS

    max_expected_count = max(1, int(round(86400000 / cadence_ms)))
    history_limit = max(IAQ_CADENCE_LOOKBACK, max_expected_count * IAQ_WINDOW_LOOKBACK_FACTOR)
    history_sql = f"""
    SELECT
      bucket,
      AVG(co2)  AS avg_co2,
      AVG(pm25) AS avg_pm25,
      AVG(tvoc) AS avg_tvoc
    FROM (
      SELECT
        FLOOR(time_index / {IAQ_BUCKET_MS}) * {IAQ_BUCKET_MS} AS bucket,
        co2,
        pm25,
        tvoc
      FROM {schema}.etwsensors
      WHERE entity_id = '{entity_id}'
    ) AS minute_measurements
    GROUP BY bucket
    ORDER BY bucket DESC
    LIMIT {history_limit}
    """
    history_rows = sorted(sql_runner(history_sql).get("rows") or [], key=lambda row: row[0])

    def build_period(window_start: int, window_end: int, sample_count: int, expected_count: int, is_successive: bool) -> dict:
        return {
            "start": datetime.fromtimestamp(window_start / 1000, tz=timezone.utc).isoformat(),
            "end": datetime.fromtimestamp(window_end / 1000, tz=timezone.utc).isoformat(),
            "sample_count": sample_count,
            "expected_count": int(expected_count),
            "cadence_ms": cadence_ms,
            "is_successive": is_successive,
            "is_complete": sample_count == int(expected_count) and is_successive,
        }

    def summarize_window_rows(window_rows: list, window_start: int, expected_bucket_count: int) -> dict:
        expected_buckets = [
            window_start + (idx * cadence_ms)
            for idx in range(int(expected_bucket_count))
        ]
        buckets = [row[0] for row in window_rows]
        is_successive = buckets == expected_buckets

        if not window_rows:
            values = {pollutant: None for pollutant in IAQ_POLLUTANTS}
            values["period"] = build_period(
                window_start,
                latest_bucket,
                0,
                expected_bucket_count,
                False,
            )
            return values

        values = {pollutant: None for pollutant in IAQ_POLLUTANTS}

        pollutant_columns = {
            "co2": 1,
            "pm25": 2,
            "tvoc": 3,
        }
        for pollutant, column_index in pollutant_columns.items():
            pollutant_values = [
                row[column_index]
                for row in window_rows
                if row[column_index] is not None
            ]
            if pollutant_values:
                values[pollutant] = round(sum(pollutant_values) / len(pollutant_values), 2)

        values["period"] = build_period(
            window_start,
            latest_bucket,
            len(window_rows),
            expected_bucket_count,
            is_successive,
        )
        return values

    def window_rows_for_latest_period(expected_bucket_count: int) -> list:
        window_start = latest_bucket - ((expected_bucket_count - 1) * cadence_ms)
        return [
            row
            for row in history_rows
            if window_start <= row[0] <= latest_bucket
        ]

    def latest_window(expected_bucket_count: int) -> dict:
        window_start = latest_bucket - ((expected_bucket_count - 1) * cadence_ms)
        window_rows = window_rows_for_latest_period(expected_bucket_count)
        return summarize_window_rows(window_rows, window_start, expected_bucket_count)

    def avg_for_window(window_ms: int) -> Optional[dict]:
        expected_bucket_count = max(1, int(round(window_ms / cadence_ms)))
        return latest_window(expected_bucket_count)

    return {
        "last_1h": avg_for_window(3600000),
        "last_8h": avg_for_window(28800000),
        "last_24h": avg_for_window(86400000),
    }


def calculate_hourly_iaq_means(entity_id: str, sql_runner, schema: str, hours: int = 24) -> list:
    if not entity_id or not schema:
        raise ValueError("Missing entity_id or schema")
    if hours <= 0:
        return []

    latest_hour_sql = f"""
    SELECT FLOOR(MAX(time_index) / {IAQ_HOUR_MS}) * {IAQ_HOUR_MS}
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
    """

    latest_hour = (sql_runner(latest_hour_sql).get("rows") or [[None]])[0][0]
    if latest_hour is None:
        return []

    window_start = latest_hour - ((hours - 1) * IAQ_HOUR_MS)
    sql = f"""
    SELECT
      hour_bucket,
      AVG(co2)  AS avg_co2,
      AVG(pm25) AS avg_pm25,
      AVG(tvoc) AS avg_tvoc
    FROM (
      SELECT
        FLOOR(time_index / {IAQ_HOUR_MS}) * {IAQ_HOUR_MS} AS hour_bucket,
        co2,
        pm25,
        tvoc
      FROM {schema}.etwsensors
      WHERE entity_id = '{entity_id}'
        AND time_index >= {window_start}
        AND time_index < {latest_hour + IAQ_HOUR_MS}
    ) AS hourly_measurements
    GROUP BY hour_bucket
    ORDER BY hour_bucket
    """

    rows_by_hour = {
        row[0]: row
        for row in (sql_runner(sql).get("rows") or [])
        if row[0] is not None
    }

    hourly_means = []
    for idx in range(hours):
        hour_bucket = window_start + (idx * IAQ_HOUR_MS)
        row = rows_by_hour.get(hour_bucket)
        timestamp = datetime.fromtimestamp(hour_bucket / 1000, tz=timezone.utc)
        hourly_means.append({
            "bucket": hour_bucket,
            "label": timestamp.strftime("%H:%M"),
            "full_label": timestamp.strftime("%Y-%m-%d %H:%M"),
            "co2": round(row[1], 2) if row and row[1] is not None else None,
            "pm25": round(row[2], 2) if row and row[2] is not None else None,
            "tvoc": round(row[3], 2) if row and row[3] is not None else None,
        })

    return hourly_means
