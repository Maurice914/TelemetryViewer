from coaching import analyze_laps, format_coaching

turn_data = analyze_laps(
    fast_csv_path='./fast.csv',
    slow_csv_path='./slow.csv',
    track_name='Summit Point'
)

print(format_coaching(turn_data))