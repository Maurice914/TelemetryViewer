from data import load_lap, resample_lap, compute_delta
from analysis import analyze_corner
from detection import detect_corners


def _diff(a, b, decimals=None):
    if a is None or b is None: return None
    d = a - b
    return round(d, decimals) if decimals is not None else d

class _DebugList(list):
    pass


def analyze_laps(fast_csv_path: str, slow_csv_path: str, track_name: str = 'Unknown Track'):
    """
    Analyze two laps and return turn data with automatic corner detection.

    Args:
        fast_csv_path: Path to fast (reference) lap CSV file
        slow_csv_path: Path to slow (student) lap CSV file
        track_name: Name of track for display purposes

    Returns:
        List of turn data dictionaries (same format as extract_turn_data)
    """
    # Load laps
    fast = load_lap(fast_csv_path)
    slow = load_lap(slow_csv_path)

    # Resample
    fast_r = resample_lap(fast)
    slow_r = resample_lap(slow, track_length=len(fast_r))

    # Compute delta
    delta = compute_delta(fast_r, slow_r)

    # Detect corners automatically
    corners = detect_corners(fast, slow)
    tl = len(fast_r)

    # Run analysis on each detected corner
    corner_results = []
    for c in corners:
        mask = (fast_r.index >= c['start']) & (fast_r.index < c['end'])
        delta_seg = delta.iloc[mask]
        result = analyze_corner(fast_r.iloc[mask], slow_r.iloc[mask], c['name'], delta_seg, apex_idx=c['apex'])
        result['apex_pct'] = round(c['apex'] / tl, 4)
        result['start_pct'] = round(c['start'] / tl, 4)
        result['end_pct'] = round(c['end'] / tl, 4)
        corner_results.append(result)

    # Extract turn data (sorted by time lost)
    filtered = _DebugList(extract_turn_data(corner_results))
    filtered._raw_corners = corner_results
    filtered._track_length = tl
    return filtered


def extract_turn_data(corner_results):
    """Extract clean data object from corner analysis results."""
    results = []
    for r in sorted(corner_results, key=lambda x: x['time_lost'], reverse=True):
        if r['time_lost'] <= 0:
            continue
        results.append(_build_turn_data(r))
    return results


def _build_turn_data(r):
    br = r['braking']
    st = r['steering']
    ln = r['line']

    bp_diff     = _diff(br.get('slow_bp'), br.get('fast_bp'), 1)
    hold_diff   = _diff(br.get('slow_hold'), br.get('fast_hold'))
    release_diff = _diff(br.get('slow_release'), br.get('fast_release'))
    dead_diff   = _diff(br.get('slow_dead'), br.get('fast_dead'), 1)
    overlap_diff = (br.get('s_overlap', 0) or 0) - (br.get('f_overlap', 0) or 0)
    shape_diff  = _diff(br.get('slow_shape'), br.get('fast_shape'), 3)
    peak_diff   = _diff(br.get('slow_peak'), br.get('fast_peak'), 3)
    max_diff    = _diff(st.get('slow_max'), st.get('fast_max'), 3)
    turn_in_diff = _diff(st.get('slow_turn_in'), st.get('fast_turn_in'), 1)

    flags = []
    if br.get('lockup'): flags.append('LOCKUP')
    if br.get('multi_brake'): flags.append('MULTI_BRAKE')
    if st.get('double_turn'): flags.append('DOUBLE_TURN_IN')
    if r.get('understeer'): flags.append('UNDERSTEER')

    return {
        'corner': r['corner'],
        'time_lost': r['time_lost'],
        'speed_diff': r['speed_diff'],
        'thr_diff': r['thr_diff'],
        'flags': flags,
        'apex_pct': r.get('apex_pct'),
        'start_pct': r.get('start_pct'),
        'end_pct': r.get('end_pct'),
        'entry_time_lost': r.get('entry_time_lost'),
        'exit_time_lost': r.get('exit_time_lost'),
        'entry_speed_diff': r.get('entry_speed_diff'),
        'apex_speed_diff': r.get('apex_speed_diff'),
        'exit_speed_diff': r.get('exit_speed_diff'),
        'speed_recovery_rate': r.get('speed_recovery_rate'),
        'understeer': r.get('understeer', False),
        'lat_g': r.get('lat_g'),
        'gear': r.get('gear'),
        'braking': {
            'grade': br.get('grade'),
            'zone_type': br.get('zone_type'),
            'slow_zone': br.get('slow_zone'),
            'fast_peak': br.get('fast_peak'),
            'slow_peak': br.get('slow_peak'),
            'peak_diff': peak_diff,
            'fast_bp': br.get('fast_bp'),
            'slow_bp': br.get('slow_bp'),
            'bp_diff': bp_diff,
            'fast_hold': br.get('fast_hold'),
            'slow_hold': br.get('slow_hold'),
            'hold_diff': hold_diff,
            'fast_release': br.get('fast_release'),
            'slow_release': br.get('slow_release'),
            'release_diff': release_diff,
            'fast_dead': br.get('fast_dead'),
            'slow_dead': br.get('slow_dead'),
            'dead_diff': dead_diff,
            'fast_overlap': br.get('f_overlap'),
            'slow_overlap': br.get('s_overlap'),
            'overlap_diff': overlap_diff,
            'fast_shape': br.get('fast_shape'),
            'slow_shape': br.get('slow_shape'),
            'shape_diff': shape_diff,
            'n_apps': br.get('n_apps', 0),
            'lockup': br.get('lockup', False),
            'multi_brake': br.get('multi_brake', False),
            'feedback': br.get('feedback', []),
        },
        'steering': {
            'grade': st.get('grade'),
            'fast_max': st.get('fast_max'),
            'slow_max': st.get('slow_max'),
            'max_diff': max_diff,
            'fast_turn_in': st.get('fast_turn_in'),
            'slow_turn_in': st.get('slow_turn_in'),
            'turn_in_diff': turn_in_diff,
            'double_turn': st.get('double_turn', False),
            'fast_double_turn': st.get('fast_double_turn', False),
            'feedback': st.get('feedback', []),
        },
        'line': {
            'grade': ln.get('grade'),
            'entry_gap': ln.get('entry_gap'),
            'apex_gap': ln.get('apex_gap'),
            'exit_gap': ln.get('exit_gap'),
            'max_gap': ln.get('max_gap'),
            'worst_phase': ln.get('worst_phase'),
            'feedback': ln.get('feedback', []),
        }
    }


def format_coaching(turn_data_list, track_name='Unknown Track'):
    lines = []
    lines.append("\n========================================")
    lines.append(f"  COACHING REPORT — {track_name}")
    lines.append("========================================\n")

    raw = getattr(turn_data_list, '_raw_corners', None)
    if raw is not None:
        lines.append(f"\n--- DEBUG: {len(raw)} corners ---")
        for r in sorted(raw, key=lambda x: abs(x.get('time_lost', 0)), reverse=True):
            s = r.get('start_pct', -1)
            e = r.get('end_pct', -1)
            a = r.get('apex_pct', -1)
            lost = r.get('time_lost', 0)
            mark = "✓" if lost > 0 else "✗"
            et = r.get('entry_time_lost', '')
            xt = r.get('exit_time_lost', '')
            es = r.get('entry_speed_diff', '')
            as_ = r.get('apex_speed_diff', '')
            xs = r.get('exit_speed_diff', '')
            under = ' U' if r.get('understeer') else ''
            lines.append(f"  [{r['corner']}] a={a:.4f}→e={e:.4f} s={s:.4f} t={lost:+.4f}{under} entry_t={et} exit_t={xt} entry_spd={es} apex_spd={as_} exit_spd={xs}")
        lines.append("---\n")

    for d in turn_data_list:
        br = d['braking']
        st = d['steering']
        ln = d['line']

        flag_str = ''
        if d['flags']:
            flag_str = '  ' + '  '.join([f'[! {f}]' for f in d['flags']])

        lines.append(f"[ {d['corner']} ] — losing {d['time_lost']:.3f}s{flag_str}")

        # Phase breakdown
        if d.get('entry_time_lost') is not None and d.get('exit_time_lost') is not None:
            lines.append(f"  • Entry: {d['entry_time_lost']:.3f}s lost | Exit: {d['exit_time_lost']:.3f}s lost")

        # Speed diffs by phase
        if d.get('entry_speed_diff') is not None:
            if d['entry_speed_diff'] < -3:
                lines.append(f"  • Entry speed {abs(d['entry_speed_diff']):.1f} km/h lower than reference — carrying too little speed")
            elif d['entry_speed_diff'] > 3:
                lines.append(f"  • Entry speed {d['entry_speed_diff']:.1f} km/h higher than reference — check braking zone")

        if d.get('apex_speed_diff') is not None:
            if d['apex_speed_diff'] < -3:
                lines.append(f"  • Apex speed {abs(d['apex_speed_diff']):.1f} km/h lower than reference — minimum corner speed too low")
            elif d['apex_speed_diff'] < -1:
                lines.append(f"  • Slightly lower apex speed ({abs(d['apex_speed_diff']):.1f} km/h)")

        if d.get('exit_speed_diff') is not None:
            if d['exit_speed_diff'] < -3:
                lines.append(f"  • Exit speed {abs(d['exit_speed_diff']):.1f} km/h lower than reference — loss carries down straight")
            elif d['exit_speed_diff'] < -1:
                lines.append(f"  • Slightly lower exit speed ({abs(d['exit_speed_diff']):.1f} km/h)")

        # Speed recovery rate
        if d.get('speed_recovery_rate') is not None:
            if d['speed_recovery_rate'] < -5:
                lines.append(f"  • Speed recovery after apex {abs(d['speed_recovery_rate']):.1f} km/h/100m slower than reference — get back to throttle sooner")
            elif d['speed_recovery_rate'] < -2:
                lines.append(f"  • Speed recovery slightly slow ({abs(d['speed_recovery_rate']):.1f} km/h/100m)")

        # Lateral G
        lg = d.get('lat_g')
        if lg:
            lat_diff = round((lg.get('slow_peak') or 0) - (lg.get('fast_peak') or 0), 2)
            if lat_diff < -0.15:
                lines.append(f"  • Peak lateral G {abs(lat_diff):.2f} lower than reference — less cornering grip used")
            elif lat_diff > 0.15:
                lines.append(f"  • Peak lateral G {lat_diff:.2f} higher than reference — more cornering grip, but check exit speed")

        # Understeer
        if d.get('understeer'):
            lines.append(f"  • Understeer at apex — more steering input produces less rotation than reference")

        # Throttle diff
        if d['thr_diff'] and d['thr_diff'] > 10:
            lines.append(f"  • Full throttle {d['thr_diff']:.0f}m later than reference on exit")
        elif d['thr_diff'] and d['thr_diff'] < -10:
            lines.append(f"  • Full throttle {abs(d['thr_diff']):.0f}m earlier than reference — good exit")

        # Gear
        gear = d.get('gear')
        if gear:
            for fb in _generate_gear_text(gear):
                lines.append(f"    -> {fb}")

        # Braking
        lines.append(f"  • Braking [{br['zone_type']}] grade: {br['grade']}  "
                     f"peak: {br['slow_peak']} vs {br['fast_peak']} ref | "
                     f"overlap: {br['slow_overlap']}m vs {br['fast_overlap']}m ref")

        for fb in _generate_braking_text(br):
            lines.append(f"    -> {fb}")

        # Steering
        lines.append(f"  • Steering grade: {st['grade']}  "
                     f"max input: {st['slow_max']} vs {st['fast_max']} ref")
        for fb in _generate_steering_text(st):
            lines.append(f"    → {fb}")

        # Line
        lines.append(f"  • Line grade: {ln['grade']}  "
                     f"entry: {ln['entry_gap']}m | apex: {ln['apex_gap']}m | exit: {ln['exit_gap']}m off ref")
        for fb in _generate_line_text(ln):
            lines.append(f"    → {fb}")

        lines.append("")

    return '\n'.join(lines)


def _generate_braking_text(br):
    return list(br.get('feedback', []))


def _generate_steering_text(st):
    return list(st.get('feedback', []))


def _generate_gear_text(gear):
    feedback = []

    fast_apex = gear.get('fast_apex')
    slow_apex = gear.get('slow_apex')
    if fast_apex is not None and slow_apex is not None and slow_apex != fast_apex:
        if slow_apex < fast_apex:
            feedback.append(f"Lower gear at apex (gear {slow_apex} vs {fast_apex} ref) — higher RPM but may cost exit speed")
        else:
            feedback.append(f"Higher gear at apex (gear {slow_apex} vs {fast_apex} ref) — saves a shift but check exit torque")

    min_diff = gear.get('slow_min') - gear.get('fast_min') if gear.get('fast_min') is not None else 0
    if min_diff < 0:
        feedback.append(f"Lower minimum gear than reference (gear {gear['slow_min']} vs {gear['fast_min']} ref) — may indicate over-slowing")

    fast_ch = gear.get('fast_changes', 0)
    slow_ch = gear.get('slow_changes', 0)
    if slow_ch > fast_ch + 1:
        feedback.append(f"More gear changes than reference ({slow_ch} vs {fast_ch}) — unsettled through this section")

    if not feedback:
        feedback.append("Gear selection matches reference")

    return feedback


def _generate_line_text(ln):
    return list(ln.get('feedback', []))