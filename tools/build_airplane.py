"""Generate an F-22-inspired visual game asset. Python + numpy + Pillow."""
from pathlib import Path
import json, struct, math
import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'models'
OUT.mkdir(parents=True, exist_ok=True)
MATS = [('Airframe', [.48,.53,.60], .92, .25), ('Wing panels',[.58,.63,.70],.95,.29),
        ('Dark panels',[.25,.30,.37],.85,.36), ('Canopy gold',[.68,.43,.12],.55,.12),
        ('Canopy frame',[.12,.15,.20],.9,.22), ('Exhaust metal',[.32,.29,.25],1.,.27),
        ('Intake darkness',[.025,.032,.04],0.,.95)]
PARTS=[]
def part(name, verts, faces, mat):
    PARTS.append(dict(name=name, v=np.array(verts,dtype=float), f=faces, m=mat))

def loft(name, sections, mat, sides=8, cap=True):
    # sections: longitudinal position, x center, vertical center, halfwidth, halfheight
    # Monotone cubic Hermite interpolation keeps radii positive without overshoot.
    src=np.asarray(sections,float);z=src[:,0];values=src[:,1:]
    delta=np.diff(values,axis=0)/np.diff(z)[:,None]
    slopes=np.zeros_like(values);slopes[0]=delta[0];slopes[-1]=delta[-1]
    for i in range(1,len(src)-1):
        for k in range(4):
            a,b=delta[i-1,k],delta[i,k]
            if a*b>0:
                h0,h1=z[i]-z[i-1],z[i+1]-z[i]
                slopes[i,k]=3*(h0+h1)/((2*h1+h0)/a+(h1+2*h0)/b)
    dense=[]
    for i in range(len(src)-1):
        h=z[i+1]-z[i]
        for t in np.linspace(0,1,9,endpoint=False):
            val=(2*t**3-3*t*t+1)*values[i]+(t**3-2*t*t+t)*h*slopes[i]+(-2*t**3+3*t*t)*values[i+1]+(t**3-t*t)*h*slopes[i+1]
            dense.append([z[i]+t*h,*val])
    dense.append(src[-1]);sections=dense;sides=64
    vs=[]
    for z,x,y,w,h in sections:
        for k in range(sides):
            a=2*math.pi*k/sides
            vs.append([x+w*math.cos(a), y+h*math.sin(a),z])
    fs=[]
    for j in range(len(sections)-1):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides;c=b+sides;d=a+sides
            fs.extend([(a,b,c),(a,c,d)])
    if cap:
        for end,reverse in [(0,True),(len(sections)-1,False)]:
            z,x,y,w,h=sections[end]; center=len(vs);vs.append([x,y,z])
            rim=len(vs);vs.extend([vs[end*sides+k].copy() for k in range(sides)])
            for k in range(sides):
                a=rim+k;b=rim+(k+1)%sides
                fs.append((center,b,a) if reverse else (center,a,b))
    part(name,vs,fs,mat)
    p=PARTS[-1]; normals=np.zeros_like(p['v'])
    for f in fs:
        a,b,c=p['v'][list(f)];n=np.cross(b-a,c-a)
        for index in f:normals[index]+=n
    normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
    p['normals']=normals

def panel(name, points, mat, thickness=.09):
    # Convex 3D polygon; closed plate, oriented outward from its volume center.
    p=np.array(points,float);n=len(p)
    verts=np.concatenate([p+[0,thickness/2,0],p-[0,thickness/2,0]])
    faces=[]
    for k in range(1,n-1):faces.extend([(0,k,k+1),(n,n+k+1,n+k)])
    for k in range(n):
        j=(k+1)%n;faces.extend([(k,j,j+n),(k,j+n,k+n)])
    center=verts.mean(axis=0)
    for i,f in enumerate(faces):
        a,b,c=verts[list(f)]
        if np.dot(np.cross(b-a,c-a),(a+b+c)/3-center)<0:faces[i]=(f[0],f[2],f[1])
    part(name,verts,faces,mat)

loft('Blended fuselage', [(-9.2,0,0,.035,.035),(-7.4,0,.06,.46,.28),
    (-5.3,0,.12,.85,.49),(-3.0,0,.02,1.42,.58),(-.5,0,-.02,1.98,.62),
    (2.2,0,-.03,2.05,.61),(4.8,0,-.07,1.72,.5),(6.65,0,-.11,1.2,.28)],0,12)
for s,label in [(-1,'Left'),(1,'Right')]:
    def pts(seq):return [(s*x,y,z) for x,y,z in seq]
    panel(label+' main wing',pts([(1.12,.07,-3.35),(6.75,-.02,1.72),(6.4,-.06,2.8),(2.02,.04,3.47),(1.25,.1,.45)]),1,.16)
    panel(label+' wing inset',pts([(2.0,.17,-1.78),(5.91,.075,1.82),(3.17,.14,2.49),(2.11,.17,1.0)]),0,.012)
    panel(label+' trailing control surface',pts([(3.3,.09,2.64),(6.2,.02,2.18),(6.14,.01,2.66),(2.39,.13,3.24)]),2,.025)
    panel(label+' horizontal stabilizer',pts([(1.3,.06,4.18),(3.3,.04,4.93),(4.26,.02,7.58),(2.2,.1,8.09),(1.24,.12,6.45)]),1,.13)
    panel(label+' tail inset',pts([(1.61,.2,5.01),(3.01,.16,5.35),(3.65,.12,7.22),(2.26,.19,7.55)]),0,.012)
    panel(label+' canted vertical stabilizer',pts([(1.40,.38,3.12),(2.44,2.75,3.83),(2.54,2.90,5.08),(1.53,.45,7.20)]),0,.095)
    loft(label+' engine nacelle',[(.1,s*.91,-.05,.65,.47),(2.5,s*.91,.04,.72,.60),(5.9,s*.91,-.01,.66,.49),(7.28,s*.91,-.05,.57,.33)],0,8)
    # Flat rectangular nozzle, open at the rear with a recessed dark throat.
    x=s*.91
    ring=[(x-.56,-.32,7.2),(x+.56,-.32,7.2),(x+.56,.24,7.2),(x-.56,.24,7.2)]
    back=[(x-.53,-.28,7.92),(x+.53,-.28,7.92),(x+.53,.2,7.92),(x-.53,.2,7.92)]
    for k in range(4):panel(label+' exhaust wall '+str(k),[ring[k],ring[(k+1)%4],back[(k+1)%4],back[k]],5,.04)
    panel(label+' exhaust throat',[(x-.49,-.255,7.54),(x+.49,-.255,7.54),(x+.49,.175,7.54),(x-.49,.175,7.54)],6,.01)
    panel(label+' intake housing',pts([(1.01,.2,-4.1),(1.72,.13,-3.63),(2.01,-.36,-2.54),(1.00,-.49,-2.78)]),2,.07)
    panel(label+' intake mouth',pts([(1.1,.1,-4.04),(1.58,.07,-3.73),(1.69,-.25,-3.49),(1.08,-.30,-3.64)]),6,.015)

loft('Canopy frame',[(-6.57,0,.40,.025,.025),(-5.8,0,.56,.44,.24),(-4.62,0,.65,.61,.29),(-3.28,0,.59,.46,.24),(-2.77,0,.53,.035,.025)],4,12)
loft('Amber canopy',[(-6.42,0,.49,.02,.02),(-5.72,0,.72,.37,.39),(-4.65,0,.80,.52,.49),(-3.5,0,.74,.40,.33),(-2.98,0,.61,.03,.03)],3,16)
panel('Nose radar seam',[(-.51,.29,-7.12),(0,.43,-6.86),(.51,.29,-7.12),(0,.34,-7.2)],2,.013)

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
draw.text((38,32),'GYRO / F-22 INSPIRED',fill=(220,232,246),font_size=28)
draw.text((38,H-48),f'SMOOTH METAL AIRFRAME   |   {len(alltris):,} TRIANGLES   |   GLB + OBJ',fill=(137,158,180),font_size=18)
im.save(OUT/'airplane-f22-preview.png')

data=[]
for tri,n,m in alltris:
    for p,normal in zip(tri,n):data.extend([*p,*normal,*MATS[m][1],*MATS[m][2:]])
template='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>GYRO 飞机模型预览</title><style>body{margin:0;background:#141c28;color:#dce8f6;font:16px system-ui}canvas{width:100vw;height:100vh;display:block}aside{position:absolute;top:24px;left:28px;pointer-events:none}small{color:#91a6bf}a{color:#8ac7ff;pointer-events:auto}</style><canvas id="c"></canvas><aside><h2>GYRO · F-22 风格飞机</h2><small>拖动旋转 · 滚轮缩放 · 双击复位</small><p><a href="airplane-f22.glb" download>下载 GLB</a> · <a href="airplane-f22.obj" download>下载 OBJ</a></p></aside><script>
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
report={'triangles':len(alltris),'parts':len(PARTS),'glb_bytes':len(blob),'units':'meters (approximate artistic scale)','axes':'Y up, nose -Z'}
(OUT/'model-info.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(OUT/'README.md').write_text('''# F-22 风格飞机模型

根据 assets/airplane-f22.png 的造型制作的游戏美术模型。机身、发动机舱与座舱采用 64 段环向细分、单调三次曲线纵向插值和平滑顶点法线；金属材质高光沿曲面连续变化。

- airplane-f22.glb：带材质的通用 3D 模型，可直接导入 Blender / Godot / Unity 等软件。
- airplane-f22.obj + airplane-f22.mtl：备用格式，两个文件需要放在一起。
- airplane-f22-viewer.html：独立离线 WebGL 预览，拖动旋转、滚轮缩放、双击复位。
- airplane-f22-preview.png：从实际模型几何体渲染的预览图。
- ../../tools/build_airplane.py：可编辑的参数化建模脚本，依赖 numpy 与 Pillow。

坐标 Y 向上、机头朝 -Z。尺寸为美术近似比例。机翼、机身、尾翼、座舱和喷口独立命名；使用 PBR 色材质，无外部纹理。
模型为静态外观资产，尚未制作动画骨骼、驾驶舱内部、起落架、LOD 或碰撞体；重叠部件未合并成适合 3D 打印的单一实体。
''',encoding='utf-8')
print(json.dumps(report))
