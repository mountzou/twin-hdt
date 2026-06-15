import os
import json
import requests
from flask import session
from authlib.jose import jwt

from config_env import make_headers

API_URL = "http://twinairdmp.online:8669/v2/entities"
DEVICE_METADATA_PATH = "data/device_metadata.json"

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
    tenant = session.get('tenant')
    username = session.get('username')
    email = session.get('email')
    user_metadata = get_user_metadata(tenant, username, email)
    devices = user_metadata.get('devices', [])
    portable_ids = [device.get('id') for device in devices if device.get('type') == 'portable' and device.get('id')]
    wearable_ids = [device.get('id') for device in devices if device.get('type') == 'wearable' and device.get('id')]

    session['hwsensors_ids'] = portable_ids
    session['portable_ids'] = portable_ids
    session['wbsensors_ids'] = wearable_ids
    session['selected_portable_id'] = portable_ids[0] if portable_ids else None
    session['selected_wbsensor_id'] = wearable_ids[0] if wearable_ids else None
    session['assigned_device_user'] = user_metadata.get('username')


def load_device_metadata():
    try:
        with open(DEVICE_METADATA_PATH, 'r') as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError) as e:
        print(f"Error loading device metadata: {e}")
        return {}


def normalize_metadata_key(value):
    return str(value or '').strip().lower()


def find_case_insensitive(mapping, key):
    if not isinstance(mapping, dict):
        return None

    normalized_key = normalize_metadata_key(key)
    for candidate_key, candidate_value in mapping.items():
        if normalize_metadata_key(candidate_key) == normalized_key:
            return candidate_value

    return None


def user_matches_identity(user_key, user_metadata, username, email):
    identity_values = {
        normalize_metadata_key(user_key),
        normalize_metadata_key(user_metadata.get('email')),
        *(normalize_metadata_key(alias) for alias in user_metadata.get('aliases', [])),
    }
    login_values = {
        normalize_metadata_key(username),
        normalize_metadata_key(email),
    }

    return bool(identity_values.intersection(login_values))


def get_user_metadata(tenant, username, email=None):
    if not tenant:
        return {}

    metadata = load_device_metadata()
    tenant_metadata = find_case_insensitive(metadata.get('tenants', {}), tenant) or {}
    users_metadata = tenant_metadata.get('users', {})
    user_metadata = find_case_insensitive(users_metadata, username)

    if user_metadata:
        return {**user_metadata, 'username': username}

    for user_key, candidate_metadata in users_metadata.items():
        if user_matches_identity(user_key, candidate_metadata, username, email):
            return {**candidate_metadata, 'username': user_key}

    print(f"No device metadata found for tenant={tenant}, username={username}, email={email}")
    return {}


# Check if the user has selected a wearable sensor and if it's valid
def has_selected_wbsensor():
    selected_wbsensor_id = session.get('selected_wbsensor_id')
    if not selected_wbsensor_id:
        return False

    available_wbsensors = session.get('wbsensors_ids') or []
    return selected_wbsensor_id in available_wbsensors


def has_selected_portable():
    selected_portable_id = session.get('selected_portable_id')
    if not selected_portable_id:
        return False

    available_portables = session.get('portable_ids') or []
    return selected_portable_id in available_portables
