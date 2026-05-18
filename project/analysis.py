import numpy as np
from helpers import grade, first_above, smooth, classify_zone, release_shape

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

    fb = smooth(fast_seg['Brake'], threshold=noise_thresh)
    sb = smooth(slow_seg['Brake'], threshold=noise_thresh)

    fast_peak = fb.max()
    slow_peak = sb.max()
    fast_bp   = first_above(fb, brake_thresh)
    slow_bp   = first_above(sb, brake_thresh)

    def phases(brake):
        if brake.max() < brake_thresh: return None, None, None, None
        peak_idx = brake.idxmax()
        peak_val = brake.max()
        hold     = len(brake[brake >= peak_val * 0.90])
        after    = brake.loc[peak_idx:]
        zeros    = after[after <= noise_thresh]
        zero_idx = zeros.index[0] if len(zeros) > 0 else None
        release  = zero_idx - peak_idx if zero_idx else 0
        return peak_idx, hold, zero_idx, release

    fp_idx, f_hold, f_zero, f_release = phases(fb)
    sp_idx, s_hold, s_zero, s_release = phases(sb)

    def dead_zone(seg, zero_idx):
        if zero_idx is None: return None
        thr = seg['Throttle'].loc[zero_idx:]
        hit = thr[thr > 0.1]
        return round(hit.index[0] - zero_idx, 1) if len(hit) > 0 else None

    f_dead = dead_zone(fast_seg, f_zero)
    s_dead = dead_zone(slow_seg, s_zero)

    def overlap(seg, zero_idx):
        if zero_idx is None or fp_idx is None: return 0
        w = seg.loc[fp_idx:zero_idx]
        b = smooth(w['Brake'], threshold=noise_thresh)
        return int(((b > 0.05) & (w['SteeringWheelAngle'].abs() > 0.05)).sum())

    f_overlap = overlap(fast_seg, f_zero)
    s_overlap = overlap(slow_seg, s_zero)

    def lockup(brake):
        grad = np.diff(brake.values)
        for i in np.where(grad < -0.15)[0]:
            if i + 5 < len(brake) and brake.values[i+5] > brake.values[i] * 0.8:
                return True
        return False

    above       = (sb > brake_thresh).astype(int)
    n_apps      = int((above.diff().fillna(0) == 1).sum())
    multi_brake = n_apps > 1

    f_shape = release_shape(fb, fp_idx, f_zero)
    s_shape = release_shape(sb, sp_idx, s_zero)

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

    if f_hold and s_hold:
        hold_diff = s_hold - f_hold
        if hold_diff > 15:
            feedback.append(f'Holding peak pressure {hold_diff:.0f}m longer — compressing trail brake phase')
            issues += 1
        elif hold_diff < -10 and f_hold > 5:
            feedback.append('Releasing peak pressure earlier than reference — hold longer before trailing off')
            issues += 0.5

    if f_shape is not None and s_shape is not None:
        if f_shape > 0.05 and s_shape < -0.05:
            feedback.append(f'Release too convex — dropping pressure too early ({s_shape:.2f} vs {f_shape:.2f} ref)')
            issues += 1
        elif (s_shape - f_shape) < -0.12:
            feedback.append('Release shape slightly early vs reference')
            issues += 0.5

    if f_overlap > 5 and s_overlap < 3:
        feedback.append(f'No trail braking overlap — reference uses {f_overlap}m. Apply light brake through turn in')
        issues += 1
    elif (s_overlap - f_overlap) < -8:
        feedback.append(f'Less trail braking than reference ({s_overlap}m vs {f_overlap}m)')
        issues += 0.5

    if f_dead is not None and s_dead is not None:
        dead_diff = s_dead - f_dead
        if dead_diff > 15:
            feedback.append(f'Slow throttle pickup — {s_dead:.0f}m dead zone vs {f_dead:.0f}m ref')
            issues += 1
        elif dead_diff > 8:
            feedback.append(f'Slightly slow to throttle after braking ({s_dead:.0f}m vs {f_dead:.0f}m)')
            issues += 0.5

    if lockup(sb):
        feedback.append('Possible lockup — sudden pressure spike detected. Brake more smoothly')
        issues += 1

    if multi_brake:
        feedback.append(f'Multiple brake applications ({n_apps}x) — pumping brakes or mid-corner correction')
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
        'fast_hold':   f_hold,
        'slow_hold':   s_hold,
        'fast_release': f_release,
        'slow_release': s_release,
        'fast_dead':   f_dead,
        'slow_dead':   s_dead,
        'f_overlap':   f_overlap,
        's_overlap':   s_overlap,
        'fast_shape':  round(f_shape, 3) if f_shape is not None else None,
        'slow_shape':  round(s_shape, 3) if s_shape is not None else None,
        'n_apps':      n_apps,
        'lockup':      lockup(sb),
        'multi_brake': multi_brake,
        'feedback':    feedback,
    }

def analyze_steering(fast_seg, slow_seg):
    feedback = []
    issues   = 0

    fs = smooth(fast_seg['SteeringWheelAngle'])
    ss = smooth(slow_seg['SteeringWheelAngle'])

    if fs.abs().max() < 0.05 or ss.abs().max() < 0.05:
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

    fast_max   = fs.abs().max()
    slow_max   = ss.abs().max()
    steer_diff = slow_max - fast_max

    fast_turn_in = first_above(fs.abs(), 0.05)
    slow_turn_in = first_above(ss.abs(), 0.05)

    def double_turn(steer, threshold=0.05):
        vals = steer.abs().values
        if len(vals) < 10: return False
        peak = np.argmax(vals)
        if peak < 5 or peak > len(vals) - 5: return False
        first_half = vals[:peak]
        ti = next((i for i, v in enumerate(first_half) if v > threshold), None)
        if ti is None: return False
        between = first_half[ti:]
        if len(between) < 5: return False
        drop = np.max(between) - np.min(between)
        return drop > 0.25 * vals[peak] and np.min(between) < np.max(between) * 0.7

    slow_double = double_turn(ss)
    fast_double = double_turn(fs)

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
        ti_diff = slow_turn_in - fast_turn_in
        if ti_diff < -15:
            feedback.append(f'Turning in {abs(ti_diff):.0f}m early — leads to early apex and running wide on exit')
            issues += 1
        elif ti_diff < -8:
            feedback.append(f'Turn in slightly early ({abs(ti_diff):.0f}m) — delay a little')
            issues += 0.5
        elif ti_diff > 15:
            feedback.append(f'Turning in {ti_diff:.0f}m late — may be causing tighter line than optimal')
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

    n      = len(gap)
    entry  = gap.iloc[:n//3]
    apex   = gap.iloc[n//3: 2*n//3]
    exit_  = gap.iloc[2*n//3:]

    entry_gap = entry.mean()
    apex_gap  = apex.mean()
    exit_gap  = exit_.mean()
    max_gap   = gap.max()
    max_gap_m = gap.idxmax()

    if max_gap_m < fast_seg.index[n//3]:
        worst_phase = 'entry'
    elif max_gap_m < fast_seg.index[2*n//3]:
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
            + ('late apex — losing exit speed' if exit_gap < entry_gap else 'early apex — running wide on exit')
        )
        issues += 1
    elif apex_gap > 1.0:
        feedback.append(f'Apex position {apex_gap:.1f}m off reference')
        issues += 0.5

    if exit_gap > 2.0:
        feedback.append(f'Exit line {exit_gap:.1f}m from reference — track out further on exit')
        issues += 1
    elif exit_gap > 1.0:
        feedback.append(f'Exit line slightly tight ({exit_gap:.1f}m) — use more road')
        issues += 0.25

    if entry_gap > 1.0 and apex_gap > 1.0 and exit_gap > 1.0:
        feedback.append(f'Line offset throughout — entry: {entry_gap:.1f}m, apex: {apex_gap:.1f}m, exit: {exit_gap:.1f}m')
        issues += 0.5

    if not feedback:
        feedback.append(f'Line matches reference well (max deviation {max_gap:.1f}m)')

    return {
        'grade':       grade(issues),
        'entry_gap':   round(entry_gap, 2),
        'apex_gap':    round(apex_gap, 2),
        'exit_gap':    round(exit_gap, 2),
        'max_gap':     round(max_gap, 2),
        'worst_phase': worst_phase,
        'feedback':    feedback,
    }

def analyze_corner(fast_seg, slow_seg, corner_name, delta_seg):
    time_lost   = delta_seg['time_delta'].iloc[-1] - delta_seg['time_delta'].iloc[0]
    fast_thr_pt = first_above(fast_seg['Throttle'], 0.9)
    slow_thr_pt = first_above(slow_seg['Throttle'], 0.9)
    thr_diff    = round(slow_thr_pt - fast_thr_pt, 0) if (fast_thr_pt and slow_thr_pt) else None

    return {
        'corner':     corner_name,
        'time_lost':  round(time_lost, 3),
        'speed_diff': round((slow_seg['Speed'].min() - fast_seg['Speed'].min()) * 3.6, 1),
        'thr_diff':   thr_diff,
        'braking':    analyze_braking(fast_seg, slow_seg),
        'steering':   analyze_steering(fast_seg, slow_seg),
        'line':       analyze_line(fast_seg, slow_seg),
    }