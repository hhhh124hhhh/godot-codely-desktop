@tool
extends Node
## LLM 客户端 — OpenAI 兼容 /chat/completions + 真流式（HTTPClient 分块读 SSE）
## 对标 cowork 引擎测的流式 AI 对话体验。
## 配置来源：<DSH_HOME>/.godot/llm_config.json（base_url / api_key / model）；
## 无则回退 <DSH_HOME>/cordis.patch.yml 提取 token-plan qwen（OpenAI 兼容端点）。

signal chunk_received(text: String)
signal finished(full_text: String)
signal failed(error_message: String)
## agentic：LLM 请求调用工具（OpenAI 兼容 tool_calls，流式分片累积后一次性发出）
signal tool_calls_requested(tool_calls: Array, content_so_far: String)

const DEFAULT_BASE_URL := "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
const DEFAULT_MODEL := "qwen3.8-flash"

var _http: HTTPClient
var _buffer := ""
var _full := ""
var _done := false
var _streaming := true
var _pending_tool_calls: Dictionary = {}

# 配置（运行时可由面板设置）
var base_url := ""
var api_key := ""
var model := ""


func _ready() -> void:
	pass


## 加载默认配置：llm_config.json → cordis.patch.yml（token-plan qwen）
func load_default_config() -> bool:
	var dsh_home := _dsh_home()
	var cfg_path := dsh_home + "/.godot/llm_config.json"
	if FileAccess.file_exists(cfg_path):
		var f := FileAccess.open(cfg_path, FileAccess.READ)
		if f:
			var parsed = JSON.parse_string(f.get_as_text())
			f.close()
			if parsed is Dictionary:
				base_url = str(parsed.get("base_url", ""))
				api_key = str(parsed.get("api_key", ""))
				model = str(parsed.get("model", ""))
				if base_url != "" and api_key != "" and model != "":
					return true
	# 回退：从 cordis.patch.yml 提取 token-plan
	var yml_path := dsh_home + "/cordis.patch.yml"
	if FileAccess.file_exists(yml_path):
		var f := FileAccess.open(yml_path, FileAccess.READ)
		if f:
			var yml := f.get_as_text()
			f.close()
			var key := _extract_yml_value(yml, "ANTHROPIC_AUTH_TOKEN")
			if key != "":
				api_key = key
				base_url = DEFAULT_BASE_URL
				model = DEFAULT_MODEL
				return true
	return false


## 保存面板模型配置到 <DSH_HOME>/.godot/llm_config.json
func save_config(cfg_base: String, cfg_key: String, cfg_model: String) -> bool:
	var dsh_home := _dsh_home()
	var dir := dsh_home + "/.godot"
	DirAccess.make_dir_recursive_absolute(dir)
	var f := FileAccess.open(dir + "/llm_config.json", FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({
			"base_url": cfg_base,
			"api_key": cfg_key,
			"model": cfg_model,
		}))
		f.close()
		base_url = cfg_base
		api_key = cfg_key
		model = cfg_model
		return true
	return false


func is_configured() -> bool:
	return base_url != "" and api_key != "" and model != ""


## 发起对话（messages: Array of {role, content}；tools: OpenAI 兼容 function 定义数组，可空）。
## 流式：逐块发 chunk_received，结束发 finished；若模型请求调用工具则发 tool_calls_requested
func chat(messages: Array, tools: Array = []) -> void:
	if not is_configured():
		failed.emit("LLM 未配置：请用 /model 命令或写入 llm_config.json")
		return
	_buffer = ""
	_full = ""
	_done = false
	_pending_tool_calls = {}
	var url := base_url.trim_suffix("/") + "/chat/completions"
	var payload := {
		"model": model,
		"messages": messages,
	}
	if tools.size() > 0:
		payload["tools"] = tools
	if _streaming:
		payload["stream"] = true
	var body := JSON.stringify(payload)
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"Authorization: Bearer " + api_key,
		"Accept: text/event-stream",
	])
	_http = HTTPClient.new()
	var host := _host_of(url)
	var port := _port_of(url)
	var tls: TLSOptions = null
	if url.begins_with("https://"):
		tls = TLSOptions.client()
	var err := _http.connect_to_host(host, port, tls)
	if err != OK:
		failed.emit("LLM 连接失败: " + str(err))
		return
	# 等待连接建立
	for i in 200:
		await get_tree().process_frame
		_http.poll()
		var st := _http.get_status()
		if st == HTTPClient.STATUS_CONNECTED or st == HTTPClient.STATUS_CANT_CONNECT or st == HTTPClient.STATUS_CANT_RESOLVE:
			break
	if _http.get_status() != HTTPClient.STATUS_CONNECTED:
		failed.emit("LLM 连接失败: " + str(_http.get_status()))
		return
	err = _http.request(HTTPClient.METHOD_POST, _path_of(url), headers, body)
	if err != OK:
		failed.emit("LLM 请求失败: " + str(err))
		return
	# 读响应体（分块，流式解析 SSE）
	# 注意 Godot 4.6：无 STATUS_DONE；body 读完 poll 后状态回 STATUS_CONNECTED，
	# 错误枚举为 STATUS_CONNECTION_ERROR / STATUS_TLS_HANDSHAKE_ERROR
	while not _done:
		await get_tree().process_frame
		_http.poll()
		var st := _http.get_status()
		if st == HTTPClient.STATUS_BODY:
			var chunk := _http.read_response_body_chunk()
			if chunk.size() > 0:
				_buffer += chunk.get_string_from_utf8()
				_parse_sse()
		elif st == HTTPClient.STATUS_CONNECTED or st == HTTPClient.STATUS_DISCONNECTED:
			# body 读取结束（回 CONNECTED）或连接断开
			break
		elif st == HTTPClient.STATUS_CONNECTION_ERROR or st == HTTPClient.STATUS_CANT_CONNECT or st == HTTPClient.STATUS_TLS_HANDSHAKE_ERROR or st == HTTPClient.STATUS_CANT_RESOLVE:
			failed.emit("LLM 请求错误: " + str(st))
			return
		# 其余（RESOLVING/CONNECTING/REQUESTING）继续 poll 等待
	# 残留 buffer（非流式响应或无 [DONE]）
	if not _done:
		_parse_sse()
	if not _done:
		if _full.is_empty():
			# 服务器忽略 stream 返回普通 JSON：解析 choices[0].message（content / tool_calls）
			var parsed = JSON.parse_string(_buffer.strip_edges())
			if parsed is Dictionary:
				var choices = parsed.get("choices", [])
				if choices is Array and choices.size() > 0:
					var msg = choices[0].get("message", {})
					var content = msg.get("content", "")
					if content is String and content != "":
						_full = content
					var tcs = msg.get("tool_calls", [])
					if tcs is Array and tcs.size() > 0:
						_done = true
						tool_calls_requested.emit(tcs, _full)
						return
		_finish()


func _finish() -> void:
	_done = true
	if _pending_tool_calls.size() > 0:
		var keys := _pending_tool_calls.keys()
		keys.sort()
		var calls := []
		for index in keys:
			var e: Dictionary = _pending_tool_calls[index]
			calls.append({
				"id": str(e.get("id", "")),
				"type": "function",
				"function": {
					"name": str(e.get("name", "")),
					"arguments": str(e.get("arguments", "")),
				},
			})
		tool_calls_requested.emit(calls, _full)
	else:
		finished.emit(_full)


func _parse_sse() -> void:
	while _buffer.find("\n") >= 0:
		var nl := _buffer.find("\n")
		var line := _buffer.substr(0, nl).strip_edges()
		_buffer = _buffer.substr(nl + 1)
		if line.begins_with("data:"):
			var data := line.substr(5).strip_edges()
			if data == "[DONE]":
				_finish()
				return
			var parsed = JSON.parse_string(data)
			if parsed is Dictionary:
				var choices = parsed.get("choices", [])
				if choices is Array and choices.size() > 0:
					var delta = choices[0].get("delta", {})
					var content = delta.get("content", "")
					if content is String and content != "":
						_full += content
						chunk_received.emit(content)
					# OpenAI 兼容流式 tool_calls：按 index 累积分片
					if delta.has("tool_calls") and delta["tool_calls"] is Array:
						for tc in delta["tool_calls"]:
							var index := int(tc.get("index", 0))
							if not _pending_tool_calls.has(index):
								_pending_tool_calls[index] = {"id": "", "name": "", "arguments": ""}
							var entry: Dictionary = _pending_tool_calls[index]
							var tc_id = tc.get("id", "")
							if tc_id is String and tc_id != "":
								entry["id"] = tc_id
							var fn = tc.get("function", {})
							var fname = fn.get("name", "")
							if fname is String and fname != "":
								entry["name"] = fname
							var fargs = fn.get("arguments", "")
							if fargs is String and fargs != "":
								entry["arguments"] = str(entry["arguments"]) + fargs
	if _buffer.length() > 6000:
		# 防缓冲膨胀：丢弃已完成解析的旧残尾
		_buffer = _buffer.substr(_buffer.length() - 400)


func _dsh_home() -> String:
	var home := OS.get_environment("USERPROFILE")
	if home.is_empty():
		home = OS.get_environment("HOME")
	var dsh := OS.get_environment("DSH_HOME")
	return dsh if not dsh.is_empty() else home + "/.dsh"


func _extract_yml_value(yml: String, name: String) -> String:
	for line in yml.split("\n"):
		var idx := line.find(name + "=")
		if idx >= 0:
			var rest := line.substr(idx + name.length() + 1).strip_edges()
			if rest.begins_with("\""):
				rest = rest.trim_prefix("\"")
				rest = rest.trim_suffix("\"")
			return rest
	return ""


func _host_of(url: String) -> String:
	var start := url.find("://") + 3
	var end := url.find("/", start)
	if end < 0:
		end = url.length()
	var host := url.substr(start, end - start)
	if host.contains(":"):
		host = host.substr(0, host.find(":"))
	return host


func _port_of(url: String) -> int:
	var start := url.find("://") + 3
	var end := url.find("/", start)
	if end < 0:
		end = url.length()
	var host_port := url.substr(start, end - start)
	if host_port.contains(":"):
		return int(host_port.split(":")[1])
	return 443 if url.begins_with("https://") else 80


func _path_of(url: String) -> String:
	var start := url.find("://") + 3
	var slash := url.find("/", start)
	if slash < 0:
		return "/"
	return url.substr(slash)
