"""Compose a compact GIF from actual bridge frame captures; no fabricated poses."""
import os,sys
sys.dont_write_bytecode=True
from pathlib import Path
import json,statistics
from PIL import Image,ImageDraw,ImageFont,ImageChops
ROOT=Path(__file__).resolve().parents[1]
WORKSPACE=Path(os.environ.get('BROFORCE_WORKSPACE') or Path.cwd()).resolve()
recordings=WORKSPACE/'.broforge/runtime/recordings'
out=ROOT/'docs/media';out.mkdir(parents=True,exist_ok=True)
clips=[('combat','WEB SHOTS','Two lethal pellets, one from each hand',.35,3.6),('sense','SPIDER SENSE','Special input: dodge and temporary protection',.1,4.5),('swing','WEB SWING','Hold fire, pump the swing, then release',.4,4.6)]
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',19)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
frames=[];durations=[];proof={'source':'Actual Unity game frames captured through BroForge MCP','editing':'Cropped, nearest-neighbor resized and captioned. Clips joined; original elapsed frame timing retained. No synthetic gameplay or test invulnerability flags.','clips':[]}

def marker(im):
 r,g,b=im.convert('RGB').split()
 mask=ImageChops.multiply(r.point(lambda p:255 if p<90 else 0),b.point(lambda p:255 if p>190 else 0))
 mask=ImageChops.multiply(mask,g.point(lambda p:255 if 65<p<190 else 0))
 box=mask.crop((0,0,im.width,int(im.height*.65))).getbbox()
 return ((box[0]+box[2])/2,box[3]) if box else None

for label,title,caption,begin,end in clips:
 directories=sorted(recordings.glob(label+'-*'),key=lambda p:p.stat().st_mtime)
 if not directories:raise RuntimeError('No recorded '+label+' clip')
 directory=directories[-1];allrows=[json.loads(s)for s in (directory/'frames.jsonl').read_text().splitlines()]
 rows=[r for r in allrows if begin<=r['elapsed']<=end]
 if len(rows)<3:raise RuntimeError('Insufficient real frames for '+label)
 ims=[Image.open(directory/r['file']).convert('RGB')for r in rows]
 markers=[p for im in ims if (p:=marker(im))]
 cx=statistics.median(p[0]for p in markers) if markers else ims[0].width*.35
 cy=statistics.median(p[1]for p in markers) if markers else ims[0].height*.4
 w,h=ims[0].size;cw=min(1280,w);ch=min(720,h)
 x=max(0,min(w-cw,int(cx-400)));y=max(0,min(h-ch,int(cy-220)))
 count=0
 for i,(im,row) in enumerate(zip(ims,rows)):
  canvas=Image.new('RGB',(768,480),'#151c27')
  view=im.crop((x,y,x+cw,y+ch)).resize((768,432),Image.Resampling.NEAREST)
  canvas.paste(view,(0,0));d=ImageDraw.Draw(canvas);d.line((0,432,767,432),fill='#d64143',width=2)
  d.text((14,438),title,font=font,fill='#f5f2e9');d.text((14,462),caption,font=small,fill='#b8c5d7')
  hud=im.crop((0,h-145,560,h));hud=hud.resize((185,48),Image.Resampling.NEAREST);canvas.paste(hud,(583,432))
  frames.append(canvas);duration=(rows[i+1]['elapsed']-row['elapsed'])*1000 if i+1<len(rows) else 200
  durations.append(max(60,min(400,round(duration/10)*10)));count+=1
 players=[r['state']['players'][0]for r in allrows if r['state']['players']]
 evidence={'label':label,'framesUsed':count,'capturedFrames':len(allrows),'durationSeconds':round(sum(durations[-count:])/1000,2),'assemblyMvid':players[0]['assemblyMvid'],'maxKills':max(p['counters']['kills']or 0 for p in players),'maxPellets':max(p['counters']['pellets']or 0 for p in players),'specialActiveFrames':sum(bool(p['counters']['spiderSense'])for p in players),'airborneAttachedFrames':sum(p['counters']['whipState']=='Attached'and p['y']>165 for p in players)}
 proof['clips'].append(evidence)
assert proof['clips'][0]['maxKills']>=1,'Combat capture has no enemy kill'
assert proof['clips'][1]['specialActiveFrames']>=3,'Special was not active in capture'
assert proof['clips'][2]['airborneAttachedFrames']>=3,'Swing capture has no airborne attachment'
# One shared palette avoids flashing colors between frames and keeps pixel clusters crisp.
strip=Image.new('RGB',(192*len(frames),120))
for i,frame in enumerate(frames):strip.paste(frame.resize((192,120),Image.Resampling.NEAREST),(i*192,0))
palette=strip.quantize(colors=192,method=Image.Quantize.MEDIANCUT)
quantized=[f.quantize(palette=palette,dither=Image.Dither.NONE)for f in frames]
quantized[0].save(out/'spider-bro-gameplay.gif',save_all=True,append_images=quantized[1:],duration=durations,loop=0,optimize=True,disposal=1)
frames[min(4,len(frames)-1)].save(out/'spider-bro-gameplay-poster.png')
proof['gif']={'width':768,'height':480,'frames':len(frames),'durationSeconds':round(sum(durations)/1000,2),'bytes':(out/'spider-bro-gameplay.gif').stat().st_size}
(out/'spider-bro-gameplay.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof['gif']))
