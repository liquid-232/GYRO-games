"""Authored 4K PBR atlas for the F-22 exterior; no third-party image pixels."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
N=4096
BOUNDS=(-7.05,7.05,-10.65,8.65)
def generate(folder):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    color=Image.new('RGB',(N,N),(139,146,150));height=Image.new('L',(N,N),128)
    rough=Image.new('L',(N,N),148)
    c,h,r=ImageDraw.Draw(color),ImageDraw.Draw(height),ImageDraw.Draw(rough)
    def xy(p,under=False):
        x,z=p;x0,x1,z0,z1=BOUNDS
        return (32+(x-x0)/(x1-x0)*(N-64),N-(32+(z-z0)/(z1-z0)*(N//2-64)+(N//2 if under else 0)))
    def path(points,under=False):return [xy(p,under) for p in points]
    def line(points,under=False,width=2,shade=(108,116,122)):
        p=path(points,under);c.line(p,fill=shade,width=width,joint='curve');h.line(p,fill=96,width=width,joint='curve');r.line(p,fill=174,width=width,joint='curve')
    def panel(points,under=False):
        p=path(points,under);r.polygon(p,fill=155);line(points+[points[0]],under,2,(116,125,132))
    # Smooth grey camouflage islands with a short soft transition.
    mask=Image.new('L',(N,N));d=ImageDraw.Draw(mask)
    for s in [-1,1]:
        for points in [
            [(1.4,-2.4),(2.1,-1.9),(3.5,-.2),(5.85,1.8),(5.5,2.65),(4.8,2.8),(3.8,2.5),(3.05,2.8),(2.45,2.4),(1.8,.5)],
            [(.6,-1.2),(1.5,-.8),(1.65,1.4),(1.5,3.2),(1.65,5.9),(1.05,6.6),(.7,4.1),(.8,1.9)],
            [(2.1,4.9),(2.8,5.8),(3.9,6.9),(3.9,7.5),(3.1,7.9),(2.7,7.2),(2.2,6.3)]]:
            d.polygon(path([(s*x,z) for x,z in points]),fill=255)
    color.paste((108,120,130),mask=mask.filter(ImageFilter.GaussianBlur(5)))
    c=ImageDraw.Draw(color)
    for s in [-1,1]:
        m=lambda ps:[(s*x,z) for x,z in ps]
        for under in [False,True]:
            # Physical trailing control surface and narrow radar-absorbent edge coat.
            c.polygon(path(m([(2.15,-1.95),(6.78,2.18),(6.78,3.38),(6.61,3.43),(6.59,2.31),(2.15,-1.72)]),under),fill=(157,163,165))
            line(m([(2.15,-1.72),(6.59,2.31)]),under,2,(125,133,138))
            line(m([(2.4,4.17),(6.64,2.97)]),under,3)
            line(m([(4.48,3.51),(4.72,4.27)]),under)
            line(m([(2.15,5.12),(4.25,7.1)]),under)
            for z in [1.1,3.1,5.0]:
                line(m([(.7,z),(.85,z+.13),(1,z),(1.15,z+.13),(1.3,z),(1.45,z+.13),(1.6,z)]),under,2)
        for z in [-1.2,.5,2.5,4.0]:
            panel(m([(.84,z),(1.35,z),(1.5,z+.18),(1.5,z+.75),(1.34,z+.88),(.84,z+.88)]))
            for x in [.91,1.34]:
                for zz in [z+.13,z+.72]:
                    u,v=xy((s*x,zz));c.ellipse((u-1,v-1,u+1,v+1),fill=(110,118,122));h.ellipse((u-1,v-1,u+1,v+1),fill=106)
        panel(m([(1.17,-3.15),(1.48,-2.9),(1.48,-2.35),(1.15,-2.6)]))
        panel(m([(.12,-2.42),(.65,-2.42),(.78,-2.18),(1.05,-2.18),(1.12,1.65),(.91,1.94),(.72,1.94),(.56,2.17),(.12,2.17)]),True)
        panel(m([(1.43,-3.15),(1.72,-2.6),(1.9,.88),(1.63,1.42),(1.38,.88),(1.26,-2.52)]),True)
        panel(m([(.67,2.1),(1.55,2.1),(1.72,2.4),(1.72,3.3),(.67,3.3)]),True)
    panel([(-.34,-2.94),(.34,-2.94),(.46,-2.75),(.46,-2.0),(.24,-1.7),(-.24,-1.7),(-.46,-2.0),(-.46,-2.75)])
    panel([(-.22,-6.4),(.22,-6.4),(.32,-6.2),(.32,-4.8),(-.32,-4.8),(-.32,-6.2)],True)
    try:font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
    except OSError:font=ImageFont.load_default()
    for s in [-1,1]:
        for txt,x,z in [('NO STEP',s*4.0,3.4),('RESCUE',s*1.12,-3.9),('SERVICE',s*1.32,4.8)]:
            c.text(xy((x,z)),txt,font=font,fill=(91,101,109),anchor='mm')
    save_maps(folder,'Body',color,height,rough,.24)
    tail=Image.new('RGB',(2048,2048),(139,146,150));th=Image.new('L',tail.size,128);tr=Image.new('L',tail.size,148)
    d=ImageDraw.Draw(tail);hd=ImageDraw.Draw(th)
    # Two charts reserve enough gutter for mipmapping and readable outside text.
    for side in range(2):
        def tp(z,y):return (24+(z-2.65)/4.65*2000,2048-(24+(y-.27)/2.93*976+side*1024))
        p=[tp(z,y) for z,y in [(3.6,1.2),(4.08,2.5),(4.8,2.7),(5.5,1.9),(5.6,1.1),(4.7,.9)]]
        d.polygon(p,fill=(113,124,132))
        p=[tp(z,y) for z,y in [(5.05,2.88),(5.34,2.31),(5.86,1.4),(6.35,.56)]]
        d.line(p,fill=(101,112,120),width=3);hd.line(p,fill=98,width=3)
        for txt,z,y,size in [('FF',4.55,2.43,160),('AF 08',4.55,1.94,46),('022',4.55,1.57,94)]:
            try:f=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',size)
            except OSError:f=font
            stamp=Image.new('RGBA',(650,220));sd=ImageDraw.Draw(stamp);sd.text((325,110),txt,font=f,anchor='mm',fill=(74,87,96,255))
            if side==0:stamp=stamp.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            u,v=tp(z,y);tail.paste(stamp,(int(u-325),int(v-110)),stamp)
    save_maps(folder,'Tail',tail,th,tr,.24)

def save_maps(folder,name,color,height,rough,metal):
    n=color.width;rng=np.random.default_rng(22)
    rgb=np.asarray(color,dtype=np.float32).copy();noise=rng.normal(0,.55,(n,n)).astype(np.float32)
    rgb+=noise[:,:,None];color=Image.fromarray(np.uint8(np.clip(rgb,0,255)))
    h=np.asarray(height.filter(ImageFilter.GaussianBlur(.65)),dtype=np.float32)/255
    dy,dx=np.gradient(h);normal=np.dstack((-dx*1.6,dy*1.6,np.ones_like(h)))
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    norm=Image.fromarray(np.uint8(np.clip((normal*.5+.5)*255,0,255)))
    ms=np.zeros((n,n,4),dtype=np.uint8);ms[:,:,0]=int(metal*255);ms[:,:,3]=255-np.asarray(rough)
    color.save(folder/(name+'_BaseColor.png'));norm.save(folder/(name+'_Normal.png'));Image.fromarray(ms).save(folder/(name+'_MetallicSmoothness.png'))
    print('Textures:',name,n,flush=True)
