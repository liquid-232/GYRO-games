"""Build a photo-referenced F-22 exterior game asset (numpy + Pillow).

References: USAF F-22 fact sheet and official photographs; Lockheed Martin
F-22 product-card planform. Overall length/span follow published dimensions.
Surface curvature, ducts and closed bay details are visual approximations.
"""
from pathlib import Path
import json, struct, math, shutil
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
MATS = [('Airframe', [.24,.27,.29], .32, .53),
        ('Wing panels',[.27,.30,.31],.30,.54),
        ('Dark panels',[.18,.21,.23],.29,.58),
        ('Canopy gold',[.56,.34,.09],.32,.12),
        ('Canopy frame',[.22,.26,.27],.38,.40),
        ('Exhaust metal',[.29,.28,.26],.85,.40),
        ('Intake darkness',[.022,.028,.032],.12,.86),
        ('Radome coating',[.23,.25,.26],.16,.62),
        ('Edge trim',[.34,.36,.36],.24,.56),
        ('Bay seam',[.16,.19,.20],.28,.62)]
PARTS=[]


def part(name, verts, faces, mat, smooth=False):
    p=dict(name=name,v=np.asarray(verts,dtype=float),f=faces,m=mat)
    if smooth:
        normals=np.zeros_like(p['v'])
        for f in faces:
            a,b,c=p['v'][list(f)];n=np.cross(b-a,c-a)
            for index in f:normals[index]+=n
        normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
        p['normals']=normals
    PARTS.append(p)


def densify(sections, steps=4):
    # Shape-preserving cubic interpolation avoids ballooning the nose/radii.
    src=np.asarray(sections,float);z=src[:,0];v=src[:,1:]
    d=np.diff(v,axis=0)/np.diff(z)[:,None]
    slopes=np.zeros_like(v);slopes[0]=d[0];slopes[-1]=d[-1]
    for i in range(1,len(src)-1):
        for k in range(v.shape[1]):
            a,b=d[i-1,k],d[i,k]
            if a*b>0:
                h0,h1=z[i]-z[i-1],z[i+1]-z[i]
                slopes[i,k]=3*(h0+h1)/((2*h1+h0)/a+(h1+2*h0)/b)
    rows=[]
    for i in range(len(src)-1):
        h=z[i+1]-z[i]
        for t in np.linspace(0,1,steps,endpoint=False):
            val=(2*t**3-3*t*t+1)*v[i]+(t**3-2*t*t+t)*h*slopes[i]+(-2*t**3+3*t*t)*v[i+1]+(t**3-t*t)*h*slopes[i+1]
            rows.append([z[i]+t*h,*val])
    return np.asarray(rows+[src[-1].tolist()])


# Rounded chines retain the real flattened diamond section, not a round tube.
CHINE=np.array([(1,0),(.985,.10),(.92,.35),(.77,.62),(.55,.84),(.28,.98),(0,1.03),
                (-.28,.98),(-.55,.84),(-.77,.62),(-.92,.35),(-.985,.10),(-1,0),
                (-.97,-.16),(-.84,-.47),(-.60,-.70),(-.3,-.80),(0,-.83),
                (.3,-.80),(.60,-.70),(.84,-.47),(.97,-.16)])


def loft(name, sections, mat, profile='chine', steps=4, ridge=0):
    rows=densify(sections,steps)
    ring=CHINE if profile=='chine' else np.array([(math.cos(a),math.sin(a)) for a in np.linspace(0,2*math.pi,40,endpoint=False)])
    n=len(ring);vs=[];fs=[]
    for z,x,y,w,h in rows:
        for rx,ry in ring:
            extra=0
            if ridge and ry>0:
                # Two engine shoulders separated by a subdued centerline valley.
                extra=ridge*math.exp(-((z-3.2)/3.6)**4)*math.exp(-((abs(rx*w)-1.04)/.54)**2)*ry
            vs.append([x+rx*w,y+ry*h+extra,z])
    for j in range(len(rows)-1):
        for k in range(n):
            a=j*n+k;b=j*n+(k+1)%n;c=b+n;d=a+n
            fs.extend([(a,b,c),(a,c,d)])
    for end,reverse in [(0,True),(len(rows)-1,False)]:
        z,x,y,w,h=rows[end];center=len(vs);vs.append([x,y,z]);rim=len(vs)
        vs.extend([vs[end*n+k].copy() for k in range(n)])
        for k in range(n):
            a=rim+k;b=rim+(k+1)%n
            fs.append((center,b,a) if reverse else (center,a,b))
    part(name,vs,fs,mat,True)


def panel(name, points, mat, thickness=.02):
    # Thickness follows the panel normal, including canted fins and duct walls.
    p=np.asarray(points,float);n=len(p)
    normal=np.cross(p[1]-p[0],p[2]-p[0]);normal/=max(np.linalg.norm(normal),1e-9)
    vs=np.concatenate([p+normal*thickness/2,p-normal*thickness/2])
    fs=[]
    for k in range(1,n-1):fs.extend([(0,k,k+1),(n,n+k+1,n+k)])
    for k in range(n):
        j=(k+1)%n;fs.extend([(k,j,j+n),(k,j+n,k+n)])
    center=vs.mean(axis=0)
    for i,f in enumerate(fs):
        a,b,c=vs[list(f)]
        if np.dot(np.cross(b-a,c-a),(a+b+c)/3-center)<0:fs[i]=(f[0],f[2],f[1])
    part(name,vs,fs,mat)


def ribbon(name, points, width=.014, mat=9):
    # Small physical seal/rebate strips: their placement follows the exterior.
    for i in range(len(points)-1):
        a,b=np.asarray(points[i]),np.asarray(points[i+1]);d=b-a
        across=np.cross(d,[0,1,0]);across/=max(np.linalg.norm(across),1e-9)
        panel(name+' '+str(i),[a+across*width/2,b+across*width/2,b-across*width/2,a-across*width/2],mat,.004)


def wing(name, side, rows, mat, control=False):
    # True airfoil volume with a tapered root and thin leading/trailing edges.
    # Each row is x, leading-z, trailing-z, center-y, full-thickness.
    source=np.asarray(rows,float);dense=[]
    for i in range(len(source)-1):
        for t in np.linspace(0,1,4,endpoint=False):dense.append(source[i]*(1-t)+source[i+1]*t)
    dense.append(source[-1]);dense=np.asarray(dense)
    cuts=[(' fixed',np.array([0,.018,.05,.10,.19,.33,.50,.66,.80,.818]),mat),
          (' trailing control surface',np.array([.824,.86,.92,.98,1.]),mat)] if control else [('',np.array([0,.018,.05,.10,.19,.33,.5,.66,.82,.94,1.]),mat)]
    for suffix,ts,material in cuts:
        vs=[];fs=[];nc=len(ts)
        for x,z0,z1,y,thick in dense:
            for sign in [1,-1]:
                for t in ts:
                    profile=max(.012,math.sin(math.pi*t)**.72)
                    camber=.018*math.sin(math.pi*t)*(1-(x/source[-1,0])**2)
                    vs.append([side*x,y+camber+sign*thick*.5*profile,z0+(z1-z0)*t])
        stride=2*nc
        for i in range(len(dense)-1):
            for face in [0,1]:
                base=i*stride+face*nc
                for j in range(nc-1):
                    a=base+j;b=a+1;c=b+stride;d=a+stride
                    fs.extend([(a,b,c),(a,c,d)] if (side>0)==(face==0) else [(a,c,b),(a,d,c)])
            for j in [0,nc-1]:
                a=i*stride+j;b=a+stride;c=b+nc;d=a+nc
                fs.extend([(a,b,c),(a,c,d)] if (side>0)==(j==0) else [(a,c,b),(a,d,c)])
        for i in [0,len(dense)-1]:
            for j in range(nc-1):
                a=i*stride+j;b=a+1;c=b+nc;d=a+nc
                fs.extend([(a,b,c),(a,c,d)] if (side>0)==(i==0) else [(a,c,b),(a,d,c)])
        part(name+suffix,vs,fs,material,True)


# Main planform is scaled to 18.90 m length and 13.56 m wingspan.
loft('Radome coating nose', [(-10.45,0,-.03,.008,.008),(-10.12,0,-.005,.19,.14),
    (-9.55,0,.025,.43,.26),(-8.6,0,.06,.65,.37),(-7.7,0,.075,.78,.43)],7,steps=6)
loft('Airframe chined fuselage', [(-7.7,0,.075,.78,.43),(-6.5,0,.10,.91,.49),
    (-4.9,0,.07,1.02,.53),(-3.75,0,.02,1.10,.54),(-2.7,0,-.04,1.52,.55),
    (-1.35,0,-.10,2.20,.55),(1.4,0,-.11,2.21,.52),(3.25,0,-.09,2.12,.47),
    (5.1,0,-.10,1.95,.39),(6.1,0,-.10,1.44,.28),(7.2,0,-.14,.36,.16),
    (7.75,0,-.14,.16,.10)],0,steps=5,ridge=.25)
# A real dome canopy (not a floating metallic oval) and a narrow structural rim.
loft('Canopy frame', [(-7.65,0,.44,.035,.025),(-7.0,0,.54,.43,.11),
    (-5.9,0,.60,.66,.13),(-4.65,0,.59,.64,.13),(-3.65,0,.52,.40,.08),
    (-3.35,0,.47,.03,.025)],4,profile='round',steps=5)
loft('Canopy gold bubble', [(-7.48,0,.48,.018,.018),(-6.92,0,.61,.37,.32),
    (-5.82,0,.66,.59,.59),(-4.77,0,.66,.57,.55),(-3.75,0,.56,.31,.26),
    (-3.51,0,.50,.02,.02)],3,profile='round',steps=6)
# Slim dorsal spine aft of the canopy, blending into the engine saddle.
loft('Airframe dorsal spine', [(-3.56,0,.46,.25,.11),(-2.4,0,.47,.43,.16),
    (-.5,0,.42,.46,.17),(1.5,0,.37,.37,.14),(3.4,0,.35,.23,.08)],0,steps=4)

for s,label in [(-1,'Left'),(1,'Right')]:
    def pts(seq):return [(s*x,y,z) for x,y,z in seq]
    wing(label+' main wing',s,[(1.45,-2.59,5.76,.02,.42),(2.15,-1.95,5.45,.01,.34),
         (3.75,-.522,4.735,-.025,.22),(5.3,.862,4.042,-.05,.12),
         (6.78,2.18,3.38,-.065,.045)],1,control=True)
    wing(label+' horizontal stabilizer',s,[(1.4,3.8,6.95,-.10,.20),
         (2.75,5.087,8.45,-.11,.14),(4.42,6.68,7.95,-.12,.055)],1)
    # Canted trapezoidal fins: leading edge swept, tip shortened, rudder separate.
    fin=pts([(1.58,.36,2.85),(2.65,2.95,3.82),(2.82,3.05,5.35),(1.68,.36,7.10)])
    panel(label+' canted vertical stabilizer',fin,0,.105)
    a,b,c,d=map(np.asarray,fin)
    # A subtle raised tip cap and rudder hinge trim, not deep ornamental grooves.
    panel(label+' vertical stabilizer tip cap',[b,c,c+(d-c)*.045,b+(a-b)*.045],8,.108)
    hinge1=b*.26+c*.74;hinge2=a*.18+d*.82
    across=np.array([s*.012,0,0])
    panel(label+' rudder hinge',[hinge1-across,hinge1+across,hinge2+across,hinge2-across],9,.114)
    # Smooth paired engine housings continue into the rectangular 2D nozzles.
    loft(label+' engine upper fairing',[(.6,s*1.02,.20,.45,.36),(2.7,s*1.02,.18,.74,.53),
         (4.9,s*1.02,.13,.76,.50),(6.5,s*1.02,.02,.70,.39),(7.25,s*1.02,-.03,.65,.29)],0,steps=5)
    # Actual hollow inlet, with a sloping lip and tapering inner walls.
    outer=np.asarray(pts([(1.02,.26,-4.64),(2.02,.23,-4.17),(1.78,-.59,-3.86),(.76,-.84,-4.29)]))
    mid=outer.mean(axis=0);inner=mid+(outer-mid)*np.array([.87,.83,1])
    back=np.asarray(pts([(1.14,.25,-1.7),(2.10,.20,-1.5),(1.86,-.52,-1.3),(.92,-.65,-1.55)]))
    innerback=back.mean(axis=0)+(back-back.mean(axis=0))*.80
    for k in range(4):
        j=(k+1)%4
        panel(label+' intake lip '+str(k),[outer[k],outer[j],inner[j],inner[k]],8,.024)
        panel(label+' intake outer housing '+str(k),[outer[k],back[k],back[j],outer[j]],0,.035)
        panel(label+' intake inner duct '+str(k),[inner[k],inner[j],innerback[j],innerback[k]],6,.025)
    panel(label+' intake deep throat',list(innerback),6,.01)
    # Angular splitter boundary, thin enough to read as a real junction.
    panel(label+' intake splitter',pts([(1.005,.28,-4.68),(1.09,.26,-3.25),
        (1.00,-.73,-3.0),(.745,-.85,-4.31)]),2,.025)
    # Closed side bay door: edge treatment follows the lower chine.
    sidebay=pts([(1.43,-.49,-3.15),(1.72,-.49,-2.60),(1.90,-.49,.88),
                 (1.63,-.49,1.42),(1.38,-.49,.88),(1.26,-.49,-2.52),(1.43,-.49,-3.15)])
    ribbon(label+' closed side bay seam',sidebay,.013)
    # Rectangular exhaust with depth, outer cheeks and individual feather petals.
    x=s*1.02
    front=np.array([(x-.65,-.33,7.1),(x+.65,-.33,7.1),(x+.65,.27,7.1),(x-.65,.27,7.1)])
    rear=np.array([(x-.60,-.29,8.07),(x+.60,-.29,8.07),(x+.60,.22,8.07),(x-.60,.22,8.07)])
    throat=front.copy();throat[:,2]=7.32;throat[:,:2]=throat[:,:2]*[1,.89]
    panel(label+' exhaust recessed throat',throat.tolist(),6,.015)
    for k in range(4):
        j=(k+1)%4
        panel(label+' exhaust interior '+str(k),[front[k],front[j],rear[j],rear[k]],6,.015)
    for k in [1,3]:
        j=(k+1)%4
        panel(label+' exhaust side cheek '+str(k),[front[k],front[j],rear[j],rear[k]],5,.045)
    for upper in [False,True]:
        y0=.30 if upper else -.36;y1=.24 if upper else -.31
        for i in range(8):
            xa=x-.65+i*1.3/8;xb=xa+1.3/8-.012
            z1=8.08 if i%2==0 else 8.04
            panel(label+(' exhaust upper petal ' if upper else ' exhaust lower petal ')+str(i),
                  [(xa,y0,6.98),(xb,y0,6.98),(x+(xb-x)*.93,y1,z1),(x+(xa-x)*.93,y1,z1)],5,.027)
    # Closed main bay outlines are shallow physical seals on the belly.
    bay=pts([(.09,-.574,-2.42),(.65,-.574,-2.42),(.78,-.574,-2.18),(1.05,-.574,-2.18),
        (1.12,-.574,1.65),(.91,-.574,1.94),(.72,-.574,1.94),(.56,-.574,2.17),
        (.09,-.574,2.17),(.09,-.574,-2.42)])
    panel(label+' closed weapon bay door',bay[:-1],0,.016)
    ribbon(label+' closed weapon bay seal',bay,.012)
    # Flush upper shoulder vents, modeled recessed under narrow cover strips.
    for i in range(5):
        z=-2.4+i*.11
        panel(label+' shoulder vent '+str(i),pts([(1.46,.44,z),(1.87,.36,z+.18),
             (1.87,.36,z+.22),(1.46,.44,z+.04)]),6,.006)
# Center tail sting lies between, and slightly behind, the paired exhausts.
loft('Airframe center tail sting',[(5.9,0,-.05,.22,.15),(7.35,0,-.06,.18,.12),
     (8.19,0,-.08,.12,.07),(8.30,0,-.08,.018,.018)],0,steps=3)

# Smooth lofts and crisp panels, with independently named parts.
binary=bytearray(); views=[]; access=[]; meshes=[]; nodes=[]; alltris=[]
def attr(arr,typ):
    arr=np.asarray(arr,dtype='<f4');offset=len(binary);binary.extend(arr.tobytes())
    views.append(dict(buffer=0,byteOffset=offset,byteLength=arr.nbytes,target=34962))
    a=dict(bufferView=len(views)-1,componentType=5126,count=len(arr),type=typ)
    if typ=='VEC3':a.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
    access.append(a);return len(access)-1
for p in PARTS:
    pos=[];norm=[]
    for f in p['f']:
        tri=p['v'][list(f)]; n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);length=np.linalg.norm(n)
        if length<1e-8:continue
        n/=length;ns=p['normals'][list(f)] if 'normals' in p else np.tile(n,(3,1))
        pos.extend(tri);norm.extend(ns);alltris.append((tri,ns,p['m']))
    pa=attr(pos,'VEC3');na=attr(norm,'VEC3')
    meshes.append(dict(name=p['name'],primitives=[dict(attributes=dict(POSITION=pa,NORMAL=na),material=p['m'])]))
    nodes.append(dict(name=p['name'],mesh=len(meshes)-1))
gltf=dict(asset=dict(version='2.0',generator='gyro procedural aircraft builder'),scene=0,
    scenes=[dict(nodes=list(range(len(nodes))))],nodes=nodes,meshes=meshes,
    materials=[dict(name=n,doubleSided=True,pbrMetallicRoughness=dict(baseColorFactor=c+[1],metallicFactor=m,roughnessFactor=r)) for n,c,m,r in MATS],
    accessors=access,bufferViews=views,buffers=[dict(byteLength=len(binary))])
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binary+=b'\0'*((-len(binary))%4)
blob=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
(OUT/'airplane-f22.glb').write_bytes(blob)
obj=['mtllib airplane-f22.mtl'];offset=1;normal_offset=1
for p in PARTS:
    obj.extend(['o '+p['name'].replace(' ','_'),'usemtl '+MATS[p['m']][0].replace(' ','_')])
    obj.extend('v '+' '.join(f'{q:.6f}' for q in v) for v in p['v'])
    if 'normals' in p:
        obj.extend('vn '+' '.join(f'{q:.6f}' for q in n) for n in p['normals'])
        obj.append('s 1')
        obj.extend('f '+' '.join(f'{i+offset}//{i+normal_offset}' for i in f) for f in p['f'])
        normal_offset+=len(p['normals'])
    else:
        obj.append('s off');obj.extend('f '+' '.join(str(i+offset) for i in f) for f in p['f'])
    offset+=len(p['v'])
(OUT/'airplane-f22.obj').write_text('\n'.join(obj),encoding='utf-8')
(OUT/'airplane-f22.mtl').write_text('\n'.join('newmtl '+n.replace(' ','_')+'\nKd '+' '.join(map(str,c))+'\nKs '+' '.join(str(.04*(1-m)+v*m) for v in c)+f'\nNs {min(1000,2/r**2-2):.2f}\nPm {m}\nPr {r}\nillum 2\n' for n,c,m,r in MATS),encoding='utf-8')

# Render the actual geometry with a software z-buffer, not an AI illustration.
W,H=1500,1080
camera=np.array([19.,15.,-23.]);forward=-camera/np.linalg.norm(camera)
right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
rgb=np.zeros((H,W,3),dtype=np.uint8);rgb[:]=[20,28,40];depth=np.full((H,W),np.inf)
light=np.array([-0.4,.85,-.4]);light/=np.linalg.norm(light)
for tri,n,m in alltris:
    rel=tri-camera;screen=np.column_stack([rel@right*58+W/2,-rel@up*58+H/2,rel@forward])
    a,b,c=screen
    xmin=max(0,int(np.floor(screen[:,0].min())));xmax=min(W-1,int(np.ceil(screen[:,0].max())))
    ymin=max(0,int(np.floor(screen[:,1].min())));ymax=min(H-1,int(np.ceil(screen[:,1].max())))
    if xmin>xmax or ymin>ymax:continue
    xx,yy=np.meshgrid(np.arange(xmin,xmax+1)+.5,np.arange(ymin,ymax+1)+.5)
    den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(den)<1e-8:continue
    u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
    v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w=1-u-v
    z=u*a[2]+v*b[2]+w*c[2];area=depth[ymin:ymax+1,xmin:xmax+1]
    mask=(u>=0)&(v>=0)&(w>=0)&(z<area)
    if not mask.any():continue
    points=u[...,None]*tri[0]+v[...,None]*tri[1]+w[...,None]*tri[2]
    view=camera-points;view/=np.maximum(np.linalg.norm(view,axis=-1,keepdims=True),1e-8)
    base=np.array(MATS[m][1]);metal,rough=MATS[m][2:]
    normal=u[...,None]*n[0]+v[...,None]*n[1]+w[...,None]*n[2]
    normal/=np.maximum(np.linalg.norm(normal,axis=-1,keepdims=True),1e-8)
    normal*=np.where(np.sum(view*normal,axis=-1,keepdims=True)>=0,1,-1)
    ndv=np.clip(np.sum(view*normal,axis=-1),0,1)
    fresnel=(.04*(1-metal)+base*metal)+(1-(.04*(1-metal)+base*metal))*(1-ndv[...,None])**5
    result=base*(.22+.18*np.maximum(normal[...,1:2],0))*(1-.45*metal)+fresnel*.18
    for source,tint,power in [([-8,14,-10],[.80,.90,1.],1.3),([10,10,3],[1.,.87,.70],1.),([-5,6,12],[.64,.78,1.],1.1)]:
        ld=np.array(source)-points;ld/=np.maximum(np.linalg.norm(ld,axis=-1,keepdims=True),1e-8)
        half=ld+view;half/=np.maximum(np.linalg.norm(half,axis=-1,keepdims=True),1e-8)
        ndl=np.maximum(np.sum(ld*normal,axis=-1),0);ndh=np.maximum(np.sum(half*normal,axis=-1),0)
        spec=ndh**(2/(rough*rough)-2)*((2/(rough*rough))/8)
        result+=(base*(1-metal)*ndl[...,None]*.5+fresnel*spec[...,None]*ndl[...,None])*np.array(tint)*power
    result=np.maximum(result,0);result=result/(1+result)
    col=np.clip(result**(1/2.2)*255,0,255).astype(np.uint8)
    area[mask]=z[mask];rgb[ymin:ymax+1,xmin:xmax+1][mask]=col[mask]
im=Image.fromarray(rgb);draw=ImageDraw.Draw(im)
draw.text((38,32),'GYRO / F-22 RAPTOR',fill=(220,232,246),font_size=28)
draw.text((38,H-48),f'PHOTO-REFERENCED AIRFRAME   |   {len(alltris):,} TRIANGLES   |   GLB + OBJ',fill=(137,158,180),font_size=18)
im.save(OUT/'airplane-f22-preview.png')

data=[]
for tri,n,m in alltris:
    for p,normal in zip(tri,n):data.extend([*p,*normal,*MATS[m][1],*MATS[m][2:]])
template='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>GYRO 飞机模型预览</title><style>body{margin:0;background:#141c28;color:#dce8f6;font:16px system-ui}canvas{width:100vw;height:100vh;display:block}aside{position:absolute;top:24px;left:28px;pointer-events:none}small{color:#91a6bf}a{color:#8ac7ff;pointer-events:auto}</style><canvas id="c"></canvas><aside><h2>GYRO · F-22 Raptor 外观模型</h2><small>拖动旋转 · 滚轮缩放 · 双击复位</small><p><a href="airplane-f22.glb" download>下载 GLB</a> · <a href="airplane-f22.obj" download>下载 OBJ</a></p></aside><script>
const canvas=document.getElementById('c'),gl=canvas.getContext('webgl');
if(!gl){document.body.innerHTML='浏览器未启用 WebGL，请在 Blender 中打开 GLB 模型。';throw Error('WebGL unavailable');}
const raw=__DATA__;
const vs=`attribute vec3 p,n,c;attribute vec2 mr;uniform vec3 eye;uniform float aspect,zoom;varying vec3 position,normal,color;varying vec2 material;void main(){vec3 f=normalize(-eye),r=normalize(cross(f,vec3(0.,1.,0.))),u=cross(r,f);vec3 q=p-eye;gl_Position=vec4(dot(q,r)/(zoom*aspect),dot(q,u)/zoom,(dot(q,f)-30.)/40.,1.);position=p;normal=n;color=c;material=mr;}`;
const fs=`precision highp float;uniform vec3 eye;varying vec3 position,normal,color;varying vec2 material;
vec3 illuminate(vec3 source,vec3 tint,float power,vec3 N,vec3 V,vec3 F){vec3 L=normalize(source-position),H=normalize(L+V);float nl=max(dot(N,L),0.),nh=max(dot(N,H),0.);float exponent=2./(material.y*material.y)-2.;float spec=pow(nh,exponent)*(exponent+2.)/8.;return (color*(1.-material.x)*nl*.5+F*spec*nl)*tint*power;}
void main(){vec3 N=normalize(normal),V=normalize(eye-position);if(dot(N,V)<0.)N=-N;float nv=max(dot(N,V),0.);vec3 f0=mix(vec3(.04),color,material.x),F=f0+(1.-f0)*pow(1.-nv,5.);vec3 lit=color*(.22+.18*max(N.y,0.))*(1.-.45*material.x)+F*.18;lit+=illuminate(vec3(-8.,14.,-10.),vec3(.8,.9,1.),1.3,N,V,F);lit+=illuminate(vec3(10.,10.,3.),vec3(1.,.87,.7),1.,N,V,F);lit+=illuminate(vec3(-5.,6.,12.),vec3(.64,.78,1.),1.1,N,V,F);lit=lit/(1.+lit);gl_FragColor=vec4(pow(lit,vec3(1./2.2)),1.);}`;
function shader(type,source){let s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
let prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(raw),gl.STATIC_DRAW);
['p','n','c','mr'].forEach((name,i)=>{let a=gl.getAttribLocation(prog,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,i===3?2:3,gl.FLOAT,false,44,i*12);});
gl.enable(gl.DEPTH_TEST);let yaw=.69,pitch=.49,zoom=10.5;
function draw(){let d=Math.min(devicePixelRatio,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.078,.11,.157,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform3f(gl.getUniformLocation(prog,'eye'),30*Math.sin(yaw)*Math.cos(pitch),30*Math.sin(pitch),-30*Math.cos(yaw)*Math.cos(pitch));gl.uniform1f(gl.getUniformLocation(prog,'aspect'),canvas.width/canvas.height);gl.uniform1f(gl.getUniformLocation(prog,'zoom'),zoom);gl.drawArrays(gl.TRIANGLES,0,raw.length/11);}
let drag=false,x=0,y=0;canvas.style.touchAction='none';canvas.onpointerdown=e=>{drag=true;x=e.clientX;y=e.clientY;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(drag){yaw-=(e.clientX-x)*.008;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-y)*.008));x=e.clientX;y=e.clientY;draw();}};canvas.onpointerup=canvas.onpointercancel=()=>drag=false;canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(4,Math.min(25,zoom*Math.exp(e.deltaY*.001)));draw();};canvas.ondblclick=()=>{yaw=.69;pitch=.49;zoom=10.5;draw();};window.onresize=draw;draw();</script></html>'''
(OUT/'airplane-f22-viewer.html').write_text(template.replace('__DATA__',json.dumps([round(float(v),5) for v in data],separators=(',',':'))),encoding='utf-8')
bounds=np.concatenate([p['v'] for p in PARTS]);size=bounds.max(axis=0)-bounds.min(axis=0)
report={'triangles':len(alltris),'parts':len(PARTS),'glb_bytes':len(blob),'dimensions_m':{'span':round(float(size[0]),3),'body_height':round(float(size[1]),3),'length':round(float(size[2]),3)},'units':'meters; length/span based on published dimensions, local surfaces artist reconstructed','axes':'Y up, nose -Z','sources':['https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/','https://www.lockheedmartin.com/content/dam/lockheed-martin/aero/documents/f22/FG19-Product%20Card%20F-22.pdf']}
(OUT/'model-info.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(OUT/'README.md').write_text("""# F-22 Raptor 外观模型

依据美国空军公开照片、F-22 资料页和 Lockheed Martin 产品卡的俯视轮廓重建。总长 18.90 米、翼展 13.56 米、平尾展 8.84 米；局部曲面、进气道与舱门细节依据照片作美术近似，非官方工程模型。

- airplane-f22.glb：带低光泽灰色涂层、金色座舱和金属喷口的通用 3D 模型。
- airplane-f22.obj + airplane-f22.mtl：备用格式，两个文件需放在一起。
- airplane-f22-viewer.html：独立离线 WebGL 预览，拖动旋转、滚轮缩放、双击复位。
- airplane-f22-preview.png：从本次实际几何体渲染的预览图。
- ../../tools/build_airplane.py：参数化建模脚本，依赖 numpy 与 Pillow。
- model-info.json：构建统计、尺寸及参考来源。

前机身使用带折线的圆润菱形横截面，翼身肩部与双发动机背脊具有体积；主翼和平尾采用翼根厚、翼尖薄的翼型，主翼后缘控制面有实际间隙。左右进气道有唇口、内壁和深处暗面，喷口有二维矩形开口与独立瓣片。机腹包括闭合武器舱边界。部件使用语义名称，便于游戏按材质合并渲染。

坐标 Y 向上、机头朝 -Z。GLB 使用 POSITION/NORMAL 非索引三角形，不依赖外部纹理；游戏另加程序涂装和局部自阴影。此为静态外观资产，未制作起落架、驾驶舱内部或工程结构，重叠部件不适合直接 3D 打印。

参考：
- https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/
- https://www.lockheedmartin.com/content/dam/lockheed-martin/aero/documents/f22/FG19-Product%20Card%20F-22.pdf
""",encoding='utf-8')
shutil.copy2(OUT/'airplane-f22.glb',ROOT/'game'/'dist'/'assets'/'airplane-f22.glb')
print(json.dumps(report))
