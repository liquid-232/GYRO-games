# 苍穹突击 · 原生客户端工程基础

当前阶段：**原生工程源码已建立，尚未编译运行 Unreal 客户端，也尚未接入 NVIDIA DLSS。**

此目录是用户选择的下一版开发路线：Unreal Engine 5.8、Windows x64、C++、DirectX 12。首个阶段只搭工程；两张完整地图、原飞机的原生显示、空战玩法、BLE/USB 设备连接和正式 UI 还需后续移植。

网页稳定版保存在提交 `efd3b6a` 和标签 `stable-2026-10-16`。下一版使用分支 `feature/native-dlss`；现有 `game/start-game.cmd` 和桌面快捷方式继续启动网页游戏。

## 已提供的工程内容

| 部分 | 当前状态 |
| --- | --- |
| Unreal 项目、游戏/编辑器目标、DX12/SM6 配置 | 源码已建立；需引擎进行 UHT 和 C++ 编译 |
| 键盘飞行、镜头、暂停/重置、航道标记、预览 HUD | 原型源码；目前使用几何代理，没有替换为已导入 F-22 |
| GYB1/GYB2 姿态、USB 帧与命令协议核心 | 独立 C++ 库，具备有界拆包和校验测试；尚无设备接收线程 |
| F-22 GLB 和地球贴图导入 | 编辑器脚本；记录多网格实际路径，默认不覆盖已有资源 |
| 原型关卡 | 首次 Prepare 时创建 `Prototype.umap`；未安装引擎前没有地图二进制文件 |
| 环境检查、构建、资源准备、打包入口 | PowerShell 脚本；缺依赖时明确停止 |
| DLSS Super Resolution / DLAA / Reflex / 帧生成 | 尚未接入，等待匹配引擎版本的官方插件及实际运行验证 |
| DLSS 5 3D-Guided Neural Rendering | 尚未接入，需先落实官方 SDK 获取及目标设备支持 |

所有 C++ 头文件和实现均提供中文说明。此原型默认设置 TSR、60 FPS 上限和关闭硬件光追作为基础配置；这些配置不表示已达到实测 60 FPS，也不等于 DLSS。

## 本机环境检查（2026-10-16）

已检测到 NVIDIA GeForce RTX 4060 Laptop GPU、Visual Studio Community 2026 和可用的 MinGW C++ 工具。未检测到 Unreal Engine 5.8、MSVC x64 C++ 工具组件、Windows SDK 或官方 DLSS 插件。Visual Studio IDE 已安装并不代表 C++ 工具链已经齐全。

在仓库根目录运行只读检查：

```powershell
.\native\tools\build-native.ps1 -Action Check
```

`CanAttemptBuild` 只表示脚本查到基础依赖，最终版本兼容性由 UnrealBuildTool 判定。`LocalPlugins` 只是文件盘点，不能据此判断 DLSS 可用或已生效。

## 安装依赖后使用

通过 Epic Games Launcher 安装 **UE 5.8**。在 Visual Studio Installer 添加“使用 C++ 的游戏开发”、对应 MSVC x64/x86 工具和 Windows SDK。版本要求以 Epic 与所选 NVIDIA 插件说明为准。

以下命令均在仓库根目录执行；引擎安装到其他位置时替换路径：

```powershell
$env:UE_ROOT = 'C:\Program Files\Epic Games\UE_5.8'
.\native\tools\build-native.ps1 -Action Generate
.\native\tools\build-native.ps1 -Action Prepare
.\native\tools\build-native.ps1 -Action Preview
```

- `Generate`：生成 Visual Studio 工程。
- `Build`：编译编辑器目标，不导入资源。
- `Prepare`：先编译，再启动命令行编辑器导入资源、创建空原型地图。
- `Editor`：准备资源后打开编辑器。
- `Preview`：通过引擎运行原生工程预览，WASD/方向键移动、P 暂停、R 重置。
- `Package`：准备资源后构建 Win64 客户端，输出到 `native/.runtime/package`；可加 `-Configuration Shipping`。

原生预览仍依赖安装的引擎；完成打包并验证后才能提供独立可运行的客户端。脚本不安装依赖、不自动获取 NVIDIA SDK。

资源导入记录位于 `native/.runtime/imported-assets.json`。导入失败、残留目录、缺少地图或旧记录都会阻止后续运行。已有资源默认保留；如果清单提示上次部分失败，请先在编辑器检查相关目录，不要把不完整的模型当作导入成功。自动导入不会组装多网格 F-22，也不会自动烘焙网页的程序化蒙皮。

## 协议核心的独立构建

协议核心不依赖引擎或硬件，可用支持 C++17 的编译器独立构建。以本机 MinGW/Ninja 为例：

```powershell
cmake -S native/core -B native/.runtime/core-build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build native/.runtime/core-build
ctest --test-dir native/.runtime/core-build --output-on-failure
```

Unreal 模块通过 `GyroProtocol.cpp` 编译同一份核心实现，避免维护两套解析器。设备扫描、WinRT BLE、串口句柄、中位四元数转换和游戏线程快照尚未接线；现阶段不能用此原型控制真实设备。固件保持现有版本。

## 真正 DLSS 的接入顺序

1. 先完成原生编译、资源与玩法移植，获取稳定的真实渲染帧率基线。
2. 安装与 UE 小版本匹配的官方 DLSS 插件；用插件的支持查询接口检测硬件和驱动，然后接入 Super Resolution / DLAA 与 Reflex。必须检查深度、运动矢量、曝光、透明特效和重置时机的实际输出。
3. 分别测量渲染 FPS、显示 FPS、GPU 帧时间和输入延迟；帧生成不能代替基础帧率优化。
4. 取得官方 DLSS 5 神经渲染接口及授权后，再针对支持设备实现该独立阶段。只有功能查询、真实输出和视觉/性能验证都完成，才能标记为已启用。

截至 2026-10-16，NVIDIA 公开 Unreal 下载页列出 DLSS 4.5 插件；DLSS 5 神经渲染不是简单换名。NVIDIA 最近公告列出的神经渲染支持平台仍以 RTX 50 系列与 RTX Spark 等为主，不能承诺本机 RTX 4060 已能使用官方 DLSS 5 神经渲染。第三方插件请放在被 Git 忽略的 `unreal/Plugins/ThirdParty/`，完成接口接入后再显式启用；此仓库不内置 SDK DLL。

参考官方资料（本次已查阅）：

- [NVIDIA DLSS 和 Unreal 插件下载](https://developer.nvidia.com/rtx/dlss)
- [DLSS 5 开发者技术介绍](https://developer.nvidia.com/blog/whats-new-for-game-developers-dlss-5-with-3d-guided-neural-rendering-nvidia-ace-updates-and-new-rtx-kit-capabilities)
- [2026-10-13 神经渲染与支持平台更新](https://www.nvidia.com/en-us/geforce/news/dlss-5-faster-ai-model-hogwarts-legacy-rtx-spark-laptops/)
- [Unreal Engine 硬件与开发环境要求](https://dev.epicgames.com/documentation/en-us/unreal-engine/hardware-and-software-specifications-for-unreal-engine)

## 完整移植范围

F-22 GLB、地球两张贴图可导入；贴图来源见 `game/dist/assets/earth/ATTRIBUTION.md`。玄女、敌机、海岛、金币等目前是 JS 生成资源，需要导出网格、UV 与纹理，或在原生工程重新实现。F-22 的运行时蒙皮也未完整包含在原始 GLB 中。

需保留双地图武器区别（海岛火光弹/炮口焰、太空激光）、障碍/金币/目标、冷启动导弹技能、暂停返回大厅、六种机头安装方向、中位/校准、蓝牙默认与 USB/键盘切换、实时姿态与延迟信息。坐标从网页 Y-up/-Z-forward 转为 Unreal Z-up/+X-forward 时应统一转换，避免导入与控制器再各自旋转一次。

本阶段的原型航道和代理机体只用于工程准备，不代表这些玩法或模型已经迁移完成。

## 本阶段验证记录

2026-10-16：协议核心用 GCC 16.1.0 / C++17 / Release 编译通过，关闭异常与 RTTI，无编译警告。CTest 的 1 个测试程序通过，内部 1,379 项检查、0 失败，覆盖固定协议向量、全部状态位、拆包粘包、坏 CRC/截断后恢复、序号回绕和新鲜期。

PowerShell 语法、Python 语法、项目 JSON 和源资源路径检查通过。静态审查补齐了航道网格的打包引用；检查了协议核心桥接路径。UE C++/UHT 编译、资源导入、原型运行、Package 与实际设备接收尚未验证，因为本机缺少引擎和 Windows C++ 开发依赖。这些独立协议测试不代表原生客户端或 DLSS 已运行成功。
