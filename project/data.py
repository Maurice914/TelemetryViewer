import pandas as pd
import numpy as np


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


def _gps_track_length(lats, lons):
    total = 0.0
    for i in range(1, len(lats)):
        total += _haversine(lats[i - 1], lons[i - 1], lats[i], lons[i])
    return total


def load_lap(path):
    df = pd.read_csv(path)
    diffs = df['LapDistPct'].diff()
    neg_mask = diffs < -0.5
    reset_idx = neg_mask.idxmax() if neg_mask.any() else len(df)
    df = df.iloc[:reset_idx].copy()

    track_length_m = _gps_track_length(df['Lat'].values, df['Lon'].values)
    df.attrs['track_length'] = round(track_length_m)

    df['speed_ms'] = df['Speed']
    df['distance_m'] = df['LapDistPct'] * track_length_m
    df['d_dist'] = df['distance_m'].diff().fillna(0)
    df['dt'] = df['d_dist'] / df['speed_ms'].replace(0, np.nan).ffill()
    df['time_s'] = df['dt'].cumsum()
    return df


def resample_lap(df, track_length=None):
    if track_length is None:
        track_length = int(df.attrs.get('track_length', len(df)))
    grid = np.arange(0, track_length, 1)
    gear_raw = np.round(np.interp(grid, df['distance_m'], df['Gear'])).astype(int)
    cols = ['time_s', 'Speed', 'Brake', 'Throttle', 'LongAccel',
            'SteeringWheelAngle', 'LatAccel', 'Lat', 'Lon']
    res = pd.DataFrame(
        {col: np.interp(grid, df['distance_m'], df[col]) for col in cols},
        index=grid
    )
    res['Gear'] = gear_raw
    return res


def compute_delta(fast, slow):
    return pd.DataFrame({
        'distance_m':    fast.index,
        'time_delta':    slow['time_s'] - fast['time_s'],
        'speed_diff':    slow['Speed'] - fast['Speed'],
        'brake_diff':    slow['Brake'] - fast['Brake'],
        'throttle_diff': slow['Throttle'] - fast['Throttle'],
    })