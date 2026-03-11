import os
import requests
from flask import session
from authlib.jose import jwt

from config_env import make_headers

API_URL = "http://twinairdmp.online:8669/v2/entities"

# Validate the ID token received from Keyrock and extract claims
def validate_id_token(id_token, nonce):
    try:
        # Fetch JWKS (public keys) from Keyrock
        jwks_url = f"{os.getenv('OIDC_ISSUER_URL')}/certs"
        jwks = requests.get(jwks_url).json()

        claims = jwt.decode(
            id_token,
            jwks,  # validate token signature against JWKS
            claims_options={
                'iss': {'essential': True, 'value': os.getenv('OIDC_ISSUER_URL')},
                'aud': {'essential': True, 'value': os.getenv('OAUTH2_CLIENT_ID')},
                'nonce': {'essential': True, 'value': nonce},
            },
        )
        return claims
    except Exception as e:
        print(f"ID Token validation failed: {str(e)}")
        return None

# Check if the user has an authenticated session with required claims
def has_authenticated_session():
    missing = []

    if session.get('authenticated') is not True:
        missing.append('authenticated')
    if not session.get('sub'):
        missing.append('sub')
    if not session.get('tenant'):
        missing.append('tenant')
    if not session.get('schema'):
        missing.append('schema')

    return len(missing) == 0, missing


def build_tenant_schema(tenant: str) -> str:
    return f"mt{tenant}"


# Store user claims in session after successful authentication
def store_user_claims(claims):
    tenant = claims['extra']['tenant']
    session['authenticated'] = True
    session['sub'] = claims['sub']
    session['username'] = claims['username']
    session['email'] = claims['email']
    session['tenant'] = tenant
    session['schema'] = build_tenant_schema(tenant)
    session['lName'] = claims['extra']['lastName']
    session['fName'] = claims['extra']['firstName']
    session['admin'] = claims['extra']['admin']


# Fetch the current tenant's hardware and wearable sensor identifiers
def get_sensor_id_per_tenant():
    tenant = session.get('tenant')
    headers = make_headers()

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


# Store sensor IDs in session after successful authentication
def store_sensor_ids():
    hw_sensors, wb_sensors = get_sensor_id_per_tenant()
    session['hwsensors_ids'] = hw_sensors
    session['wbsensors_ids'] = wb_sensors
    session.pop('selected_wbsensor_id', None)


# Check if the user has selected a wearable sensor and if it's valid
def has_selected_wbsensor():
    selected_wbsensor_id = session.get('selected_wbsensor_id')
    if not selected_wbsensor_id:
        return False

    available_wbsensors = session.get('wbsensors_ids') or []
    return selected_wbsensor_id in available_wbsensors
