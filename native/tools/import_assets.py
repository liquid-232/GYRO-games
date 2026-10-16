"""苍穹突击原生工程的编辑器资源导入入口。

在 Unreal Editor 5.8 中运行本文件；普通 Python 无法导入 unreal 模块。
本机尚未安装 Unreal，此脚本尚未完成引擎内运行验证。
每种来源使用独立目录，已有资源默认保留，不强行覆盖或合并 GLB 网格。
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import unreal


# native/tools/import_assets.py 的上两级是 native，再上一级就是仓库根目录。
REPO_ROOT = Path(__file__).resolve().parents[2]
NATIVE_ROOT = REPO_ROOT / "native"
MANIFEST_PATH = NATIVE_ROOT / ".runtime" / "imported-assets.json"
MAP_PATH = "/Game/Skystrike/Maps/Prototype"
SOURCES = (
    ("f22", "assets/models/airplane-f22.glb", "/Game/Skystrike/Imported/F22", "mesh"),
    ("earth_day", "game/dist/assets/earth/earth-day.jpg", "/Game/Skystrike/Imported/Earth/Day", "color"),
    ("earth_clouds", "game/dist/assets/earth/earth-clouds.jpg", "/Game/Skystrike/Imported/Earth/Clouds", "mask"),
)


def log(message):
    unreal.log("[Skystrike Import] " + message)


def write_manifest(manifest):
    """每个阶段落盘实际结果，失败时也留下已创建对象的路径便于人工检查。"""
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = MANIFEST_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(MANIFEST_PATH)


def asset_paths(directory):
    library = unreal.EditorAssetLibrary
    if not library.does_directory_exist(directory):
        return []
    return sorted(str(path) for path in library.list_assets(directory, recursive=True, include_folder=False))


def make_directory(directory):
    library = unreal.EditorAssetLibrary
    if not library.does_directory_exist(directory) and not library.make_directory(directory):
        raise RuntimeError("无法创建内容目录：" + directory)


def import_source(key, relative_source, destination, kind, manifest, previous):
    """同步导入一个来源；不假定 GLB 只返回一个 StaticMesh 或固定资产名。"""
    library = unreal.EditorAssetLibrary
    source = REPO_ROOT / relative_source
    entry = {"source": relative_source, "destination": destination, "status": "pending",
             "imported_object_paths": [], "saved_object_paths": []}
    manifest["assets"][key] = entry
    existing = asset_paths(destination)
    if existing:
        # 整个来源目录已占用时跳过，防止 Interchange 改名、覆盖或复制同一份部件。
        entry["status"] = "kept_existing"
        entry["existing_object_paths"] = existing
        old = previous.get("assets", {}).get(key, {})
        if old.get("source") == relative_source and old.get("destination") == destination:
            entry["imported_object_paths"] = old.get("imported_object_paths", [])
        if old.get("status") in ("failed", "blocked_partial_import"):
            entry["status"] = "blocked_partial_import"
            entry["error"] = "上次导入失败且目标目录仍有对象，请在编辑器中检查残留资源后再运行：" + destination
            write_manifest(manifest)
            raise RuntimeError(entry["error"])
        if old.get("status") not in ("imported", "kept_existing"):
            unreal.log_warning("[Skystrike Import] 目录已有资源，本次保留；请检查是否为完整导入：" + destination)
        log("保留已有目录：" + destination)
        for path in existing:
            log("  已有对象：" + path)
        write_manifest(manifest)
        return

    make_directory(destination)
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(source))
    task.set_editor_property("destination_path", destination)
    task.set_editor_property("automated", True)
    task.set_editor_property("async_", False)
    task.set_editor_property("replace_existing", False)
    task.set_editor_property("replace_existing_settings", False)
    # 保存结果必须逐个检查布尔返回值，因此不用 task.save 自动保存。
    task.set_editor_property("save", False)
    log("开始导入：" + relative_source)
    try:
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        objects = [obj for obj in task.get_objects() if obj is not None]
        entry["imported_object_paths"] = [str(path) for path in task.get_editor_property("imported_object_paths")]
        entry["result_object_paths"] = [obj.get_path_name() for obj in objects]
        for path in entry["imported_object_paths"]:
            log("  imported_object_paths：" + path)
        write_manifest(manifest)
        if not objects:
            raise RuntimeError("导入器未返回对象：" + relative_source + "。GLB 请检查 Interchange/glTF 导入插件和 Output Log。")
        if kind == "mesh" and not any(isinstance(obj, unreal.StaticMesh) for obj in objects):
            raise RuntimeError("GLB 导入未得到 StaticMesh，不能把空模型标记为成功：" + relative_source)
        if kind != "mesh" and not any(isinstance(obj, unreal.Texture2D) for obj in objects):
            raise RuntimeError("JPEG 导入未得到 Texture2D：" + relative_source)

        # 包括导入器创建的材质和贴图依赖，避免只保存返回的主网格。
        to_save = {obj.get_path_name(): obj for obj in objects}
        for path in set(entry["imported_object_paths"]) | set(asset_paths(destination)):
            if path not in to_save:
                obj = library.load_asset(path)
                if obj is None:
                    raise RuntimeError("导入对象无法加载：" + path)
                to_save[path] = obj
        for path, obj in sorted(to_save.items()):
            if not path.startswith(destination + "/"):
                raise RuntimeError("导入器返回了目标目录以外的对象，未保存：" + path)
            if isinstance(obj, unreal.Texture2D) and kind in ("color", "mask"):
                # 日间地图是颜色数据；云层作为遮罩使用，必须关闭 sRGB 解码。
                obj.set_editor_property("srgb", kind == "color")
            if not library.save_loaded_asset(obj, only_if_is_dirty=False):
                raise RuntimeError("资产保存失败，请检查磁盘权限/源代码管理状态：" + path)
            entry["saved_object_paths"].append(path)
            log("  已保存：" + path)
        entry["status"] = "imported"
    except Exception as error:
        entry["status"] = "failed"
        entry["error"] = str(error)
        raise
    finally:
        write_manifest(manifest)


def ensure_prototype_map(manifest, project_directory):
    """只在地图不存在、当前没有脏地图时创建空关卡，不覆盖用户的关卡。"""
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    disk_map = project_directory / "Content" / "Skystrike" / "Maps" / "Prototype.umap"
    if disk_map.exists() or registry.get_assets_by_package_name(MAP_PATH):
        manifest["map"] = {"path": MAP_PATH, "status": "kept_existing"}
        log("保留已有原型地图：" + MAP_PATH)
        return
    # new_level 会关闭当前地图且不会保存，因此存在未保存改动时明确停止此步骤。
    dirty_maps = unreal.EditorLoadingAndSavingUtils.get_dirty_map_packages()
    if dirty_maps:
        manifest["map"] = {"path": MAP_PATH, "status": "deferred_dirty_map"}
        unreal.log_warning("[Skystrike Import] 当前地图有未保存改动；已完成资源导入，保存地图后重新运行可创建 Prototype。")
        return
    subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    make_directory("/Game/Skystrike/Maps")
    if not subsystem.new_level(MAP_PATH, is_partitioned_world=False):
        raise RuntimeError("创建或保存原型地图失败：" + MAP_PATH)
    if not disk_map.is_file():
        raise RuntimeError("编辑器未生成预期地图文件：" + str(disk_map))
    manifest["map"] = {"path": MAP_PATH, "status": "created_empty"}
    log("已创建空原型关卡：" + MAP_PATH)


def main():
    project_directory = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())).resolve()
    # 防止从其他 UE 工程误运行后把资源写入错误的 Content 目录。
    if not project_directory.is_relative_to(NATIVE_ROOT.resolve()):
        raise RuntimeError("请先打开本仓库 native 目录中的 Unreal 工程，当前工程：" + str(project_directory))
    if unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).is_in_play_in_editor():
        raise RuntimeError("请先停止 Play/Simulate，再执行资源导入。")
    missing = [str(REPO_ROOT / source) for _, source, _, _ in SOURCES if not (REPO_ROOT / source).is_file()]
    if missing:
        raise RuntimeError("缺少仓库源资源：" + ", ".join(missing))
    previous = {}
    if MANIFEST_PATH.is_file():
        try:
            previous = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            if not isinstance(previous, dict):
                previous = {}
        except (ValueError, OSError):
            unreal.log_warning("[Skystrike Import] 上次导入记录不可读；仍按已有目录检查并保留资源。")
    if previous.get("project_directory") != str(project_directory):
        previous = {}
    manifest = {"schema_version": 1, "project_directory": str(project_directory),
                "started_at_utc": datetime.now(timezone.utc).isoformat(),
                "status": "running", "assets": {}, "map": {"path": MAP_PATH, "status": "pending"}}
    write_manifest(manifest)
    try:
        for spec in SOURCES:
            import_source(*spec, manifest, previous)
        ensure_prototype_map(manifest, project_directory)
        manifest["status"] = "finished"
        log("资源处理结束；实际路径记录：" + str(MANIFEST_PATH))
        unreal.log_warning("[Skystrike Import] 玄女、海岛、敌机等程序生成资源及 F-22 运行时蒙皮图集尚未移植；Prototype 为空关卡，本脚本不代表原生游戏或 DLSS 已完成。")
    except Exception as error:
        manifest["status"] = "failed"
        manifest["error"] = str(error)
        unreal.log_error("[Skystrike Import] " + str(error))
        raise
    finally:
        write_manifest(manifest)


if __name__ == "__main__":
    main()
