@tool
extends EditorPlugin
## Godot Codely AI — 编辑器内嵌 AI 面板（对标团结引擎 AI Assistant / Codely）
## 注册一个右侧 Dock，内置：状态栏 / 会话区 / 输入区 + MCP 工具调用

const PANEL_SCRIPT := "res://addons/godot_codely_ai/panel.gd"

var _dock: Control

func _enter_tree() -> void:
	push_warning("[godot-codely] plugin _enter_tree: add dock")
	_dock = load(PANEL_SCRIPT).new()
	_dock.name = "Godot Codely AI"
	# Godot 4.6: add_control_to_dock(slot, control, shortcut) — 第三参为 Shortcut，标题取 control.name
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)
	print("[godot-codely] dock added: ", _dock != null)

func _exit_tree() -> void:
	if _dock:
		remove_control_from_docks(_dock)
		_dock.free()
		_dock = null
