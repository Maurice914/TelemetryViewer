import numpy as np
import matplotlib.pyplot as plt
from project.data import load_lap, resample_lap, compute_delta
from project.detection import detect_corners
from project.analysis import analyze_corner
from project.coaching import format_coaching, extract_turn_data

# ── Plots ─────────────────────────────────────────────────────────────────────
def plot_telemetry(fast_r, slow_r, delta, corners):
    line_gap = compute_line_distance(fast_r, slow_r)
    
    fig, axes = plt.subplots(7, 1, figsize=(14, 24), sharex=True)
    fig.suptitle('Summit Point — Lap Comparison', fontsize=14)
    dist = fast_r.index

    axes[0].plot(dist, fast_r['Speed'] * 3.6, color='steelblue', linewidth=1, label='Fast')
    axes[0].plot(dist, slow_r['Speed'] * 3.6, color='tomato',    linewidth=1, label='Slow', alpha=0.7)
    axes[0].set_ylabel('Speed (km/h)'); axes[0].legend()

    axes[1].plot(dist, delta['time_delta'], color='green', linewidth=1)
    axes[1].axhline(0, color='gray', linestyle='--', linewidth=0.5)
    axes[1].set_ylabel('Time delta (s)')
    axes[1].set_title('Cumulative time gap (positive = slow losing time)')

    axes[2].plot(dist, fast_r['Brake'], color='steelblue', linewidth=1, label='Fast')
    axes[2].plot(dist, slow_r['Brake'], color='tomato',    linewidth=1, label='Slow', alpha=0.7)
    axes[2].set_ylabel('Brake'); axes[2].legend()

    axes[3].plot(dist, fast_r['Throttle'], color='steelblue', linewidth=1, label='Fast')
    axes[3].plot(dist, slow_r['Throttle'], color='tomato',    linewidth=1, label='Slow', alpha=0.7)
    axes[3].set_ylabel('Throttle'); axes[3].legend()

    axes[4].plot(dist, fast_r['SteeringWheelAngle'], color='steelblue', linewidth=1, label='Fast')
    axes[4].plot(dist, slow_r['SteeringWheelAngle'], color='tomato',    linewidth=1, label='Slow', alpha=0.7)
    axes[4].axhline(0, color='gray', linestyle='--', linewidth=0.8, label='0°')
    axes[4].set_ylabel('Steering (deg)'); axes[4].legend()
    axes[4].set_title('Steering wheel angle')

    axes[5].plot(dist, line_gap, color='mediumpurple', linewidth=1)
    axes[5].set_ylabel('Line gap (m)')
    for c in corners:
        axes[5].axvspan(c['start'], c['end'], alpha=0.2, color='red')
        axes[5].text((c['start']+c['end'])/2, line_gap.max()*0.92,
                     c['name'], ha='center', fontsize=8, color='darkred')

    axes[6].plot(dist, fast_r['Speed'] * 3.6, color='steelblue', linewidth=1, alpha=0.5)
    for c in corners:
        axes[6].axvspan(c['start'], c['end'], alpha=0.2, color='red')
        axes[6].text((c['start']+c['end'])/2, fast_r['Speed'].max()*3.6*0.92,
                     c['name'], ha='center', fontsize=8, color='darkred')
    axes[6].set_ylabel('Speed (km/h)')
    axes[6].set_xlabel('Distance (m)')
    axes[6].set_title('Corner zones')

    plt.tight_layout()
    plt.savefig('lap_comparison.png', dpi=150, bbox_inches='tight')
    plt.show()

def plot_track_map(fast_r, corners):
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.plot(fast_r['Lon'], fast_r['Lat'], color='steelblue', linewidth=1.5, alpha=0.4)
    for i, c in enumerate(corners):
        color = plt.cm.Set1.colors[i % 9]
        mask  = (fast_r.index >= c['start']) & (fast_r.index < c['end'])
        ax.plot(fast_r['Lon'][mask], fast_r['Lat'][mask], color=color, linewidth=4)
        mid = (c['start'] + c['end']) // 2
        ax.annotate(c['name'],
                    xy=(fast_r['Lon'].iloc[mid], fast_r['Lat'].iloc[mid]),
                    fontsize=9, fontweight='bold', color=color, ha='center', va='center',
                    bbox=dict(boxstyle='round,pad=0.2', fc='white', alpha=0.7))
    ax.set_aspect('equal'); ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('track_map.png', dpi=150, bbox_inches='tight')
    plt.show()

def compute_line_distance(fast_r, slow_r):
    lat_diff = (slow_r['Lat'] - fast_r['Lat']) * 111320
    lon_diff = (slow_r['Lon'] - fast_r['Lon']) * 111320 * np.cos(np.radians(fast_r['Lat'].mean()))
    return np.sqrt(lat_diff**2 + lon_diff**2)

# ── Run ───────────────────────────────────────────────────────────────────────
fast = load_lap('./fast.csv')
slow = load_lap('./slow.csv')

fast_r = resample_lap(fast)
slow_r = resample_lap(slow)
delta  = compute_delta(fast_r, slow_r)

corners = detect_corners(fast, slow)

corner_results = []
for c in corners:
    mask     = (fast_r.index >= c['start']) & (fast_r.index < c['end'])
    fast_seg = fast_r.iloc[mask]
    slow_seg = slow_r.iloc[mask]
    delta_seg = delta.iloc[mask]
    corner_results.append(analyze_corner(fast_seg, slow_seg, c['name'], delta_seg))

print(f"\nFast lap:  {int(fast['time_s'].iloc[-1]//60)}:{fast['time_s'].iloc[-1]%60:06.3f}")
print(f"Slow lap:  {int(slow['time_s'].iloc[-1]//60)}:{slow['time_s'].iloc[-1]%60:06.3f}")
print(f"Total gap: {slow['time_s'].iloc[-1] - fast['time_s'].iloc[-1]:.3f}s")

turn_data = extract_turn_data(corner_results)
coaching_text = format_coaching(turn_data)
print(coaching_text)

plot_telemetry(fast_r, slow_r, delta, corners)
plot_track_map(fast_r, corners)
