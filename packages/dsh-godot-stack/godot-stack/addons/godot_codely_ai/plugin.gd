@tool
extends EditorPlugin
## Godot Codely AI — 编辑器内嵌 AI 面板（对标团结引擎 AI Assistant / Codely）
## 注册一个右侧 Dock，内置：状态栏 / 会话区 / 输入区 + MCP 工具调用

const PANEL_SCRIPT := "res://addons/godot_codely_ai/panel.gd"
const EDITOR_STATE_SCRIPT := preload("res://addons/godot_codely_ai/editor_state.gd")
const EDITOR_CONTROL_SCRIPT := preload("res://addons/godot_codely_ai/editor_control.gd")

var _dock: Control
var _selection: EditorSelection
var _undo: EditorUndoRedoManager
var _state_queued := false
var _editor_control: Node

func _enter_tree() -> void:
	_editor_control = EDITOR_CONTROL_SCRIPT.new()
	add_child(_editor_control)
	push_warning("[godot-codely] plugin _enter_tree: add dock")
	_dock = load(PANEL_SCRIPT).new()
	_dock.name = "Godot Codely AI"
	# Godot 4.6: add_control_to_dock(slot, control, shortcut) — 第三参为 Shortcut，标题取 control.name
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	print("[godot-codely] dock added: ", _dock != null)
	# 连接后持续发布。只在面板连上 MCP 时写一次会漏掉随后的选择、保存和切场景。
	scene_changed.connect(_queue_editor_state)
	scene_closed.connect(_queue_editor_state)
	scene_saved.connect(_queue_editor_state)
	_selection = EditorInterface.get_selection()
	if _selection != null:
		_selection.selection_changed.connect(_queue_editor_state)
	_undo = EditorInterface.get_editor_undo_redo()
	if _undo != null:
		_undo.history_changed.connect(_queue_editor_state)
		_undo.version_changed.connect(_queue_editor_state)
	_queue_editor_state()

func _exit_tree() -> void:
	if is_instance_valid(_editor_control):
		_editor_control.free()
	_disconnect_editor_state()
	if _dock:
		remove_control_from_docks(_dock)
		_dock.free()
		_dock = null

func _queue_editor_state(_value = null) -> void:
	if _state_queued:
		return
	_state_queued = true
	_flush_editor_state.call_deferred()

func _flush_editor_state() -> void:
	_state_queued = false
	EDITOR_STATE_SCRIPT.write_current()

func _disconnect_editor_state() -> void:
	if scene_changed.is_connected(_queue_editor_state):
		scene_changed.disconnect(_queue_editor_state)
	if scene_closed.is_connected(_queue_editor_state):
		scene_closed.disconnect(_queue_editor_state)
	if scene_saved.is_connected(_queue_editor_state):
		scene_saved.disconnect(_queue_editor_state)
	if _selection != null and _selection.selection_changed.is_connected(_queue_editor_state):
		_selection.selection_changed.disconnect(_queue_editor_state)
	if _undo != null and _undo.history_changed.is_connected(_queue_editor_state):
		_undo.history_changed.disconnect(_queue_editor_state)
	if _undo != null and _undo.version_changed.is_connected(_queue_editor_state):
		_undo.version_changed.disconnect(_queue_editor_state)
	_selection = null
	_undo = null
