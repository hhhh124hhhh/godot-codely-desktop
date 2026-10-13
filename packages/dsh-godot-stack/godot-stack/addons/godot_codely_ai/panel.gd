@tool
extends Control
## Godot Codely AI 面板 — 对标团结引擎 AI Assistant（Codely）
## 布局：状态栏 / 会话区 / 输入区（模式 + 快捷工具按钮）
## 输入 /tool <名称> <json参数> 直接调用 MCP 工具；按钮一键执行常用操作

const MCP_CLIENT_SCRIPT := "res://addons/godot_codely_ai/mcp_client.gd"
const LLM_CLIENT_SCRIPT := "res://addons/godot_codely_ai/llm_client.gd"
const HARNESS_CLIENT_SCRIPT := "res://addons/godot_codely_ai/harness_client.gd"

const MIN_WIDTH := 340

var _client: Node
var _llm: Node
var _harness: Node
var _agent_status: Label
var _preview: TextEdit
var _approvals: VBoxContainer
var _approval_signature := ""
var _agent_ready := false
var _agent_busy := false
var _status_label: Label
var _log: RichTextLabel
var _input: TextEdit
var _mode: OptionButton
var _connecting := false
var _connected := false
var _mcp_launch_attempted := false
var _history: Array = []
var _llm_busy := false
var _tool_rounds := 0
const _MAX_TOOL_ROUNDS := 8
const _SYSTEM_PROMPT := "你是嵌入 Godot 编辑器的 AI 助手 Godot Codely。帮助用户完成 Godot 开发：场景、GDScript、UI、物理、着色器、导出等。回答简洁、可操作，需要改代码时直接给出 GDScript 代码块。\n\n你可以调用 MCP 工具在编辑器里实际执行操作。当用户要求创建/修改场景、节点、脚本、运行项目、查询状态时，优先调用对应工具（如 scenes、nodes、scripts、project 等；多数工具用 action 参数区分操作，参数结构以工具定义为准）。工具返回后基于真实结果继续回答。不要编造工具执行结果。"


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
	_agent_status = Label.new()
	_agent_status.text = "Agent 未连接"
	status_bar.add_child(_agent_status)
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
	_preview = TextEdit.new()
	_preview.editable = false
	_preview.custom_minimum_size = Vector2(0, 100)
	_preview.visible = false
	root.add_child(_preview)
	_approvals = VBoxContainer.new()
	root.add_child(_approvals)
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
	_mode.add_item("桌面 Agent")
	_mode.add_item("工具直调")
	_mode.add_item("独立 LLM 对话")
	_mode.select(0)
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
	var cancel := Button.new()
	cancel.text = "停止"
	cancel.pressed.connect(_cancel_agent)
	input_row.add_child(cancel)

	# 初始化 MCP 客户端
	_client = load(MCP_CLIENT_SCRIPT).new()
	add_child(_client)
	_client.connected.connect(_on_connected)
	_client.connection_error.connect(_on_conn_error)
	_harness = load(HARNESS_CLIENT_SCRIPT).new()
	add_child(_harness)
	_harness.connected.connect(func():
		_agent_ready = true
		_agent_status.text = "Agent 已连接"
	)
	_harness.failed.connect(_on_agent_error)
	_harness.journal_event.connect(_on_agent_event)
	_harness.assistant_frame.connect(_on_agent_frame)
	_harness.approvals_changed.connect(_on_approvals)
	# 初始化 LLM 客户端（AI 对话 + 流式）
	_llm = load(LLM_CLIENT_SCRIPT).new()
	add_child(_llm)
	_llm.chunk_received.connect(_on_llm_chunk)
	_llm.finished.connect(_on_llm_finished)
	_llm.failed.connect(_on_llm_failed)
	_llm.tool_calls_requested.connect(_on_llm_tool_calls)
	if _llm.load_default_config():
		_append_line("[color=#999999]LLM 已配置（%s）[/color]" % _llm.model, Color.WHITE)
	else:
		_append_line("[color=#999999]LLM 未配置：/model base=… key=… model=… 可配置后对话[/color]", Color.WHITE)
	# 等一帧确保子节点（HTTPRequest）已挂载进树，再发起连接
	await get_tree().process_frame
	_on_connect_pressed()


func _on_connect_pressed() -> void:
	_agent_status.text = "Agent 连接中…"
	_harness.connect_session()
	if _mode.selected == 0:
		return
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
	if text == "/new":
		if _agent_busy:
			_on_agent_error("请先停止当前任务，再新建会话")
			return
		await _harness.new_session()
	elif text == "/cancel":
		_cancel_agent()
	elif text.begins_with("/tool "):
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
	elif text.begins_with("/model "):
		if _mode.selected == 0:
			_append_line("桌面 Agent 使用桌面端的模型配置。独立 LLM 对话可用 /model 配置。", Color.WHITE)
		else:
			_handle_model_cmd(text.substr(7).strip_edges())
	elif _mode.selected == 0:
		if _agent_busy:
			_on_agent_error("任务仍在执行，可停止后发送新任务")
			_input.text = text
			return
		if not _agent_ready and not await _harness.connect_session():
			_input.text = text
			return
		if await _harness.prompt(text):
			_agent_busy = true
			_agent_status.text = "任务已接收"
		else:
			_input.text = text
	elif _mode.selected == 2:
		_start_llm_chat(text)
	else:
		_append_line("[color=#9BBBF4]你：[/color]" + text, Color.WHITE)
		_append_line("[color=#666666]工具直调模式：请用 /tool 或快捷按钮；切换 Agent 对话模式可用自然语言。[/color]", Color.WHITE)


func _on_agent_error(message: String) -> void:
	_agent_ready = false
	_agent_status.text = "Agent 连接中断"
	_log.add_text("Agent: " + message + "\n")
	_on_approvals([])


func _on_agent_event(event: Dictionary) -> void:
	var kind := str(event.get("type", ""))
	var data: Dictionary = event.get("data", {})
	if kind == "turn/start":
		_agent_busy = true
		_agent_status.text = "Agent 执行中"
	elif kind == "turn/end":
		_agent_busy = false
		_agent_status.text = "Agent 就绪"
	elif kind == "user/message" or kind == "assistant/message":
		var message: Dictionary = data.get("message", {})
		_log.add_text(("你：" if kind == "user/message" else "AI：") + _message_text(message) + "\n")
	elif kind == "tool/call":
		_log.add_text("调用工具：" + str(data.get("name", "")) + "\n")
	elif kind == "tool/result":
		var message: Dictionary = data.get("message", {})
		_log.add_text("工具结果：" + _message_text(message).substr(0, 4000) + "\n")
	elif kind == "approval/asked":
		_agent_status.text = "等待审批"
	elif kind == "approval/decided":
		_log.add_text("审批：" + str(data.get("outcome", "")) + "\n")
	_log.scroll_to_line(_log.get_line_count() - 1)


func _message_text(message: Dictionary) -> String:
	var content = message.get("content", "")
	if content is String:
		return content
	var text := ""
	if content is Array:
		for part in content:
			if part is Dictionary and part.get("type") == "text":
				text += str(part.get("text", ""))
	return text


func _on_agent_frame(frame: Dictionary) -> void:
	if frame.get("type") == "start":
		_preview.text = ""
		_preview.visible = true
	elif frame.get("type") == "chunk":
		var chunk: Dictionary = frame.get("chunk", {})
		if chunk.get("type") == "text-delta":
			_preview.text += str(chunk.get("text", ""))
	elif frame.get("type") == "end":
		_preview.visible = false


func _on_approvals(items: Array) -> void:
	var signature := JSON.stringify(items)
	if signature == _approval_signature:
		return
	_approval_signature = signature
	for child in _approvals.get_children():
		_approvals.remove_child(child)
		child.queue_free()
	for item in items:
		var reason := Label.new()
		reason.text = "审批：%s\n%s" % [item.get("toolName", ""), item.get("reason", "")]
		reason.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_approvals.add_child(reason)
		var row := HBoxContainer.new()
		_approvals.add_child(row)
		for choice in [["允许一次", "allowed-once"], ["拒绝", "rejected"]]:
			var button := Button.new()
			button.text = choice[0]
			button.pressed.connect(_answer_approval.bind(str(item.get("id", "")), str(choice[1]), button))
			row.add_child(button)


func _answer_approval(id: String, outcome: String, button: Button) -> void:
	button.disabled = true
	var ok: bool = await _harness.answer(id, outcome)
	if is_instance_valid(button):
		button.disabled = ok


func _cancel_agent() -> void:
	if _mode.selected == 2:
		_on_agent_error("独立 LLM 模式的停止尚未接入；桌面 Agent 支持取消")
		return
	if await _harness.cancel():
		_agent_status.text = "取消中…"


## 模型配置命令：/model base=<url> key=<key> model=<name>（缺省保留现值）
func _handle_model_cmd(rest: String) -> void:
	var cfg_base: String = _llm.base_url
	var cfg_key: String = _llm.api_key
	var cfg_model: String = _llm.model
	for kv in rest.split(" "):
		var parts := kv.split("=", true, 1)
		if parts.size() < 2:
			continue
		var k := parts[0].strip_edges()
		var v := parts[1].strip_edges()
		if k == "base":
			cfg_base = v
		elif k == "key":
			cfg_key = v
		elif k == "model":
			cfg_model = v
	if cfg_base == "" or cfg_key == "" or cfg_model == "":
		_append_line("[color=#E5533D]/model 需要 base/key/model 完整（如 /model base=https://… key=sk-… model=qwen3.8-flash）[/color]", Color.WHITE)
		return
	if _llm.save_config(cfg_base, cfg_key, cfg_model):
		_append_line("[color=#57B44E]✓ 模型已保存：%s（base=%s）[/color]" % [cfg_model, cfg_base], Color.WHITE)
	else:
		_append_line("[color=#E5533D]模型配置保存失败[/color]", Color.WHITE)


## Agent 对话：组装消息历史 → LLM 流式生成（可调用 MCP 工具，agentic 循环）
func _start_llm_chat(text: String) -> void:
	if _llm_busy:
		_append_line("[color=#999999]上一条仍在生成，请稍候…[/color]", Color.WHITE)
		return
	if not _llm.is_configured():
		_append_line("[color=#E5533D]LLM 未配置：/model base=… key=… model=…[/color]", Color.WHITE)
		return
	_llm_busy = true
	_tool_rounds = 0
	_history.append({"role": "user", "content": text})
	if _history.size() > 20:
		_history = _history.slice(_history.size() - 20)
	_append_line("[color=#9BBBF4]你：[/color]" + text, Color.WHITE)
	_log.append_text("[color=#57B44E]AI：[/color]")
	_log.scroll_to_line(_log.get_line_count() - 1)
	var tools: Array = []
	if _connected:
		tools = await _client.list_tools()
		if tools.size() == 0:
			_append_line("[color=#999999]MCP 工具清单为空，本次仅对话[/color]", Color.WHITE)
	_llm.chat(_build_messages(), tools)


## 组装 system + 历史消息
func _build_messages() -> Array:
	var messages: Array = [{"role": "system", "content": _SYSTEM_PROMPT}]
	messages.append_array(_history)
	return messages


## agentic：LLM 请求调用工具 → 逐条执行 → 结果回喂 → 继续
func _on_llm_tool_calls(tool_calls: Array, content_so_far: String) -> void:
	if content_so_far != "":
		_log.append_text(content_so_far)
		_log.scroll_to_line(_log.get_line_count() - 1)
	_tool_rounds += 1
	if _tool_rounds > _MAX_TOOL_ROUNDS:
		_log.append_text("\n")
		_append_line("[color=#E5533D]✗ 工具调用轮次超过 %d，已停止[/color]" % _MAX_TOOL_ROUNDS, Color.WHITE)
		_history.append({"role": "assistant", "content": content_so_far + "\n（工具调用超限）"})
		_llm_busy = false
		return
	# 记录 assistant 的 tool_calls 消息（OpenAI 兼容：content 可空）
	var assistant_msg: Dictionary = {"role": "assistant", "content": content_so_far if content_so_far != "" else null}
	var calls_clean: Array = []
	for tc in tool_calls:
		var fn_name := str(tc.get("function", {}).get("name", ""))
		var fn_args_raw := str(tc.get("function", {}).get("arguments", ""))
		var tc_id := str(tc.get("id", ""))
		if fn_name == "":
			continue
		calls_clean.append({"id": tc_id, "type": "function", "function": {"name": fn_name, "arguments": fn_args_raw}})
		_append_line("[color=#9BBBF4]▶ 调用工具 %s %s[/color]" % [fn_name, fn_args_raw], Color.WHITE)
		var args: Dictionary = {}
		var parsed = JSON.parse_string(fn_args_raw)
		if parsed is Dictionary:
			args = parsed
		else:
			_append_line("[color=#E5533D]工具参数解析失败：%s[/color]" % fn_args_raw, Color.WHITE)
		var result: Dictionary = await _client.call_tool(fn_name, args)
		_show_result(result)
		_history.append({"role": "tool", "tool_call_id": tc_id, "content": JSON.stringify(result)})
	if calls_clean.size() == 0:
		_log.append_text("\n")
		_append_line("[color=#E5533D]✗ LLM 返回空工具调用[/color]", Color.WHITE)
		_history.append({"role": "assistant", "content": content_so_far if content_so_far != "" else "（无有效工具调用）"})
		_llm_busy = false
		return
	assistant_msg["tool_calls"] = calls_clean
	_history.append(assistant_msg)
	if _history.size() > 20:
		_history = _history.slice(_history.size() - 20)
	_log.append_text("[color=#57B44E]AI：[/color]")
	_log.scroll_to_line(_log.get_line_count() - 1)
	var tools: Array = []
	if _connected:
		tools = await _client.list_tools()
	_llm.chat(_build_messages(), tools)


func _on_llm_chunk(content: String) -> void:
	_log.append_text(content)
	_log.scroll_to_line(_log.get_line_count() - 1)


func _on_llm_finished(full_text: String) -> void:
	_log.append_text("\n")
	_log.scroll_to_line(_log.get_line_count() - 1)
	_history.append({"role": "assistant", "content": full_text})
	if _history.size() > 20:
		_history = _history.slice(_history.size() - 20)
	_llm_busy = false


func _on_llm_failed(err: String) -> void:
	_log.append_text("\n")
	_append_line("[color=#E5533D]✗ " + err + "[/color]", Color.WHITE)
	_llm_busy = false


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
