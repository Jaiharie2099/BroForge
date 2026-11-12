"""Approved classic-tingle HUD icon with mirrored eye patches."""
from pathlib import Path
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parents[1]
im=Image.new('RGBA',(16,16));d=ImageDraw.Draw(im)
INK='#19263e';RED='#df424a';DARK='#92303e';HI='#fa7a60';WHITE='#eef1e6';GOLD='#ffd366'
for pts in [[(2,2),(3,4)],[(7,0),(7,2)],[(12,2),(11,4)],[(0,6),(2,6)],[(13,6),(15,6)]]:d.line(pts,fill=GOLD)
d.polygon([(5,3),(10,3),(12,5),(12,10),(10,13),(7,15),(4,12),(3,9),(3,6)],fill=INK)
d.polygon([(5,4),(9,4),(11,6),(11,10),(8,13),(6,13),(4,10),(4,6)],fill=RED)
d.line([(5,5),(8,4)],fill=HI);d.line([(10,6),(10,11),(8,13)],fill=DARK)
left=[(4,7),(6,8),(6,10),(5,10),(4,8)]
d.polygon(left,fill=WHITE)
d.polygon([(15-x,y) for x,y in left],fill=WHITE)
white=Image.new('RGBA',(1,1),WHITE).getpixel((0,0))
for y in range(16):
 for x in range(16):assert (im.getpixel((x,y))==white)==(im.getpixel((15-x,y))==white)
im.save(P/'assets/special.png')

preview=Image.new('RGB',(360,370),'#242b35');pd=ImageDraw.Draw(preview)
zoom=im.resize((192,192),Image.Resampling.NEAREST);preview.paste(zoom,(84,20),zoom)
hud=Image.new('RGBA',(104,42),'#080b10');hd=ImageDraw.Draw(hud)
face=Image.open(P/'assets/avatar.png').crop((0,27,32,64));hud.alpha_composite(face,(0,5))
for x in (37,57,77):hud.alpha_composite(im,(x,4))
hd.text((37,25),'LIVES 1',fill=WHITE);hd.line([(0,0),(103,0),(103,41)],fill='#3da9e0')
hud=hud.resize((312,126),Image.Resampling.NEAREST);preview.paste(hud,(24,232),hud)

print('Mirrored eyes verified; 16x16 icon saved')
