import json
import uuid
import os

from flask import Flask, render_template, redirect, url_for, session, jsonify, abort, request, current_app
from authlib.integrations.flask_client import OAuth

from sensor_data import get_sensor_historical_data
from config_env import DMP_SQL_API_URL, DMP_SQL_API_AUTH
from utils_auth import validate_id_token, store_user_claims, store_sensor_ids
from utils_data import run_cratedb_query, init_mqtt_portable, calculate_avg_iaq

from iaq_policy_loader import load_policy, apply_iaq_policy

policy = load_policy("data/IAQ_breakpoints.json")

from mqtt_handler import start_mqtt_thread, mqtt_messages, set_mqtt_topic_portable_device, is_mqtt_running, set_socketio
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


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'email' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)

    return decorated_function


@app.route('/')
@app.route('/index/')
@app.route('/dashboard/')
@login_required
def index():
    print(session['wbsensors_ids'][-1])
    return render_template('index.html', messages=mqtt_messages)


@app.route('/scenario-analysis/')
@app.route('/scenario_analysis/')
@login_required
def scenario_analysis():
    return render_template('scenario-analysis.html')


@app.route('/health-recommendations/')
@app.route('/health_recommendations/')
@login_required
def health_recommendations():
    return render_template('health-recommendations.html')


@app.route('/activity-status/')
@app.route('/activity_status/')
@login_required
def activity_status():
    return render_template('activity-status.html')


@app.route('/profile/')
@login_required
def profile():
    return render_template('profile.html')


with open('data/pollutants_info.json', 'r') as file:
    POLLUTANTS_DATA = json.load(file)


@app.route('/air-pollutants/')
@app.route('/air_pollutants/')
@login_required
def air_pollutants():
    return render_template('air-pollutants.html', pollutants_info=POLLUTANTS_DATA)


@app.route('/air-pollutant/<pollutant>')
@app.route('/air_pollutant/<pollutant>')
@login_required
def air_pollutant(pollutant):
    if pollutant not in POLLUTANTS_DATA:
        abort(404)
    return render_template('air-pollutant.html', pollutant=pollutant, pollutants_info=POLLUTANTS_DATA)


@app.route('/get_pollutants_historical_data', methods=['POST'])
def get_pollutants_historical_data():
    keys = ['type', 'fromDate', 'toDate', 'attrs', 'aggrPeriod', 'aggrMethod']
    params = {key: request.json.get(key) for key in keys}

    sensor_data = get_sensor_historical_data(params, request.json['sensorID'])

    if sensor_data:
        return jsonify(sensor_data)
    else:
        return jsonify({'error': 'Unable to fetch data'}), 500


@app.route('/init_mqtt_queue', methods=['POST'])
@login_required
def init_mqtt_queue():
    try:
        PORTABLE_ID = session.get('wbsensors_ids', [])[-1]
        WEARABLE_ID = session.get('wbsensors_ids', [])[-1]
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)
        payload_portable = init_mqtt_portable(PORTABLE_ID, limit=10, sql_runner=cratedb_run_query)
        return jsonify(payload_portable)

    except Exception as e:
        current_app.logger.exception("init_mqtt_queue error")
        return jsonify({"error": str(e)}), 500


@app.route('/calculate/iaq/avg', methods=['GET'])
@login_required
def iaq_avg():
    try:
        PORTABLE_ID = session.get('wbsensors_ids', [])[-1]
        WEARABLE_ID = session.get('wbsensors_ids', [])[-1]
        cratedb_run_query = lambda q: run_cratedb_query(q, DMP_SQL_API_AUTH, DMP_SQL_API_URL)

        iaq_averages = calculate_avg_iaq(PORTABLE_ID, sql_runner=cratedb_run_query)
        classified   = apply_iaq_policy(iaq_averages, policy)

        return jsonify({
            "entity_id": PORTABLE_ID,
            **classified
        })

    except Exception as e:
        current_app.logger.exception("iaq_avg error")
        return jsonify({"error": str(e)}), 500


# User authentication routes
@app.route('/login')
def login():
    session['nonce'] = str(uuid.uuid4())
    session['state'] = "oic"
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
    if not (claims := validate_id_token(request.args.get('id_token'), session.get('nonce'))):
        return "ID Token validation failed!", 400

    # Check if the state exists in the session
    if 'state' not in session:
        return "State is missing in session!", 400  # Handle missing state

    # Check if the state matches
    if request.args.get('state') != session['state']:
        return "State does not match!", 400  # Handle the error as you see fit

    # Check if the user is associated with tenant, otherwise force logout
    if not claims['extra'].get('tenant'):
        session.clear()
        logout_url = f"{os.getenv('OAUTH2_URL_LOGOUT')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
        return render_template('_error/error_tenant.html', logout_url=logout_url)

    # Store in session variable the user's information
    store_user_claims(claims)
    # Store in session variable the tenant's sensor information
    store_sensor_ids(session['tenant'])

    if not is_mqtt_running():
        set_mqtt_topic_portable_device(session.get('tenant'), session.get('wbsensors_ids', [])[-1])
        start_mqtt_thread()

    return redirect(url_for('index'))


@app.route('/logout')
def logout():
    session.clear()
    request_url = f"{os.getenv('OAUTH2_URL_LOGOUT')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
    return redirect(request_url)


if __name__ == "__main__":
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, port=5656)
