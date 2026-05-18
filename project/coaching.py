from data import load_lap, resample_lap, compute_delta
from analysis import analyze_corner
from detection import detect_corners


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
    slow_r = resample_lap(slow)

    # Compute delta
    delta = compute_delta(fast_r, slow_r)

    # Detect corners automatically
    corners = detect_corners(fast, slow)

    # Run analysis on each detected corner
    corner_results = []
    for c in corners:
        mask = (fast_r.index >= c['start']) & (fast_r.index < c['end'])
        delta_seg = delta.iloc[mask]
        corner_results.append(
            analyze_corner(fast_r.iloc[mask], slow_r.iloc[mask], c['name'], delta_seg)
        )

    # Extract turn data (sorted by time lost)
    return extract_turn_data(corner_results)


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

    # Compute diffs
    bp_diff = None
    if br.get('slow_bp') is not None and br.get('fast_bp') is not None:
        bp_diff = round(br['slow_bp'] - br['fast_bp'], 1)

    hold_diff = None
    if br.get('slow_hold') is not None and br.get('fast_hold') is not None:
        hold_diff = br['slow_hold'] - br['fast_hold']

    release_diff = None
    if br.get('slow_release') is not None and br.get('fast_release') is not None:
        release_diff = br['slow_release'] - br['fast_release']

    dead_diff = None
    if br.get('slow_dead') is not None and br.get('fast_dead') is not None:
        dead_diff = round(br['slow_dead'] - br['fast_dead'], 1)

    overlap_diff = br.get('s_overlap', 0) - br.get('f_overlap', 0)

    shape_diff = None
    if br.get('slow_shape') is not None and br.get('fast_shape') is not None:
        shape_diff = round(br['slow_shape'] - br['fast_shape'], 3)

    peak_diff = round(br['slow_peak'] - br['fast_peak'], 3) if br.get('slow_peak') and br.get('fast_peak') else None

    max_diff = None
    if st.get('slow_max') is not None and st.get('fast_max') is not None:
        max_diff = round(st['slow_max'] - st['fast_max'], 3)

    turn_in_diff = None
    if st.get('slow_turn_in') is not None and st.get('fast_turn_in') is not None:
        turn_in_diff = round(st['slow_turn_in'] - st['fast_turn_in'], 1)

    # Extract flags
    flags = []
    if br.get('lockup'): flags.append('LOCKUP')
    if br.get('multi_brake'): flags.append('MULTI_BRAKE')
    if st.get('double_turn'): flags.append('DOUBLE_TURN_IN')

    return {
        'corner': r['corner'],
        'time_lost': r['time_lost'],
        'speed_diff': r['speed_diff'],
        'thr_diff': r['thr_diff'],
        'flags': flags,
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
        },
        'line': {
            'grade': ln.get('grade'),
            'entry_gap': ln.get('entry_gap'),
            'apex_gap': ln.get('apex_gap'),
            'exit_gap': ln.get('exit_gap'),
            'max_gap': ln.get('max_gap'),
            'worst_phase': ln.get('worst_phase'),
        }
    }


def format_coaching(turn_data_list):
    """Generate coaching text from extracted turn data."""
    lines = []
    lines.append("\n========================================")
    lines.append("  COACHING REPORT — Summit Point Main")
    lines.append("========================================\n")

    for d in turn_data_list:
        br = d['braking']
        st = d['steering']
        ln = d['line']

        flag_str = ''
        if d['flags']:
            flag_str = '  ' + '  '.join([f'[! {f}]' for f in d['flags']])

        lines.append(f"[ {d['corner']} ] — losing {d['time_lost']:.3f}s{flag_str}")

        # Speed diff
        if d['speed_diff'] < -3:
            lines.append(f"  • Apex speed {abs(d['speed_diff']):.1f} km/h lower than reference")
        elif d['speed_diff'] < -1:
            lines.append(f"  • Slightly lower apex speed ({abs(d['speed_diff']):.1f} km/h)")

        # Throttle diff
        if d['thr_diff'] and d['thr_diff'] > 10:
            lines.append(f"  • Full throttle {d['thr_diff']:.0f}m later than reference on exit")
        elif d['thr_diff'] and d['thr_diff'] < -10:
            lines.append(f"  • Full throttle {abs(d['thr_diff']):.0f}m earlier than reference — good exit")

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
    feedback = []

    if br.get('zone_type') == 'none':
        if br.get('slow_peak', 0) > 0.05:
            feedback.append('Unnecessary braking — reference does not brake here')
        return feedback

    # Peak pressure
    if br.get('peak_diff') is not None:
        if br['peak_diff'] < -0.15:
            feedback.append(f'Underbraking — peak pressure {br["slow_peak"]:.2f} vs {br["fast_peak"]:.2f} ref')
        elif br['peak_diff'] < -0.08:
            feedback.append(f'Slightly less peak pressure ({br["slow_peak"]:.2f} vs {br["fast_peak"]:.2f})')

    # Brake point
    if br.get('bp_diff') is not None:
        if br['zone_type'] in ('heavy', 'medium'):
            if br['bp_diff'] < -15:
                feedback.append(f'Braking {abs(br["bp_diff"]):.0f}m earlier than reference — brake later')
            elif br['bp_diff'] < -8:
                feedback.append(f'Brake point {abs(br["bp_diff"]):.0f}m early — small gain available')
            elif br['bp_diff'] > 10:
                feedback.append(f'Braking {br["bp_diff"]:.0f}m later than reference — check entry speed')

    # Hold
    if br.get('hold_diff') is not None:
        if br['hold_diff'] > 15:
            feedback.append(f'Holding peak pressure {br["hold_diff"]:.0f}m longer — compressing trail brake phase')
        elif br['hold_diff'] < -10 and (br.get('fast_hold') or 0) > 5:
            feedback.append('Releasing peak pressure earlier than reference — hold longer before trailing off')

    # Release shape
    if br.get('shape_diff') is not None:
        if (br.get('fast_shape') or 0) > 0.05 and (br.get('slow_shape') or 0) < -0.05:
            feedback.append(f'Release too convex — dropping pressure too early ({br["slow_shape"]:.2f} vs {br["fast_shape"]:.2f} ref)')
        elif br['shape_diff'] < -0.12:
            feedback.append('Release shape slightly early vs reference')

    # Trail braking overlap
    if br.get('fast_overlap', 0) > 5 and (br.get('slow_overlap') or 0) < 3:
        feedback.append(f'No trail braking overlap — reference uses {br["fast_overlap"]}m. Apply light brake through turn in')
    elif br.get('overlap_diff', 0) < -8:
        feedback.append(f'Less trail braking than reference ({br["slow_overlap"]}m vs {br["fast_overlap"]}m)')

    # Dead zone
    if br.get('dead_diff') is not None:
        if br['dead_diff'] > 15:
            feedback.append(f'Slow throttle pickup — {br["slow_dead"]:.0f}m dead zone vs {br["fast_dead"]:.0f}m ref')
        elif br['dead_diff'] > 8:
            feedback.append(f'Slightly slow to throttle after braking ({br["slow_dead"]:.0f}m vs {br["fast_dead"]:.0f}m)')

    # Flags
    if br.get('lockup'):
        feedback.append('Possible lockup — sudden pressure spike detected. Brake more smoothly')
    if br.get('multi_brake'):
        feedback.append(f"Multiple brake applications ({br['n_apps']}x) — pumping brakes or mid-corner correction")

    # Zone mismatch
    if br.get('slow_zone') and br.get('zone_type') and br['slow_zone'] != br['zone_type']:
        feedback.append(
            f'Braking intensity mismatch — reference is {br["zone_type"]}, driver is {br["slow_zone"]}. '
            + ('Underbraking on entry' if br['slow_zone'] in ('light', 'none') else 'Overbraking vs reference')
        )

    if not feedback:
        feedback.append('Braking matches reference well')

    return feedback


def _generate_steering_text(st):
    feedback = []

    if not st.get('fast_max') or not st.get('slow_max'):
        return ['Not enough steering data']

    # Max steering
    if st.get('max_diff') is not None:
        if st['max_diff'] > 0.15:
            feedback.append(f'Too much steering — {st["slow_max"]:.2f} vs {st["fast_max"]:.2f} ref. Early apex likely')
        elif st['max_diff'] > 0.08:
            feedback.append(f'Slightly more steering than reference ({st["slow_max"]:.2f} vs {st["fast_max"]:.2f})')
        elif st['max_diff'] < -0.15:
            feedback.append(f'Too little steering — {st["slow_max"]:.2f} vs {st["fast_max"]:.2f} ref. Missing apex')
        elif st['max_diff'] < -0.08:
            feedback.append('Slightly less steering than reference — may be missing apex')

    # Turn in
    if st.get('turn_in_diff') is not None:
        if st['turn_in_diff'] < -15:
            feedback.append(f'Turning in {abs(st["turn_in_diff"]):.0f}m early — leads to early apex and running wide on exit')
        elif st['turn_in_diff'] < -8:
            feedback.append(f'Turn in slightly early ({abs(st["turn_in_diff"]):.0f}m) — delay a little')
        elif st['turn_in_diff'] > 15:
            feedback.append(f'Turning in {st["turn_in_diff"]:.0f}m late — may be causing tighter line than optimal')

    # Double turn
    if st.get('double_turn') and not st.get('fast_double_turn'):
        feedback.append(
            'Double turn in detected — steering builds, drops, then increases again. '
            'Strong sign of early apex. Delay turn in and target a later apex'
        )
    elif st.get('double_turn') and st.get('fast_double_turn'):
        feedback.append('Double turn in on both laps — characteristic of this corner, review line')

    if not feedback:
        feedback.append('Steering matches reference well')

    return feedback


def _generate_line_text(ln):
    feedback = []

    if not ln.get('entry_gap'):
        return ['Not enough position data']

    # Max gap
    if ln.get('max_gap', 0) > 3.0:
        feedback.append(f'Large line deviation — {ln["max_gap"]:.1f}m off reference at {ln["worst_phase"]}')
    elif ln.get('max_gap', 0) > 1.5:
        feedback.append(f'Moderate line deviation — {ln["max_gap"]:.1f}m off reference at {ln["worst_phase"]}')

    # Entry
    if ln.get('entry_gap', 0) > 2.0:
        feedback.append(f'Entry line {ln["entry_gap"]:.1f}m from reference — check positioning on approach')
    elif ln.get('entry_gap', 0) > 1.0:
        feedback.append(f'Entry line slightly off reference ({ln["entry_gap"]:.1f}m)')

    # Apex
    if ln.get('apex_gap', 0) > 2.0:
        feedback.append(
            f'Apex {ln["apex_gap"]:.1f}m from reference — '
            + ('late apex — losing exit speed' if ln.get('exit_gap', 0) < ln.get('entry_gap', 0) else 'early apex — running wide on exit')
        )
    elif ln.get('apex_gap', 0) > 1.0:
        feedback.append(f'Apex position {ln["apex_gap"]:.1f}m off reference')

    # Exit
    if ln.get('exit_gap', 0) > 2.0:
        feedback.append(f'Exit line {ln["exit_gap"]:.1f}m from reference — track out further on exit')
    elif ln.get('exit_gap', 0) > 1.0:
        feedback.append(f'Exit line slightly tight ({ln["exit_gap"]:.1f}m) — use more road')

    # Offset throughout
    if ln.get('entry_gap', 0) > 1.0 and ln.get('apex_gap', 0) > 1.0 and ln.get('exit_gap', 0) > 1.0:
        feedback.append(f'Line offset throughout — entry: {ln["entry_gap"]:.1f}m, apex: {ln["apex_gap"]:.1f}m, exit: {ln["exit_gap"]:.1f}m')

    if not feedback:
        feedback.append(f'Line matches reference well (max deviation {ln["max_gap"]:.1f}m)')

    return feedback