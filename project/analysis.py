import numpy as np
from helpers import grade, first_above, smooth, classify_zone, release_shape

def _phases(brake, brake_thresh, noise_thresh):
    if brake.max() < brake_thresh: return None, None, None, None
    peak_idx = brake.idxmax()
    peak_val = brake.max()
    hold     = len(brake[brake >= peak_val * 0.90])
    after    = brake.loc[peak_idx:]
    zeros    = after[after <= noise_thresh]
    zero_idx = zeros.index[0] if len(zeros) > 0 else None
    release  = zero_idx - peak_idx if zero_idx else 0
    return peak_idx, hold, zero_idx, release

def _dead_zone(seg, zero_idx):
    if zero_idx is None: return None
    thr = seg['Throttle'].loc[zero_idx:]
    hit = thr[thr > 0.1]
    return round(hit.index[0] - zero_idx, 1) if len(hit) > 0 else None

def _overlap(seg, zero_idx, peakIdx, noise_thresh):
    if zero_idx is None or peakIdx is None: return 0
    windowSegment = seg.loc[peakIdx:zero_idx]
    smoothBrakeWindow = smooth(windowSegment['Brake'], threshold=noise_thresh)
    return int(((smoothBrakeWindow > 0.05) & (windowSegment['SteeringWheelAngle'].abs() > 0.05)).sum())

def _lockup(brake):
    grad = np.diff(brake.values)
    for i in np.where(grad < -0.15)[0]:
        if i + 5 < len(brake) and brake.values[i+5] > brake.values[i] * 0.8:
            return True
    return False

def analyze_braking(fast_seg, slow_seg):
    zone_type, brake_thresh, noise_thresh = classify_zone(fast_seg)
    feedback = []
    issues   = 0

    if zone_type == 'none':
        if slow_seg['Brake'].max() > 0.05:
            feedback.append('Unnecessary braking — reference does not brake here')
            issues += 1
        return {
            'grade':       grade(issues),
            'zone_type':   zone_type,
            'fast_peak':   round(fast_seg['Brake'].max(), 3),
            'slow_peak':   round(slow_seg['Brake'].max(), 3),
            'fast_bp':     None,
            'slow_bp':     None,
            'f_overlap':   0,
            's_overlap':   0,
            'lockup':      False,
            'multi_brake': False,
            'feedback':    feedback,
            'slow_zone':   zone_type,
            'fast_hold':   None,
            'slow_hold':   None,
            'fast_release': None,
            'slow_release': None,
            'fast_dead':   None,
            'slow_dead':   None,
            'fast_shape':  None,
            'slow_shape':  None,
            'n_apps':       0,
        }

    smoothFastBrake = smooth(fast_seg['Brake'], threshold=noise_thresh)
    smoothSlowBrake = smooth(slow_seg['Brake'], threshold=noise_thresh)

    fast_peak = smoothFastBrake.max()
    slow_peak = smoothSlowBrake.max()
    fast_bp   = first_above(smoothFastBrake, brake_thresh)
    slow_bp   = first_above(smoothSlowBrake, brake_thresh)

    fastPeakIdx, fastHoldLen, fastZeroIdx, fastReleaseLen = _phases(smoothFastBrake, brake_thresh, noise_thresh)
    slowPeakIdx, slowHoldLen, slowZeroIdx, slowReleaseLen = _phases(smoothSlowBrake, brake_thresh, noise_thresh)

    fastDeadZone = _dead_zone(fast_seg, fastZeroIdx)
    slowDeadZone = _dead_zone(slow_seg, slowZeroIdx)

    fastTrailOverlap = _overlap(fast_seg, fastZeroIdx, fastPeakIdx, noise_thresh)
    slowTrailOverlap = _overlap(slow_seg, slowZeroIdx, slowPeakIdx, noise_thresh)

    aboveBrakeThresh       = (smoothSlowBrake > brake_thresh).astype(int)
    numBrakeApps      = int((aboveBrakeThresh.diff().fillna(0) == 1).sum())
    multi_brake = numBrakeApps > 1

    fastReleaseShape = release_shape(smoothFastBrake, fastPeakIdx, fastZeroIdx)
    slowReleaseShape = release_shape(smoothSlowBrake, slowPeakIdx, slowZeroIdx)

    slow_zone, _, _ = classify_zone(slow_seg)
    if slow_zone != zone_type:
        feedback.append(
            f'Braking intensity mismatch — reference is {zone_type}, driver is {slow_zone}. '
            + ('Underbraking on entry' if slow_zone in ('light','none') else 'Overbraking vs reference')
        )
        issues += 1.5

    if slow_bp is not None and fast_bp is not None:
        bp_diff = slow_bp - fast_bp
        if zone_type in ('heavy','medium'):
            if bp_diff < -15:
                feedback.append(f'Braking {abs(bp_diff):.0f}m earlier than reference — brake later')
                issues += 1.5
            elif bp_diff < -8:
                feedback.append(f'Brake point {abs(bp_diff):.0f}m early — small gain available')
                issues += 0.5
            elif bp_diff > 10:
                feedback.append(f'Braking {bp_diff:.0f}m later than reference — check entry speed')
                issues += 0.5

    peak_diff = slow_peak - fast_peak
    if peak_diff < -0.15:
        feedback.append(f'Underbraking — peak pressure {slow_peak:.2f} vs {fast_peak:.2f} ref')
        issues += 1
    elif peak_diff < -0.08:
        feedback.append(f'Slightly less peak pressure ({slow_peak:.2f} vs {fast_peak:.2f})')
        issues += 0.5

    if fastHoldLen and slowHoldLen:
        hold_diff = slowHoldLen - fastHoldLen
        if hold_diff > 15:
            feedback.append(f'Holding peak pressure {hold_diff:.0f}m longer — compressing trail brake phase')
            issues += 1
        elif hold_diff < -10 and fastHoldLen > 5:
            feedback.append('Releasing peak pressure earlier than reference — hold longer before trailing off')
            issues += 0.5

    if fastReleaseShape is not None and slowReleaseShape is not None:
        if fastReleaseShape > 0.05 and slowReleaseShape < -0.05:
            feedback.append(f'Release too convex — dropping pressure too early ({slowReleaseShape:.2f} vs {fastReleaseShape:.2f} ref)')
            issues += 1
        elif (slowReleaseShape - fastReleaseShape) < -0.12:
            feedback.append('Release shape slightly early vs reference')
            issues += 0.5

    if fastTrailOverlap > 5 and slowTrailOverlap < 3:
        feedback.append(f'No trail braking overlap — reference uses {fastTrailOverlap}m. Apply light brake through turn in')
        issues += 1
    elif (slowTrailOverlap - fastTrailOverlap) < -8:
        feedback.append(f'Less trail braking than reference ({slowTrailOverlap}m vs {fastTrailOverlap}m)')
        issues += 0.5

    if fastDeadZone is not None and slowDeadZone is not None:
        dead_diff = slowDeadZone - fastDeadZone
        if dead_diff > 15:
            feedback.append(f'Slow throttle pickup — {slowDeadZone:.0f}m dead zone vs {fastDeadZone:.0f}m ref')
            issues += 1
        elif dead_diff > 8:
            feedback.append(f'Slightly slow to throttle after braking ({slowDeadZone:.0f}m vs {fastDeadZone:.0f}m)')
            issues += 0.5

    if _lockup(smoothSlowBrake):
        feedback.append('Possible lockup — sudden pressure spike detected. Brake more smoothly')
        issues += 1

    if multi_brake:
        feedback.append(f'Multiple brake applications ({numBrakeApps}x) — pumping brakes or mid-corner correction')
        issues += 1

    if not feedback:
        feedback.append('Braking matches reference well')

    return {
        'grade':       grade(issues),
        'zone_type':   zone_type,
        'slow_zone':   slow_zone,
        'fast_peak':   round(fast_peak, 3),
        'slow_peak':   round(slow_peak, 3),
        'fast_bp':     round(fast_bp, 1) if fast_bp else None,
        'slow_bp':     round(slow_bp, 1) if slow_bp else None,
        'fast_hold':   fastHoldLen,
        'slow_hold':   slowHoldLen,
        'fast_release': fastReleaseLen,
        'slow_release': slowReleaseLen,
        'fast_dead':   fastDeadZone,
        'slow_dead':   slowDeadZone,
        'f_overlap':   fastTrailOverlap,
        's_overlap':   slowTrailOverlap,
        'fast_shape':  round(fastReleaseShape, 3) if fastReleaseShape is not None else None,
        'slow_shape':  round(slowReleaseShape, 3) if slowReleaseShape is not None else None,
        'n_apps':      numBrakeApps,
        'lockup':      _lockup(smoothSlowBrake),
        'multi_brake': multi_brake,
        'feedback':    feedback,
    }

def analyze_steering(fast_seg, slow_seg):
    feedback = []
    issues   = 0

    smoothFastSteer = smooth(fast_seg['SteeringWheelAngle'])
    smoothSlowSteer = smooth(slow_seg['SteeringWheelAngle'])

    if smoothFastSteer.abs().max() < 0.05 or smoothSlowSteer.abs().max() < 0.05:
        return {
            'grade': 'N/A',
            'fast_max': None,
            'slow_max': None,
            'double_turn': False,
            'fast_turn_in': None,
            'slow_turn_in': None,
            'fast_double_turn': False,
            'feedback': ['Not enough steering data']
        }

    fast_max   = smoothFastSteer.abs().max()
    slow_max   = smoothSlowSteer.abs().max()
    steer_diff = slow_max - fast_max

    fast_turn_in = first_above(smoothFastSteer.abs(), 0.05)
    slow_turn_in = first_above(smoothSlowSteer.abs(), 0.05)

    def double_turn(steer, threshold=0.05):
        vals = steer.abs().values
        if len(vals) < 10: return False
        peak = np.argmax(vals)
        if peak < 5 or peak > len(vals) - 5: return False
        first_half = vals[:peak]
        turnInIdx = next((i for i, v in enumerate(first_half) if v > threshold), None)
        if turnInIdx is None: return False
        between = first_half[turnInIdx:]
        if len(between) < 5: return False
        drop = np.max(between) - np.min(between)
        return drop > 0.25 * vals[peak] and np.min(between) < np.max(between) * 0.7

    slow_double = double_turn(smoothSlowSteer)
    fast_double = double_turn(smoothFastSteer)

    if steer_diff > 0.15:
        feedback.append(f'Too much steering — {slow_max:.2f} vs {fast_max:.2f} ref. Early apex likely')
        issues += 1
    elif steer_diff > 0.08:
        feedback.append(f'Slightly more steering than reference ({slow_max:.2f} vs {fast_max:.2f})')
        issues += 0.5
    elif steer_diff < -0.15:
        feedback.append(f'Too little steering — {slow_max:.2f} vs {fast_max:.2f} ref. Missing apex')
        issues += 1
    elif steer_diff < -0.08:
        feedback.append('Slightly less steering than reference — may be missing apex')
        issues += 0.5

    if fast_turn_in and slow_turn_in:
        turnInDiff = slow_turn_in - fast_turn_in
        if turnInDiff < -15:
            feedback.append(f'Turning in {abs(turnInDiff):.0f}m early — leads to early apex and running wide on exit')
            issues += 1
        elif turnInDiff < -8:
            feedback.append(f'Turn in slightly early ({abs(turnInDiff):.0f}m) — delay a little')
            issues += 0.5
        elif turnInDiff > 15:
            feedback.append(f'Turning in {turnInDiff:.0f}m late — may be causing tighter line than optimal')
            issues += 0.5

    if slow_double and not fast_double:
        feedback.append(
            'Double turn in detected — steering builds, drops, then increases again. '
            'Strong sign of early apex. Delay turn in and target a later apex'
        )
        issues += 2
    elif slow_double and fast_double:
        feedback.append('Double turn in on both laps — characteristic of this corner, review line')
        issues += 0.5

    if not feedback:
        feedback.append('Steering matches reference well')

    return {
        'grade':       grade(issues),
        'fast_max':    round(fast_max, 3),
        'slow_max':    round(slow_max, 3),
        'double_turn': slow_double,
        'fast_turn_in': fast_turn_in,
        'slow_turn_in': slow_turn_in,
        'fast_double_turn': fast_double,
        'feedback':    feedback,
    }

def analyze_line(fast_seg, slow_seg):
    feedback = []
    issues   = 0

    lat_diff = (slow_seg['Lat'] - fast_seg['Lat']) * 111320
    lon_diff = (slow_seg['Lon'] - fast_seg['Lon']) * 111320 * np.cos(np.radians(fast_seg['Lat'].mean()))
    gap = np.sqrt(lat_diff**2 + lon_diff**2)

    if len(gap) < 5:
        return {'grade': 'N/A', 'feedback': ['Not enough position data']}

    numPoints = len(gap)
    entry  = gap.iloc[:numPoints // 3]
    apex   = gap.iloc[numPoints // 3: 2 * numPoints // 3]
    exitSegment  = gap.iloc[2 * numPoints // 3:]

    entry_gap = entry.mean()
    apex_gap  = apex.mean()
    exitGap  = exitSegment.mean()
    max_gap   = gap.max()
    max_gap_m = gap.idxmax()

    if max_gap_m < fast_seg.index[numPoints // 3]:
        worst_phase = 'entry'
    elif max_gap_m < fast_seg.index[2 * numPoints // 3]:
        worst_phase = 'apex'
    else:
        worst_phase = 'exit'

    if max_gap > 3.0:
        feedback.append(f'Large line deviation — {max_gap:.1f}m off reference at {worst_phase}')
        issues += 1.5
    elif max_gap > 1.5:
        feedback.append(f'Moderate line deviation — {max_gap:.1f}m off reference at {worst_phase}')
        issues += 0.5

    if entry_gap > 2.0:
        feedback.append(f'Entry line {entry_gap:.1f}m from reference — check positioning on approach')
        issues += 0.5
    elif entry_gap > 1.0:
        feedback.append(f'Entry line slightly off reference ({entry_gap:.1f}m)')
        issues += 0.25

    if apex_gap > 2.0:
        feedback.append(
            f'Apex {apex_gap:.1f}m from reference — '
            + ('late apex — losing exit speed' if exitGap < entry_gap else 'early apex — running wide on exit')
        )
        issues += 1
    elif apex_gap > 1.0:
        feedback.append(f'Apex position {apex_gap:.1f}m off reference')
        issues += 0.5

    if exitGap > 2.0:
        feedback.append(f'Exit line {exitGap:.1f}m from reference — track out further on exit')
        issues += 1
    elif exitGap > 1.0:
        feedback.append(f'Exit line slightly tight ({exitGap:.1f}m) — use more road')
        issues += 0.25

    if entry_gap > 1.0 and apex_gap > 1.0 and exitGap > 1.0:
        feedback.append(f'Line offset throughout — entry: {entry_gap:.1f}m, apex: {apex_gap:.1f}m, exit: {exitGap:.1f}m')
        issues += 0.5

    if not feedback:
        feedback.append(f'Line matches reference well (max deviation {max_gap:.1f}m)')

    return {
        'grade':       grade(issues),
        'entry_gap':   round(entry_gap, 2),
        'apex_gap':    round(apex_gap, 2),
        'exit_gap':    round(exitGap, 2),
        'max_gap':     round(max_gap, 2),
        'worst_phase': worst_phase,
        'feedback':    feedback,
    }

def _understeer_at_apex(fast_seg, slow_seg, apex_loc):
    fast_steer = abs(fast_seg['SteeringWheelAngle'].iloc[apex_loc])
    slow_steer = abs(slow_seg['SteeringWheelAngle'].iloc[apex_loc])
    fast_lat = abs(fast_seg['LatAccel'].iloc[apex_loc])
    slow_lat = abs(slow_seg['LatAccel'].iloc[apex_loc])
    if fast_lat < 0.1 or slow_lat < 0.1:
        return False, None
    fast_ratio = fast_steer / fast_lat
    slow_ratio = slow_steer / slow_lat
    if slow_ratio > fast_ratio * 1.3 and slow_lat < fast_lat * 0.95:
        return True, round(slow_ratio - fast_ratio, 2)
    return False, None


def analyze_corner(fast_seg, slow_seg, corner_name, delta_seg, apex_idx=None):
    time_lost   = delta_seg['time_delta'].iloc[-1] - delta_seg['time_delta'].iloc[0]
    fast_thr_pt = first_above(fast_seg['Throttle'], 0.9)
    slow_thr_pt = first_above(slow_seg['Throttle'], 0.9)
    thr_diff    = round(slow_thr_pt - fast_thr_pt, 0) if (fast_thr_pt and slow_thr_pt) else None

    entry_time_lost = None
    exitTimeLost = None
    entry_speed_diff = None
    apex_speed_diff = None
    exitSpeedDiff = None
    speed_recovery_rate = None
    lat_g = None
    understeer = False
    understeer_ratio = None

    if apex_idx is not None and apex_idx in fast_seg.index:
        apex_loc = fast_seg.index.get_loc(apex_idx)

        entry_delta = delta_seg.iloc[:apex_loc + 1]
        exitDelta = delta_seg.iloc[apex_loc:]
        entry_time_lost = round(entry_delta['time_delta'].iloc[-1] - entry_delta['time_delta'].iloc[0], 3)
        exitTimeLost = round(exitDelta['time_delta'].iloc[-1] - exitDelta['time_delta'].iloc[0], 3)

        fast_entry_spd = fast_seg['Speed'].iloc[0] * 3.6
        slow_entry_spd = slow_seg['Speed'].iloc[0] * 3.6
        entry_speed_diff = round(slow_entry_spd - fast_entry_spd, 1)

        fast_apex_spd = fast_seg['Speed'].iloc[apex_loc] * 3.6
        slow_apex_spd = slow_seg['Speed'].iloc[apex_loc] * 3.6
        apex_speed_diff = round(slow_apex_spd - fast_apex_spd, 1)

        fastExitSpd = fast_seg['Speed'].iloc[-1] * 3.6
        slowExitSpd = slow_seg['Speed'].iloc[-1] * 3.6
        exitSpeedDiff = round(slowExitSpd - fastExitSpd, 1)

        exitDist = fast_seg.index[-1] - apex_idx
        if exitDist > 0:
            fast_recovery = (fastExitSpd - fast_apex_spd) / exitDist * 100
            slow_recovery = (slowExitSpd - slow_apex_spd) / exitDist * 100
            speed_recovery_rate = round(slow_recovery - fast_recovery, 1)

        lat_g = {
            'fast_peak': round(fast_seg['LatAccel'].max(), 3),
            'slow_peak': round(slow_seg['LatAccel'].max(), 3),
            'fast_apex': round(fast_seg['LatAccel'].iloc[apex_loc], 3),
            'slow_apex': round(slow_seg['LatAccel'].iloc[apex_loc], 3),
        }

        understeer, understeer_ratio = _understeer_at_apex(fast_seg, slow_seg, apex_loc)

    fast_gear = fast_seg['Gear'].values
    slow_gear = slow_seg['Gear'].values
    fast_gear_pos = fast_gear[fast_gear > 0]
    slow_gear_pos = slow_gear[slow_gear > 0]
    gear = {
        'fast_entry': int(round(fast_gear[0])),
        'slow_entry': int(round(slow_gear[0])),
        'fast_exit': int(round(fast_gear[-1])),
        'slow_exit': int(round(slow_gear[-1])),
        'fast_min': int(round(fast_gear_pos.min())) if len(fast_gear_pos) > 0 else None,
        'slow_min': int(round(slow_gear_pos.min())) if len(slow_gear_pos) > 0 else None,
        'fast_apex': int(round(fast_gear[apex_loc])) if apex_idx is not None and apex_idx in fast_seg.index else None,
        'slow_apex': int(round(slow_gear[apex_loc])) if apex_idx is not None and apex_idx in fast_seg.index else None,
        'fast_changes': int((np.diff(fast_gear) != 0).sum()),
        'slow_changes': int((np.diff(slow_gear) != 0).sum()),
    }

    return {
        'corner':     corner_name,
        'time_lost':  round(time_lost, 3),
        'speed_diff': round((slow_seg['Speed'].min() - fast_seg['Speed'].min()) * 3.6, 1),
        'thr_diff':   thr_diff,
        'entry_time_lost': entry_time_lost,
        'exit_time_lost': exitTimeLost,
        'entry_speed_diff': entry_speed_diff,
        'apex_speed_diff': apex_speed_diff,
        'exit_speed_diff': exitSpeedDiff,
        'speed_recovery_rate': speed_recovery_rate,
        'lat_g': lat_g,
        'understeer': understeer,
        'understeer_ratio': understeer_ratio,
        'gear':       gear,
        'braking':    analyze_braking(fast_seg, slow_seg),
        'steering':   analyze_steering(fast_seg, slow_seg),
        'line':       analyze_line(fast_seg, slow_seg),
    }