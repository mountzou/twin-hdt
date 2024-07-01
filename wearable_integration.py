def create_measurement_object(device):
    device_id = device.get('device_id', '')
    device_name = device.get('device_name', '')
    device_description = device.get('device_description', '')

    measurement = {
        "@context": "https://raw.githubusercontent.com/smart-data-models/dataModel.Environment/master/context.jsonld",
        "id": f"urn:ngsi-ld:wsensors:{device_id}",
        "type": "wsensors",
        "name": f"{device_name}",
        "description": f"{device_description}",
        "location": {
            "type": "Point",
            "coordinates": [60.170833, 4.9375, 32.339]
        },
        "deviceInfo": {
            "type": "Property",
            "value": {
                "deviceID": f"{device_id}",
                "deviceModel": {
                    "areaServed": "Dublin",
                    "brandName": "UoP-WS",
                    "manufacturerName": "UoP",
                    "modelName": "WearableSensor-v0_4-default",
                    "modelURL": "www.upatras.gr"
                },
                "deviceName": f"{device_name}"
            }
        },
        "airTemperature": {
            "type": "Property",
            "value": 17.08,
            "name": {
                "type": "Property",
                "value": "Air Temperature"
            },
            "unitCode": "°C"
        },
        "humidity": {
            "type": "Property",
            "value": 17.08,
            "name": {
                "type": "Property",
                "value": "Humidity"
            },
            "unitCode": ""
        },
        "pm25": {
            "type": "Property",
            "value": 1.08,
            "name": {
                "type": "Property",
                "value": "Particle Matters 2.5"
            },
            "unitCode": ""
        },
        "pm10": {
            "type": "Property",
            "value": 1.08,
            "name": {
                "type": "Property",
                "value": "Particle Matters 2.5"
            },
            "unitCode": ""
        },
        "volatileOrganicCompoundsTotal": {
            "type": "Property",
            "value": 1.08,
            "name": {
                "type": "Property",
                "value": "Particle Matters 2.5"
            },
            "unitCode": ""
        },
        "observationDateTime": "2024-03-29T17:24:28Z"
    }

    return measurement
