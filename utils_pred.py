# utils_pred.py

import pandas as pd
from statsmodels.tsa.arima.model import ARIMA


def predict_co2_arima(payload_portable):
    """
    Compute ARIMA-based CO2 forecasts for fixed horizons (5, 10, 15 minutes).

    Parameters
    ----------
    payload_portable : dict
        The payload that contains "attributes" with a "co2" entry
        of the form {"attrName": "co2", "values": [...] }.

    Returns
    -------
    dict
        Dictionary with keys:
        - "co2_pred_5min"
        - "co2_pred_10min"
        - "co2_pred_15min"

        Each value is a dict:
        {
            "value": float,
            "lower": float,
            "upper": float,
            "horizon_minutes": int,
            "model": "ARIMA(3, 0, 1)"
        }
    """
    # Internal configuration
    horizons = (5, 10, 15)     # minutes/steps
    order = (3, 0, 1)          # ARIMA(p,d,q)
    alpha = 0.05               # 95% CI

    # -------- Extract CO2 values --------
    co2_values = None
    for attr in payload_portable.get("attributes", []):
        if attr.get("attrName") == "co2":
            co2_values = attr.get("values", [])
            break

    if not co2_values:
        raise ValueError("No CO2 values found in payload_portable.")

    co2_series = pd.Series(co2_values)

    # -------- Fit ARIMA model --------
    model = ARIMA(co2_series, order=order)
    fit = model.fit()

    # Forecast up to the max horizon
    max_horizon = max(horizons)
    forecast_res = fit.get_forecast(steps=max_horizon)

    mean_forecast = forecast_res.predicted_mean
    conf_int = forecast_res.conf_int(alpha=alpha)

    predictions = {}
    for h in horizons:
        idx = h - 1  # step h → index h-1

        value = float(mean_forecast.iloc[idx])
        lower = float(conf_int.iloc[idx, 0])
        upper = float(conf_int.iloc[idx, 1])

        # Round to 2 decimals
        value = round(value, 2)
        lower = round(lower, 2)
        upper = round(upper, 2)

        key = f"co2_pred_{h}min"
        predictions[key] = {
            "value": value,
            "lower": lower,
            "upper": upper,
            "horizon_minutes": h,
            "model": f"ARIMA{order}",
        }

    return predictions


def predict_pm25_arima(payload_portable):
    """
    Compute an ARIMA-based PM2.5 forecast for a fixed horizon (5 minutes).

    Parameters
    ----------
    payload_portable : dict
        The payload that contains "attributes" with a "pm25" entry
        of the form {"attrName": "pm25", "values": [...] }.

    Returns
    -------
    dict
        Dictionary with a single key:
        - "pm25_pred_5min"

        Value is a dict:
        {
            "value": float,
            "lower": float,
            "upper": float,
            "horizon_minutes": 5,
            "model": "ARIMA(3, 0, 1)"
        }
    """
    # Internal configuration
    horizon = 5               # minutes/steps
    order = (3, 0, 1)         # ARIMA(p,d,q)
    alpha = 0.05              # 95% CI

    # -------- Extract PM2.5 values --------
    pm25_values = None
    for attr in payload_portable.get("attributes", []):
        if attr.get("attrName") == "pm25":
            pm25_values = attr.get("values", [])
            break

    if not pm25_values:
        raise ValueError("No PM2.5 values found in payload_portable.")

    pm25_series = pd.Series(pm25_values)

    # -------- Fit ARIMA model --------
    model = ARIMA(pm25_series, order=order)
    fit = model.fit()

    # Forecast 5 steps ahead
    forecast_res = fit.get_forecast(steps=horizon)

    mean_forecast = forecast_res.predicted_mean
    conf_int = forecast_res.conf_int(alpha=alpha)

    # Index for 5 steps ahead → 4 (zero-based)
    idx = horizon - 1

    value = float(mean_forecast.iloc[idx])
    lower = float(conf_int.iloc[idx, 0])
    upper = float(conf_int.iloc[idx, 1])

    # Round to 2 decimals
    value = round(value, 2)
    lower = round(lower, 2)
    upper = round(upper, 2)

    return {
        "pm25_pred_5min": {
            "value": value,
            "lower": lower,
            "upper": upper,
            "horizon_minutes": horizon,
            "model": f"ARIMA{order}",
        }
    }