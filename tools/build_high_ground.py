"""Generate a tiny original campaign for the inspected Linux Broforce build.

Native format 0x907f0a4a; reconstructed from Campaign/MapData/DoodadInfo.Serialize.
No copied campaign or game art is included in the output. Requires only Python.
"""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'library/levels/high-ground'
SCHEMA = json.loads(Path(__file__).with_name('map-binary-schema.json').read_text())


def pack_string(value):
    if value is None:
        return b'\0'
    b = value.encode('utf-8')
    n = len(b)
    prefix = bytearray([1])
    while n >= 128:
        prefix.append((n & 127) | 128)
        n >>= 7
    prefix.append(n)
    return bytes(prefix) + b


def build():
    w, h = 64, 48
    settings = {name: False if fmt == '?' else '' if fmt == 's' else 0 for name, fmt in SCHEMA}
    settings.update(cameraSpeed=32.0, regualrMookSpawnProbability=1.0,
                    spawnAmmoCrates=True, canHighFiveSlowDownThisLevel=True,
                    ammoCrateFrequencyMultiplier=1.0, bloomEffectM=1.0,
                    bloomThresholdM=1.0, collapseInterval=3.0,
                    brosStartWithFullSpecials=True, theme=4, musicType=8,
                    weatherType=4, ambience=8, heroSpawnMode=4,
                    forcedBro=1000, width=w, height=h,
                    levelDescription='THE HIGH GROUND - A short descent into Hell')
    fg = [[0] * h for _ in range(w)]
    bg = [[0] * h for _ in range(w)]
    # Four short descents; lower ledges catch the player without precision jumps.
    terraces = [(0, 13, 35), (14, 24, 29), (25, 35, 23), (36, 46, 17), (47, 63, 11)]
    for left, right, top in terraces:
        for x in range(left, right + 1):
            for y in range(top + 1):
                fg[x][y] = 47 if y >= top - 2 else 48  # HellEarth / HellRock
                if y < top - 1:
                    bg[x][y] = 7  # EarthBehind, rendered using the active theme
    # Small industrial overlook above the burning descent.
    for x in range(3, 10):
        fg[x][35] = 13  # steel at the high starting overlook
    doodads = []
    def obj(x, y, kind, variation=0):
        doodads.append(dict(x=x, y=y, type=kind, variation=variation))
    for i in range(4):
        obj(4 + i * 2, 36, 35, 1)  # four invisible spawn points; variation is visibility, not player index
    obj(21, 30, 74, 0)
    obj(32, 24, 74, 1)
    obj(43, 18, 74, 1)
    obj(52, 12, 74, 0)
    obj(28, 24, 3, 0)  # checkpoint halfway down
    obj(30, 25, 1, 0)  # native cage footprint rows25/24, supported by ground row23
    obj(58, 12, 4, 0)  # native Satan encounter; the area action handles completion
    obj(57, 12, 3, 0)
    # Native Hell decorations, including the burning atmosphere selected above.
    for x, y in [(12, 36), (24, 30), (35, 24), (46, 18), (50, 12)]:
        obj(x, y, 80, 14)  # native burning bone torches
    for x, y in [(34, 24), (45, 18), (51, 12), (61, 12)]:
        obj(x, y, 80, 24)  # native heat sparks and ember emitters
    obj(49, 12, 80, 26)  # smoke near the bottom of the descent
    b = bytearray(struct.pack('<I', 0x907f0a4a))
    b += pack_string('The High Ground') + struct.pack('<ii', -1, 1)
    for name, fmt in SCHEMA:
        b += pack_string(settings[name]) if fmt == 's' else struct.pack('<' + fmt, settings[name])
    for x in range(w):
        for y in range(h):
            b += bytes([fg[x][y], bg[x][y]])
    # Native portal for the scene, followed by an explicit completion region.
    # The portal alone has destructive scripted behavior; victory is explicit.
    def area_event(bounds, name, event):
        data = struct.pack('<iiii?f????ii?', *bounds, True, 1.0,
                           False, True, False, False, 0, 0, True)
        data += pack_string(name) + pack_string('') + pack_string(None)
        data += struct.pack('<iii', 0, 1, 7)  # Area / one action / LevelEvent
        data += struct.pack('<f?', 0.0, False) + pack_string(name)
        data += struct.pack('<i?ii', 7, True, 61, 12)
        data += struct.pack('<?iffi????', False, 0, 0.0, 0.0, 0, False, True, False, False)
        return data + pack_string(None) + struct.pack('<ii', event, 0)
    b += struct.pack('<i', 2)
    b += area_event([48, 10, 63, 18], 'Open the exit portal', 19)
    b += area_event([59, 11, 63, 16], 'Finish test level', 0)
    b += struct.pack('<i', len(doodads))
    for d in doodads:
        b += struct.pack('<iii?', d['x'], d['y'], d['variation'], False)
        b += pack_string(None) + bytes([d['type'], 0])  # no tag / embedded trigger
    b += struct.pack('<i', 0)  # no forced bro list; works without mods
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'The High Ground.bfc').write_bytes(b)
    design = dict(name='The High Ground', environment='Hell', expected_duration_seconds='15-30',
                  settings=settings, terraces=terraces, doodads=doodads,
                  broPolicy=dict(initial='native vanilla selection', rescue='random vanilla bro',
                                 implementation='external BroMaker integration; campaign does not globally force a hero'),
                  intent='High industrial ledge descending into a burning demonic ravine; brief test.',
                  exit=dict(trigger_area=[48, 10, 63, 18], action='CallHellPortal', position=[61,12],
                            completion_area=[59,11,63,16], completion_action='LevelEndSuccess'),
                  status='generated; see playtest.json for observed verification')
    (OUT / 'design.json').write_text(json.dumps(design, indent=2) + '\n')
    print(f'Created {OUT / "The High Ground.bfc"}: {len(b)} bytes, {w}x{h}, {len(doodads)} objects')
    return design, fg


if __name__ == '__main__':
    build()
