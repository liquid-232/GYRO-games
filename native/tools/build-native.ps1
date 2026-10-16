[CmdletBinding()]
param(
 [ValidateSet('Check','Generate','Build','Prepare','Editor','Preview','Package')][string]$Action='Check',
 [string]$EngineRoot=$env:UE_ROOT,
 [ValidateSet('Development','Shipping')][string]$Configuration='Development'
)
$ErrorActionPreference='Stop'
# 所有产物限定在原生工程或 .runtime；不更改现有网页启动方式。
$nativeRoot=Split-Path -Parent $PSScriptRoot
$project=Join-Path $nativeRoot 'unreal\SkystrikeNative.uproject'
$runtime=Join-Path $nativeRoot '.runtime'
if (!$EngineRoot) {
 $record=Get-ItemProperty 'HKLM:\SOFTWARE\EpicGames\Unreal Engine\5.8' -ErrorAction SilentlyContinue
 if ($record) { $EngineRoot=$record.InstalledDirectory }
}
if (!$EngineRoot -and (Test-Path -LiteralPath 'C:\Program Files\Epic Games\UE_5.8')) {
 $EngineRoot='C:\Program Files\Epic Games\UE_5.8'
}
$engineFound=$false
if ($EngineRoot) {
 $EngineRoot=[IO.Path]::GetFullPath($EngineRoot)
 $engineFound=Test-Path -LiteralPath (Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat')
}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$compilerRoot=$null
if (Test-Path -LiteralPath $vswhere) {
 $compilerRoot=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
$sdkRoot=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Include'
$sdk=Get-ChildItem -LiteralPath $sdkRoot -Directory -ErrorAction SilentlyContinue |
 Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'um\Windows.h') } |
 Sort-Object Name -Descending | Select-Object -First 1
$gpu=@()
try { $gpu=@(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) } catch { $gpu=@('无法读取显卡信息') }
$pluginRoot=Join-Path $nativeRoot 'unreal\Plugins'
$plugins=@(Get-ChildItem -LiteralPath $pluginRoot -Filter '*.uplugin' -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.BaseName })
$engineVersion=$null
if($engineFound){
 $versionFile=Join-Path $EngineRoot 'Engine\Build\Build.version'
 if(Test-Path -LiteralPath $versionFile){$v=Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json;$engineVersion="$($v.MajorVersion).$($v.MinorVersion).$($v.PatchVersion)"}
}
$engineCompatible=$engineFound -and $engineVersion -and $engineVersion.StartsWith('5.8.')
$report=[ordered]@{
 Project=$project; EngineFound=$engineFound; EngineRoot=$EngineRoot; EngineVersion=$engineVersion
 CppToolchain=$compilerRoot; WindowsSDK=if($sdk){$sdk.Name}else{$null}; GPU=$gpu
 LocalPlugins=$plugins; DLSSSuperResolution='未接入；需官方匹配版本插件和运行验证'
 DLSS5NeuralRendering='未接入；SDK获取与设备支持需确认'
 CanAttemptBuild=($engineCompatible -and !!$compilerRoot -and !!$sdk)
}
if($Action -eq 'Check') { $report | ConvertTo-Json -Depth 4; exit 0 }
if(!$engineFound){ throw '未找到 Unreal Engine。先通过 Epic 安装 UE 5.8，再传入 -EngineRoot 或设置 UE_ROOT。' }
if(!$engineCompatible){throw "当前工程目标为 UE 5.8，检测到 $engineVersion；请先确认对应插件和引擎版本。"}
if(!$compilerRoot -or !$sdk){throw '缺少 MSVC C++ 工具或 Windows SDK；请在 Visual Studio Installer 安装使用 C++ 的游戏开发工作负载。'}
$batch=Join-Path $EngineRoot 'Engine\Build\BatchFiles'
$editor=Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor.exe'
$editorCmd=Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
function Invoke-NativeBuild {
 param([string]$Target,[string]$Config='Development')
 & (Join-Path $batch 'Build.bat') $Target Win64 $Config "-Project=$project" -WaitMutex -NoHotReloadFromIDE
 if($LASTEXITCODE -ne 0){throw "Unreal 编译失败，退出码 $LASTEXITCODE"}
}
function Prepare-NativeAssets {
 Invoke-NativeBuild 'SkystrikeNativeEditor'
 $script=Join-Path $PSScriptRoot 'import_assets.py'
 $importStarted=[DateTimeOffset]::UtcNow
 & $editorCmd $project -run=pythonscript "-script=$script" -unattended -nosplash -RenderOffscreen -stdout -FullStdOutLogOutput
 if($LASTEXITCODE -ne 0){throw "Unreal 资源导入失败，退出码 $LASTEXITCODE"}
 $manifest=Join-Path $runtime 'imported-assets.json'
 if(!(Test-Path -LiteralPath $manifest)){throw '未找到导入清单，检查 Unreal 的 Python 日志。'}
 # 部分编辑器错误不一定传播为非零退出码，必须检查本轮新生成的完整清单。
 $result=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
 if(!$result.started_at_utc -or [DateTimeOffset]::Parse($result.started_at_utc) -lt $importStarted){throw '导入清单来自旧运行，本轮资源准备未完成。'}
 if($result.status -ne 'finished'){throw '资源导入未完成；检查 .runtime/imported-assets.json 和编辑器日志。'}
 foreach($key in @('f22','earth_day','earth_clouds')){
  if($result.assets.$key.status -notin @('imported','kept_existing')){throw "资源 $key 未就绪。"}
 }
 if($result.map.status -notin @('created_empty','kept_existing')){throw 'Prototype 地图准备被延后；请先保存当前编辑器地图再重试。'}
 $mapFile=Join-Path $nativeRoot 'unreal\Content\Skystrike\Maps\Prototype.umap'
 if(!(Test-Path -LiteralPath $mapFile)){throw 'Prototype 地图尚未生成；打开编辑器并运行导入脚本。'}
}
switch($Action){
 'Generate' {
  $generator=Join-Path $batch 'GenerateProjectFiles.bat'
  if(Test-Path -LiteralPath $generator){
   & $generator "-project=$project" -game -engine
  }else{
   & (Join-Path $EngineRoot 'Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.exe') -projectfiles "-project=$project" -game -engine
  }
  if($LASTEXITCODE -ne 0){throw "生成工程失败，退出码 $LASTEXITCODE"}
 }
 'Build' { Invoke-NativeBuild 'SkystrikeNativeEditor' }
 'Prepare' { Prepare-NativeAssets }
 'Editor' {
  Prepare-NativeAssets
  # 用户请求打开编辑器时才显示交互窗口；后台构建不创建单独命令窗口。
  & $editor $project -dx12
 }
 'Preview' {
  Prepare-NativeAssets
  & $editor $project '/Game/Skystrike/Maps/Prototype' -game -dx12 -windowed -ResX=1280 -ResY=720
 }
 'Package' {
  Prepare-NativeAssets
  $archive=Join-Path $runtime 'package'
  & (Join-Path $batch 'RunUAT.bat') BuildCookRun "-project=$project" -noP4 -platform=Win64 "-clientconfig=$Configuration" -build -cook -stage -pak -archive "-archivedirectory=$archive" -map=/Game/Skystrike/Maps/Prototype -utf8output
  if($LASTEXITCODE -ne 0){throw "打包失败，退出码 $LASTEXITCODE"}
 }
}
