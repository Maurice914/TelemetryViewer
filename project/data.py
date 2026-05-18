import pandas as pd
import numpy as np
from config import TRACK_LENGTH

# loading garage61 laps, will have to likely adjust for other sources/formats in the future
def load_lap(path, track_length_m=TRACK_LENGTH):
    df = pd.read_csv(path)
    reset_idx = df['LapDistPct'].diff().idxmin()
    df = df.iloc[:reset_idx].copy()
    df['speed_ms']   = df['Speed']
    df['distance_m'] = df['LapDistPct'] * track_length_m
    df['d_dist']     = df['distance_m'].diff().fillna(0)
    df['dt']         = df['d_dist'] / df['speed_ms'].replace(0, np.nan).ffill()
    df['time_s']     = df['dt'].cumsum()
    return df

def resample_lap(df, track_length_m=TRACK_LENGTH):
    grid = np.arange(0, track_length_m, 1)
    cols = ['time_s','Speed','Brake','Throttle','LongAccel',
            'SteeringWheelAngle','LatAccel','Lat','Lon']
    return pd.DataFrame(
        {col: np.interp(grid, df['distance_m'], df[col]) for col in cols},
        index=grid
    )

def compute_delta(fast, slow):
    return pd.DataFrame({
        'distance_m':    fast.index,
        'time_delta':    slow['time_s']   - fast['time_s'],
        'speed_diff':    slow['Speed']    - fast['Speed'],
        'brake_diff':    slow['Brake']    - fast['Brake'],
        'throttle_diff': slow['Throttle'] - fast['Throttle'],
    })