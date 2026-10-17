"""Build a meter-scale F-22 art asset with Blender 4.5 (bpy).
Run using the isolated bpy Python environment; exports are independent of the game.
"""
import sys,math,json,argparse
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from textures import generate,BOUNDS
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--out',default=str(ROOT/'exports'/'F22-Unity-URP'));parser.add_argument('--skip-render',action='store_true');args=parser.parse_args()
OUT=Path(args.out);ASSET=OUT/'Assets'/'GYRO_F22';MODEL=ASSET/'Models';TEX=ASSET/'Textures';PREVIEW=OUT/'Previews';SOURCE=OUT/'Source'
for p in [MODEL,TEX,PREVIEW,SOURCE]:p.mkdir(parents=True,exist_ok=True)
generate(TEX)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
collection=bpy.data.collections.new('F22_Airframe');scene.collection.children.link(collection)
gear=bpy.data.collections.new('LandingGear_Showcase');scene.collection.children.link(gear)
# Original design coordinates are Y-up / nose -Z. Blender is Z-up / nose +Y.
def C(p):x,y,z=p;return (x,-z-1,y)
def activate(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def move_collection(o,col):
    for old in list(o.users_collection):old.objects.unlink(o)
    col.objects.link(o)

def material(name,color,metal=.2,rough=.5,atlas=None):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if atlas:
        for suffix in ['BaseColor','Normal','MetallicSmoothness']:
            im=bpy.data.images.load(str(TEX/(atlas+'_'+suffix+'.png')),check_existing=True)
            t=n.new('ShaderNodeTexImage');t.image=im
            if suffix=='BaseColor':m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
            else:im.colorspace_settings.name='Non-Color'
            if suffix=='Normal':
                q=n.new('ShaderNodeNormalMap');q.inputs['Strength'].default_value=.65;m.node_tree.links.new(t.outputs['Color'],q.inputs['Color']);m.node_tree.links.new(q.outputs['Normal'],p.inputs['Normal'])
            if suffix=='MetallicSmoothness':
                sep=n.new('ShaderNodeSeparateColor');m.node_tree.links.new(t.outputs['Color'],sep.inputs['Color']);m.node_tree.links.new(sep.outputs['Red'],p.inputs['Metallic'])
                inv=n.new('ShaderNodeMath');inv.operation='SUBTRACT';inv.inputs[0].default_value=1;m.node_tree.links.new(t.outputs['Alpha'],inv.inputs[1]);m.node_tree.links.new(inv.outputs[0],p.inputs['Roughness'])
    return m
mats=[material('Body_Paint',(.24,.27,.29),atlas='Body'),material('Wing_Paint',(.27,.30,.31),atlas='Body'),material('Dark_Paint',(.15,.18,.21)),material('Canopy_Gold',(.42,.24,.06),.18,.12),material('Canopy_Frame',(.11,.14,.16),.35,.38),material('Nozzle_Titanium',(.18,.19,.20),.88,.34),material('Intake_Interior',(.013,.018,.023),.05,.88),material('Radome',(.28,.30,.30),.08,.62),material('RAM_Edge',(.34,.36,.37),.16,.55),material('Seal',(.038,.046,.05),.1,.72)]
tailmat=material('Tail_Paint',(.24,.27,.29),atlas='Tail');cockpitmat=material('Cockpit',(.025,.033,.04),.15,.72);seatmat=material('Seat_Fabric',(.08,.095,.065),0,.9);strapmat=material('Harness',(.19,.22,.18),.05,.8);chrome=material('Gear_Chrome',(.42,.45,.48),.95,.18);rubber=material('Tyre',(.018,.022,.024),0,.82);wheelmat=material('Wheel_Alloy',(.39,.41,.4),.7,.38)
glass=mats[3].node_tree.nodes.get('Principled BSDF');glass.inputs['Transmission Weight'].default_value=.64;glass.inputs['IOR'].default_value=1.46;glass.inputs['Coat Weight'].default_value=.65
# Load the shared, photo-referenced shape parameters without running its exporters.
text=(ROOT/'tools'/'build_airplane.py').read_text(encoding='utf-8-sig')
defs,calls=text.split('# Main planform is scaled',1);calls=('# Main planform is scaled'+calls).split('# Smooth lofts and crisp panels',1)[0]
defs=defs.replace('OUT.mkdir(parents=True, exist_ok=True)','').replace('0,2*math.pi,40','0,2*math.pi,160').replace('0,1,4,endpoint=False','0,1,20,endpoint=False').replace('for suffix,ts,material in cuts:\n','for suffix,ts,material in cuts:\n        ts=np.linspace(ts[0],ts[-1],49)\n')
ns={'__file__':str(ROOT/'tools'/'build_airplane.py')};exec(compile(defs,'base-definitions','exec'),ns)
def capture(name,verts,faces,mat,smooth=False):ns['PARTS'].append(dict(name=name,v=np.asarray(verts),f=faces,m=mat,smooth=smooth))
ns['part']=capture
base_densify=ns['densify'];ns['densify']=lambda sec,steps=4:base_densify(sec,steps*5)
# Cubic reconstruction of rounded chines: new surface samples, not flat triangle splits.
ring=ns['CHINE'];smoothring=[]
for i in range(len(ring)):
    a,b,c,d=[ring[j%len(ring)] for j in [i-1,i,i+1,i+2]]
    for t in np.linspace(0,1,6,endpoint=False):smoothring.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t**3))
ns['CHINE']=np.asarray(smoothring)
exec(compile(calls,'base-shape-parameters','exec'),ns)
objects=[]
def mesh(name,verts,faces,mat,smooth=False,col=collection):
    me=bpy.data.meshes.new(name);me.from_pydata([C(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);col.objects.link(o);me.materials.append(mat)
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
    for p in me.polygons:p.use_smooth=smooth
    objects.append(o);return o

def bevel(o,width=.006,segments=3):
    activate(o);mod=o.modifiers.new('Machined edge bevel','BEVEL');mod.width=width;mod.segments=segments;mod.limit_method='ANGLE'
    bpy.ops.object.modifier_apply(modifier=mod.name)

for part in ns['PARTS']:
    name=part['name'];mat=tailmat if 'vertical stabilizer' in name and 'tip cap' not in name else mats[part['m']]
    if 'Canopy gold' in name:mat=mats[3]
    o=mesh(name,part['v'],part['f'],mat,part['smooth'])
    if not part['smooth'] and 'seam' not in name and 'seal' not in name:bevel(o,.004 if 'petal' in name else .008,3)
print('Dense aerodynamic surfaces created',flush=True)
# Blend the body and two nacelle shoulders as one continuous high resolution skin.
bodyparts=[o for o in collection.objects if o.name in ['Airframe chined fuselage','Airframe dorsal spine','Left engine upper fairing','Right engine upper fairing']]
bpy.ops.object.select_all(action='DESELECT')
for o in bodyparts:o.select_set(True)
bpy.context.view_layer.objects.active=bodyparts[0];bpy.ops.object.join();body=bpy.context.object;body.name='Airframe_ContinuousSkin'
body.data.remesh_voxel_size=.036;activate(body);bpy.ops.object.voxel_remesh()
sm=body.modifiers.new('Shoulder blend','SMOOTH');sm.factor=.6;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
for p in body.data.polygons:p.use_smooth=True

def cube(name,center,size,mat,bevelsize=.02,col=collection):
    bpy.ops.mesh.primitive_cube_add(size=1,location=C(center));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);move_collection(o,col);o.data.materials.append(mat)
    if bevelsize:bevel(o,bevelsize,4)
    return o

def sphere(name,center,scale,mat,col=collection,segments=64,rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=C(center));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);move_collection(o,col);o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o

def cylinder(name,a,b,radius,mat,col=collection,vertices=48):
    a,b=Vector(C(a)),Vector(C(b));d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=d.length,location=(a+b)*.5);o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');move_collection(o,col);o.data.materials.append(mat);bevel(o,min(.006,radius*.15),3)
    for p in o.data.polygons:p.use_smooth=True
    return o

def tube(name,points,radius,mat,col=collection):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=12;curve.bevel_depth=radius;curve.bevel_resolution=3;s=curve.splines.new('POLY');s.points.add(len(points)-1)
    for v,p in zip(s.points,points):v.co=(*C(p),1)
    o=bpy.data.objects.new(name,curve);col.objects.link(o);o.data.materials.append(mat);activate(o);bpy.ops.object.convert(target='MESH');return o

def boolean_cut(target,cutter):
    activate(target);mod=target.modifiers.new('Functional recess','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
# A real recess under the clear canopy, with seat, console, coaming and harness.
cutter=sphere('Cockpit cutter',(0,.66,-5.55),(.58,.76,1.62),cockpitmat)
boolean_cut(body,cutter)
sphere('Cockpit dark tub',(0,.38,-5.55),(.545,.36,1.47),cockpitmat)
cube('Ejection seat cushion',(0,.48,-5.0),(.60,.17,.72),seatmat)
seat=cube('Ejection seat back',(0,.76,-4.6),(.62,.68,.20),seatmat);seat.rotation_euler.x=math.radians(-9)
cube('Ejection seat headrest',(0,.96,-4.52),(.42,.23,.20),cockpitmat)
for side in [-1,1]:
    cube('Side console '+str(side),(side*.43,.59,-5.45),(.19,.20,1.12),cockpitmat)
    tube('Seat shoulder belt '+str(side),[(side*.18,1.00,-4.68),(side*.14,.77,-4.77),(side*.2,.59,-5.15)],.025,strapmat)
    cylinder('Seat rail '+str(side),(side*.29,.30,-4.43),(side*.29,1.00,-4.43),.025,chrome)
    for i in range(9):sphere('Console switch',(side*.43,.702,-5.9+i*.11),(.018,.016,.018),wheelmat,segments=12,rings=8)
cube('Instrument panel',(0,.73,-6.19),(.81,.35,.10),cockpitmat)
screen=material('Display_Green',(.025,.15,.11),.1,.22)
for x in [-.25,0,.25]:cube('Multifunction display',(x,.76,-6.125),(.20,.17,.012),screen,.012)
cylinder('Control stick',(.28,.55,-5.45),(.28,.83,-5.43),.028,cockpitmat)
# Sensor windows, flush fasteners, intake recess details and articulated-looking petals.
for side,label in [(-1,'Port'),(1,'Starboard')]:
    for i in range(8):
        z=7.08+i*.106
        tube(label+' nozzle internal cooling rib '+str(i),[(side*1.02-.57,-.235,z),(side*1.02-.57,.16,z),(side*1.02+.57,.16,z),(side*1.02+.57,-.235,z)],.009,mats[5])
    for x in [side*1.02-.45,side*1.02,side*1.02+.45]:
        cylinder(label+' exhaust actuator',(x,.35,6.46),(x,.28,7.45),.027,chrome)
        cylinder(label+' exhaust actuator collar',(x,.35,6.46),(x,.32,6.9),.052,mats[5])
    for i in range(10):
        # Small louvre ribs remain behind the visible inlet lip.
        z=-3.55+i*.17
        tube(label+' inlet lining '+str(i),[(side*.99,-.60,z),(side*1.77,-.48,z),(side*1.9,.10,z)],.007,mats[2])
    wing_object=bpy.data.objects[('Left' if side<0 else 'Right')+' main wing fixed']
    wing_tree=BVHTree.FromObject(wing_object,bpy.context.evaluated_depsgraph_get())
    for i in range(14):
        x=side*(2.65+i*.245);z=-1.5+i*.219
        hit,_,_,_=wing_tree.ray_cast(Vector((x,-z-1,5)),Vector((0,0,-1)))
        if hit is not None:sphere(label+' wing edge fastener '+str(i),(x,hit.z+.0008,z),(.012,.0012,.012),mats[8],segments=16,rings=8)
    # Low profile position light housings stay within published span.
    light=material(label+'_Navigation',(.35,.012,.008) if side<0 else (.008,.24,.10),.1,.22)
    sphere(label+' position light',(side*6.73,-.046,2.82),(.025,.024,.105),light,segments=32,rings=16)
    cube(label+' shoulder sensor',(side*.94,.34,-3.15),(.14,.018,.21),mats[2],.015)
# Detailed optional landing gear. The public height includes deployed gear.
for side,label in [(-1,'Port'),(1,'Starboard')]:
    x=side*1.22
    cylinder(label+' main oleo',(side*.92,-.46,2.50),(x,-1.48,2.75),.075,wheelmat,gear)
    cylinder(label+' main piston',(x,-1.12,2.65),(x,-1.60,2.78),.045,chrome,gear)
    cylinder(label+' drag brace',(side*.80,-.46,1.75),(x,-1.4,2.74),.034,wheelmat,gear)
    cylinder(label+' torque link A',(x,-.91,2.6),(x+side*.16,-1.22,2.56),.027,wheelmat,gear)
    cylinder(label+' torque link B',(x+side*.16,-1.22,2.56),(x,-1.49,2.72),.027,wheelmat,gear)
    wheelcenter=(x+side*.13,-1.60,2.78)
    cylinder(label+' tyre',(wheelcenter[0]-.14,-1.60,2.78),(wheelcenter[0]+.14,-1.60,2.78),.43,rubber,gear,96)
    for end in [-1,1]:
        cx=wheelcenter[0]+end*.145
        cylinder(label+' wheel hub',(cx,-1.60,2.78),(cx+end*.018,-1.60,2.78),.24,wheelmat,gear,64)
        for i in range(10):
            a=i*math.tau/10;cylinder(label+' hub fastener',(cx+end*.02,-1.60+math.cos(a)*.17,2.78+math.sin(a)*.17),(cx+end*.03,-1.60+math.cos(a)*.17,2.78+math.sin(a)*.17),.014,chrome,gear,12)
    tube(label+' brake hydraulic line',[(side*.98,-.52,2.6),(x+.1,-1.0,2.65),(x+.1,-1.45,2.75)],.013,rubber,gear)
    door=cube(label+' open main gear door',(side*1.71,-.92,2.5),(.045,.82,1.18),mats[0],.018,gear);door.rotation_euler.y=side*.2
cylinder('Nose gear oleo',(0,-.40,-5.55),(0,-1.63,-5.42),.057,wheelmat,gear)
cylinder('Nose gear chrome',(0,-1.04,-5.49),(0,-1.61,-5.43),.033,chrome,gear)
cylinder('Nose gear drag brace',(0,-.47,-4.65),(0,-1.40,-5.43),.032,wheelmat,gear)
for s in [-1,1]:
    cylinder('Nose wheel fork',(s*.14,-1.39,-5.43),(s*.14,-1.73,-5.42),.037,wheelmat,gear)
    cube('Nose bay open door',(s*.26,-.91,-5.7),(.028,.56,1.15),mats[0],.012,gear)
cylinder('Nose tyre',(-.105,-1.73,-5.42),(.105,-1.73,-5.42),.30,rubber,gear,96)
for s in [-1,1]:cylinder('Nose wheel hub',(s*.11,-1.73,-5.42),(s*.128,-1.73,-5.42),.145,wheelmat,gear,64)
print('Cockpit, nozzle hardware and landing gear detailed',flush=True)
# Match the published overall deployed height, measuring the authored geometry.
all_meshes=[o for o in list(collection.objects)+list(gear.objects) if o.type=='MESH']
bpy.context.view_layer.update()
points=np.concatenate([np.array([tuple(o.matrix_world@v.co) for v in o.data.vertices]) for o in all_meshes])
height_factor=5.08/float(points[:,2].max()-points[:,2].min())
for o in all_meshes:
    inv=o.matrix_world.inverted()
    for v in o.data.vertices:
        world=o.matrix_world@v.co;world.z*=height_factor;v.co=inv@world
    o.data.update()
points=np.concatenate([np.array([tuple(o.matrix_world@v.co) for v in o.data.vertices]) for o in all_meshes])
dimensions=points.max(axis=0)-points.min(axis=0);ground_offset=-float(points[:,2].min())
# UVs use dedicated top / belly and outer fin charts. Sidewall gutters are neutral.
for o in list(collection.objects)+list(gear.objects):
    if o.type!='MESH':continue
    
    while len(o.data.uv_layers):o.data.uv_layers.remove(o.data.uv_layers[0])
    uv=o.data.uv_layers.new(name='UVMap');uv.active_render=True;is_tail=any(m==tailmat for m in o.data.materials)
    for poly in o.data.polygons:
        normal=o.matrix_world.to_3x3()@poly.normal
        for li in poly.loop_indices:
            v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;x,y,z=v.x,v.z,-v.y-1
            if is_tail and abs(normal.x)>.32 and x*normal.x>0:
                u=(24+(z-2.65)/4.65*2000)/2048;vv=(24+(y-.27)/2.93*976+(1024 if x<0 else 0))/2048
            elif not is_tail and abs(normal.z)>.32:
                u=(32+(x-BOUNDS[0])/(BOUNDS[1]-BOUNDS[0])*(4096-64))/4096
                vv=(32+(z-BOUNDS[2])/(BOUNDS[3]-BOUNDS[2])*(2048-64)+(2048 if normal.z<0 else 0))/4096
            else:u=vv=.0001
            uv.data[li].uv=(u,vv)
# Semantic forward markers allow Unity's importer to normalize the prefab axes.
for name,p in [('Nose_Axis',(0,0,-10.45)),('Tail_Axis',(0,0,8.45))]:
    o=bpy.data.objects.new(name,None);collection.objects.link(o);o.location=C(p);o.empty_display_size=.15
for o in list(collection.objects)+list(gear.objects):
    if o.type=='MESH':
        activate(o);tri=o.modifiers.new('Export triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
# Use named, independent meshes and baked geometry; no Blender-only shader dependency in Unity.
def export(name,include_gear):
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(collection.objects)+(list(gear.objects) if include_gear else []):o.select_set(True)
    bpy.ops.export_scene.fbx(filepath=str(MODEL/(name+'.fbx')),use_selection=True,object_types={'MESH','EMPTY'},use_mesh_modifiers=True,global_scale=1,apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',axis_forward='-Z',axis_up='Y',bake_space_transform=True,mesh_smooth_type='FACE',use_tspace=True,add_leaf_bones=False,bake_anim=False,path_mode='RELATIVE')
export('F22_Flight_High',False);export('F22_GearDown_High',True)
count=lambda col:sum(len(o.data.polygons) for o in col.objects if o.type=='MESH')
report={'length_m':round(float(dimensions[1]),5),'wingspan_m':round(float(dimensions[0]),5),'gear_down_height_m':round(float(dimensions[2]),5),'ground_offset_m':ground_offset,'flight_triangles':count(collection),'landing_gear_triangles':count(gear),'unit':'meter','render_pipeline':'URP','body_texture_resolution':4096,'tail_texture_resolution':2048,'reference_fidelity':'Published overall dimensions; photo-reconstructed exterior. Cockpit, ducts, gear and hardware are artistic approximations, not factory CAD.'}
(OUT/'model-info.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
# Save a fully editable source with the textures packed.
gear.hide_render=True;gear.hide_viewport=True
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'F22_HighDetail.blend'))
if not args.skip_render:
    scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.11,.15,.2,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
    def area(name,pos,power,size,color):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    area('Large softbox',(-8,8,14),2600,10,(.83,.91,1));area('Warm rim',(9,-6,11),3300,8,(1,.86,.69));area('Front fill',(0,14,6),1500,6,(.75,.87,1));area('Low bounce',(10,8,1),600,7,(.8,.86,1))
    floor=cube('Studio floor',(0,-ground_offset-.04,0),(200,.06,200),material('Studio floor',(.025,.033,.044),.05,.7),0,scene.collection)
    camdata=bpy.data.cameras.new('Preview camera');camera=bpy.data.objects.new('Preview camera',camdata);scene.collection.objects.link(camera);scene.camera=camera;camdata.type='ORTHO';camdata.ortho_scale=24
    for name,pos,target,ground in [('Front',(15,22,12),(0,0,.25),False),('Rear',(-14,-23,10),(0,-.5,.3),False),('Top',(0,0,30),(0,0,0),False),('GearDown',(15,21,7),(0,0,-.15),True)]:
        gear.hide_render=not ground;camdata.ortho_scale=30 if name=='Top' else 24;camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(PREVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
    print('Preview renders complete',flush=True)
print('BUILD COMPLETE',flush=True)

