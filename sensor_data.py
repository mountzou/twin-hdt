from config_env import make_headers, API_DPM_BASE_URL
import requests


def http_dmp_request(url, header, params):
    response = requests.get(url, headers=header, params=params)

    if response.status_code == 200:
        try:
            return response.json()
        except ValueError:
            print('Error decoding JSON:', response.text)
            return None
    else:
        print(f'Error: HTTP {response.status_code} status code')
        return None

def get_sensor_historical_data(params: dict, sensor_id: str):
    headers = make_headers()
    url = f"{API_DPM_BASE_URL}/entities/{sensor_id}"
    return http_dmp_request(url, headers, params)
