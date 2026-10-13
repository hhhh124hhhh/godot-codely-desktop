extends SceneTree
## Exercise the actual dock and HTTPRequest client in an isolated project.

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var panel = load("res://addons/godot_codely_ai/panel.gd").new()
	root.add_child(panel)
	# 默认模式是桌面 Agent，不会连接 MCP。状态往返检查的是工具直调。
	panel._mode.select(1)
	panel._client._base_url = OS.get_environment("GODOT_TEST_URL")
	var deadline := Time.get_ticks_msec() + 10000
	while not panel._connected and Time.get_ticks_msec() < deadline:
		await process_frame
	if not panel._connected or panel._status_label.text != "已连接":
		printerr("PANEL_CONNECTION_FAILED: ", panel._status_label.text)
		quit(1)
		return
	var result: Dictionary = await panel._client.call_tool("config", {"action": "state"})
	if result.get("isError", false) or not result.has("structuredContent"):
		printerr("STATE_READ_FAILED: ", result)
		quit(1)
		return
	var state: Dictionary = result["structuredContent"]
	var editor = state.get("editor_plugin")
	if not editor is Dictionary or editor.get("project") != "panel-smoke":
		printerr("STATE_ROUNDTRIP_FAILED: ", state)
		quit(1)
		return
	if editor.get("project_path") != ProjectSettings.globalize_path("res://"):
		printerr("STATE_PROJECT_PATH_FAILED: ", editor)
		quit(1)
		return
	print("PANEL_CONNECTED_AND_STATE_VERIFIED")
	panel.queue_free()
	await process_frame
	quit(0)
