import os
from dotenv import load_dotenv

load_dotenv()

AUTH_TOKEN = os.getenv('AUTH_TOKEN') or (_ for _ in ()).throw(
    EnvironmentError('Error: AUTH_TOKEN is not set in the environment variables'))

SENSOR_ID = os.getenv('SENSOR_ID') or (_ for _ in ()).throw(
    EnvironmentError('Error: SENSOR_ID is not set in the environment variables'))

API_DPM_BASE_URL = os.getenv('API_DPM_BASE_URL') or (_ for _ in ()).throw(
    EnvironmentError('Error: API_DPM_BASE_URL is not set in the environment variables'))

API_DPM_BASE_URL_1 = os.getenv('API_DPM_BASE_URL_1') or (_ for _ in ()).throw(
    EnvironmentError('Error: API_DPM_BASE_URL_1 is not set in the environment variables'))

# MQTT creds
MQTT_USERNAME = os.getenv('MQTT_USERNAME') or (_ for _ in ()).throw(
    EnvironmentError('Error: MQTT_USERNAME is not set in the environment variables'))

MQTT_PASSWORD = os.getenv('MQTT_PASSWORD') or (_ for _ in ()).throw(
    EnvironmentError('Error: MQTT_PASSWORD is not set in the environment variables'))

MQTT_HOST = os.getenv('MQTT_HOST') or (_ for _ in ()).throw(
    EnvironmentError('Error: MQTT_HOST is not set in the environment variables'))

DMP_SQL_API_AUTH = os.getenv('DMP_SQL_API_AUTH') or (_ for _ in ()).throw(
    EnvironmentError('Error: DMP_SQL_API_AUTH is not set in the environment variables'))

DMP_SQL_API_URL = os.getenv('DMP_SQL_API_URL') or (_ for _ in ()).throw(
    EnvironmentError('Error: DMP_SQL_API_URL is not set in the environment variables'))


def make_headers(tenant: str) -> dict:
    if not tenant:
        raise ValueError("Fiware-Service (tenant) is empty or missing")
    return {
        'Fiware-Service': tenant,
        'X-Auth-Token': AUTH_TOKEN,
    }


def make_headers_wb(tenant: str) -> dict:
    return make_headers(tenant)
