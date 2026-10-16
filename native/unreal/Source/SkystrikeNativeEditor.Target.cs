using UnrealBuildTool;
// 编辑器目标用于资源导入、地图保存和原生玩法调试。
public class SkystrikeNativeEditorTarget : TargetRules {
 public SkystrikeNativeEditorTarget(TargetInfo Target) : base(Target) {
  Type=TargetType.Editor; DefaultBuildSettings=BuildSettingsVersion.V5;
  IncludeOrderVersion=EngineIncludeOrderVersion.Latest;
  ExtraModuleNames.Add("SkystrikeNative");
 }
}
