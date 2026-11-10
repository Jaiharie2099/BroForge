"""Compose a clearly labeled MCP workflow replay from real web captures (Pillow)."""
from pathlib import Path
import json, math, textwrap
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'runtime/readme-demo';OUT=ROOT/'docs/media';OUT.mkdir(parents=True,exist_ok=True)
W,H=1280,820
BG='#0d151e';PANEL='#111d28';LINE='#334451';WHITE='#eef2ed';MUTED='#97adbe';ORANGE='#ffad6c';MINT='#a7edcf'
SANS=Path('/usr/share/fonts/truetype/noto');MONO=Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf')
def f(size,bold=False,mono=False):return ImageFont.truetype(str(MONO if mono else SANS/('NotoSans-Bold.ttf' if bold else 'NotoSans-Regular.ttf')),size)
fonts={s:f(s) for s in [12,13,14,15,16,17,18,20,22,24,30]}
base=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(base)
for y in range(H):
    k=y/H;d.line((0,y,W,y),fill=(int(13+7*k),int(21+3*k),int(30-1*k)))
for x in range(0,W,40):d.line((x,0,x,H),fill='#14212b')
for y in range(0,H,40):d.line((0,y,W,y),fill='#14212b')
shots=[Image.open(CACHE/(name+'.png')).convert('RGB').crop((260,220,1215,870)).resize((728,496),Image.Resampling.LANCZOS) for name in ['01-route','02-encounters','03-built']]
transcript=json.loads((CACHE/'transcript.json').read_text())
build=next(x['result'] for x in transcript['transcript'] if x['tool']=='build_project')
bfc=build['artifacts']['Furnace Escape.bfc'][:12];bfg=build['artifacts']['Furnace Escape.bfg'][:12]
def box(draw,rect,fill=PANEL,outline=LINE,r=12):draw.rounded_rectangle(rect,radius=r,fill=fill,outline=outline,width=1)
def line(draw,x,y,value,color=WHITE,size=16,mono=False,bold=False):draw.text((x,y),value,font=f(size,bold,mono),fill=color)
def ease(v):return (1-math.cos(max(0,min(1,v))*math.pi))/2

def render(t):
    image=base.copy();draw=ImageDraw.Draw(image)
    line(draw,32,22,'BRO',WHITE,30,bold=True);line(draw,100,22,'FORGE',ORANGE,30,bold=True)
    box(draw,(1000,29,1248,58),fill='#192e2c',outline='#385c50',r=6);draw.ellipse((1012,40,1018,46),fill=MINT);line(draw,1027,33,'REAL MCP CALLS / REPLAY',MINT,12,mono=True)
    titles=['Describe the mission.','Let your agent forge it.','Build real campaign files.','Inspect it in your browser.']
    stage=0 if t<3 else 1 if t<10 else 2 if t<14 else 3
    line(draw,32,77,titles[stage],WHITE,30,bold=True)
    line(draw,32,120,'One brief. Native Broforce files. A local preview you can inspect.',MUTED,15)
    # Agent pane. This is an authored replay of the captured tool transcript, not a client recording.
    box(draw,(32,158,450,698));draw.line((33,196,449,196),fill=LINE)
    draw.ellipse((48,172,57,181),fill=MINT);line(draw,68,167,'AGENT + broforce-workshop',MUTED,13,mono=True)
    box(draw,(48,214,434,313),fill='#1c2c37',outline='#3a505c',r=8)
    line(draw,62,226,'YOU',ORANGE,12,mono=True)
    prompt='Make a tiny Hell descent with one rescue and a dramatic exit.'
    n=min(len(prompt),int(t*34))
    for i,row in enumerate(textwrap.wrap(prompt[:n],37)):line(draw,62,249+i*23,row,WHITE,16)
    if t<3:
        line(draw,52,341,'> Understanding your brief',MINT,15,mono=True)
        line(draw,52,379,'A high ledge. A burning descent.',MUTED,15)
        line(draw,52,404,'One rescue. One clear exit.',MUTED,15)
    else:
        entries=[]
        if t>=3:entries += [('inspect_installation',MINT),('  Linux build verified',MUTED)]
        if t>=4:entries += [('create_project',MINT),('  furnace-escape / campaign',MUTED)]
        if t>=5:entries += [('write_project_file',ORANGE),('  design.json / route + terrain',MUTED)]
        if t>=7:entries += [('preview_project',MINT),('  local Web UI connected',MUTED)]
        if t>=8.5:entries += [('write_project_file',ORANGE),('  rescue + encounters + exit',MUTED)]
        if t>=10.5:entries += [('build_project',ORANGE)]
        if t>=12:entries += [('  native round trip passed',MINT),('  .bfc + .bfg ready',MINT)]
        visible=entries[-13:]
        for i,(value,color) in enumerate(visible):line(draw,52,335+i*25,('> ' if not value.startswith(' ') else '')+value,color,14,mono=True)
        if 10.5<=t<12:line(draw,72,335+len(visible)*25,'serializing'+'.'*(int(t*4)%4),MUTED,14,mono=True)
    line(draw,52,664,'SKILL -> TOOLS -> EDITABLE FILES',MUTED,12,mono=True)
    # Browser pane: unmodified captures, cropped for readability.
    box(draw,(478,158,1248,698));draw.line((479,196,1247,196),fill=LINE)
    for i,c in enumerate(['#f68e75','#dfbd76','#9bd7bd']):draw.ellipse((494+i*16,172,501+i*16,179),fill=c)
    line(draw,556,167,'127.0.0.1 / Furnace Escape',MUTED,13,mono=True)
    if t<5.7:
        line(draw,648,348,'YOUR LOCAL WORKSHOP',MUTED,13,mono=True)
        line(draw,645,387,'Waiting for your agent.',WHITE,22,bold=True)
        line(draw,673,426,'The preview starts via MCP.',MUTED,15)
        for i in range(3):draw.ellipse((838+i*17,475,845+i*17,482),fill=MINT if int(t*2)%3==i else '#34504f')
    else:
        shot=shots[0] if t<8.5 else shots[1] if t<12 else shots[2]
        if 8.5<=t<9.2:shot=Image.blend(shots[0],shots[1],ease((t-8.5)/.7))
        image.paste(shot,(499,199));draw=ImageDraw.Draw(image)
        # A clear label remains visible independent of the app's smaller legend.
        box(draw,(1051,212,1227,238),fill='#192a32',outline='#43616c',r=5);line(draw,1061,216,'SCHEMATIC PREVIEW',MINT,11,mono=True)
    # Progress and result strip.
    for i,label in enumerate(['01 DESCRIBE','02 GENERATE','03 BUILD','04 PREVIEW']):
        x=32+i*308;fill='#baf1d6' if i<=stage else '#435665'
        draw.rounded_rectangle((x,723,x+284,727),radius=2,fill=fill)
        line(draw,x,739,label,fill,13,mono=True)
    if t>=12:
        value=f'Furnace Escape.bfc  {bfc}   /   .bfg  {bfg}'
        line(draw,32,783,value,MINT,12,mono=True)
    else:line(draw,32,783,'Workflow replay / actual tool results and local browser captures',MUTED,12)
    line(draw,1021,783,'BUILT ON BRO MAKER',MUTED,11,mono=True)
    return image

# One global palette keeps typography stable across GIF frames.
seed=Image.new('RGB',(640,1230))
for i,t in enumerate([1,9,17]):seed.paste(render(t).resize((640,410)),(0,i*410))
palette=seed.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
cover=render(17)
cover.paste(base.crop((25,72,995,116)),(25,72))
line(ImageDraw.Draw(cover),32,77,'From brief to campaign.',WHITE,30,bold=True)
frames=[cover.quantize(palette=palette,dither=Image.Dither.NONE)]
for index in range(148):
    frame=render(index/8)
    frames.append(frame.quantize(palette=palette,dither=Image.Dither.NONE))
    if index in [16,72,128]:frame.save(CACHE/f'contact-{index}.png')
frames[0].save(OUT/'workflow.gif',save_all=True,append_images=frames[1:],duration=[1500]+[125]*148,loop=0,optimize=True,disposal=1)
cover.save(OUT/'workflow-poster.png',optimize=True)
# A review contact sheet makes all phases inspectable without an animated viewer.
contact=Image.new('RGB',(1280,820*3))
for i,t in enumerate([2,9,17]):contact.paste(render(t),(0,i*820))
contact.resize((960,1845)).save(CACHE/'contact-sheet.jpg',quality=90)
print(f'Wrote {OUT/"workflow.gif"} ({(OUT/"workflow.gif").stat().st_size:,} bytes), 20 s at 8 fps')
