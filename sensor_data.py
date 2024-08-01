# sensor_data.py

import os
import json

from utils import http_dmp_request
from config_env import HEADERS, API_DPM_BASE_URL, API_DPM_BASE_URL_1, SENSOR_ID

from dotenv import load_dotenv
load_dotenv()


def get_sensor_historical_data(params, sensorID):

    URL = f'{API_DPM_BASE_URL}/entities/{sensorID}'

    return http_dmp_request(URL, HEADERS, params)


def get_sensor_historical_latest_data():

    URL = f'{API_DPM_BASE_URL}/entities/urn:ngsi-ld:hwsensors:{SENSOR_ID}'

    query_params = {
        'type': 'hwsensors',
        'lastN': 20
    }

    return http_dmp_request(URL, HEADERS, query_params)


def get_all_sensor_historical_latest_data():
    url = f'{API_DPM_BASE_URL_1}ngsi-ld/v1/entities/'

    query_params = {
        'type': 'hwsensors',
        'lastN': 20
    }

    return http_dmp_request(url, HEADERS, query_params)


def get_hardware_sensor_ids():

    with open('data/sensors_hardware.json', 'r') as file:
        data = json.load(file)

    sensor_ids = data.get(os.getenv('FIWARE_SERVICE'), {}).get('HardwareSensorIDs', [])

    return sensor_ids
