# sensor_data.py

import requests
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()


def get_sensor_historical_data(params, fiware_service):
    auth_token = os.getenv('AUTH_TOKEN')

    if not auth_token:
        print('Error: AUTH_TOKEN is not set in the environment variables')
        return None

    sensor_id = params.get('sensor_id')
    url = f'http://twinairdmp.online:8669/v2/entities/{sensor_id}'

    query_params = {
        'type': params.get('sensor_type'),
        'fromDate': params.get('from_date'),
        'toDate': params.get('to_date'),
        'limit': params.get('limit'),
        'attrs': params.get('attrs'),
        'aggrPeriod': params.get('aggr_period'),
        'aggrMethod': params.get('aggr_method'),
    }

    headers = {
        'Fiware-Service': fiware_service,
        'X-Auth-Token': auth_token
    }

    response = requests.get(url, headers=headers, params=query_params)

    if response.status_code == 200:
        try:
            data = response.json()
            return data
        except ValueError:
            print('Error decoding JSON:', response.text)
            return None
    else:
        print(f'Error: Received HTTP status code {response.status_code}')
        return None
