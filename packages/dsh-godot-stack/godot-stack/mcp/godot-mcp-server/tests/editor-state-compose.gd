extends SceneTree
## 不启动编辑器，核对选中节点、未保存和场景切换如何进入 state.json。

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var editor_state = load("res://addons/godot_codely_ai/editor_state.gd")
	var selected: Dictionary = editor_state.compose({
		"project": "state-live",
		"project_path": "/tmp/game",
		"scene_path": "res://main.tscn",
		"has_scene_root": true,
		"godot_version": "4.7.2",
		"selected_nodes": [{"path": "Coin", "type": "Node2D", "name": "Coin"}],
		"unsaved_scenes": ["res://main.tscn"],
		"open_scenes": ["res://main.tscn", "res://other.tscn"],
		"updated_at": "t1",
	})
	if selected.get("unsaved") != true or selected.get("selected_nodes")[0].get("path") != "Coin":
		printerr("COMPOSE_SELECTION_FAILED ", selected)
		quit(1)
		return
	var switched: Dictionary = editor_state.compose({
		"project": "state-live",
		"project_path": "/tmp/game",
		"scene_path": "res://other.tscn",
		"has_scene_root": true,
		"godot_version": "4.7.2",
		"selected_nodes": [],
		"unsaved_scenes": ["res://main.tscn"],
		"open_scenes": ["res://main.tscn", "res://other.tscn"],
		"updated_at": "t2",
	})
	if switched.get("scene_path") != "res://other.tscn" or switched.get("unsaved") != false:
		printerr("COMPOSE_SWITCH_FAILED ", switched)
		quit(1)
		return
	var fresh: Dictionary = editor_state.compose({
		"project": "state-live",
		"scene_path": "",
		"has_scene_root": true,
		"unsaved_scenes": [],
		"selected_nodes": [],
		"open_scenes": [],
	})
	if fresh.get("unsaved") != true:
		printerr("COMPOSE_NEW_SCENE_FAILED ", fresh)
		quit(1)
		return
	print("EDITOR_STATE_COMPOSE_OK")
	quit(0)
