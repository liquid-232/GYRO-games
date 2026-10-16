using UnrealBuildTool;
using System.IO;
// 官方 DLSS 插件尚未接入；基础工程不依赖未安装的第三方模块。
public class SkystrikeNative : ModuleRules {
 public SkystrikeNative(ReadOnlyTargetRules Target) : base(Target) {
  PCHUsage=PCHUsageMode.UseExplicitOrSharedPCHs;
  PublicDependencyModuleNames.AddRange(new[]{"Core","CoreUObject","Engine","InputCore"});
  PrivateDependencyModuleNames.AddRange(new[]{"Projects","RHI"});
  PublicIncludePaths.Add(Path.GetFullPath(Path.Combine(ModuleDirectory,"../../..","core","include")));
 }
}
