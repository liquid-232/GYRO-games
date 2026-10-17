using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
namespace GYRO.F22 {
public static class PackageBuilder {
 const string Root="Assets/GYRO_F22";
 static readonly Dictionary<string,Material> Materials=new Dictionary<string,Material>();
 [MenuItem("GYRO/F22/Rebuild URP materials and prefabs")]
 public static void Build() {
  Materials.Clear();
  var dimensionsReport=new StringBuilder("variant,width_m,height_m,length_m,forward_x,forward_y,forward_z,renderers\n");
  AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
  foreach(var folder in new[]{"Materials","Prefabs","Scenes","Settings"}) Directory.CreateDirectory(Root+"/"+folder);
  AssetDatabase.Refresh();
  var shader=Shader.Find("Universal Render Pipeline/Lit");
  if(shader==null) throw new InvalidOperationException("Install Universal RP before building the F22 URP assets.");
  foreach(var path in Directory.GetFiles(Root+"/Textures","*.png")) {
   var ti=(TextureImporter)AssetImporter.GetAtPath(path.Replace('\\','/'));
   ti.maxTextureSize=4096;ti.mipmapEnabled=true;ti.anisoLevel=8;
   ti.textureCompression=TextureImporterCompression.CompressedHQ;
   ti.sRGBTexture=path.Contains("BaseColor");
   if(path.Contains("Normal"))ti.textureType=TextureImporterType.NormalMap;
   if(path.Contains("MetallicSmoothness"))ti.alphaSource=TextureImporterAlphaSource.FromInput;
   ti.SaveAndReimport();
  }
  foreach(var file in Directory.GetFiles(Root+"/Models","*.fbx")) {
   string path=file.Replace('\\','/');var mi=(ModelImporter)AssetImporter.GetAtPath(path);
   mi.globalScale=1;mi.useFileScale=true;mi.importAnimation=false;mi.importCameras=false;mi.importLights=false;
   mi.importNormals=ModelImporterNormals.Import;mi.importTangents=ModelImporterTangents.CalculateMikk;
   mi.meshCompression=ModelImporterMeshCompression.Off;mi.isReadable=false;mi.addCollider=false;
   mi.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;mi.SaveAndReimport();
   var model=AssetDatabase.LoadAssetAtPath<GameObject>(path);
   var root=new GameObject(Path.GetFileNameWithoutExtension(file));
   var instance=UnityEngine.Object.Instantiate(model,root.transform);instance.name="Airframe";
   // Use explicit model markers, avoiding assumptions about FBX axis conversion.
   var transforms=instance.GetComponentsInChildren<Transform>(true);
   var nose=transforms.First(t=>t.name=="Nose_Axis");var tail=transforms.First(t=>t.name=="Tail_Axis");
   instance.transform.rotation=Quaternion.FromToRotation((nose.position-tail.position).normalized,Vector3.forward)*instance.transform.rotation;
   foreach(var renderer in instance.GetComponentsInChildren<MeshRenderer>(true)) {
    renderer.sharedMaterials=renderer.sharedMaterials.Select(m=>GetMaterial(m==null?"Body_Paint":m.name.Replace(" (Instance)",""),shader)).ToArray();
    renderer.shadowCastingMode=ShadowCastingMode.On;renderer.receiveShadows=true;
   }
   var renderers=instance.GetComponentsInChildren<Renderer>();
   var bounds=renderers[0].bounds;foreach(var rr in renderers)bounds.Encapsulate(rr.bounds);
   var forward=(nose.position-tail.position).normalized;
   dimensionsReport.AppendLine(string.Join(",",new[]{root.name,bounds.size.x.ToString("F5",CultureInfo.InvariantCulture),bounds.size.y.ToString("F5",CultureInfo.InvariantCulture),bounds.size.z.ToString("F5",CultureInfo.InvariantCulture),forward.x.ToString("F5",CultureInfo.InvariantCulture),forward.y.ToString("F5",CultureInfo.InvariantCulture),forward.z.ToString("F5",CultureInfo.InvariantCulture),renderers.Length.ToString()}));
   // Origin is aircraft datum; the optional display scene grounds the wheels.
   PrefabUtility.SaveAsPrefabAsset(root,Root+"/Prefabs/"+root.name+".prefab");UnityEngine.Object.DestroyImmediate(root);
  }
  File.WriteAllText(Root+"/ImportDimensions.csv",dimensionsReport.ToString());
  BuildScene();AssetDatabase.SaveAssets();AssetDatabase.Refresh();
  AssetDatabase.ExportPackage(Root,"F22_URP_HighDetail.unitypackage",ExportPackageOptions.Recurse);
  Debug.Log("F22 ASSET BUILD COMPLETE: FBX, URP materials, prefabs, demonstration scene and unitypackage.");
 }
 static Material GetMaterial(string name,Shader shader) {
  if(Materials.TryGetValue(name,out var found))return found;
  string path=Root+"/Materials/"+name+".mat";
  var m=AssetDatabase.LoadAssetAtPath<Material>(path);
  if(m==null){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}else m.shader=shader;
  m.name=name;
  string atlas=name=="Body_Paint"||name=="Wing_Paint"?"Body":name=="Tail_Paint"?"Tail":null;
  var color=new Color(.24f,.27f,.29f,1);float metal=.24f,smooth=.45f;
  if(name=="Radome"){color=new Color(.55f,.57f,.57f);metal=.08f;smooth=.38f;}
  if(name=="RAM_Edge"){color=new Color(.62f,.64f,.65f);metal=.16f;}
  if(name=="Dark_Paint"||name=="Canopy_Frame"){color=new Color(.32f,.37f,.40f);metal=.3f;}
  if(name=="Intake_Interior"||name=="Cockpit"||name=="Seal"||name=="Tyre"){color=new Color(.10f,.13f,.15f);metal=0;smooth=.18f;}
  if(name=="Seat_Fabric"||name=="Harness"){color=new Color(.32f,.35f,.28f);metal=0;smooth=.12f;}
  if(name=="Gear_Chrome"){color=new Color(.7f,.72f,.74f);metal=.95f;smooth=.82f;}
  if(name=="Wheel_Alloy"){color=new Color(.65f,.67f,.66f);metal=.7f;smooth=.62f;}
  if(name=="Nozzle_Titanium"){color=new Color(.45f,.47f,.48f);metal=.88f;smooth=.66f;}
  if(name.Contains("Navigation")){color=name.StartsWith("Port")?Color.red:Color.green;metal=.1f;smooth=.7f;}
  if(name=="Display_Green"){color=new Color(.08f,.30f,.22f);metal=.1f;smooth=.75f;}
  m.SetColor("_BaseColor",atlas!=null?Color.white:color);m.SetFloat("_Metallic",metal);m.SetFloat("_Smoothness",smooth);m.SetFloat("_BumpScale",.65f);
  if(atlas!=null){
   m.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/"+atlas+"_BaseColor.png"));
   m.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/"+atlas+"_Normal.png"));m.EnableKeyword("_NORMALMAP");
   m.SetTexture("_MetallicGlossMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/"+atlas+"_MetallicSmoothness.png"));m.EnableKeyword("_METALLICSPECGLOSSMAP");m.SetFloat("_Smoothness",1);
  }
  if(name=="Canopy_Gold"){
   m.SetColor("_BaseColor",new Color(.72f,.49f,.18f,.36f));m.SetFloat("_Smoothness",.91f);m.SetFloat("_Metallic",.18f);
   m.SetFloat("_Surface",1);m.SetFloat("_Blend",0);m.SetFloat("_SrcBlend",(float)BlendMode.SrcAlpha);m.SetFloat("_DstBlend",(float)BlendMode.OneMinusSrcAlpha);m.SetFloat("_ZWrite",0);
   m.SetOverrideTag("RenderType","Transparent");m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");m.renderQueue=(int)RenderQueue.Transparent;
  }
  EditorUtility.SetDirty(m);Materials[name]=m;return m;
 }
 static void BuildScene(){
  var data=AssetDatabase.LoadAssetAtPath<UniversalRendererData>(Root+"/Settings/F22Renderer.asset");
  if(data==null){data=ScriptableObject.CreateInstance<UniversalRendererData>();AssetDatabase.CreateAsset(data,Root+"/Settings/F22Renderer.asset");}
  var pipe=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(Root+"/Settings/F22_URP.asset");
  if(pipe==null){pipe=UniversalRenderPipelineAsset.Create(data);AssetDatabase.CreateAsset(pipe,Root+"/Settings/F22_URP.asset");}
  // This tool does not replace the receiving project's Graphics or Quality settings.
  var s=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  var model=(GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/Prefabs/F22_GearDown_High.prefab"));var minY=model.GetComponentsInChildren<Renderer>().Min(r=>r.bounds.min.y);model.transform.position=Vector3.up*(-minY);
  var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);floor.name="Display floor - 1 Unity unit is 1 metre";floor.transform.localScale=Vector3.one*10;
  var sun=new GameObject("Sun").AddComponent<Light>();sun.type=LightType.Directional;sun.intensity=1.6f;sun.shadows=LightShadows.Soft;sun.transform.rotation=Quaternion.Euler(45,-35,0);
  RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.42f,.49f,.58f);RenderSettings.ambientEquatorColor=new Color(.29f,.32f,.35f);RenderSettings.ambientGroundColor=new Color(.12f,.13f,.14f);
  var cam=new GameObject("Main Camera").AddComponent<Camera>();cam.tag="MainCamera";cam.transform.position=new Vector3(18,12,25);cam.transform.LookAt(new Vector3(0,3,0));cam.nearClipPlane=.1f;cam.farClipPlane=300;cam.fieldOfView=42;
  EditorSceneManager.SaveScene(s,Root+"/Scenes/F22_Showcase.unity");
 }
}
}
