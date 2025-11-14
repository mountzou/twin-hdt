import os
import requests
from flask import session
from authlib.jose import jwt

from sensor_data import get_sensor_id_per_tenant


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


def store_user_claims(claims):
    session['username'] = claims['username']
    session['email'] = claims['email']
    session['tenant'] = claims['extra']['tenant']
    session['lName'] = claims['extra']['lastName']
    session['fName'] = claims['extra']['firstName']
    session['admin'] = claims['extra']['admin']

    return None


def store_sensor_ids(tenant):
    hw_sensors, wb_sensors = get_sensor_id_per_tenant(tenant)
    session['hwsensors_ids'] = hw_sensors
    session['wbsensors_ids'] = wb_sensors
