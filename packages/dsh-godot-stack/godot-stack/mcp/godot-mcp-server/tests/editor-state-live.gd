@tool
extends EditorPlugin
## 在真实编辑器里改选择、把场景标脏、再切换场景，确认插件把 state.json 跟着改写。

func _enter_tree() -> void:
	_run.call_deferred()

func _run() -> void:
	var fs := EditorInterface.get_resource_filesystem()
	var deadline := Time.get_ticks_msec() + 20000
	while fs != null and fs.is_scanning() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	for _i in 8:
		await get_tree().process_frame
	var state_path := OS.get_environment("DSH_HOME") + "/.godot/state.json"
	var initial := _read(state_path)
	if str(initial.get("project")) != "state-live":
		printerr("INITIAL_PROJECT ", initial)
		get_tree().quit(1)
		return
	var before := int(initial.get("revision", 0))
	EditorInterface.open_scene_from_path("res://main.tscn")
	for _i in 8:
		await get_tree().process_frame
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		printerr("NO_ROOT")
		get_tree().quit(1)
		return
	var coin := root.get_node_or_null("Coin")
	if coin == null:
		printerr("NO_COIN")
		get_tree().quit(1)
		return
	var selection := EditorInterface.get_selection()
	selection.clear()
	selection.add_node(coin)
	var undo := EditorInterface.get_editor_undo_redo()
	undo.create_action("move coin")
	undo.add_do_property(coin, "position", Vector2(24, 16))
	undo.add_undo_property(coin, "position", coin.position)
	undo.commit_action()
	for _i in 10:
		await get_tree().process_frame
	var edited := _read(state_path)
	var found := false
	for item in edited.get("selected_nodes", []):
		if item is Dictionary and str(item.get("path")) == "Coin":
			found = true
	if not found:
		printerr("SELECTION_MISSING ", edited)
		get_tree().quit(1)
		return
	if edited.get("unsaved") != true:
		printerr("UNSAVED_MISSING ", edited)
		get_tree().quit(1)
		return
	if int(edited.get("revision", 0)) <= before:
		printerr("REVISION_NOT_ADVANCED ", edited)
		get_tree().quit(1)
		return
	EditorInterface.open_scene_from_path("res://other.tscn")
	for _i in 10:
		await get_tree().process_frame
	var switched := _read(state_path)
	if str(switched.get("scene_path")) != "res://other.tscn":
		printerr("SCENE_SWITCH_FAILED ", switched)
		get_tree().quit(1)
		return
	print("EDITOR_CONTEXT_LIVE_OK")
	get_tree().quit(0)

func _read(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if parsed is Dictionary:
		return parsed
	return {}
