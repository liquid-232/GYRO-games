using UnrealBuildTool;
// Windows 原生游戏目标；与编辑器目标分开，供打包客户端使用。
public class SkystrikeNativeTarget : TargetRules {
 public SkystrikeNativeTarget(TargetInfo Target) : base(Target) {
  Type=TargetType.Game; DefaultBuildSettings=BuildSettingsVersion.V5;
  IncludeOrderVersion=EngineIncludeOrderVersion.Latest;
  ExtraModuleNames.Add("SkystrikeNative");
 }
}
