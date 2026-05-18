import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from data import resample_lap


def detect_corners(fast_df: pd.DataFrame, slow_df: pd.DataFrame) -> list[dict]:
    """
    Automatically detect corners from telemetry data.

    Args:
        fast_df: Fast (reference) lap DataFrame with resampled columns
        slow_df: Slow (student) lap DataFrame

    Returns:
        List of corner dicts with keys: name, start, end, apex, peak_steering,
        peak_lataccel, brake_onset, turn_in, detection_type
    """
    # Resample both laps to consistent 1m grid
    fast_r = resample_lap(fast_df)
    slow_r = resample_lap(slow_df)

    # Check for partial lap
    if fast_r.index[0] > 10 or slow_r.index[0] > 10:
        raise ValueError("Partial lap detected - requires full lap starting near 0m")

    # Compute average signal across both laps
    avg_steering = (np.abs(fast_r['SteeringWheelAngle']) + np.abs(slow_r['SteeringWheelAngle'])) / 2
    avg_brake = (fast_r['Brake'] + slow_r['Brake']) / 2
    avg_lataccel = (np.abs(fast_r['LatAccel']) + np.abs(slow_r['LatAccel'])) / 2

    # Smooth signals
    steering_smooth = avg_steering.rolling(window=5, center=True).mean().fillna(0)
    brake_smooth = avg_brake.rolling(window=5, center=True).mean().fillna(0)

    # Find steering peaks (corner apexes)
    # prominence: how much peak stands out from surrounding
    # distance: minimum samples between peaks (~80m = 80 samples at 1m resolution)
    peaks, properties = find_peaks(
        steering_smooth.values,
        prominence=0.03,
        distance=80,
        width=10
    )

    corners = []
    distances = steering_smooth.index.values

    for i, apex_idx in enumerate(peaks):
        apex_dist = distances[apex_idx]
        peak_steering = steering_smooth.iloc[apex_idx]
        peak_lataccel = avg_lataccel.iloc[apex_idx] if i < len(avg_lataccel) else 0

        # Find start: brake onset OR turn-in (significant steering increase)
        brake_onset = None
        turn_in = None

        # Look for brake onset before apex
        for j in range(apex_idx - 1, max(0, apex_idx - 300), -1):
            if brake_smooth.iloc[j] > 0.1:
                brake_onset = int(distances[j])
                break

        # Look for turn-in (steering crosses threshold)
        steering_threshold = 0.03
        for j in range(apex_idx - 1, max(0, apex_idx - 200), -1):
            if steering_smooth.iloc[j] > steering_threshold:
                turn_in = int(distances[j])
                break

        # Start is earlier of brake_onset or turn_in
        start = brake_onset if brake_onset else turn_in
        if start is None:
            start = int(apex_dist - 50)  # fallback

        # Find end: steering changes direction (next corner) OR returns to straight
        steering_change = None
        steering_straight = None

        # Look for steering reversal (changes direction)
        if i + 1 < len(peaks):
            next_apex = distances[peaks[i + 1]]
            # Check if steering changes sign between apexes
            sign_before = np.sign(steering_smooth.iloc[apex_idx - 5:apex_idx].diff().mean())
            sign_after = np.sign(steering_smooth.iloc[apex_idx:apex_idx + 5].diff().mean())
            if sign_before != sign_after and sign_after != 0:
                # Steering direction changed - corner into corner
                steering_change = int((apex_dist + next_apex) / 2)

        # Look for steering returning to near-zero
        straight_threshold = 0.02
        for j in range(apex_idx + 1, min(len(steering_smooth), apex_idx + 200)):
            if steering_smooth.iloc[j] < straight_threshold:
                steering_straight = int(distances[j])
                break

        # End is earlier of steering_change or steering_straight
        if steering_change and steering_straight:
            end = min(steering_change, steering_straight)
        elif steering_change:
            end = steering_change
        elif steering_straight:
            end = steering_straight
        else:
            end = int(apex_dist + 50)  # fallback

        # Determine detection type
        if brake_onset and steering_change:
            detection_type = "brake-to-corner"
        elif brake_onset and steering_straight:
            detection_type = "brake-to-straight"
        elif turn_in and not brake_onset:
            detection_type = "no-brake-turn-in"
        else:
            detection_type = "detected"

        corners.append({
            'name': f'Corner {i + 1}',
            'start': start,
            'end': end,
            'apex': int(apex_dist),
            'peak_steering': round(peak_steering, 3),
            'peak_lataccel': round(peak_lataccel, 2),
            'brake_onset': brake_onset,
            'turn_in': turn_in,
            'detection_type': detection_type
        })

    # Merge corners that are too close (high-downforce car scenario)
    # If gap between corners < 80m, merge them
    merged_corners = []
    for corner in corners:
        if not merged_corners:
            merged_corners.append(corner)
            continue

        prev = merged_corners[-1]
        gap = corner['start'] - prev['end']

        if gap < 80:
            # Merge: extend previous corner's end to this one's end
            # Keep earlier start, use average peak values
            prev['end'] = corner['end']
            prev['peak_steering'] = (prev['peak_steering'] + corner['peak_steering']) / 2
            prev['peak_lataccel'] = (prev['peak_lataccel'] + corner['peak_lataccel']) / 2
            prev['detection_type'] = 'merged'
        else:
            merged_corners.append(corner)

    return merged_corners