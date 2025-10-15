import json
import requests
import uuid
import os
import threading

import joblib
import pandas as pd
import numpy as np

import time

import paho.mqtt.client as mqtt

from collections import deque

from flask import Flask, render_template, redirect, url_for, session, jsonify, abort, request, flash, current_app
from authlib.integrations.flask_client import OAuth

from sensor_data import get_sensor_historical_data, get_sensor_historical_latest_data
from config_env import HEADERS_WB, API_DPM_BASE_URL, WEARABLE_ID
from utils import http_dmp_request
from utils_auth import validate_id_token, store_user_claims, store_sensor_ids

from mqtt_handler import start_mqtt_thread, mqtt_messages, init_mqtt
from flask_socketio import SocketIO

import tensorflow as tf
import keras
from tensorflow.keras.layers import Layer

model_path = "models_ml/model_3.keras"
scaler_X = joblib.load('models_ml/scaler_X.gz')
scaler_y = joblib.load('models_ml/scaler_y.gz')

# Load the 5-minute ahead CO2 forecasting model
MODEL_PATH_CO2_5MIN = 'models_ml/co2_5min/lstm_5min_RAW_residual_SAFE.keras'
LOOKBACK_5MIN = 4
model_5min = keras.models.load_model(MODEL_PATH_CO2_5MIN)

# Load the 10-minute ahead CO2 forecasting model
MODEL_PATH_CO2_10MIN = 'models_ml/co2_10min/lstm_10min_RAW_residual_SAFE.keras'
LOOKBACK_10MIN = 4
model_10min = keras.models.load_model(MODEL_PATH_CO2_10MIN)

# Load the 15-minute ahead CO2 forecasting model
MODEL_PATH_CO2_15MIN = 'models_ml/co2_15min/lstm_15min_RAW_residual_SAFE.keras'
LOOKBACK_15MIN = 6
model_15min = keras.models.load_model(MODEL_PATH_CO2_15MIN)


@keras.saving.register_keras_serializable()
class RecentFocusAttention(Layer):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def build(self, input_shape):
        self.W = self.add_weight(
            name="attention_weight",
            shape=(input_shape[-1], 1),
            initializer="random_normal",
            trainable=True,
        )
        self.b = self.add_weight(
            name="attention_bias",
            shape=(input_shape[1], 1),
            initializer="zeros",
            trainable=True,
        )
        positions = np.arange(input_shape[1])
        bias_vector = positions / positions.max()
        self.positional_bias = tf.constant(bias_vector.reshape(-1, 1), dtype=tf.float32)
        super().build(input_shape)

    def call(self, x):
        e = tf.keras.backend.tanh(tf.keras.backend.dot(x, self.W) + self.b)
        e = e + self.positional_bias
        a = tf.keras.backend.softmax(e, axis=1)
        output = x * a
        return tf.keras.backend.sum(output, axis=1)


model = tf.keras.models.load_model(
    model_path,
    compile=False,
    custom_objects={'RecentFocusAttention': RecentFocusAttention}
)

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


def _extract_series_from_payload(data):
    if "co2_values" in data and "timestamps" in data:
        return data["co2_values"], data["timestamps"]
    attrs = {a.get("attrName"): a.get("values") for a in data.get("attributes", [])}
    co2_vals = attrs.get("co2")
    ts = data.get("index") or attrs.get("observationDateTime")
    if co2_vals is None or ts is None:
        raise ValueError("Missing co2/timestamps in payload.")
    n = min(len(co2_vals), len(ts))
    if n == 0:
        raise ValueError("Empty co2/timestamp arrays.")
    return co2_vals[:n], ts[:n]


def build_lookback_sequence_strict(co2_values, raw_timestamps, lookback):
    df = pd.DataFrame({"ts": raw_timestamps, "co2": co2_values})
    df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    df = df.dropna(subset=["ts"])
    if df.empty:
        raise ValueError("No valid timestamps.")
    per_min = (df.assign(minute=lambda x: x["ts"].dt.floor("min"))
               .groupby("minute", as_index=True)["co2"].median().sort_index())
    last = per_min.index.max()
    want = pd.date_range(end=last, periods=lookback, freq="min", tz="UTC")
    if not set(want).issubset(set(per_min.index)):
        raise ValueError("Missing minutes; strict window failed.")
    seq = per_min.loc[want].to_numpy(dtype=float)
    return seq, [t.isoformat() for t in want]


def _predict_from_request(model, lookback):
    data = request.get_json(force=True)
    co2_values, timestamps = _extract_series_from_payload(data)

    seq, _ = build_lookback_sequence_strict(co2_values, timestamps, lookback=lookback)
    x_input = np.asarray(seq, dtype=np.float32).reshape(1, lookback, 1)

    y_ppm = float(model.predict(x_input, verbose=0).item())
    return round(y_ppm, 2)


@app.route('/predict_co2_5min/', methods=['POST'])
@login_required
def predict_co2_5min():
    try:
        return jsonify(_predict_from_request(model_5min, LOOKBACK_5MIN))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/predict_co2_10min/', methods=['POST'])
@login_required
def predict_co2_10min():
    try:
        return jsonify(_predict_from_request(model_10min, LOOKBACK_10MIN))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/predict_co2_15min/', methods=['POST'])
@login_required
def predict_co2_15min():
    try:
        return jsonify(_predict_from_request(model_15min, LOOKBACK_15MIN))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/predict_pm25', methods=['POST'])
def predict_pm25():
    data = request.get_json()
    seq = data.get('sequence')
    if seq is None or len(seq) != 10:
        return jsonify({'error': 'Invalid input. Send 10 values in "sequence".'}), 400

    X_input = np.array(seq).reshape(1, 10, 1)  # adjust shape if needed
    X_input_scaled = scaler_X.transform(X_input.reshape(-1, 1)).reshape(1, 10, 1)

    y_pred_scaled = model.predict(X_input_scaled)
    y_pred = scaler_y.inverse_transform(y_pred_scaled.reshape(-1, 1)).squeeze()
    y_pred_rounded = float(np.round(y_pred, 2))

    return jsonify({'prediction': y_pred_rounded})


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
    last_n = request_data.get('lastN', 20)

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


test_wearable_BROKER = "eu1.cloud.thethings.network"
test_wearable_PORT = 1883
test_wearable_USERNAME = "german-pilots@ttn"
test_wearable_PASSWORD = "NNSXS.BUJRAWNDPUWD75UGLHLVZO7U74ACUIEVVCJNPYY.34CJ25QSMQJUWJ2NHXGO52525GSI2CZWACB53RJDYFWBK6OKYRJA"

test_wearable_messages = deque(maxlen=200)

def test_wearable_on_connect(client, userdata, flags, rc):
    print(f"[test_wearable] Connected rc={rc}")
    if rc == 0:
        topic = "v3/+/devices/+/up"
        client.subscribe(topic, qos=0)
        print(f"[test_wearable] Subscribed to {topic}")


def test_wearable_on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode("utf-8", errors="replace")
        data = json.loads(payload)
    except Exception:
        data = str(msg.payload)

    item = {"topic": msg.topic, "data": data, "ts": time.time()}
    print(f"[test_wearable] {msg.topic} => {str(data)[:200]}")
    test_wearable_messages.append(item)

    socketio.emit("test_wearable_up", item)


def test_wearable_start_mqtt():
    client = mqtt.Client(client_id="test_wearable_client")
    client.username_pw_set(test_wearable_USERNAME, test_wearable_PASSWORD)
    client.on_connect = test_wearable_on_connect
    client.on_message = test_wearable_on_message
    client.connect_async(test_wearable_BROKER, test_wearable_PORT, keepalive=60)
    client.loop_start()


threading.Thread(target=test_wearable_start_mqtt, daemon=True).start()


@app.route('/logout')
def logout():
    session.clear()
    request_url = f"{os.getenv('OAUTH2_LOGOUT_URL')}?_method=DELETE&client_id={os.getenv('OAUTH2_CLIENT_ID')}"
    return redirect(request_url)


if __name__ == "__main__":
    start_mqtt_thread()
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True, port=5656)
