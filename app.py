import json
import requests
import uuid
import os

from flask import Flask, render_template, redirect, url_for, session, jsonify, abort, request
from authlib.integrations.flask_client import OAuth

from sensor_data import get_sensor_historical_data, get_sensor_historical_latest_data
from config_env import HEADERS_WB, API_DPM_BASE_URL, WEARABLE_ID
from utils import http_dmp_request

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'

from mqtt_handler import start_mqtt_thread, mqtt_messages, init_mqtt
from flask_socketio import SocketIO

socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)
init_mqtt(socketio)

oauth = OAuth(app)
keyrock = oauth.register(
    name='keyrock',
    client_id=os.getenv('OAUTH2_CLIENT_ID'),
    client_secret=os.getenv('OAUTH2_CLIENT_SECRET'),
    access_token_url=os.getenv('OAUTH2_ACCESS_TOKEN_URL'),
    authorize_url=os.getenv('OAUTH2_AUTHORIZE_URL'),
    client_kwargs={'scope': 'openid profile email'},
)

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
    print(f"Session Data: {session}")
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
    url = f'{API_DPM_BASE_URL}/entities/urn:ngsi-ld:wsensors:{WEARABLE_ID}'
    query_params = {'lastN': 20}

    latest_data_wb_device = http_dmp_request(url, header=HEADERS_WB, params=query_params)

    return latest_data_wb_device


# User authentication routes
@app.route('/login')
def login():
    session['nonce'] = str(uuid.uuid4())
    session['state'] = str(uuid.uuid4())
    redirect_uri = url_for('authorize', _external=True)

    return keyrock.authorize_redirect(
        redirect_uri,
        state=session['state'],
        nonce=session['nonce']
    )


@app.route('/authorize')
def authorize():
    if 'state' not in session:
        return "State is missing in session!", 400

    if request.args.get('state') != session['state']:
        return "State does not match!", 400

    token = keyrock.authorize_access_token()

    if not token.get('access_token'):
        return "Access token is missing!", 400

    headers = {'Authorization': f"Bearer {token['access_token']}"}
    response = requests.get(os.getenv('OAUTH2_USERINFO_URL'), headers=headers)

    if response.status_code == 200:
        user_info = response.json()
        session['email'] = user_info['email']
    else:
        return f"Failed to fetch user info: {response.status_code} - {response.text}"

    return redirect(url_for('index'))


@app.route('/logout/')
def logout():
    session.clear()
    request_url = f"{os.getenv('OAUTH2_LOGOUT_URL')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
    return redirect(request_url)


if __name__ == "__main__":
    start_mqtt_thread()
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, port=5656)
