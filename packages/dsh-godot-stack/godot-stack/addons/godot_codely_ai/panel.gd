@tool
extends Control
## Godot Codely AI 面板 — 对标团结引擎 AI Assistant（Codely）
## 布局：状态栏 / 会话区 / 输入区（模式 + 快捷工具按钮）
## 输入 /tool <名称> <json参数> 直接调用 MCP 工具；按钮一键执行常用操作

const MCP_CLIENT_SCRIPT := "res://addons/godot_codely_ai/mcp_client.gd"

const MIN_WIDTH := 340

var _client: Node
var _status_label: Label
var _log: RichTextLabel
var _input: TextEdit
var _mode: OptionButton
var _connecting := false
var _connected := false
var _mcp_launch_attempted := false


func _ready() -> void:
	custom_minimum_size = Vector2(MIN_WIDTH, 0)
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 6)
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	# ── 状态栏 ──
	var status_bar := HBoxContainer.new()
	root.add_child(status_bar)
	var title := Label.new()
	title.text = "Godot Codely AI"
	title.add_theme_font_size_override("font_size", 14)
	status_bar.add_child(title)
	status_bar.add_child(HSeparator.new())
	_status_label = Label.new()
	_status_label.text = "未连接"
	_status_label.add_theme_color_override("font_color", Color(0.9, 0.5, 0.2))
	status_bar.add_child(_status_label)
	status_bar.add_child(Control.new()) # spacer
	var reconnect := Button.new()
	reconnect.text = "连接"
	reconnect.pressed.connect(_on_connect_pressed)
	status_bar.add_child(reconnect)

	# ── 会话区 ──
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(scroll)
	_log = RichTextLabel.new()
	_log.bbcode_enabled = true
	_log.scroll_active = true
	_log.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(_log)
	_append_line("[b][color=#9BBBF4]Godot Codely AI[/color][/b] 已就绪。输入 [b]/tool 名称 参数[/b] 调用工具，或点下方快捷按钮。", Color.WHITE)

	# ── 快捷操作行 ──
	var quick_row := HBoxContainer.new()
	quick_row.add_theme_constant_override("separation", 4)
	root.add_child(quick_row)
	for item in [
		["场景", "scenes", "list", {}],
		["节点", "nodes", "list", {}],
		["引擎", "project", "version", {}],
		["运行", "project", "run", {}],
		["建项目", "project", "create", {"name": "new_game", "parent_path": "D:/godot-projects", "template": "2d"}],
	]:
		var btn := Button.new()
		btn.text = item[0]
		btn.pressed.connect(_on_quick.bind(item[1], item[2], item[3]))
		quick_row.add_child(btn)

	# ── 模式 + 输入区 ──
	var mode_row := HBoxContainer.new()
	mode_row.add_theme_constant_override("separation", 4)
	root.add_child(mode_row)
	_mode = OptionButton.new()
	_mode.add_item("Agent 对话（规划中）")
	_mode.add_item("工具直调")
	_mode.select(1)
	mode_row.add_child(_mode)
	mode_row.add_child(Control.new())

	var input_row := HBoxContainer.new()
	input_row.add_theme_constant_override("separation", 4)
	root.add_child(input_row)
	_input = TextEdit.new()
	_input.placeholder_text = "/tool config status  或  输入自然语言"
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.custom_minimum_size = Vector2(0, 60)
	input_row.add_child(_input)
	var send := Button.new()
	send.text = "发送"
	send.pressed.connect(_on_send_pressed)
	input_row.add_child(send)

	# 初始化 MCP 客户端
	_client = load(MCP_CLIENT_SCRIPT).new()
	add_child(_client)
	_client.connected.connect(_on_connected)
	_client.connection_error.connect(_on_conn_error)
	# 等一帧确保子节点（HTTPRequest）已挂载进树，再发起连接
	await get_tree().process_frame
	_on_connect_pressed()


func _on_connect_pressed() -> void:
	if _connecting:
		return
	_connected = false
	_connecting = true
	_status_label.text = "连接中…"
	_append_line("[color=#999999]连接 godot-mcp-server (127.0.0.1:8785)…[/color]", Color.WHITE)
	var ok: bool = await _client.connect_server()
	_connecting = false
	if not ok:
		_status_label.text = "未连接"
		_status_label.add_theme_color_override("font_color", Color(0.9, 0.5, 0.2))
		_append_line("[color=#E5533D]连接失败[/color] — 尝试自动拉起 godot-mcp-server…", Color.WHITE)
		_try_start_mcp_server()
		# 自动重连：MCP server 可能正在启动（3 秒后重试）
		await get_tree().create_timer(3.0).timeout
		if not _connected and is_inside_tree():
			_on_connect_pressed()


## 启动即用：面板连接失败时自动拉起 HTTP 模式的 godot-mcp-server
## 定位：<DSH_HOME>/.godot/mcp-server/start-http.cmd（无则回退 D:\tools\mcp-http.cmd 调试副本）
func _try_start_mcp_server() -> void:
	if _mcp_launch_attempted:
		return
	_mcp_launch_attempted = true
	var home := OS.get_environment("USERPROFILE")
	if home.is_empty():
		home = OS.get_environment("HOME")
	var dsh := OS.get_environment("DSH_HOME")
	var dsh_home := dsh if not dsh.is_empty() else home + "/.dsh"
	var launcher := dsh_home + "/.godot/mcp-server/start-http.cmd"
	if not FileAccess.file_exists(launcher):
		launcher = "D:/tools/mcp-http.cmd"
	if FileAccess.file_exists(launcher):
		OS.create_process("cmd.exe", ["/c", ProjectSettings.globalize_path(launcher)])
		_append_line("[color=#999999]已拉起 MCP server（%s）[/color]" % launcher, Color.WHITE)


func _on_connected() -> void:
	_connected = true
	_status_label.text = "已连接"
	_status_label.add_theme_color_override("font_color", Color(0.3, 0.8, 0.5))
	_append_line("[color=#57B44E]✓ MCP 已连接[/color]", Color.WHITE)
	_write_state()


## 状态同步：把当前项目/场景/版本写入 <DSH_HOME>/.godot/state.json
## 桌面端/CLI 通过 config/state 工具读取，实现双端同步
func _write_state() -> void:
	var home := OS.get_environment("USERPROFILE")
	if home.is_empty():
		home = OS.get_environment("HOME")
	var dsh := OS.get_environment("DSH_HOME")
	var dsh_home := dsh if not dsh.is_empty() else home + "/.dsh"
	var dir := dsh_home + "/.godot"
	var dir_error := DirAccess.make_dir_recursive_absolute(dir)
	if dir_error != OK:
		push_warning("[godot-codely] state directory failed: " + str(dir_error))
		return
	var ver := Engine.get_version_info()
	var scene_path := ""
	if Engine.is_editor_hint():
		var scene := EditorInterface.get_edited_scene_root()
		if scene != null:
			scene_path = scene.scene_file_path
	var state := {
		"client": "godot-codely-ai-panel",
		"project": str(ProjectSettings.get_setting("application/config/name", "unknown")),
		"project_path": ProjectSettings.globalize_path("res://"),
		"scene_path": scene_path,
		"godot_version": str(ver.get("string", "unknown")),
		"mcp_port": 8785,
		"connected_at": Time.get_datetime_string_from_system(),
	}
	var f := FileAccess.open(dir + "/state.json", FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(state))
		var write_error := f.get_error()
		f.close()
		if write_error != OK:
			push_warning("[godot-codely] state write failed: " + str(write_error))
	else:
		push_warning("[godot-codely] state open failed: " + str(FileAccess.get_open_error()))


func _on_conn_error(message: String) -> void:
	_connected = false
	_append_line("[color=#E5533D]" + message + "[/color]", Color.WHITE)


func _on_quick(tool_name: String, action: String, args: Dictionary) -> void:
	var full_args := args.duplicate()
	full_args["action"] = action
	_run_tool(tool_name, full_args)


func _on_send_pressed() -> void:
	var text := _input.text.strip_edges()
	if text.is_empty():
		return
	_input.text = ""
	if text.begins_with("/tool "):
		# /tool <name> <json参数>
		var parts := text.substr(6).split(" ", true, 2)
		var tool_name := parts[0].strip_edges()
		var args: Dictionary = {}
		if parts.size() > 1 and not parts[1].strip_edges().is_empty():
			var parsed = JSON.parse_string(parts[1].strip_edges())
			if parsed is Dictionary:
				args = parsed
			else:
				args = {"action": parts[1].strip_edges()}
		_run_tool(tool_name, args)
	else:
		_append_line("[color=#9BBBF4]你：[/color]" + text, Color.WHITE)
		_append_line("[color=#666666]自然语言对话将在 Agent 模式接入 LLM 后启用；当前请用 /tool 或快捷按钮。[/color]", Color.WHITE)


func _run_tool(tool_name: String, args: Dictionary) -> void:
	_append_line("[color=#9BBBF4]▶ /tool %s %s[/color]" % [tool_name, JSON.stringify(args)], Color.WHITE)
	var result: Dictionary = await _client.call_tool(tool_name, args)
	_show_result(result)


func _show_result(result: Dictionary) -> void:
	if result.has("error"):
		_append_line("[color=#E5533D]✗ " + str(result["error"]) + "[/color]", Color.WHITE)
		return
	var text := str(result.get("content", result))
	if text.length() > 4000:
		text = text.substr(0, 4000) + "…（截断）"
	_append_line("[color=#57B44E]" + text + "[/color]", Color.WHITE)


func _append_line(text: String, _color: Color) -> void:
	_log.append_text(text + "\n")
	_log.scroll_to_line(_log.get_line_count() - 1)
