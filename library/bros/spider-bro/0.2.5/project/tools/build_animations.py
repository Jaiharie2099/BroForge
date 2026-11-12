"""Complete native-pixel animation bank derived from the approved prototype 3.

The renderer selects these explicit rows, independent of Indiana's weapon atlas.
Run from any directory; no game extraction or model generation is needed.
"""
from pathlib import Path
import json, math
from PIL import Image, ImageDraw, ImageFont
import prototype3_art as art

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'

def shift(im,x=0,y=0):
    out=Image.new('RGBA',(32,32));out.alpha_composite(im,(x,y));return out

def limbs(d,legs,arms):
    for hip,knee,foot in legs:
        art.limb(d,[hip,knee,foot],'blue')
        x,y=foot
        d.rectangle((x-1,y-2,x+1,y),fill=art.RD)
        d.line([(x,y-1),(min(x+2,30),y-1)],fill=art.R,width=2)
    for shoulder,elbow,hand in arms:
        art.limb(d,[shoulder,elbow,hand],'blue')
        x,y=hand;d.rectangle((x-1,y-1,x,y+1),fill=art.R)
        d.point((x-1,y-1),fill=art.RH)

def figure(legs,arms,head=(14,10),torso=(0,0),rear=True):
    im=Image.new('RGBA',(32,32));d=ImageDraw.Draw(im)
    # Limbs before the chest keep shoulders connected and behind its silhouette.
    limbs(d,legs,arms)
    art.torso(d,*torso)
    hx,hy=head;d.rectangle((hx+2,hy+6,hx+3,hy+8),fill=art.RD)
    art.head(im,hx,hy)
    return im

def run(i):
    if i==0:return art.running()
    keys=[(12,26,9,29,21,26,23,29),(13,26,12,29,19,26,21,29),(15,26,16,29,17,27,16,30),(18,26,20,29,14,26,11,28),
          (20,26,23,29,12,26,9,29),(19,26,20,29,13,26,12,29),(17,27,16,30,15,26,16,29),(14,26,11,28,18,26,20,29)]
    a,b,c,e,f,g,h,j=keys[i]
    bob=-1 if i%4 in (0,1) else 0
    arms=[((13,18+bob),(11,20+bob),(12+(i%3),23+bob)),((21,18+bob),(24,19+bob),(24,16+(i%2)))]
    return figure([((15,24+bob),(a,b),(c,e)),((18,24+bob),(f,g),(h,j))],arms,(15,10+bob),(1,bob))

def crouch(i):
    legs=[((15,26),(12,28),(11,30)),((18,26),(21,28),(23,30))]
    arms=[((12,22),(10,24),(12,26)),((21,22),(23,24),(22,26))]
    return figure(legs,arms,(14,14+i%2),(0,4))

def airborne(i,fall=False):
    legs=[((15,24),(12+i%2,26),(11,28)),((18,24),(21,25),(22,27))]
    arms=[((12,18),(10,19+i%2),(10,22+i%2)),((21,18),(23,17+i%2),(23,15+i%2))]
    im=figure(legs,arms,(14,10),(0,0))
    return shift(im,0,1 if fall else -1)

def swing(i):
    # Both hands grip the same white web above the head, alternating tucked legs.
    legs=[((15,24),(12,26),(11,28+i%2)),((18,24),(21,25),(23,27))]
    arms=[((12,18),(12,12),(16,7)),((21,18),(21,12),(18,7))]
    im=figure(legs,arms,(14,10));d=ImageDraw.Draw(im)
    d.rectangle((15,6,16,8),fill=art.R);d.rectangle((17,6,18,8),fill=art.R)
    return shift(im,(0,1,1,0,-1,-1)[i],0)

def dual(i):
    # Two distinct palms at y=19 and y=22, both aimed forwards. No gun layer.
    im=art.standing();d=ImageDraw.Draw(im)
    # Remove only the resting forearms, outside the approved torso.
    d.rectangle((9,20,12,25),fill=(0,0,0,0));d.rectangle((20,20,23,25),fill=(0,0,0,0))
    reach=(-1,0,-1,-2)[i]
    art.limb(d,[(12,19),(16,22),(24+reach,22)],'blue')
    art.limb(d,[(20,19),(24,19),(27+reach,19)],'blue')
    for x,y in [(24+reach,22),(27+reach,19)]:
        d.line([(x-2,y),(x,y)],fill=art.R,width=2)
        d.point((x+1,y-1),fill=art.RH);d.point((x+1,y+1),fill=art.R)
    return im

def climb(i):
    # Stock bros remain compact on ladders: hands around shoulder height and
    # feet close together, rather than a stretched overhead swing silhouette.
    rung=i%2
    arms=[((12,18),(12,20),(13,17+rung)),((21,18),(21,20),(20,17-rung))]
    legs=[((15,24),(14,26),(14,29)),((18,24),(19,26),(19,29))]
    return figure(legs,arms,(14,10))

def melee(i):
    if i<2:return shift(art.standing(),-i,0)
    legs=[((15,24),(12,27),(11,30)),((18,24),(21,27),(23,30))]
    arms=[((12,18),(10,20),(12,22)),((21,18),(24,18),(min(30,26+i)-1,17+i%2))]
    return figure(legs,arms,(15,10),(1,0))

def celebrate(i,flex=False):
    arms=[((12,18),(9,15),(10,12)),((21,18),(24,15),(23,12+i%2 if flex else 7+i%2))]
    legs=[((15,24),(13,27),(12,30)),((18,24),(20,27),(21,30))]
    return figure(legs,arms,(14,10))

def roll(i):
    base=shift(crouch(0),0,-8)
    # Rotate the actual complete pose about the centre; constant cell/foot anchor.
    return shift(base.rotate(-i*45,resample=Image.Resampling.NEAREST,center=(16,16)),0,3)

def dodge(i):
    base=crouch(i)
    return base.rotate((12,20,28,-12,-20,-28)[i],resample=Image.Resampling.NEAREST,center=(16,27))

def die(i):
    if i<2:return shift(airborne(i,True),0,i)
    return shift(art.standing().rotate(90,resample=Image.Resampling.NEAREST,center=(16,20)),0,3)

ROWS=[('idle',4,5,lambda i:shift(art.standing(),0,-1 if i==2 else 0)),
      ('run',8,13,run),('crouch',4,7,crouch),('jump',4,9,lambda i:airborne(i)),
      ('fall',4,8,lambda i:airborne(i,True)),('swing',6,10,swing),
      ('dual_fire',4,16,dual),('wall_climb',6,4,climb),('ladder',6,3,climb),
      ('wall_slide',4,3,lambda i:climb(1+i%2)),('roll',8,14,roll),('dodge',6,14,dodge),
      ('melee',6,14,melee),('death',6,10,die),('high_five',6,9,celebrate),
      ('rescue',6,9,celebrate),('flex',6,8,lambda i:celebrate(i,True)),
      ('zipline',4,7,swing),('recall',6,9,lambda i:shift(celebrate(i),0,-i//2)),
      ('crouch_run',8,11,lambda i:shift(crouch(i),-1 if i%2 else 1,0)),
      ('special',6,12,lambda i:dodge(i))]

if __name__=='__main__':
    atlas=Image.new('RGBA',(256,32*len(ROWS)));manifest={'cell':[32,32],'columns':8,'rows':[]}
    previews=[]
    for row,(name,count,fps,draw) in enumerate(ROWS):
        frames=[]
        for col in range(count):
            im=draw(col);assert im.getbbox(),(name,col)
            atlas.alpha_composite(im,(col*32,row*32));frames.append(im)
        manifest['rows'].append({'name':name,'row':row,'frames':count,'fps':fps})
        # Preview GIF frames preserve native pixels with a solid charcoal backdrop.
        gif=[]
        for im in frames:
            bg=Image.new('RGBA',(32,32),(48,52,61,255));bg.alpha_composite(im)
            gif.append(bg.resize((256,256),Image.Resampling.NEAREST).convert('RGB'))
        dest=ROOT/'records/animation-preview';dest.mkdir(parents=True,exist_ok=True)
        gif[0].save(dest/(name+'.gif'),save_all=True,append_images=gif[1:],duration=round(1000/fps),loop=0)
        previews.append((name,frames))
    atlas.save(OUT/'spider_moves.png')
    (OUT/'spider_moves.json').write_text(json.dumps(manifest,indent=2)+'\n')
    metadata={'note':'Runtime rows in spider_moves.json; the same frames are shown in this browser preview.','animations':[]}
    for r in manifest['rows']:
        metadata['animations'].append({'name':r['name'],'file':'spider_moves.png','fps':r['fps'],'frames':[[c*32,r['row']*32,32,32] for c in range(r['frames'])]})
    (ROOT/'animations.json').write_text(json.dumps(metadata,indent=2)+'\n')
    board=Image.new('RGBA',(960,len(ROWS)*112),(48,52,61,255));d=ImageDraw.Draw(board)
    font=ImageFont.load_default()
    for row,(name,frames) in enumerate(previews):
        d.text((8,row*112+44),name,font=font,fill='white')
        for col,im in enumerate(frames):board.alpha_composite(im.resize((96,96),Image.Resampling.NEAREST),(150+col*100,row*112))
    board.save(ROOT/'records/animation-preview/contact-sheet.png')
    # Keep correctly coloured fallback atlases for native gibs/temporary engine poses.
    # Native gib prefabs crop arbitrary small rectangles from this legacy atlas.
    # Preserve their original alpha geometry rather than filling them with tiny
    # complete characters; the live body uses only spider_moves.png above.
    if (ROOT/'art-source/indiannabrones_anim.png').exists():
        source=Image.open(ROOT/'art-source/indiannabrones_anim.png').convert('RGBA')
        fallback=Image.new('RGBA',source.size)
        for y in range(source.height):
            for x in range(source.width):
                r,g,b,a=source.getpixel((x,y))
                if not a:continue
                skin=r>135 and r>g*1.15 and g>b*1.04
                color=art.R if skin else art.B if max(r,g,b)>65 else art.INK
                fallback.putpixel((x,y),Image.new('RGBA',(1,1),color).getpixel((0,0)))
        fallback.save(OUT/'spider_anim.png');fallback.save(OUT/'spider_armless.png')
    else:
        for name in ('spider_anim.png','spider_armless.png'):
            if not (OUT/name).is_file():raise FileNotFoundError('Keep the bundled fallback asset: '+name)
    Image.new('RGBA',(1024,256)).save(OUT/'spider_gun.png')
    Image.new('RGBA',(1024,64)).save(OUT/'spider_grab.png')
    # Compact, bullet-like web pellet (not the old large binding ring).
    pellet=Image.new('RGBA',(8,8));pd=ImageDraw.Draw(pellet)
    pd.line([(1,4),(6,3)],fill=art.W,width=2);pd.point((5,5),fill=art.BH)
    pellet.save(OUT/'web_shot.png')
    print(json.dumps({'states':len(ROWS),'frames':sum(r[1] for r in ROWS),'atlas':list(atlas.size)}))
