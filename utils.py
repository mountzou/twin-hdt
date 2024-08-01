import requests


''' A util function to perform HTTP requests on TwinAIR Data Management Platform '''
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
