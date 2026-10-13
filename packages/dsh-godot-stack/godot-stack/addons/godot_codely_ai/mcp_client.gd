@tool
extends Node
## Godot Codely AI — MCP HTTP 客户端
## 连接 godot-mcp-server 的 HTTP 模式（MCP_TRANSPORT=http，默认 127.0.0.1:8785）
## 支持 initialize（拿会话） + tools/call（调用 32 个 Godot 工具）

signal connected
signal tool_result(id: int, result: Dictionary)
signal connection_error(message: String)

const DEFAULT_URL := "http://127.0.0.1:8785/api"

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
	var result: Dictionary = await _post("", body)
	if result.get("ok", false) and result.has("data"):
		var data: Dictionary = result["data"]
		if data.has("result") and not data["result"].is_empty():
			var headers: Dictionary = result["headers"]
			if headers.has("mcp-session-id"):
				_session_id = str(headers["mcp-session-id"])
			if not _session_id.is_empty():
				var notified: Dictionary = await _post("", {"jsonrpc": "2.0", "method": "notifications/initialized"})
				if notified.get("ok", false):
					connected.emit()
					return true
	connection_error.emit("MCP 初始化失败: " + str(result.get("data", result)))
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
	var result: Dictionary = await _post("", body)
	var parsed: Dictionary = _extract_result(result)
	tool_result.emit(_req_id, parsed)
	return parsed


## 拉取 MCP 工具清单，映射为 OpenAI 兼容 function 定义（供 LLM 工具调用）
func list_tools() -> Array:
	var body := {
		"jsonrpc": "2.0",
		"id": _req_id + 1,
		"method": "tools/list",
		"params": {},
	}
	var result: Dictionary = await _post("", body)
	var tools: Array = []
	if result.get("ok", false) and result.has("data"):
		var data: Dictionary = result["data"]
		if data.has("result"):
			var list = data["result"].get("tools", [])
			for t in list:
				tools.append({
					"type": "function",
					"function": {
						"name": str(t.get("name", "")),
						"description": str(t.get("description", "")),
						"parameters": t.get("inputSchema", {}),
					},
				})
	return tools


## 解析 JSON 响应中的 result 字段
func _extract_result(result: Dictionary) -> Dictionary:
	if not result.get("ok", false):
		return {"error": result.get("error", "unknown"), "raw": result}
	var data: Dictionary = result["data"]
	if data.has("result"):
		return data["result"]
	return data


## 发 POST 请求（自动带 session 头），返回 {ok, status, headers, data}
func _post(path: String, body: Dictionary) -> Dictionary:
	_ensure_http()
	# MCP requires both accepted types; /api selects the SDK's finite JSON response.
	var headers := ["Content-Type: application/json", "Accept: application/json, text/event-stream"]
	if not _session_id.is_empty():
		headers.append("Mcp-Session-Id: " + _session_id)
	var err := _http.request(_base_url + path, PackedStringArray(headers), HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		connection_error.emit("HTTP 请求失败: " + str(err))
		return {"ok": false, "error": str(err)}
	var response: Array = await _http.request_completed
	if int(response[0]) != HTTPRequest.RESULT_SUCCESS:
		var message := "HTTP 传输失败: " + str(response[0])
		connection_error.emit(message)
		return {"ok": false, "error": message}
	var code := int(response[1])
	var headers_raw = response[2]
	var body_bytes = response[3]
	if code == 202:
		return {"ok": true, "status": code, "headers": {}, "data": {}}
	if code != 200:
		connection_error.emit("HTTP " + str(code) + ": " + body_bytes.get_string_from_utf8())
		return {"ok": false, "status": code, "error": body_bytes.get_string_from_utf8()}
	var header_map := {}
	for h in headers_raw:
		var kv := String(h).split(":", true, 1)
		if kv.size() == 2:
			header_map[kv[0].to_lower().strip_edges()] = kv[1].strip_edges()
	var data = JSON.parse_string(body_bytes.get_string_from_utf8())
	if not data is Dictionary:
		connection_error.emit("MCP 响应不是有效 JSON 对象")
		return {"ok": false, "error": "Invalid MCP JSON response"}
	return {
		"ok": true,
		"status": code,
		"headers": header_map,
		"data": data,
	}
