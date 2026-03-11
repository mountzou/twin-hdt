import json
import uuid
import os

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
)
from utils_data import (
    run_cratedb_query,
    init_mqtt_portable,
    calculate_avg_iaq,
    build_dashboard_bootstrap,
)
from utils_pred import predict_co2_arima, predict_co2_baseline, predict_pm25_arima

from iaq_policy_loader import load_policy, apply_iaq_policy

policy = load_policy("data/IAQ_breakpoints.json")

from mqtt_handler import start_mqtt_thread, set_mqtt_topic_portable_device, is_mqtt_running, set_socketio
from flask_socketio import SocketIO

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24))

socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)
set_socketio(socketio)

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
        }
        per_pollutant["overall"] = None

        if all(value is None for key, value in per_pollutant.items() if key != "overall"):
            return None

        return per_pollutant

    return {
        "last_1h": build_period(iaq_averages.get("last_1h")),
        "last_8h": build_period(iaq_averages.get("last_8h")),
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
        if has_selected_wbsensor():
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


@app.route('/')
@app.route('/index/')
@app.route('/dashboard/')
@login_required
@wearable_required
def index():
    return render_template('index.html')


@app.route('/scenario-analysis/')
@app.route('/scenario_analysis/')
@login_required
@wearable_required
def scenario_analysis():
    return render_template('scenario-analysis.html')


@app.route('/health-recommendations/')
@app.route('/health_recommendations/')
@login_required
@wearable_required
def health_recommendations():
    return render_template('health-recommendations.html')


@app.route('/activity-status/')
@app.route('/activity_status/')
@login_required
@wearable_required
def activity_status():
    return render_template('activity-status.html')


@app.route('/profile/')
@login_required
@wearable_required
def profile():
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
        PORTABLE_ID = get_current_wbsensor_id()
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
        selected_wearable_id = get_current_wbsensor_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        recent_series = init_mqtt_portable(selected_wearable_id, limit=25, sql_runner=cratedb_run_query, schema=schema)
        bootstrap = build_dashboard_bootstrap(recent_series)

        try:
            iaq_averages = calculate_avg_iaq(selected_wearable_id, sql_runner=cratedb_run_query, schema=schema)
            try:
                classified_iaq = apply_iaq_policy(iaq_averages, policy)
            except Exception:
                current_app.logger.exception(
                    "get_init_pb_data IAQ classification error for wearable_id=%s schema=%s",
                    selected_wearable_id,
                    schema,
                )
                classified_iaq = build_basic_iaq_payload(iaq_averages)
        except Exception:
            current_app.logger.exception(
                "get_init_pb_data IAQ average error for wearable_id=%s schema=%s",
                selected_wearable_id,
                schema,
            )
            classified_iaq = {
                "last_1h": None,
                "last_8h": None,
            }

        co2_predictions = {
            **predict_co2_baseline(bootstrap["predictions"]["co2"]),
            **predict_co2_arima(bootstrap["predictions"]["co2"]),
        }
        pm25_predictions = predict_pm25_arima(bootstrap["predictions"]["pm25"])

        return jsonify({
            "historical_chart_data": bootstrap["historical_chart_data"],
            "cfd": bootstrap["cfd"],
            "iaq": {
                "entity_id": selected_wearable_id,
                **classified_iaq,
            },
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


@app.route('/calculate/iaq/avg', methods=['GET'])
@login_required
def iaq_avg():
    try:
        PORTABLE_ID = get_current_wbsensor_id()
        schema = get_current_schema()
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        iaq_averages = calculate_avg_iaq(PORTABLE_ID, sql_runner=cratedb_run_query, schema=schema)
        try:
            classified = apply_iaq_policy(iaq_averages, policy)
        except Exception:
            current_app.logger.exception(
                "iaq_avg classification error for wearable_id=%s schema=%s",
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
        PORTABLE_ID = get_current_wbsensor_id()
        return {"portable_id": PORTABLE_ID}
    except ValueError as e:
        current_app.logger.warning("devices_portable missing sensor context: %s", str(e))
        return jsonify({"error": str(e)}), 503


@app.route('/session/wearable', methods=['POST'])
@login_required
def set_session_wearable():
    wearable_id = (request.get_json(silent=True) or {}).get('wearable_id')
    if not wearable_id:
        return jsonify({"error": "wearable_id is required"}), 400

    available_wbsensors = session.get('wbsensors_ids') or []
    if wearable_id not in available_wbsensors:
        return jsonify({"error": "Selected wearable is not available for this tenant"}), 400

    session['selected_wbsensor_id'] = wearable_id
    current_app.logger.info(
        "wearable selected: sub=%s tenant=%s wearable_id=%s",
        session.get('sub'),
        session.get('tenant'),
        wearable_id,
    )

    set_mqtt_topic_portable_device(session.get('tenant'), wearable_id)
    if not is_mqtt_running():
        start_mqtt_thread()

    return jsonify({"selected_wearable_id": wearable_id}), 200


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
    current_app.logger.debug(
        "authorize stored sensors: tenant=%s hw=%s wb=%s",
        session.get('tenant'),
        len(session.get('hwsensors_ids', [])),
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
