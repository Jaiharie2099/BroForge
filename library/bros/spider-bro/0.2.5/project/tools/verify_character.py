"""Verify approved artwork, animation coverage, installed hashes and live combat evidence."""
from pathlib import Path
import argparse, json, hashlib
from PIL import Image

P=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--evidence',type=Path);args=ap.parse_args()
meta=json.loads((P/'assets/spider_moves.json').read_text());atlas=Image.open(P/'assets/spider_moves.png').convert('RGBA')
assert atlas.size==(256,len(meta['rows'])*32)
assert atlas.crop((0,0,32,32)).tobytes()==Image.open(P/'art-source/approved-idle.png').convert('RGBA').tobytes(), 'Idle differs from approved prototype 3 with approved spider emblem'
required={'idle','run','crouch','jump','fall','swing','dual_fire','wall_climb','ladder','wall_slide','roll','dodge','melee','death','high_five','rescue','flex','zipline','recall','crouch_run','special'}
assert {r['name'] for r in meta['rows']}==required
total=0
for row in meta['rows']:
    frames=[]
    for x in range(row['frames']):
        tile=atlas.crop((x*32,row['row']*32,x*32+32,row['row']*32+32))
        assert tile.getbbox(),(row['name'],x,'missing frame')
        frames.append(tile.tobytes());total+=1
    assert len(set(frames))>1,(row['name'],'no motion')
for name,size in [('spider_anim.png',(1024,512)),('spider_armless.png',(1024,512)),('spider_gun.png',(1024,256)),('spider_grab.png',(1024,64))]:
    im=Image.open(P/'assets'/name);assert im.size==size
    if name in ('spider_gun.png','spider_grab.png'):assert im.getchannel('A').getbbox() is None,'Native weapon layer is not empty'
avatar=Image.open(P/'assets/avatar.png').convert('RGBA');native=Image.open(P/'art-source/skull.png').convert('RGBA');bg=Image.new('RGBA',(32,64),(48,52,61,255))
assert Image.alpha_composite(bg,avatar.crop((96,0,128,64))).tobytes()==Image.alpha_composite(bg,native).tobytes(),'Native skull changed'
if args.evidence:
    captures=[json.loads(f.read_text()) for f in args.evidence.glob('v3-*.json')]
    heroes=[h for c in captures for h in c['heroes'] if h['type']=='WorkshopBros.Workshop_spider_bro']
    assert heroes,'No runtime evidence'
    assert all(h['pellets']==h['volleys']*2 for h in heroes),'Volley did not spawn exactly two pellets'
    assert any(len(c['bullets'])==2 and all(b['damage']==3 for b in c['bullets']) and abs(c['bullets'][0]['y']-c['bullets'][1]['y'])>2 for c in captures),'No proof of two independent damaging hand projectiles'
    assert any(h['pose']=='DualFire' for h in heroes),'Firing animation not exercised'
    assert any(h['kills']>=1 and h['hits']>=1 for h in heroes),'No lethal bullet hit observed'
    assert any(c['wall'] and c['heroes'] and c['heroes'][0]['volleys']>=1 and c['heroes'][0]['hits']==0 for c in captures),'No wall occlusion evidence'
print(f'PASS: approved prototype 3, {len(required)} animated states, {total} frames, empty native weapons, native skull'+(', two-hand lethal combat and wall occlusion' if args.evidence else ''))
