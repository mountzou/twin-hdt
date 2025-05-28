import json
import requests
import uuid
import os

import joblib
import pandas as pd

from flask import Flask, render_template, redirect, url_for, session, jsonify, abort, request, flash, current_app
from authlib.integrations.flask_client import OAuth

from sensor_data import get_sensor_historical_data, get_sensor_historical_latest_data
from config_env import HEADERS_WB, API_DPM_BASE_URL, WEARABLE_ID
from utils import http_dmp_request
from utils_auth import validate_id_token, store_user_claims, store_sensor_ids

from mqtt_handler import start_mqtt_thread, mqtt_messages, init_mqtt
from flask_socketio import SocketIO

app = Flask(__name__)
app.secret_key = os.urandom(24)

socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)
init_mqtt(socketio)

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


''' Register routes that handle HTTP errors '''
from routes_error import register_error_routes

register_error_routes(app)

''' Register routes that serve terms templates '''
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


@app.route('/predict_co2/', methods=['POST'])
@login_required
def predict_co2():
    data = request.get_json()

    co2_mean = data.get('co2_mean')
    co2_std = data.get('co2_std')
    co2_diff = data.get('co2_diff')
    co2_latest = data.get('co2_latest')

    X_new = pd.DataFrame([{
        'co2': co2_latest,
        'co2_diff1': 50,
        'co2_std': co2_std,
        'co2_avg': co2_mean
    }])

    model1 = joblib.load('models_ml/co2_pred_15m.pkl')
    prediction = model1.predict(X_new)
    predicted_co2 = float(prediction[0])

    return jsonify({'predicted_co2': round(predicted_co2, 2)})


@app.route('/predict_co2_hourly/')
@login_required
def predict_co2_hourly():
    base_url = 'http://twinairdmp.online:8669/v2/entities/urn:ngsi-ld:hwsensors:16866'
    headers = {
        'Fiware-Service': session['tenant'],
        'X-Auth-Token': '4579ea622cb713071987b603624069411d6f0338'
    }

    print(session)

    attributes = ['co2', 'noiseLevel', 'light']
    results = {}

    for attr in attributes:
        params = {
            'type': 'hwsensors',
            'lastN': 2,
            'attrs': attr,
            'aggrPeriod': 'hour',
            'aggrMethod': 'avg',
        }

        response = requests.get(base_url, headers=headers, params=params)

        results[attr] = {}

        if response.status_code == 200:
            try:
                data = response.json()
                values = data['attributes'][0]['values']
                results[attr]['0h'] = values[-1] if len(values) >= 1 else None
                results[attr]['1h'] = values[-2] if len(values) >= 2 else None
            except (KeyError, IndexError):
                results[attr]['0h'] = None
                results[attr]['1h'] = None
        else:
            results[attr]['0h'] = f'Error {response.status_code}'
            results[attr]['1h'] = f'Error {response.status_code}'

    return jsonify(results)


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


@app.route('/mqtt-messages')
@app.route('/mqtt_messages')
@login_required
def mqtt_messages_route():
    historical_data = get_sensor_historical_latest_data()
    print(historical_data)
    return render_template('mqtt_messages.html', messages=mqtt_messages, historical_data=historical_data)


@app.route('/get_pollutants_historical_data', methods=['POST'])
def get_pollutants_historical_data():
    keys = ['type', 'fromDate', 'toDate', 'attrs', 'aggrPeriod', 'aggrMethod']
    params = {key: request.json.get(key) for key in keys}

    sensor_data = get_sensor_historical_data(params, request.json['sensorID'])

    if sensor_data:
        return jsonify(sensor_data)
    else:
        return jsonify({'error': 'Unable to fetch data'}), 500


@app.route('/get_data_wb_device_latest', methods=['POST'])
def get_data_wb_device_latest():
    # Get request data
    request_data = request.get_json(silent=True) or {}

    # Extract lastN parameter from request, with a default value of 50
    last_n = request_data.get('lastN', 50)

    url = f'{API_DPM_BASE_URL}/entities/urn:ngsi-ld:wsensors:{WEARABLE_ID}'
    query_params = {'lastN': last_n}

    latest_data_wb_device = http_dmp_request(url, header=HEADERS_WB, params=query_params)

    return latest_data_wb_device


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
    # Validating the ID token and decode user information
    claims = validate_id_token(request.args.get('id_token'), session['nonce'])

    # Check if the state exists in the session
    if 'state' not in session:
        return "State is missing in session!", 400  # Handle missing state

    # Check if the state matches
    if request.args.get('state') != session['state']:
        return "State does not match!", 400  # Handle the error as you see fit

    # Check if claims exists
    if not claims:
        return "ID Token validation failed!", 400

    # Check if the user is associated with tenant, otherwise force logout
    if not claims['extra'].get('tenant'):
        session.clear()
        logout_url = f"{os.getenv('OAUTH2_LOGOUT_URL')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
        return render_template('_error/error_tenant.html', logout_url=logout_url)

    # Store in session variable the user's information
    store_user_claims(claims)
    # Store in session variable the tenant's sensor information
    store_sensor_ids(session['tenant'])

    return redirect(url_for('index'))


@app.route('/logout')
def logout():
    """
    logout route which clears the session and redirects to the home page
    """
    session.clear()
    request_url = f"{os.getenv('OAUTH2_LOGOUT_URL')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
    return redirect(request_url)


if __name__ == "__main__":
    start_mqtt_thread()
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, port=5656)
