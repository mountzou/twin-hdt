# sensor_data.py

import os
import requests

from utils import http_dmp_request
from config_env import HEADERS, API_DPM_BASE_URL, API_DPM_BASE_URL_1, SENSOR_ID

from dotenv import load_dotenv

load_dotenv()

API_URL = "http://twinairdmp.online:8669/v2/entities"


def get_sensor_id_per_tenant(tenant):
    if not tenant:
        print("Tenant is missing.")
        return [], []  # Return empty lists if no tenant is found

    headers = {
        'Fiware-Service': tenant,
        'X-Auth-Token': os.getenv('AUTH_TOKEN')
    }

    sensors = {
        'hwsensors': [],
        'wbsensors': []
    }

    sensor_types = ['hwsensors', 'wsensors']

    for sensor_type in sensor_types:
        params = {
            'type': sensor_type,
            'attrs': 'airTemperature',
            'lastN': 1
        }

        try:
            response = requests.get(API_URL, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list):
                sensors[sensor_type] = [
                    sensor["entityId"]
                    for sensor in data if sensor.get("entityType") == sensor_type
                ]
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {sensor_type} for {tenant}: {e}")

    print(f"Hardware Sensors for {tenant}: {sensors['hwsensors']}")
    print(f"Wearable Sensors for {tenant}: {sensors['wbsensors']}")

    return sensors['hwsensors'], sensors['wbsensors']


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