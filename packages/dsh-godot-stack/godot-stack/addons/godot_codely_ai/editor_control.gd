@tool
extends Node
## Commands run on the editor main thread; a lost reply never triggers automatic replay.
const CLIENT := preload("res://addons/godot_codely_ai/harness_client.gd")
var _client: Node
var _alive := true
var _editor_id := ""
var _results: Array = []

func _ready() -> void:
	_client = CLIENT.new()
	add_child(_client)
	_editor_id = Crypto.new().generate_random_bytes(16).hex_encode()
	_poll()

func _poll() -> void:
	while _alive and is_inside_tree():
		var response: Dictionary = await _client._request("/v1/editor/poll", HTTPClient.METHOD_POST, {
			"projectPath": ProjectSettings.globalize_path("res://"), "editorId": _editor_id, "results": _results,
		})
		if not _alive or not is_inside_tree():
			return
		# HTTP errors retain no commands for replay. Completed commands are acknowledged once.
		_results = []
		if response.get("ok", false):
			for command in response.get("commands", []):
				var result: Dictionary = await execute(str(command.get("action", "")), int(command.get("expiresAt", 0)))
				_results.append({"id": command.get("id", ""), "result": result})
		await get_tree().create_timer(0.25 if response.get("ok", false) else 2.0).timeout

func execute(action: String, expires_at: int = 0) -> Dictionary:
	if _expired(expires_at):
		return {"ok": false, "error": "Editor command expired before execution"}
	if not Engine.is_editor_hint():
		return {"ok": false, "error": "Editor actions require the Godot editor"}
	if action == "stop":
		EditorInterface.stop_playing_scene()
	elif action == "scan" or action == "play":
		var unsaved := EditorInterface.get_unsaved_scenes()
		var root := EditorInterface.get_edited_scene_root()
		if not unsaved.is_empty() or (root != null and root.scene_file_path.is_empty()):
			return {"ok": false, "error": "Save or discard unsaved scenes before scanning or playing", "unsaved_scenes": Array(unsaved)}
		var filesystem := EditorInterface.get_resource_filesystem()
		if filesystem.is_scanning():
			return {"ok": false, "error": "Resource import is already running; retry after it completes"}
		filesystem.scan()
		await get_tree().process_frame
		var deadline := Time.get_ticks_msec() + 8000
		while filesystem.is_scanning():
			if Time.get_ticks_msec() >= deadline:
				return {"ok": false, "error": "Resource scan timed out"}
			await get_tree().process_frame
		if action == "play":
			if _expired(expires_at):
				return {"ok": false, "error": "Editor command expired during resource scan"}
			if EditorInterface.is_playing_scene():
				return {"ok": false, "error": "A scene is already playing; stop it before starting another"}
			if str(ProjectSettings.get_setting("application/run/main_scene", "")).is_empty():
				return {"ok": false, "error": "No main scene configured"}
			EditorInterface.play_main_scene()
	elif action != "status":
		return {"ok": false, "error": "Unknown editor action"}
	# Dispatch is distinct from a running game. The caller checks status and runtime logs.
	await get_tree().process_frame
	return {"ok": true, "action": action, "playing": EditorInterface.is_playing_scene(), "scene_path": EditorInterface.get_playing_scene()}

func _exit_tree() -> void:
	_alive = false

func _expired(expires_at: int) -> bool:
	return expires_at > 0 and Time.get_unix_time_from_system() * 1000.0 >= expires_at
