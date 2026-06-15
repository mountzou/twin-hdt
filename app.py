import json
import uuid
import os
from datetime import datetime, timezone

from flask import Flask, render_template, redirect, url_for, session, jsonify, abort, request, current_app
from authlib.integrations.flask_client import OAuth
from werkzeug.exceptions import HTTPException

from sensor_data import get_sensor_historical_data
from config_env import DMP_SQL_API_URL, DMP_SQL_API_AUTH

from utils_auth import (
    validate_id_token,
    store_user_claims,
    store_sensor_ids,
    has_authenticated_session,
    has_selected_wbsensor,
    has_selected_portable,
)
from utils_data import (
    run_cratedb_query,
    init_mqtt_portable,
    init_mqtt_wearable,
    calculate_avg_iaq,
    calculate_hourly_iaq_means,
    build_dashboard_bootstrap,
    build_portable_co2_pm25_scatter,
    build_portable_co2_pm25_scatter_series,
    build_activity_status_summary_cards,
)
from utils_pred import predict_co2_arima, predict_co2_baseline, predict_pm25_arima

from iaq_policy_loader import load_policy, apply_iaq_policy
from iaq_health_score import build_health_iaq_payload

policy = load_policy("data/IAQ_breakpoints.json")

from mqtt_handler import (
    start_mqtt_thread,
    set_mqtt_topic_portable_device,
    is_mqtt_running,
    set_socketio,
    set_flask_app_for_mqtt,
)
from flask_socketio import SocketIO

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24))

socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)
set_socketio(socketio)
set_flask_app_for_mqtt(app)

oauth = OAuth(app)
keyrock = oauth.register(
    name='keyrock',
    client_id=os.getenv('OAUTH2_CLIENT_ID'),
    client_secret=os.getenv('OAUTH2_CLIENT_SECRET'),
    server_metadata_url=f"{os.getenv('OIDC_ISSUER_URL')}/.well-known/openid-configuration",
    client_kwargs={'scope': 'openid profile email jwt'},
)

# Make session available in all Jinja templates
@app.context_processor
def inject_user():
    return dict(session=session)


''' Register routes that handle HTML templates for HTTP errors '''
from routes_error import register_error_routes

register_error_routes(app)

''' Register routes that handle HTML templates for terms & conditions '''
from routes_terms import register_terms_routes

register_terms_routes(app)

from functools import wraps


def get_current_wbsensor_id():
    selected_wbsensor_id = session.get('selected_wbsensor_id')
    wb_sensors = session.get('wbsensors_ids') or []
    if not selected_wbsensor_id or selected_wbsensor_id not in wb_sensors:
        current_app.logger.warning(
            "missing wearable sensor context: path=%s sub=%s tenant=%s session_keys=%s",
            request.path,
            session.get('sub'),
            session.get('tenant'),
            list(session.keys()),
        )
        raise ValueError("No wearable sensor selected for the authenticated session")
    return selected_wbsensor_id


def get_current_portable_id():
    selected_portable_id = session.get('selected_portable_id')
    portable_ids = session.get('portable_ids') or []
    if not selected_portable_id or selected_portable_id not in portable_ids:
        current_app.logger.warning(
            "missing portable sensor context: path=%s sub=%s tenant=%s session_keys=%s",
            request.path,
            session.get('sub'),
            session.get('tenant'),
            list(session.keys()),
        )
        raise ValueError("No portable sensor assigned for the authenticated session")
    return selected_portable_id


def get_current_schema():
    schema = session.get('schema')
    if not schema:
        current_app.logger.warning(
            "missing schema context: path=%s sub=%s tenant=%s session_keys=%s",
            request.path,
            session.get('sub'),
            session.get('tenant'),
            list(session.keys()),
        )
        raise ValueError("No schema available for the authenticated session")
    return schema


def build_basic_iaq_payload(iaq_averages):
    pollutants = ("co2", "pm25", "tvoc")

    def build_period(period_values):
        if period_values is None:
            return None

        per_pollutant = {
            pollutant: (
                None
                if value is None
                else {
                    "value": value,
                    "label": "latest average",
                    "severity": None,
                    "effect": None,
                    "action": None,
                    "color": "grey",
                    "icon": None,
                }
            )
            for pollutant, value in period_values.items()
            if pollutant in pollutants
        }
        per_pollutant["overall"] = None

        if all(value is None for key, value in per_pollutant.items() if key != "overall"):
            return None

        return per_pollutant

    return {
        "last_1h": build_period(iaq_averages.get("last_1h")),
        "last_8h": build_period(iaq_averages.get("last_8h")),
        "last_24h": build_period(iaq_averages.get("last_24h")),
    }


def format_plain_measurement(value, unit):
    if value is None:
        return "N/A"
    return f"{value} {unit}"


def build_chart_breakpoints(policy_data, duration="1h"):
    sentinel_infinity = 1_000_000_000
    output = {}

    for pollutant in policy_data.get("pollutants", []):
        pollutant_id = pollutant.get("id")
        if not pollutant_id:
            continue

        rows = pollutant.get("breakpoints", {}).get(duration, [])
        finite_rows = []

        for row in rows:
            limit = row.get("le")
            if not isinstance(limit, (int, float)):
                continue
            if limit >= sentinel_infinity:
                continue

            finite_rows.append({
                "value": limit,
                "label": row.get("label"),
                "severity": row.get("severity"),
            })

        if finite_rows:
            output[pollutant_id] = finite_rows

    return output


INDEX_CHART_POLLUTANTS = {
    "co2": {
        "column": "co2",
        "label": "Carbon dioxide",
        "formula": "CO₂",
        "unit": "ppm",
        "decimals": 0,
    },
    "pm25": {
        "column": "pm25",
        "label": "Fine particulate matter",
        "formula": "PM₂.₅",
        "unit": "µg/m³",
        "decimals": 1,
    },
    "tvoc": {
        "column": "tvoc",
        "label": "Volatile organic compounds",
        "formula": "TVOC",
        "unit": "",
        "decimals": 0,
    },
}

INDEX_CHART_RANGES = {
    "1h": {
        "window_ms": 3600000,
        "bucket_ms": 60000,
        "label": "1 hour",
        "aggregation": "1-minute averages",
    },
    "6h": {
        "window_ms": 21600000,
        "bucket_ms": 900000,
        "label": "6 hours",
        "aggregation": "15-minute averages",
    },
    "8h": {
        "window_ms": 28800000,
        "bucket_ms": 1800000,
        "label": "8 hours",
        "aggregation": "30-minute averages",
    },
    "7d": {
        "window_ms": 604800000,
        "bucket_ms": 3600000,
        "label": "7 days",
        "aggregation": "1-hour averages",
    },
}


def build_index_chart_payload(entity_id: str, schema: str, pollutant_key: str, range_key: str, sql_runner) -> dict:
    pollutant = INDEX_CHART_POLLUTANTS.get(pollutant_key)
    range_config = INDEX_CHART_RANGES.get(range_key)
    if not pollutant or not range_config:
        raise ValueError("Unsupported chart pollutant or range")

    column = pollutant["column"]
    latest_sql = f"""
    SELECT MAX(time_index)
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
      AND {column} IS NOT NULL
    """
    latest_time = (sql_runner(latest_sql).get("rows") or [[None]])[0][0]
    if latest_time is None:
        return {
            "pollutant": pollutant_key,
            "range": range_key,
            "pollutant_meta": pollutant,
            "range_meta": range_config,
            "series": [],
            "stats": {
                "current": None,
                "average": None,
                "peak": None,
                "trough": None,
                "delta_percent": None,
            },
        }

    window_start = latest_time - range_config["window_ms"]
    bucket_ms = range_config["bucket_ms"]
    sql = f"""
    SELECT
      FLOOR(time_index / {bucket_ms}) * {bucket_ms} AS bucket,
      AVG({column}) AS value
    FROM {schema}.etwsensors
    WHERE entity_id = '{entity_id}'
      AND time_index >= {window_start}
      AND time_index <= {latest_time}
      AND {column} IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket
    """
    rows = [
        row
        for row in (sql_runner(sql).get("rows") or [])
        if row[0] is not None and row[1] is not None
    ]

    decimals = pollutant["decimals"]
    values = [round(row[1], decimals) for row in rows]
    series = [
        {
            "bucket": row[0],
            "timestamp": datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc).isoformat(),
            "value": round(row[1], decimals),
        }
        for row in rows
    ]

    average = round(sum(values) / len(values), decimals) if values else None
    current = values[-1] if values else None
    previous = values[-2] if len(values) > 1 else None
    delta_percent = None
    if current is not None and previous not in (None, 0):
        delta_percent = round(((current - previous) / previous) * 100, 1)

    return {
        "pollutant": pollutant_key,
        "range": range_key,
        "pollutant_meta": pollutant,
        "range_meta": range_config,
        "series": series,
        "stats": {
            "current": current,
            "average": average,
            "peak": max(values) if values else None,
            "trough": min(values) if values else None,
            "delta_percent": delta_percent,
        },
    }


# Decorator to ensure user is logged in before accessing HDT routes
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        is_authenticated, missing = has_authenticated_session()
        if not is_authenticated:
            current_app.logger.debug(
                "login_required denied: path=%s missing=%s session_keys=%s",
                request.path,
                missing,
                list(session.keys()),
            )
            return redirect(url_for('login'))
        current_app.logger.debug(
            "login_required passed: path=%s sub=%s tenant=%s",
            request.path,
            session.get('sub'),
            session.get('tenant'),
        )
        return f(*args, **kwargs)

    return decorated_function


def wearable_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if has_selected_wbsensor() and has_selected_portable():
            return f(*args, **kwargs)

        current_app.logger.debug(
            "wearable_required denied: path=%s sub=%s tenant=%s session_keys=%s",
            request.path,
            session.get('sub'),
            session.get('tenant'),
            list(session.keys()),
        )
        return render_template('wearable-selection.html')

    return decorated_function


def ensure_portable_mqtt_subscription(portable_id=None):
    portable_id = portable_id or get_current_portable_id()
    set_mqtt_topic_portable_device(session.get('tenant'), portable_id)
    if not is_mqtt_running():
        start_mqtt_thread()


@app.route('/')
@app.route('/index/')
@app.route('/dashboard/')
@login_required
@wearable_required
def index():
    selected_portable_id = get_current_portable_id()
    selected_wearable_id = get_current_wbsensor_id()
    ensure_portable_mqtt_subscription(selected_portable_id)
    return render_template(
        'index.html',
        selected_portable_id=selected_portable_id,
        selected_wearable_id=selected_wearable_id,
        chart_breakpoints=build_chart_breakpoints(policy, duration="1h"),
    )


@app.route('/index-1/')
@login_required
@wearable_required
def index_1_redirect():
    return redirect(url_for('index'))


@app.route('/cfd/')
@login_required
@wearable_required
def cfd():
    with open('data/cfd_metadata.json', 'r') as file:
        cfd_metadata = json.load(file)
    with open('data/cfd_results.json', 'r') as file:
        cfd_results = json.load(file)

    simulations = cfd_metadata.get('simulations', [])
    cfd_parameter_options = {
        'pm25': sorted({sim['initial_conditions']['pm25'] for sim in simulations}),
        'air_velocity': sorted({sim['initial_conditions']['air_velocity'] for sim in simulations}),
        'pm25_distribution': sorted({sim['initial_conditions']['pm25_distribution'] for sim in simulations}),
        'activity_state': sorted({sim['activity_state'] for sim in simulations}),
        'gender': sorted({sim['subject']['gender'] for sim in simulations}),
        'age_years': sorted({sim['subject']['age_years'] for sim in simulations}),
        'health_state': sorted({sim['subject']['health_state'] for sim in simulations}),
    }

    return render_template(
        'cfd.html',
        cfd_simulations=simulations,
        cfd_parameter_options=cfd_parameter_options,
        cfd_defaults=cfd_metadata.get('defaults', {}),
        cfd_results=cfd_results.get('results', []),
    )


@app.route('/health-recommendations/')
@app.route('/health_recommendations/')
@login_required
@wearable_required
def health_recommendations():
    return render_template(
        'health-recommendations.html',
        selected_portable_id=get_current_portable_id(),
    )


HEALTH_IAQ_HOURS = 168


@app.route('/api/health-recommendations/iaq', methods=['GET'])
@login_required
def health_recommendations_iaq():
    try:
        portable_id = get_current_portable_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        hourly_rows = calculate_hourly_iaq_means(
            portable_id,
            sql_runner=cratedb_run_query,
            schema=schema,
            hours=HEALTH_IAQ_HOURS,
        )

        last_1h_fallback = None
        if not hourly_rows or not any(
            row.get("co2") is not None or row.get("pm25") is not None
            for row in hourly_rows
        ):
            try:
                iaq_averages = calculate_avg_iaq(
                    portable_id,
                    sql_runner=cratedb_run_query,
                    schema=schema,
                )
                last_1h_fallback = iaq_averages.get("last_1h")
            except Exception:
                current_app.logger.exception(
                    "health_recommendations_iaq last_1h fallback error portable_id=%s",
                    portable_id,
                )

        payload = build_health_iaq_payload(
            hourly_rows,
            entity_id=portable_id,
            hours_total=HEALTH_IAQ_HOURS,
            last_1h_fallback=last_1h_fallback,
        )
        return jsonify(payload)

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning(
            "health_recommendations_iaq missing sensor context: %s",
            str(e),
        )
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        current_app.logger.exception("health_recommendations_iaq error")
        return jsonify({"error": str(e)}), 500


@app.route('/activity-status/')
@app.route('/activity_status/')
@login_required
@wearable_required
def activity_status():
    selected_wearable_id = get_current_wbsensor_id()
    selected_portable_id = get_current_portable_id()
    schema = get_current_schema()
    cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)
    portable_iaq_error = None
    co2_pm25_scatter_points = []
    co2_pm25_scatter_series = []
    activity_summary_cards = []

    try:
        co2_pm25_scatter_points = build_portable_co2_pm25_scatter(
            selected_portable_id,
            selected_wearable_id,
            sql_runner=cratedb_run_query,
            schema=schema,
            hours=24,
        )
        co2_pm25_scatter_series = build_portable_co2_pm25_scatter_series(
            co2_pm25_scatter_points
        )
        activity_summary_cards = build_activity_status_summary_cards(
            co2_pm25_scatter_points
        )
    except Exception:
        current_app.logger.exception(
            "activity_status portable IAQ scatter error for portable_id=%s schema=%s",
            selected_portable_id,
            schema,
        )
        portable_iaq_error = (
            "Unable to load 1-minute CO2 and PM2.5 averages for the assigned portable device."
        )

    return render_template(
        'activity-status.html',
        selected_wearable_id=selected_wearable_id,
        selected_portable_id=selected_portable_id,
        co2_pm25_scatter_points=co2_pm25_scatter_points,
        co2_pm25_scatter_series=co2_pm25_scatter_series,
        activity_summary_cards=activity_summary_cards,
        portable_iaq_error=portable_iaq_error,
    )


@app.route('/profile/')
@login_required
@wearable_required
def profile():
    store_sensor_ids()
    return render_template('profile.html')


with open('data/pollutants_info.json', 'r') as file:
    POLLUTANTS_DATA = json.load(file)


@app.route('/air-pollutants/')
@app.route('/air_pollutants/')
@login_required
@wearable_required
def air_pollutants():
    return render_template('air-pollutants.html', pollutants_info=POLLUTANTS_DATA)


@app.route('/air-pollutant/<pollutant>')
@app.route('/air_pollutant/<pollutant>')
@login_required
@wearable_required
def air_pollutant(pollutant):
    if pollutant not in POLLUTANTS_DATA:
        abort(404)
    return render_template('air-pollutant.html', pollutant=pollutant, pollutants_info=POLLUTANTS_DATA)


@app.route('/get_pollutants_historical_data', methods=['POST'])
@login_required
def get_pollutants_historical_data():
    keys = ['type', 'fromDate', 'toDate', 'attrs', 'aggrPeriod', 'aggrMethod']
    params = {key: request.json.get(key) for key in keys}

    sensor_data = get_sensor_historical_data(
        params,
        request.json['sensorID'],
    )

    if sensor_data:
        return jsonify(sensor_data)
    else:
        return jsonify({'error': 'Unable to fetch data'}), 500


@app.route('/init_mqtt_queue', methods=['POST'])
@login_required
def init_mqtt_queue():
    try:
        PORTABLE_ID = get_current_portable_id()
        schema = get_current_schema()

        body = request.get_json(silent=True) or {}
        last_n = body.get('lastN', 10)

        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)
        payload_portable = init_mqtt_portable(PORTABLE_ID, limit=last_n, sql_runner=cratedb_run_query, schema=schema)

        return jsonify(payload_portable)

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning("init_mqtt_queue missing sensor context: %s", str(e))
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        current_app.logger.exception("init_mqtt_queue error")
        return jsonify({"error": str(e)}), 500


@app.route('/get_init_pb_data', methods=['POST'])
@login_required
def get_init_pb_data():
    try:
        selected_portable_id = get_current_portable_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        recent_series = init_mqtt_portable(selected_portable_id, limit=121, sql_runner=cratedb_run_query, schema=schema)
        bootstrap = build_dashboard_bootstrap(recent_series)
        iaq_averages = {
            "last_1h": None,
            "last_8h": None,
            "last_24h": None,
        }

        try:
            iaq_averages = calculate_avg_iaq(selected_portable_id, sql_runner=cratedb_run_query, schema=schema)
            try:
                classified_iaq = apply_iaq_policy(iaq_averages, policy)
            except Exception:
                current_app.logger.exception(
                    "get_init_pb_data IAQ classification error for portable_id=%s schema=%s",
                    selected_portable_id,
                    schema,
                )
                classified_iaq = build_basic_iaq_payload(iaq_averages)
        except Exception:
            current_app.logger.exception(
                "get_init_pb_data IAQ average error for portable_id=%s schema=%s",
                selected_portable_id,
                schema,
            )
            classified_iaq = {
                "last_1h": None,
                "last_8h": None,
            }

        try:
            hourly_iaq = calculate_hourly_iaq_means(
                selected_portable_id,
                sql_runner=cratedb_run_query,
                schema=schema,
                hours=24,
            )
        except Exception:
            current_app.logger.exception(
                "get_init_pb_data hourly IAQ error for portable_id=%s schema=%s",
                selected_portable_id,
                schema,
            )
            hourly_iaq = []

        co2_predictions = {
            **predict_co2_baseline(bootstrap["predictions"]["co2"]),
            **predict_co2_arima(bootstrap["predictions"]["co2"]),
        }
        pm25_predictions = predict_pm25_arima(bootstrap["predictions"]["pm25"])

        return jsonify({
            "historical_chart_data": bootstrap["historical_chart_data"],
            "cfd": bootstrap["cfd"],
            "iaq": {
                "entity_id": selected_portable_id,
                **classified_iaq,
            },
            "iaq_averages": iaq_averages,
            "hourly_iaq": hourly_iaq,
            "predictions": {
                "co2": co2_predictions,
                "pm25": pm25_predictions,
            },
        })

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning("get_init_pb_data missing sensor context: %s", str(e))
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        current_app.logger.exception("get_init_pb_data error")
        return jsonify({"error": str(e)}), 500


@app.route('/api/index/chart-data')
@app.route('/api/index-1/chart-data')
@login_required
def index_chart_data():
    try:
        selected_portable_id = get_current_portable_id()
        schema = get_current_schema()
        pollutant_key = (request.args.get("pollutant") or "co2").lower()
        range_key = (request.args.get("range") or "1h").lower()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        return jsonify(
            build_index_chart_payload(
                selected_portable_id,
                schema,
                pollutant_key,
                range_key,
                cratedb_run_query,
            )
        )

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning("index_chart_data bad request: %s", str(e))
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("index_chart_data error")
        return jsonify({"error": str(e)}), 500


@app.route('/api/index/wearable-data')
@app.route('/api/index-1/wearable-data')
@login_required
def index_wearable_data():
    try:
        selected_wearable_id = get_current_wbsensor_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)
        recent_series = init_mqtt_wearable(
            selected_wearable_id,
            limit=121,
            sql_runner=cratedb_run_query,
            schema=schema,
        )
        return jsonify({
            "entity_id": selected_wearable_id,
            "historical_chart_data": recent_series,
        })

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning("index_wearable_data bad request: %s", str(e))
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("index_wearable_data error")
        return jsonify({"error": str(e)}), 500


@app.route('/calculate/predictions', methods=['GET'])
@login_required
def calculate_predictions():
    try:
        portable_id = get_current_portable_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        bootstrap = build_dashboard_bootstrap(portable_id, sql_runner=cratedb_run_query, schema=schema)

        co2_predictions = {
            **predict_co2_baseline(bootstrap["predictions"]["co2"]),
            **predict_co2_arima(bootstrap["predictions"]["co2"]),
        }
        pm25_predictions = predict_pm25_arima(bootstrap["predictions"]["pm25"])

        return jsonify({
            "co2": co2_predictions,
            "pm25": pm25_predictions,
        })

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning("calculate_predictions missing sensor context: %s", str(e))
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        current_app.logger.exception("calculate_predictions error")
        return jsonify({"error": str(e)}), 500


@app.route('/calculate/iaq/avg', methods=['GET'])
@login_required
def iaq_avg():
    try:
        PORTABLE_ID = get_current_portable_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        iaq_averages = calculate_avg_iaq(PORTABLE_ID, sql_runner=cratedb_run_query, schema=schema)
        try:
            classified = apply_iaq_policy(iaq_averages, policy)
        except Exception:
            current_app.logger.exception(
                "iaq_avg classification error for portable_id=%s schema=%s",
                PORTABLE_ID,
                schema,
            )
            classified = build_basic_iaq_payload(iaq_averages)

        return jsonify({
            "entity_id": PORTABLE_ID,
            **classified
        })

    except HTTPException:
        raise
    except ValueError as e:
        current_app.logger.warning("iaq_avg missing sensor context: %s", str(e))
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        current_app.logger.exception("iaq_avg error")
        return jsonify({"error": str(e)}), 500


@app.route('/api/devices_portable')
@login_required
def get_devices_portable():
    try:
        PORTABLE_ID = get_current_portable_id()
        return {"portable_id": PORTABLE_ID}
    except ValueError as e:
        current_app.logger.warning("devices_portable missing sensor context: %s", str(e))
        return jsonify({"error": str(e)}), 503


@app.route('/session/wearable', methods=['POST'])
@login_required
def set_session_wearable():
    try:
        return jsonify({
            "selected_wearable_id": get_current_wbsensor_id(),
            "selected_portable_id": get_current_portable_id(),
        }), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 503


# User authentication routes
@app.route('/login')
def login():
    session['nonce'] = str(uuid.uuid4())
    session['state'] = str(uuid.uuid4())
    redirect_uri = url_for('authorize', _external=True)

    return keyrock.authorize_redirect(
        redirect_uri,
        prompt='login',
        state=session['state'],
        nonce=session['nonce'],
        response_type='id_token',
    )


@app.route('/authorize')
def authorize():
    current_app.logger.debug(
        "authorize called: args=%s session_keys=%s",
        list(request.args.keys()),
        list(session.keys()),
    )
    if not (claims := validate_id_token(request.args.get('id_token'), session.get('nonce'))):
        current_app.logger.debug("authorize failed: invalid id_token")
        return "ID Token validation failed!", 400

    # Check if the state exists in the session
    if 'state' not in session:
        current_app.logger.debug("authorize failed: missing state in session")
        return "State is missing in session!", 400  # Handle missing state

    # Check if the state matches
    if request.args.get('state') != session['state']:
        current_app.logger.debug(
            "authorize failed: state mismatch request_state=%s session_state=%s",
            request.args.get('state'),
            session.get('state'),
        )
        return "State does not match!", 400  # Handle the error as you see fit

    # Check if the user is associated with tenant, otherwise force logout
    if not claims['extra'].get('tenant'):
        current_app.logger.debug("authorize failed: tenant missing in claims")
        session.clear()
        logout_url = f"{os.getenv('OAUTH2_URL_LOGOUT')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
        return render_template('_error/error_tenant.html', logout_url=logout_url)

    # Store in session variable the user's information
    store_user_claims(claims)
    current_app.logger.debug(
        "authorize stored claims: sub=%s email=%s tenant=%s session_keys=%s",
        session.get('sub'),
        session.get('email'),
        session.get('tenant'),
        list(session.keys()),
    )
    # Store in session variable the tenant's sensor information
    store_sensor_ids()
    if session.get('selected_portable_id'):
        set_mqtt_topic_portable_device(session.get('tenant'), session.get('selected_portable_id'))
        if not is_mqtt_running():
            start_mqtt_thread()

    current_app.logger.debug(
        "authorize stored sensors: tenant=%s portable=%s wearable=%s",
        session.get('tenant'),
        len(session.get('portable_ids', [])),
        len(session.get('wbsensors_ids', [])),
    )
    session.pop('nonce', None)
    session.pop('state', None)
    session.pop('_state_keyrock_oic', None)
    current_app.logger.debug(
        "authorize cleaned transient session keys: session_keys=%s",
        list(session.keys()),
    )

    return redirect(url_for('index'))


@app.route('/logout')
def logout():
    session.clear()
    request_url = f"{os.getenv('OAUTH2_URL_LOGOUT')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
    return redirect(request_url)


# Start the Flask application with SocketIO
if __name__ == "__main__":
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, port=5656)
