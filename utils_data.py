# utils_data.py
from datetime import datetime, timezone
from typing import Optional
import requests

FIELDS = ["co2", "tvoc", "pm25", "temperature", "relativeHumidity"]


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
    chart_limit: int = 20,
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
    SELECT MAX(time_index)
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
    """

    latest_time_index = (sql_runner(latest_time_sql).get("rows") or [[None]])[0][0]

    if latest_time_index is None:
        return {"last_1h": None, "last_8h": None}

    def avg_for_window(window_ms: int) -> Optional[dict]:
        window_start = latest_time_index - window_ms
        sql = f"""
        SELECT
          AVG(co2)  AS avg_co2,
          AVG(pm25) AS avg_pm25,
          AVG(tvoc) AS avg_tvoc
        FROM {schema}.etwsensors
        WHERE entity_id = '{entity_id}'
          AND time_index >= {window_start}
          AND time_index <= {latest_time_index}
        """
        row = (sql_runner(sql).get("rows") or [[None, None, None]])[0]
        values = {
            "co2": round(row[0], 2) if row[0] is not None else None,
            "pm25": round(row[1], 2) if row[1] is not None else None,
            "tvoc": round(row[2], 2) if row[2] is not None else None,
        }
        return None if all(value is None for value in values.values()) else values

    return {
        "last_1h": avg_for_window(3600000),
        "last_8h": avg_for_window(28800000),
    }
