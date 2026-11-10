"""Local client for the game's WorkshopBridge; no mouse/keyboard automation."""
import argparse,json,time,uuid,os
from datetime import datetime,timedelta,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def request(op, timeout=30, **params):
    ipc=ROOT/'runtime/profile/ipc'
    if not (ipc/'requests').is_dir(): raise RuntimeError('Launch scripts/run_modded.sh first')
    ready=ipc/'ready.json'
    if not ready.exists(): raise RuntimeError('Game bridge is not ready; launch scripts/run_modded.sh')
    live=json.loads(ready.read_text())
    try: os.kill(live['pid'],0)
    except ProcessLookupError: raise RuntimeError('Modded Broforce is closed; launch scripts/run_modded.sh') from None
    ident=uuid.uuid4().hex
    payload=dict(id=ident,session=live['session'],expiresUtc=(datetime.now(timezone.utc)+timedelta(seconds=timeout)).isoformat(),op=op,**params)
    temp=ipc/'requests'/f'{ident}.tmp'
    temp.write_text(json.dumps(payload))
    temp.rename(temp.with_suffix('.json'))
    reply=ipc/'responses'/f'{ident}.json'
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if reply.exists():
            data=json.loads(reply.read_text())
            if not data['ok']: raise RuntimeError(data['error'])
            return data['result']
        time.sleep(.1)
    queued=temp.with_suffix('.json')
    queued.unlink(missing_ok=True)
    raise TimeoutError(f'No reply for {op}; pending request removed if still queued. Execution outcome may be unknown; inspect status before retrying a write.')

def wait_for(predicate,timeout=30):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        state=request('status')
        if predicate(state): return state
        time.sleep(.5)
    raise TimeoutError('Game did not reach the requested state')

def start_campaign(name):
    request('load_campaign',name=name)
    wait_for(lambda s:s['scene']=='newJoin')
    request('join')
    time.sleep(.3)
    request('start')
    return wait_for(lambda s:not s['editing'] and bool(s['map']) and bool(s['players']))

def main():
    ap=argparse.ArgumentParser()
    sub=ap.add_subparsers(dest='op',required=True)
    for op in ['status','play','hide-ui','quit','join','start']: sub.add_parser(op)
    drive=sub.add_parser('drive');drive.add_argument('--milliseconds',type=int,default=500)
    for flag in ['right','left','fire','jump']:drive.add_argument('--'+flag,action='store_true')
    for name in ['load-editor','load-campaign','start-campaign']:
        s=sub.add_parser(name);s.add_argument('name')
    s=sub.add_parser('native-roundtrip');s.add_argument('input');s.add_argument('output');s.add_argument('--name',default='The High Ground');s.add_argument('--author',default='Jai')
    args=vars(ap.parse_args());op=args.pop('op').replace('-','_')
    if 'input' in args:args['input']=str(Path(args['input']).resolve());args['output']=str(Path(args['output']).resolve())
    print(json.dumps(start_campaign(args['name']) if op=='start_campaign' else request(op,**args),indent=2))

if __name__=='__main__':main()
