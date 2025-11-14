# utils_data.py
from datetime import datetime, timezone
import requests

FIELDS = ["co2", "tvoc", "pm25", "temperature", "relativeHumidity"]


def run_cratedb_query(sql: str, auth_token: str, url: str, verbose: bool = False) -> dict:
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

    if verbose:
        print("Cols:", data.get("cols"))
        for row in data.get("rows", []):
            print(row)

    return data


def init_mqtt_portable(entity_id: str, limit: int, sql_runner, schema: str = "mttrikala") -> dict:
    if not entity_id:
        raise ValueError("Missing entity_id")

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


def calculate_avg_iaq(entity_id: str, sql_runner, schema: str = "mttrikala") -> dict:
    if not entity_id:
        raise ValueError("Missing entity_id")

    def _avg_for_window(window_ms: int) -> dict:
        sql = f"""
        SELECT
          AVG(co2)  AS avg_co2,
          AVG(pm25) AS avg_pm25,
          AVG(tvoc) AS avg_tvoc
        FROM {schema}.etwsensors
        WHERE entity_id = '{entity_id}'
          AND time_index >= CAST(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000 AS LONG) - {window_ms}
        """
        data = sql_runner(sql)
        row = (data.get("rows") or [[None, None, None]])[0]
        co2, pm25, tvoc = row
        return {
            "co2": round(co2, 2) if co2 is not None else None,
            "pm25": round(pm25, 2) if pm25 is not None else None,
            "tvoc": round(tvoc, 2) if tvoc is not None else None,
        }

    last_1h = _avg_for_window(3600000)
    last_8h = _avg_for_window(28800000)

    last_1h = None if all(v is None for v in last_1h.values()) else last_1h
    last_8h = None if all(v is None for v in last_8h.values()) else last_8h

    return {"last_1h": last_1h, "last_8h": last_8h}