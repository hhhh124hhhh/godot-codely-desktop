@tool
extends EditorPlugin
## Godot Codely AI — 编辑器内嵌 AI 面板（对标团结引擎 AI Assistant / Codely）
## 注册一个右侧 Dock，内置：状态栏 / 会话区 / 输入区 + MCP 工具调用

const PANEL_SCRIPT := "res://addons/godot_codely_ai/panel.gd"
const EDITOR_STATE_SCRIPT := preload("res://addons/godot_codely_ai/editor_state.gd")

var _dock: Control
var _selection: EditorSelection
var _undo: EditorUndoRedoManager
var _state_queued := false

func _enter_tree() -> void:
	push_warning("[godot-codely] plugin _enter_tree: add dock")
	_dock = load(PANEL_SCRIPT).new()
	_dock.name = "Godot Codely AI"
	# Godot 4.6: add_control_to_dock(slot, control, shortcut) — 第三参为 Shortcut，标题取 control.name
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	print("[godot-codely] dock added: ", _dock != null)
	# 连接后持续发布。只在面板连上 MCP 时写一次会漏掉随后的选择、保存和切场景。
	# Godot 4 这些信号都带 1 个参数。直接连 0 参方法会在切场景时失败，状态就不再重发。
	scene_changed.connect(_on_scene_changed)
	scene_closed.connect(_on_scene_path)
	scene_saved.connect(_on_scene_path)
	_selection = EditorInterface.get_selection()
	if _selection != null:
		_selection.selection_changed.connect(_queue_editor_state)
	_undo = EditorInterface.get_editor_undo_redo()
	if _undo != null:
		_undo.history_changed.connect(_queue_editor_state)
		_undo.version_changed.connect(_queue_editor_state)
	_queue_editor_state()

func _exit_tree() -> void:
	_disconnect_editor_state()
	if _dock:
		remove_control_from_docks(_dock)
		_dock.free()
		_dock = null

func _on_scene_changed(_scene_root: Node) -> void:
	_queue_editor_state()

func _on_scene_path(_path: String) -> void:
	_queue_editor_state()

func _queue_editor_state() -> void:
	if _state_queued:
		return
	_state_queued = true
	_flush_editor_state.call_deferred()

func _flush_editor_state() -> void:
	_state_queued = false
	EDITOR_STATE_SCRIPT.write_current()

func _disconnect_editor_state() -> void:
	if scene_changed.is_connected(_on_scene_changed):
		scene_changed.disconnect(_on_scene_changed)
	if scene_closed.is_connected(_on_scene_path):
		scene_closed.disconnect(_on_scene_path)
	if scene_saved.is_connected(_on_scene_path):
		scene_saved.disconnect(_on_scene_path)
	if _selection != null and _selection.selection_changed.is_connected(_queue_editor_state):
		_selection.selection_changed.disconnect(_queue_editor_state)
	if _undo != null and _undo.history_changed.is_connected(_queue_editor_state):
		_undo.history_changed.disconnect(_queue_editor_state)
	if _undo != null and _undo.version_changed.is_connected(_queue_editor_state):
		_undo.version_changed.disconnect(_queue_editor_state)
	_selection = null
	_undo = null
