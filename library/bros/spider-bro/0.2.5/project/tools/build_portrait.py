"""Selected C HUD face with a red/blue webbed suit and native skull frame."""
from pathlib import Path
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parents[1]
source=Image.open(P/'art-source/portrait-C.png').convert('RGBA')
face_mask=Image.new('L',source.size);m=ImageDraw.Draw(face_mask)
m.polygon([(9,29),(22,29),(26,31),(29,35),(29,48),(27,54),(22,59),(12,59),(7,55),(3,48),(3,37),(5,32)],fill=255)
base=Image.new('RGBA',source.size);d=ImageDraw.Draw(base)
d.polygon([(1,63),(5,60),(10,58),(13,57),(22,57),(27,60),(31,63)],fill='#17243e')
d.polygon([(3,63),(7,60),(11,59),(13,61),(13,63)],fill='#32569b')
d.polygon([(23,60),(26,61),(29,63),(23,63)],fill='#32569b')
# Red shoulder yoke and mask-to-chest panel, rather than a blue turtleneck.
d.polygon([(5,61),(10,58),(14,58),(13,60),(9,61),(7,62)],fill='#d64143')
d.polygon([(20,58),(24,59),(28,62),(25,62),(22,60)],fill='#9e2b3d')
d.polygon([(12,58),(22,58),(24,63),(12,63)],fill='#d64143')
d.line([(13,60),(22,60)],fill='#f77b61')
for line in [[(15,60),(15,63)],[(19,60),(20,63)],[(12,62),(22,62)],[(8,60),(10,62)],[(24,60),(25,62)]]:
 d.line(line,fill='#742b3b')
base.paste(source,(0,0),face_mask)
# Check selected face pixels are unchanged, including its expressive lenses.
for y in range(64):
 for x in range(32):
  if face_mask.getpixel((x,y)):assert base.getpixel((x,y))==source.getpixel((x,y))
frames=[base.copy(),base.copy(),base.copy()]
# Small lens changes supply firing and angry HUD expressions on the same face.
for frame,depth in [(frames[1],1),(frames[2],2)]:
 fd=ImageDraw.Draw(frame)
 for x in range(6,28):
  ys=[y for y in range(40,49) if frame.getpixel((x,y))[:3] in [(246,240,216),(183,208,211)]]
  for y in ys[:depth]:fd.point((x,y),fill='#17243e')
atlas=Image.new('RGBA',(128,64))
for i,frame in enumerate(frames):atlas.alpha_composite(frame,(i*32,0))
native=Image.open(P/'assets/avatar.png').convert('RGBA')
atlas.alpha_composite(native.crop((96,0,128,64)),(96,0))
atlas.save(P/'assets/avatar.png')

print('C face preserved; red/blue webbed suit, three alive states, native skull')
