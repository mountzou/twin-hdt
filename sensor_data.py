# sensor_data.py

import os
import requests

from utils import http_dmp_request
from config_env import make_headers, API_DPM_BASE_URL, API_DPM_BASE_URL_1, SENSOR_ID

from dotenv import load_dotenv

load_dotenv()

API_URL = "http://twinairdmp.online:8669/v2/entities"


def get_sensor_id_per_tenant(tenant: str):
    if not tenant:
        print("Tenant is missing.")
        return [], []

    headers = make_headers(tenant)

    sensors = {'hwsensors': [], 'wsensors': []}
    for sensor_type in sensors.keys():
        params = {'type': sensor_type, 'lastN': 1}
        try:
            resp = requests.get(API_URL, headers=headers, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                sensors[sensor_type] = [
                    s.get("entityId") for s in data if s.get("entityType") == sensor_type
                ]
        except requests.RequestException as e:
            print(f"Error fetching {sensor_type} for {tenant}: {e}")

    print(f"Hardware Sensors for {tenant}: {sensors['hwsensors']}")
    print(f"Wearable Sensors for {tenant}: {sensors['wsensors']}")
    return sensors['hwsensors'], sensors['wsensors']


def get_sensor_historical_data(tenant: str, params: dict, sensor_id: str):
    """Ιστορικά για συγκεκριμένο sensor."""
    headers = make_headers(tenant)
    url = f"{API_DPM_BASE_URL}/entities/{sensor_id}"
    return http_dmp_request(url, headers, params)


def get_sensor_historical_latest_data(tenant: str):
    """Τελευταία Ν για προκαθορισμένο hwsensor (SENSOR_ID από env)."""
    headers = make_headers(tenant)
    url = f"{API_DPM_BASE_URL}/entities/urn:ngsi-ld:hwsensors:{SENSOR_ID}"
    query_params = {'type': 'hwsensors', 'lastN': 20}
    return http_dmp_request(url, headers, query_params)


def get_all_sensor_historical_latest_data(tenant: str, sensor_type: str = 'hwsensors', lastN: int = 20):
    """Τελευταία Ν για ΟΛΕΣ τις οντότητες τύπου sensor_type."""
    headers = make_headers(tenant)
    url = f"{API_DPM_BASE_URL_1}ngsi-ld/v1/entities/"
    query_params = {'type': sensor_type, 'lastN': lastN}
    return http_dmp_request(url, headers, query_params)