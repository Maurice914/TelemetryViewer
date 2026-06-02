import sys
import json
import numpy as np
from coaching import analyze_laps, format_coaching


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def main():
    fast_csv = sys.argv[1]
    slow_csv = sys.argv[2]
    track_name = sys.argv[3] if len(sys.argv) > 3 else 'Track'

    turn_data = analyze_laps(fast_csv, slow_csv, track_name)
    all_corners = getattr(turn_data, '_raw_corners', [])
    track_length = getattr(turn_data, '_track_length', 0)
    text = format_coaching(turn_data, track_name)

    output = {'text': text, 'data': turn_data, 'all_corners': all_corners, 'track_length': track_length}
    print(json.dumps(output, cls=NumpyEncoder))


if __name__ == '__main__':
    main()
