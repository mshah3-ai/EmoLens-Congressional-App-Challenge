# Draws the EmoLens app icon, Android adaptive icon layers and splash image (same design as src/ui/LensMark.tsx).
# Run from the repo root: .venv/bin/python apps/mobile/scripts/make_icons.py
from PIL import Image, ImageDraw
OUT='apps/mobile/assets/images/'
A=(0x4A,0x5F,0xD6); B=(0x7A,0x6B,0xE0)
def gradient(n):
    g=Image.new('RGB',(n,n))
    px=g.load()
    for y in range(n):
        for x in range(n):
            t=(x+y)/(2*(n-1)); px[x,y]=tuple(int(A[i]+(B[i]-A[i])*t) for i in range(3))
    return g
def lens(d, n, cx, cy, s, color):
    # s = scale where 64 units = full design; mirrors src/ui/LensMark.tsx
    u=lambda v: v*s
    r=u(14); w=u(4.5)
    d.ellipse([cx+u(-4)-r, cy+u(-2)-r, cx+u(-4)+r, cy+u(-2)+r], outline=color, width=int(w))
    d.line([cx+u(6.5), cy+u(8.5), cx+u(15), cy+u(17)], fill=color, width=int(u(5)))
    for (x,y) in [(cx+u(6.5),cy+u(8.5)),(cx+u(15),cy+u(17))]:
        rr=u(2.5); d.ellipse([x-rr,y-rr,x+rr,y+rr], fill=color)
    pts=[(28,22.5),(29.8,27.9),(35.2,29.7),(29.8,31.5),(28,36.9),(26.2,31.5),(20.8,29.7),(26.2,27.9)]
    d.polygon([(cx+u(x-32), cy+u(y-32)) for x,y in pts], fill=color)
N=1024
# iOS / generic icon: full-bleed gradient (iOS rounds corners itself)
ic=gradient(N); d=ImageDraw.Draw(ic); lens(d,N,N/2,N/2,N/64*1.05,(255,255,255)); ic.save(OUT+'icon.png')
# Android adaptive: background gradient, foreground mark within the 66% safe zone
gradient(1024).save(OUT+'android-icon-background.png')
fg=Image.new('RGBA',(1024,1024),(0,0,0,0)); d=ImageDraw.Draw(fg); lens(d,1024,512,512,1024/64*0.62,(255,255,255,255)); fg.save(OUT+'android-icon-foreground.png')
mono=Image.new('RGBA',(1024,1024),(0,0,0,0)); d=ImageDraw.Draw(mono); lens(d,1024,512,512,1024/64*0.62,(0,0,0,255)); mono.save(OUT+'android-icon-monochrome.png')
# splash: the round mark on transparent
sp=Image.new('RGBA',(512,512),(0,0,0,0)); m=Image.new('L',(512,512),0); ImageDraw.Draw(m).ellipse([16,16,496,496],fill=255)
g=gradient(512).convert('RGBA'); sp.paste(g,(0,0),m); d=ImageDraw.Draw(sp); lens(d,512,256,256,512/64*0.95,(255,255,255,255)); sp.save(OUT+'splash-icon.png')
fav=ic.resize((48,48)); fav.save(OUT+'favicon.png')
print('ok')
