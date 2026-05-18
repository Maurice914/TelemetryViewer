import numpy as np

def grade(issues):
    if issues == 0:   return 'A'
    if issues <= 0.5: return 'B'
    if issues <= 1.5: return 'C'
    if issues <= 2.5: return 'D'
    return 'F'

def first_above(series, threshold):
    above = series[series > threshold]
    return above.index[0] if len(above) > 0 else None

def smooth(series, window=5, threshold=0.0):
    s = series.rolling(window, center=True).mean().fillna(0)
    s[s < threshold] = 0
    return s

def classify_zone(seg):
    peak       = seg['Brake'].max()
    speed_drop = (seg['Speed'].max() - seg['Speed'].min()) * 3.6
    if peak > 0.7 and speed_drop > 30: return 'heavy',  0.10, 0.05
    if peak > 0.3 and speed_drop > 10: return 'medium', 0.05, 0.03
    if peak > 0.05:                     return 'light',  0.02, 0.01
    return 'none', 0.05, 0.02

def release_shape(brake, peak_idx, zero_idx):
    if zero_idx is None: return None
    vals = brake.loc[peak_idx:zero_idx].values
    if len(vals) < 5: return None
    norm = np.interp(np.linspace(0,1,100), np.linspace(0,1,len(vals)), vals)
    return round(norm[50] - (norm[0] + norm[-1]) / 2, 3)