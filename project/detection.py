import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from data import resample_lap


def detect_corners(fast_df: pd.DataFrame, slow_df: pd.DataFrame) -> list[dict]:
    fast_r = resample_lap(fast_df)
    slow_r = resample_lap(slow_df, track_length=len(fast_r))

    if fast_r.index[0] > 10 or slow_r.index[0] > 10:
        raise ValueError("Partial lap detected - requires full lap starting near 0m")

    steering = np.maximum(fast_r['SteeringWheelAngle'].abs(), slow_r['SteeringWheelAngle'].abs())
    brake = (fast_r['Brake'] + slow_r['Brake']) / 2
    throttle = (fast_r['Throttle'] + slow_r['Throttle']) / 2
    lataccel = (np.abs(fast_r['LatAccel']) + np.abs(slow_r['LatAccel'])) / 2

    steering = steering.rolling(5, center=True).mean().fillna(0)
    brake = brake.rolling(5, center=True).mean().fillna(0)
    lataccel = lataccel.rolling(5, center=True).mean().fillna(0)

    track_length = len(steering)
    distances = steering.index.values

    steer_norm = steering / max(steering.max(), 0.01)
    lat_norm = lataccel / max(lataccel.max(), 0.01)

    min_core = max(10, track_length // 200)
    merge_dist = max(20, track_length // 120)

    # === Find core corner regions from brake signal ===
    brake_min = max(0.05, brake.quantile(0.15))
    cores = _mask_to_zones((brake > brake_min).astype(int).values, track_length, min_core)

    if not cores:
        # Fallback: try steering/lataccel-based cores when brake fails
        turning = ((steer_norm + lat_norm) > 0.3).astype(int).values
        cores = _mask_to_zones(turning, track_length, min_core)

    if not cores:
        return []

    # === Merge nearby cores ===
    cores_sorted = sorted(cores, key=lambda z: z[0])
    merged = [cores_sorted[0]]
    for z in cores_sorted[1:]:
        gap = z[0] - merged[-1][1]
        md = max(20, track_length // 120)
        if gap < md:
            merged[-1][1] = max(merged[-1][1], z[1])
        else:
            merged.append(z)

    # === Build corners with three-phase boundaries ===
    # Entry = brake zone start | Apex = max lataccel/steer | Exit = throttle recovery
    max_extent = track_length // 4
    corners = []
    for i, (core_start, core_end) in enumerate(merged):
        start = core_start

        zone_check_lat = lat_norm.iloc[start:core_end].max() if core_end > start else 0
        zone_check_steer = steer_norm.iloc[start:core_end].max() if core_end > start else 0
        if zone_check_lat < 0.15 and zone_check_steer < 0.15:
            continue

        margin = 15
        s = max(0, start - margin)
        e = min(track_length, core_end + margin)
        zone_lat = lataccel.iloc[s:e]
        zone_steer = steering.iloc[s:e]
        if zone_lat.max() > 0.05:
            apex = int(zone_lat.idxmax())
        elif zone_steer.max() > 0.05:
            apex = int(zone_steer.idxmax())
        else:
            apex = (start + core_end) // 2

        apex = max(apex, start)

        next_brake_start = merged[i + 1][0] if i + 1 < len(merged) else track_length
        _end = _find_throttle_recovery(throttle, apex, next_brake_start)
        if _end is None or _end <= start:
            _end = min(next_brake_start, start + max_extent)
        _end = min(_end, track_length)
        min_zone = 30
        if _end - start < min_zone:
            _end = min(start + min_zone, track_length)
        if _end - start > max_extent:
            _end = start + max_extent

        corners.append({
            'name': f'Corner {len(corners) + 1}',
            'start': int(start),
            'end': int(_end),
            'apex': int(apex),
            'peak_steering': round(steering.iloc[apex], 3),
            'peak_lataccel': round(lataccel.iloc[apex], 2),
            'detection_type': 'detected'
        })

    return _merge_corners(corners, 0)


def _find_throttle_recovery(throttle, core_end, limit):
    search_start = min(core_end + 20, max(core_end + 1, limit - 5))
    seg = throttle.iloc[search_start:limit]
    if len(seg) < 5:
        return None
    lo, hi = seg.min(), seg.max()
    if hi - lo < 0.05:
        return None
    target = lo + 0.65 * (hi - lo)
    vals = seg.values
    for j in range(len(vals) - 2):
        if vals[j] >= target and vals[j + 1] >= target and vals[j + 2] >= target:
            return search_start + j
    return None


def _mask_to_zones(mask, track_length, min_len):
    mask = mask.copy()
    transitions = np.diff(mask, prepend=0)
    starts = np.where(transitions == 1)[0]
    ends = np.where(transitions == -1)[0]
    if mask[-1] == 1:
        ends = np.append(ends, len(mask) - 1)
    zones = []
    si, ei = 0, 0
    while si < len(starts) and ei < len(ends):
        s = int(starts[si])
        e = int(ends[ei])
        if e <= s:
            ei += 1
            continue
        zones.append([s, e])
        si += 1
        ei += 1
    return [z for z in zones if z[1] - z[0] >= min_len]


def _merge_corners(corners, merge_distance):
    merged = []
    for corner in corners:
        if not merged:
            merged.append(corner)
            continue
        prev = merged[-1]
        gap = corner['start'] - prev['end']
        if gap < merge_distance:
            prev['end'] = max(prev['end'], corner['end'])
            prev['peak_steering'] = (prev['peak_steering'] + corner['peak_steering']) / 2
            prev['peak_lataccel'] = (prev['peak_lataccel'] + corner['peak_lataccel']) / 2
            prev['detection_type'] = 'merged'
        else:
            merged.append(corner)

    for i, c in enumerate(merged):
        c['name'] = f'Corner {i + 1}'

    return merged
