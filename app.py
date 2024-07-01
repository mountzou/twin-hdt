from flask import Flask, render_template, jsonify, abort, request
from flask_socketio import SocketIO
from routes_error import register_error_routes
from routes_misc import register_misc_routes
from wearable_integration import create_measurement_object
from sensor_data import get_sensor_historical_data

import json

from dotenv import load_dotenv
from mqtt_handler import start_mqtt_thread, mqtt_messages, init_mqtt

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

register_error_routes(app)
register_misc_routes(app)

load_dotenv()

init_mqtt(socketio)


@app.route('/')
@app.route('/index/')
def index():
    return render_template('index.html')


@app.route('/scenario_analysis/')
def scenario_analysis():
    return render_template('scenario-analysis.html')


@app.route('/air-pollutants/')
def air_pollutants():
    return render_template('air-pollutants.html')


@app.route('/air-pollutant/<pollutant_name>')
def air_pollutant(pollutant_name):
    with open('data/pollutants_data.json', 'r') as file:
        pollutants_data = json.load(file)
        pollutant_unit = pollutants_data[pollutant_name]["unit"]
    if pollutant_name not in pollutants_data:
        abort(404)
    return render_template('air-pollutant.html', pollutant=pollutant_name, unit=pollutant_unit)


@app.route('/get_pollutants_historical_data', methods=['POST'])
def get_pollutants_historical_data():
    data = request.json
    sensor_type = data.get('sensor_type')
    from_date = data.get('from_date')
    to_date = data.get('to_date')
    limit = data.get('limit')
    attrs = data.get('attrs')
    aggr_period = data.get('aggr_period')
    aggr_method = data.get('aggr_method')

    fiware_service = 'etra'

    params = {
        'sensor_id': 'urn:ngsi-ld:hwsensors:16869',
        'sensor_type': sensor_type,
        'from_date': from_date,
        'to_date': to_date,
        'limit': limit,
        'attrs': attrs,
        'aggr_period': aggr_period,
        'aggr_method': aggr_method,
    }

    data = get_sensor_historical_data(params, fiware_service)

    if data:
        return jsonify(data)
    else:
        return jsonify({'error': 'Unable to fetch data'}), 500


@app.route('/mqtt_messages')
def mqtt_messages_route():
    return render_template('mqtt_messages.html', messages=mqtt_messages)


if __name__ == "__main__":
    # Start the MQTT client in a separate thread
    start_mqtt_thread()

    # Start the Flask app with SocketIO
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)
