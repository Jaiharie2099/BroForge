"""Opt-in live smoke test: uses actual game methods and input, never editor clicks."""
import json,time,hashlib
from pathlib import Path
from workshop import start_campaign,request,wait_for
ROOT=Path(__file__).resolve().parents[1]

def main():
    start_campaign('The High Ground')
    start=wait_for(lambda s:s['players'] and s['players'][0]['y']<=570)
    assert start['players'][0]['character']=='BronobiMod.Bronobi',start
    cage=next(c for c in start['cages'] if c['x']==480)
    assert cage['colliders'][0]['bottom']==376.0,cage
    request('drive',right=True,fire=True,jump=True,milliseconds=2600)
    time.sleep(2.8)
    rescued=None
    for _ in range(12):
        request('drive',right=True,fire=True,milliseconds=400)
        time.sleep(.6)
        state=request('status')
        if state['players'] and state['players'][0]['character']!='BronobiMod.Bronobi':
            rescued=state
            break
    assert rescued is not None, ('Rescue did not complete',state)
    assert any(e['character']=='BronobiMod.Bronobi' for e in rescued['spawns'])
    assert rescued['players'][0]['character'] not in ('BronobiMod.Bronobi',None)
    # Native random selection can yield melee heroes and death/checkpoint respawns.
    # Keep navigating rather than assuming every hero clears the exit in five seconds.
    deadline=time.monotonic()+120
    ended=None
    while time.monotonic()<deadline:
        state=request('status')
        if state['scene']=='VictoryCustomCampaign':
            ended=state
            break
        if state.get('players'):
            request('drive',right=True,fire=True,jump=True,milliseconds=1800)
        time.sleep(2)
    assert ended is not None, ('Campaign did not reach victory',state)
    base=ROOT/'library/levels/high-ground'
    report={'artifact_sha256':hashlib.sha256((base/'The High Ground.bfg').read_bytes()).hexdigest(),
            'initial':start,'after_rescue':rescued,'end':ended,
            'checks':{'bronobi_first':True,'cage_flush':True,'vanilla_after_rescue':True,'normal_campaign_victory':True}}
    out=base/'verification/live-smoke-test.json'
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':True,'rescued_character':rescued['players'][0]['character'],'end_scene':ended['scene'],'report':str(out)},indent=2))

if __name__=='__main__':main()
