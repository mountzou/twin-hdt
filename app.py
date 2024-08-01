import json
import requests

from flask import Flask, render_template, jsonify, abort, request

from sensor_data import get_sensor_historical_data, get_sensor_historical_latest_data
from config_env import HEADERS_WB, API_DPM_BASE_URL, WEARABLE_ID
from utils import http_dmp_request

app = Flask(__name__)

from mqtt_handler import start_mqtt_thread, mqtt_messages, init_mqtt
from flask_socketio import SocketIO

socketio = SocketIO(app, cors_allowed_origins="*")
init_mqtt(socketio)

''' Register routes that handle HTTP errors '''
from routes_error import register_error_routes
register_error_routes(app)

''' Register routes that serve terms templates '''
from routes_terms import register_terms_routes
register_terms_routes(app)


@app.route('/')
@app.route('/index/')
@app.route('/dashboard/')
def index():
    return render_template('index.html', messages=mqtt_messages)


@app.route('/scenario-analysis/')
@app.route('/scenario_analysis/')
def scenario_analysis():
    return render_template('scenario-analysis.html')


@app.route('/health-recommendations/')
@app.route('/health_recommendations/')
def health_recommendations():
    return render_template('health-recommendations.html')


with open('data/pollutants_info.json', 'r') as file:
    POLLUTANTS_DATA = json.load(file)


@app.route('/air-pollutants/')
@app.route('/air_pollutants/')
def air_pollutants():
    return render_template('air-pollutants.html', pollutants_info=POLLUTANTS_DATA)


@app.route('/air-pollutant/<pollutant>')
@app.route('/air_pollutant/<pollutant>')
def air_pollutant(pollutant):
    if pollutant not in POLLUTANTS_DATA:
        abort(404)
    return render_template('air-pollutant.html', pollutant=pollutant, pollutants_info=POLLUTANTS_DATA)


@app.route('/mqtt-messages')
@app.route('/mqtt_messages')
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


if __name__ == "__main__":
    start_mqtt_thread()
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)
