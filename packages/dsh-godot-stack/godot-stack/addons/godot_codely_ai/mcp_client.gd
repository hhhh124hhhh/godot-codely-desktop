@tool
extends Node
## Godot Codely AI — MCP HTTP 客户端
## 连接 godot-mcp-server 的 HTTP 模式（MCP_TRANSPORT=http，默认 127.0.0.1:8785）
## 支持 initialize（拿会话） + tools/call（调用 32 个 Godot 工具）

signal connected
signal tool_result(id: int, result: Dictionary)
signal connection_error(message: String)

const DEFAULT_URL := "http://127.0.0.1:8785/"

var _base_url := DEFAULT_URL
var _session_id := ""
var _req_id := 0
var _http: HTTPRequest


func _ready() -> void:
	_ensure_http()


## 懒创建 HTTPRequest（兼容 SceneTree --script 与编辑器 dock 两种加载时机）
func _ensure_http() -> void:
	if _http == null:
		_http = HTTPRequest.new()
		_http.timeout = 30.0
	if _http.is_inside_tree():
		return
	if not is_inside_tree():
		# 自身尚未进树（dock 场景偶发）——进树后再挂载
		tree_entered.connect(_ensure_http, CONNECT_ONE_SHOT)
		return
	add_child(_http)


## 连接并初始化（返回是否成功）
func connect_server(url := "") -> bool:
	if not url.is_empty():
		_base_url = url
	_session_id = ""
	var body := {
		"jsonrpc": "2.0",
		"id": 1,
		"method": "initialize",
		"params": {
			"protocolVersion": "2024-11-05",
			"capabilities": {},
			"clientInfo": {"name": "godot-codely-ai", "version": "0.1.0"},
		},
	}
	var result: Dictionary = await _post("/", body)
	if result.get("ok", false) and result.has("data"):
		var data: Dictionary = result["data"]
		if data.has("result") and not data["result"].is_empty():
			var headers: Dictionary = result["headers"]
			if headers.has("mcp-session-id"):
				_session_id = str(headers["mcp-session-id"])
			connected.emit()
			return true
	return false


## 调用 MCP 工具；返回解析后的 result（Dictionary）或 null
func call_tool(tool_name: String, args: Dictionary = {}) -> Dictionary:
	_req_id += 1
	var body := {
		"jsonrpc": "2.0",
		"id": _req_id,
		"method": "tools/call",
		"params": {"name": tool_name, "arguments": args},
	}
	var result: Dictionary = await _post("/", body)
	var parsed: Dictionary = _extract_result(result)
	tool_result.emit(_req_id, parsed)
	return parsed


## 解析 SSE/JSON 响应中的 result 字段
func _extract_result(result: Dictionary) -> Dictionary:
	if not result.get("ok", false):
		return {"error": result.get("error", "unknown"), "raw": result}
	var data: Dictionary = result["data"]
	# SSE 格式：event: message\ndata: {...}
	var text := str(data.get("text", ""))
	if text.begins_with("event:"):
		var data_idx := text.find("\ndata: ")
		if data_idx >= 0:
			var json_part := text.substr(data_idx + 7).strip_edges()
			var parsed = JSON.parse_string(json_part)
			if parsed is Dictionary:
				return parsed
	if data.has("result"):
		return data["result"]
	return data


## 发 POST 请求（自动带 session 头），返回 {ok, status, headers, data}
func _post(path: String, body: Dictionary) -> Dictionary:
	_ensure_http()
	var headers := ["Content-Type: application/json", "Accept: application/json, text/event-stream"]
	if not _session_id.is_empty():
		headers.append("Mcp-Session-Id: " + _session_id)
	var err := _http.request(_base_url + path, PackedStringArray(headers), HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		connection_error.emit("HTTP 请求失败: " + str(err))
		return {"ok": false, "error": str(err)}
	var response: Array = await _http.request_completed
	var code := int(response[1])
	var headers_raw = response[2]
	var body_bytes = response[3]
	if code != 200:
		connection_error.emit("HTTP " + str(code) + ": " + body_bytes.get_string_from_utf8())
		return {"ok": false, "status": code, "error": body_bytes.get_string_from_utf8()}
	var header_map := {}
	for h in headers_raw:
		var kv := String(h).split(":", true, 1)
		if kv.size() == 2:
			header_map[kv[0].to_lower().strip_edges()] = kv[1].strip_edges()
	return {
		"ok": true,
		"status": code,
		"headers": header_map,
		"data": {"text": body_bytes.get_string_from_utf8()},
	}
