"""Review-only, independently drawn full-body sprite poses. No inherited pose masks.

Coordinates are actual 32x32 game pixels. This file does not modify the installed art.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
P=Path(__file__).resolve().parent
INK='#203c6e'; BLACK='#090d14'; RD='#9c2435'; R='#d63843'; RH='#fa6b57'
BD='#243b67'; B='#3255a0'; BH='#5c83c5'; W='#eaf1f1'
PAL={'.':(0,0,0,0),'d':RD,'r':R,'R':RH,'W':W,'K':BLACK}
MASK=['.rrrrd.','rRKrrKd','rKWKKWK','rKWWKWK','rrKKrKd','rRrrrrd','.rrrrd.']

def head(im,x,y):
    for yy,row in enumerate(MASK):
        for xx,c in enumerate(row):
            if c!='.':im.putpixel((x+xx,y+yy),Image.new('RGBA',(1,1),PAL[c]).getpixel((0,0)))

def limb(d,pts,kind):
    # Solid, connected 3px limbs with 1px shadow edges; no detached hands.
    d.line(pts,fill=INK,width=4)
    d.line(pts,fill=BD if kind=='blue' else RD,width=3)
    d.line([(x,y) for x,y in pts],fill=B if kind=='blue' else R,width=2)

def torso(d,dx=0,dy=0):
    d.polygon([(12+dx,18+dy),(15+dx,17+dy),(19+dx,17+dy),(21+dx,19+dy),(20+dx,24+dy),(18+dx,26+dy),(13+dx,25+dy)],fill=INK)
    d.polygon([(13+dx,19+dy),(15+dx,18+dy),(19+dx,18+dy),(20+dx,20+dy),(19+dx,24+dy),(14+dx,24+dy)],fill=B)
    d.polygon([(14+dx,18+dy),(19+dx,18+dy),(19+dx,20+dy),(18+dx,22+dy),(18+dx,24+dy),(15+dx,24+dy),(15+dx,21+dy),(14+dx,20+dy)],fill=R)
    d.line([(14+dx,18+dy),(18+dx,18+dy)],fill=RH)
    d.line([(14+dx,23+dy),(19+dx,23+dy)],fill=RD)
    d.point((13+dx,21+dy),fill=BH);d.point((19+dx,22+dy),fill=BD)
    # Approved six-by-five pixel spider emblem, copied from the user's pattern.
    pattern = ['.#..#.', '#.##.#', '.####.', '#.##.#', '.#..#.']
    for yy,row in enumerate(pattern):
        for xx,pixel in enumerate(row):
            if pixel == '#':d.point((14+xx+dx,19+yy+dy),fill=BLACK)

def standing(web=False):
    im=Image.new('RGBA',(32,32));d=ImageDraw.Draw(im)
    # Legs share hips with the torso. Red boots have dark soles, not black shoes.
    limb(d,[(14,24),(13,27),(13,29)],'blue')
    limb(d,[(18,24),(19,27),(19,29)],'blue')
    d.polygon([(12,27),(14,27),(14,29),(15,29),(15,30),(11,30),(11,29)],fill=RD)
    d.line([(12,28),(12,29),(14,29)],fill=R)
    d.polygon([(18,27),(20,27),(20,29),(22,29),(22,30),(18,30)],fill=RD)
    d.line([(19,28),(19,29),(21,29)],fill=R)
    # Rear arm curves down close to the ribs; it does not project horizontally.
    limb(d,[(12,19),(11,21),(12,23)],'blue')
    d.rectangle((11,22,12,24),fill=R);d.point((11,22),fill=RH)
    torso(d)
    d.rectangle((16,16,17,17),fill=RD)
    head(im,14,10)
    if web:
        limb(d,[(20,19),(23,20),(25,19)],'blue')
        d.line([(23,20),(25,19),(27,19)],fill=R,width=2)
        d.line([(26,18),(28,17)],fill=RH)
        d.point((28,20),fill=R)
        d.point((26,20),fill=RD)
        d.line([(29,18),(31,17)],fill=W)
    else:
        limb(d,[(20,19),(21,21),(20,23)],'blue')
        d.rectangle((20,22,21,24),fill=R);d.point((21,23),fill=RD)
    return im

def running():
    im=Image.new('RGBA',(32,32));d=ImageDraw.Draw(im)
    # A readable stride rather than a recolored standing frame.
    limb(d,[(16,24),(12,26),(10,28)],'blue')
    d.polygon([(9,27),(11,28),(10,29),(8,30),(6,30),(6,29)],fill=RD)
    d.line([(8,28),(9,29),(7,29)],fill=R)
    limb(d,[(19,24),(22,26),(22,28)],'blue')
    d.polygon([(21,27),(23,27),(23,29),(25,29),(25,30),(21,30)],fill=RD)
    d.line([(22,28),(22,29),(24,29)],fill=R)
    limb(d,[(14,18),(11,20),(13,23)],'blue')
    d.line([(12,22),(14,23)],fill=R,width=2)
    torso(d,1,-1)
    d.rectangle((17,15,18,16),fill=RD)
    head(im,15,9)
    limb(d,[(21,18),(24,19),(25,16)],'blue')
    d.rectangle((24,15,25,17),fill=R);d.point((25,15),fill=RH)
    return im
