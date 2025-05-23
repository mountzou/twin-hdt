# mqtt_handler.py

import paho.mqtt.client as mqtt
import threading
import logging
import traceback
import requests

from config_env import HEADERS, MQTT_HOST, MQTT_USERNAME, MQTT_PASSWORD, WEARABLE_ID

# MQTT broker details
TOPIC = f"patras/wsensors/urn:ngsi-ld:wsensors:{WEARABLE_ID}/keyValues"

# Global variable to store MQTT messages
mqtt_messages = []


# Function to initialize MQTT handler with socketio instance
def init_mqtt(socketio_instance):
    global socketio
    socketio = socketio_instance


def on_message(client, userdata, msg):
    global mqtt_messages
    payload = msg.payload.decode('utf-8')
    print(f"Received message on topic {msg.topic}: {payload}")
    mqtt_messages.append(f"{msg.topic}: {payload}")
    socketio.emit('new_mqtt_message', {'message': f"{msg.topic}: {payload}"})


# Function to subscribe to the topic
def subscribe_to_topic(client: mqtt.Client):
    client.on_message = on_message
    client.subscribe(topic=TOPIC)
    print(f"Subscribed to {TOPIC}")
    client.loop_forever()


# Function to connect to the MQTT broker
def connect_mqtt():
    client = mqtt.Client()
    client.username_pw_set(username=MQTT_USERNAME, password=MQTT_PASSWORD)
    client.connect(host=MQTT_HOST, port=1883, keepalive=60)
    print(f"Connected to {MQTT_HOST}:1883")
    return client


def start_mqtt_client():
    try:
        mqtt_client = connect_mqtt()
        subscribe_to_topic(mqtt_client)
    except Exception as e:
        logging.error(traceback.format_exc())


def start_mqtt_thread():
    mqtt_thread = threading.Thread(target=start_mqtt_client)
    mqtt_thread.start()
