# mqtt_handler.py

import json
import logging
import threading
import traceback

from collections import deque
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from config_env import MQTT_HOST, MQTT_USERNAME, MQTT_PASSWORD

# Define global variables for the user's portable and wearable devices
TOPIC_PORTABLE = None
TOPIC_WEARABLE = None

socketio = None

_mqtt_started = False

# Buffer για εμφάνιση/ιστορικό (ring buffer)
mqtt_messages = deque(maxlen=500)

# Staging για 1-per-minute pooling
_current_minute_key = None
_staged_line = None


# Attach the SocketIO server instance (set by app.py).
def set_socketio(io):
    global socketio
    socketio = io


# Define the MQTT topic for the user's PORTABLE device.
def set_mqtt_topic_portable_device(tenant: str, portable_id: str) -> str:
    global TOPIC_PORTABLE

    TOPIC_PORTABLE = f"{tenant}/wsensors/{portable_id}/keyValues"
    print(f"[mqtt] Topic for portable device {portable_id}: {TOPIC_PORTABLE}")

    # Start the MQTT thread for the TOPIC
    start_mqtt_thread()

    return TOPIC_PORTABLE


# Check if the MQTT is running
def is_mqtt_running() -> bool:
    return _mqtt_started


# Start MQTT thread for the user's PORTABLE device.
def start_mqtt_thread():
    global _mqtt_started
    if _mqtt_started:
        print("[mqtt] Thread already running; skip.")
        return
    if not TOPIC_PORTABLE:
        raise RuntimeError("Cannot start MQTT thread without topic.")

    t = threading.Thread(target=_start_mqtt_client, daemon=True)
    t.start()
    _mqtt_started = True
    print("[mqtt] Thread started.")


def _on_connect(client, _userdata, _flags, rc):
    print(f"[mqtt] on_connect rc={rc}")
    if rc == 0 and TOPIC_PORTABLE:
        client.subscribe(TOPIC_PORTABLE)
        print(f"[mqtt] Subscribed to {TOPIC_PORTABLE}")
    else:
        print("[mqtt] connect failed")


def _on_message(client, userdata, msg):
    global _current_minute_key, _staged_line

    payload = msg.payload.decode("utf-8", errors="replace")
    print(f"[mqtt] [NEW MESSAGE] {msg.topic}: {payload}")

    try:
        payData = json.loads(payload)
    except Exception:
        print("[mqtt] [WARN] Invalid JSON payload, skipping.")
        return

    payTime = payData.get("observationDateTime")
    if not payTime:
        print("[mqtt] [WARN] Missing observationDateTime, skipping.")
        return

    try:
        minute_key = datetime.strptime(payTime[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
    except Exception:
        print(f"[mqtt] [WARN] Failed parsing timestamp: {payTime}")
        return

    payLine = f"{msg.topic}: {payload}"

    # --- First message ---
    if _current_minute_key is None:
        _current_minute_key = minute_key
        _staged_line = payLine
        return

    # --- Same minute → replace staged line ---
    if minute_key == _current_minute_key:
        _staged_line = payLine
        return

    # --- New minute → flush + stage new one ---
    if _staged_line is not None:
        mqtt_messages.append(_staged_line)
        if socketio:
            socketio.emit("new_mqtt_message", {"message": _staged_line})
        print(f"[mqtt][POOL] flushed minute: {_current_minute_key.isoformat()}")

    _current_minute_key = minute_key
    _staged_line = payLine


def _start_mqtt_client():
    try:
        client = mqtt.Client()
        client.username_pw_set(username=MQTT_USERNAME, password=MQTT_PASSWORD)
        client.on_connect = _on_connect
        client.on_message = _on_message

        print(f"[mqtt] Connecting to {MQTT_HOST}:1883 ...")
        client.connect(host=MQTT_HOST, port=1883, keepalive=60)
        client.loop_forever()
    except Exception:
        logging.error(traceback.format_exc())