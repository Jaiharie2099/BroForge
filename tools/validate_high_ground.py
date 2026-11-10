"""Read and validate the generated native campaign, rejecting trailing bytes."""
import io
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads(Path(__file__).with_name('map-binary-schema.json').read_text())


def validate(path):
    f = io.BytesIO(Path(path).read_bytes())
    def read(fmt):
        return struct.unpack('<' + fmt, f.read(struct.calcsize('<' + fmt)))[0]
    def string():
        if not read('?'):
            return None
        n = shift = 0
        while True:
            b = read('B'); n |= (b & 127) << shift; shift += 7
            if b < 128:
                break
            assert shift < 35, 'Invalid string length'
        return f.read(n).decode('utf-8')
    assert read('I') == 0x907f0a4a
    name = string()
    assert read('i') == -1
    assert read('i') == 1
    settings = {k: string() if fmt == 's' else read(fmt) for k, fmt in SCHEMA}
    w, h = settings['width'], settings['height']
    assert (w, h) == (64, 48)
    assert settings['theme'] == 4 and settings['heroSpawnMode'] == 4
    assert settings['forcedBro'] == 1000, 'Global bro forcing would also force the rescued bro'
    grid = [[(read('B'), read('B')) for y in range(h)] for x in range(w)]
    # TerrainType has different IDs from GroundType: confirm the intended inputs.
    assert grid[4][35][0] == 13  # steel overlook
    assert grid[20][29][0] == 47  # HellEarth
    assert grid[20][30][0] == 0  # air above the ledge
    assert grid[20][0][0] == 48  # HellRock
    assert read('i') == 2
    for expected_bounds, expected_name, expected_event in [
        ([48, 10, 63, 18], 'Open the exit portal', 19),
        ([59, 11, 63, 16], 'Finish test level', 0),
    ]:
        bounds = [read('i') for _ in range(4)]
        assert bounds == expected_bounds
        assert read('?') is True
        read('f')
        for _ in range(4): read('?')
        read('i'); read('i')
        assert read('?') is True
        assert string() == expected_name
        string(); string()
        assert [read('i') for _ in range(3)] == [0, 1, 7]
        read('f'); read('?'); string()
        assert read('i') == 7 and read('?') is True
        assert [read('i'), read('i')] == [61, 12]
        assert read('?') is False
        read('i'); read('f'); read('f'); read('i')
        for _ in range(4): read('?')
        string()
        assert read('i') == expected_event
        read('i')
    objects = []
    for _ in range(read('i')):
        x, y, variation = read('i'), read('i'), read('i')
        hard = read('?'); tag = string(); kind = read('B')
        assert not read('?'), 'Unexpected embedded trigger'
        assert 0 <= x < w and 0 <= y < h
        assert grid[x][y][0] == 0, f'Object inside solid terrain: {x},{y}'
        if kind == 1:  # Cage.PlaceCageBlocks uses a 2x2 footprint extending down.
            assert x + 1 < w and y >= 2, 'Cage footprint outside map'
            assert all(grid[x + dx][y + dy][0] == 0
                       for dx in (0, 1) for dy in (0, -1)), 'Rescue cage overlaps solid terrain'
            assert all(grid[x + dx][y - 2][0] != 0 for dx in (0, 1)), 'Rescue cage lacks ground support'
        if kind == 35:
            assert variation == 1, 'SpawnPoint variation 1 avoids automatic starting cages'
        objects.append((x, y, kind, variation))
    assert len([d for d in objects if d[2] == 35]) == 4
    assert len([d for d in objects if d[2] == 4]) == 1
    assert len([d for d in objects if d[2] == 74]) == 4
    assert any(d[2:] == (80, 14) for d in objects)
    assert read('i') == 0 and f.read() == b''
    heights = [max(y for y in range(h) if grid[x][y][0] != 0) for x in range(w)]
    assert all(0 <= a-b <= 6 for a,b in zip(heights,heights[1:]))
    return dict(name=name, size=[w,h], objects=len(objects),
                max_drop_tiles=max(a-b for a,b in zip(heights,heights[1:])),
                complete_binary_consumed=True, object_placement='clear including native cage footprint',
                rescue_bro_selection='unrestricted native random selection',
                runtime='separate verification required')

if __name__ == '__main__':
    import sys
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT/'library/levels/high-ground/The High Ground.bfc'
    print(json.dumps(validate(p), indent=2))
