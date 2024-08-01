import os

from dotenv import load_dotenv
load_dotenv()

AUTH_TOKEN = os.getenv('AUTH_TOKEN')
if not AUTH_TOKEN:
    raise EnvironmentError('Error: AUTH_TOKEN is not set in the environment variables')

SENSOR_ID = os.getenv('SENSOR_ID')
if not SENSOR_ID:
    raise EnvironmentError('Error: SENSOR_ID is not set in the environment variables')

WEARABLE_ID = os.getenv('WEARABLE_ID')
if not WEARABLE_ID:
    raise EnvironmentError('Error: WEARABLE_ID is not set in the environment variables')

FIWARE_SERVICE = os.getenv('FIWARE_SERVICE')
if not FIWARE_SERVICE:
    raise EnvironmentError('Error: FIWARE_SERVICE is not set in the environment variables')

FIWARE_SERVICE2 = os.getenv('FIWARE_SERVICE2')
if not FIWARE_SERVICE2:
    raise EnvironmentError('Error: FIWARE_SERVICE2 is not set in the environment variables')

API_DPM_BASE_URL = os.getenv('API_DPM_BASE_URL')
if not API_DPM_BASE_URL:
    raise EnvironmentError('Error: API_DPM_BASE_URL is not set in the environment variables')

API_DPM_BASE_URL_1 = os.getenv('API_DPM_BASE_URL_1')
if not API_DPM_BASE_URL_1:
    raise EnvironmentError('Error: API_DPM_BASE_URL_1 is not set in the environment variables')

''' Get environmental variables for MQTT credentials '''
MQTT_USERNAME = os.getenv('MQTT_USERNAME')
if not MQTT_USERNAME:
    raise EnvironmentError('Error: MQTT_USERNAME is not set in the environment variables')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD')
if not MQTT_USERNAME:
    raise EnvironmentError('Error: MQTT_USERNAME is not set in the environment variables')
MQTT_HOST = os.getenv('MQTT_HOST')
if not MQTT_HOST:
    raise EnvironmentError('Error: MQTT_HOST is not set in the environment variables')

HEADERS = {
    'Fiware-Service': FIWARE_SERVICE,
    'X-Auth-Token': AUTH_TOKEN
}

HEADERS_WB = {
    'Fiware-Service': FIWARE_SERVICE2,
    'X-Auth-Token': AUTH_TOKEN
}
