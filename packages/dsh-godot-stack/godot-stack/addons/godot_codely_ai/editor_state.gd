extends RefCounted
## 编辑器上下文快照。面板连接和插件信号都走这里，避免两套字段。
## 选中节点、未保存场景和当前场景由调用方采集后交给 compose，便于无编辑器回归。

const CLIENT_NAME := "godot-codely-ai-panel"
const MCP_PORT := 8785


static func compose(snapshot: Dictionary) -> Dictionary:
	var scene_path := str(snapshot.get("scene_path", ""))
	var has_root := bool(snapshot.get("has_scene_root", false))
	var unsaved_scenes: Array = snapshot.get("unsaved_scenes", [])
	var unsaved := false
	if has_root and scene_path.is_empty():
		unsaved = true
	if not scene_path.is_empty() and unsaved_scenes.has(scene_path):
		unsaved = true
	return {
		"client": CLIENT_NAME,
		"project": str(snapshot.get("project", "unknown")),
		"project_path": str(snapshot.get("project_path", "")),
		"scene_path": scene_path,
		"godot_version": str(snapshot.get("godot_version", "unknown")),
		"mcp_port": int(snapshot.get("mcp_port", MCP_PORT)),
		"selected_nodes": snapshot.get("selected_nodes", []),
		"unsaved": unsaved,
		"unsaved_scenes": unsaved_scenes,
		"open_scenes": snapshot.get("open_scenes", []),
		"updated_at": str(snapshot.get("updated_at", "")),
	}


static func capture() -> Dictionary:
	var scene_path := ""
	var has_root := false
	var selected: Array = []
	var unsaved_scenes: Array = []
	var open_scenes: Array = []
	if Engine.is_editor_hint():
		var scene_root := EditorInterface.get_edited_scene_root()
		has_root = scene_root != null
		if scene_root != null:
			scene_path = str(scene_root.scene_file_path)
		var selection := EditorInterface.get_selection()
		if selection != null:
			for node in selection.get_selected_nodes():
				if not is_instance_valid(node):
					continue
				var rel := node.name
				if scene_root != null:
					rel = str(scene_root.get_path_to(node))
				selected.append({
					"path": rel,
					"type": node.get_class(),
					"name": str(node.name),
				})
		unsaved_scenes = _as_array(EditorInterface.get_unsaved_scenes())
		open_scenes = _as_array(EditorInterface.get_open_scenes())
	var ver := Engine.get_version_info()
	return compose({
		"project": ProjectSettings.get_setting("application/config/name", "unknown"),
		"project_path": ProjectSettings.globalize_path("res://"),
		"scene_path": scene_path,
		"has_scene_root": has_root,
		"godot_version": ver.get("string", "unknown"),
		"selected_nodes": selected,
		"unsaved_scenes": unsaved_scenes,
		"open_scenes": open_scenes,
		"updated_at": Time.get_datetime_string_from_system(true),
	})


static func write_current() -> void:
	var path := state_file_path()
	var dir := path.get_base_dir()
	var dir_error := DirAccess.make_dir_recursive_absolute(dir)
	if dir_error != OK:
		push_warning("[godot-codely] state directory failed: " + str(dir_error))
		return
	var state := capture()
	var existing := _read_existing(path)
	if existing.has("connected_at"):
		state["connected_at"] = existing["connected_at"]
	else:
		state["connected_at"] = state["updated_at"]
	var revision := 1
	if existing.has("revision"):
		revision = int(existing["revision"]) + 1
	state["revision"] = revision
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_warning("[godot-codely] state open failed: " + str(FileAccess.get_open_error()))
		return
	file.store_string(JSON.stringify(state))
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		push_warning("[godot-codely] state write failed: " + str(write_error))


static func state_file_path() -> String:
	var home := OS.get_environment("USERPROFILE")
	if home.is_empty():
		home = OS.get_environment("HOME")
	var dsh := OS.get_environment("DSH_HOME")
	var dsh_home := dsh if not dsh.is_empty() else home + "/.dsh"
	return dsh_home + "/.godot/state.json"


static func _as_array(values) -> Array:
	var result: Array = []
	for value in values:
		result.append(str(value))
	return result


static func _read_existing(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var text := file.get_as_text()
	file.close()
	var parsed = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed
	return {}
