@tool
extends Node
## Durable Harness session adapter. A failed prompt is retained with its request ID for explicit retry.
signal connected
signal failed(message: String)
signal journal_event(event: Dictionary)
signal assistant_frame(frame: Dictionary)
signal approvals_changed(items: Array)

var base_url := "http://127.0.0.1:4399"
var session_id := ""
var last_seq := -1
var _stream_seq := 0
var _generation := 0
var _pending: Dictionary = {}
const CACHE := "res://.godot/godot-codely-session.json"

func _ready() -> void:
	var configured := OS.get_environment("GODOT_CODELY_BRIDGE_URL")
	if not configured.is_empty():
		base_url = configured.trim_suffix("/")
	if FileAccess.file_exists(CACHE):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(CACHE))
		if saved is Dictionary:
			session_id = str(saved.get("sessionId", ""))
			last_seq = int(saved.get("lastSeq", -1))
			if saved.get("pending") is Dictionary:
				_pending = saved["pending"]

func connect_session() -> bool:
	_generation += 1
	var generation := _generation
	var body: Dictionary = {"cwd": ProjectSettings.globalize_path("res://"), "preset": "godot-codely-lite"}
	if not session_id.is_empty():
		body["sessionId"] = session_id
	var response: Dictionary = await _request("/v1/sessions", HTTPClient.METHOD_POST, body)
	if generation != _generation or not is_inside_tree():
		return false
	if not response.get("ok", false):
		failed.emit(str(response.get("error", "Harness 连接失败")))
		return false
	session_id = str(response.get("sessionId", ""))
	_stream_seq = 0
	_save()
	connected.emit()
	_poll(generation)
	return true

func new_session() -> bool:
	_generation += 1
	session_id = ""
	last_seq = -1
	_pending = {}
	_save()
	return await connect_session()

func prompt(text: String) -> bool:
	if session_id.is_empty():
		if not await connect_session():
			return false
	if not _pending.is_empty() and _pending.get("text") != text:
		failed.emit("上一条发送结果未确认，请先重发原文或 /new 新建会话")
		return false
	if _pending.is_empty():
		_pending = {"text": text, "requestId": Crypto.new().generate_random_bytes(16).hex_encode()}
		_save()
	var response: Dictionary = await _request(_session_path("prompt"), HTTPClient.METHOD_POST, _pending)
	if response.get("accepted", false):
		_pending = {}
		_save()
		return true
	failed.emit(str(response.get("error", "消息未确认；原文和请求 ID 已保留")))
	return false

func cancel() -> bool:
	if session_id.is_empty():
		return false
	var response: Dictionary = await _request(_session_path("cancel"), HTTPClient.METHOD_POST, {})
	if not response.get("accepted", false):
		failed.emit(str(response.get("error", "取消未被接收")))
	return bool(response.get("accepted", false))

func answer(id: String, outcome: String) -> bool:
	var response: Dictionary = await _request(_session_path("approval"), HTTPClient.METHOD_POST, {"id": id, "outcome": outcome})
	if not response.get("ok", false):
		failed.emit(str(response.get("error", "审批已撤回或回答失败")))
	return bool(response.get("ok", false))

func _poll(generation: int) -> void:
	while generation == _generation and is_inside_tree() and not session_id.is_empty():
		var response: Dictionary = await _request(_session_path("events") + "?since=%d&streamSince=%d" % [last_seq, _stream_seq], HTTPClient.METHOD_GET)
		if generation != _generation or not is_inside_tree():
			return
		if not response.get("ok", false):
			failed.emit(str(response.get("error", "事件连接中断；重连可继续会话")))
			return
		for item in response.get("stream", []):
			assistant_frame.emit(item.get("frame", {}))
		_stream_seq = int(response.get("streamSeq", 0))
		for record in response.get("records", []):
			var event: Dictionary = record.get("event", {})
			var seq := int(event.get("seq", -1))
			if seq > last_seq:
				journal_event.emit(event)
				last_seq = seq
		approvals_changed.emit(response.get("approvals", []))
		_save()
		await get_tree().create_timer(0.75).timeout

func _session_path(action: String) -> String:
	return "/v1/sessions/" + session_id.uri_encode() + "/" + action

func _request(path: String, method: int, body: Dictionary = {}) -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = 25.0
	request.body_size_limit = 8000000
	add_child(request)
	var error := request.request(base_url + path, PackedStringArray(["Content-Type: application/json"]), method, JSON.stringify(body) if method != HTTPClient.METHOD_GET else "")
	if error != OK:
		request.queue_free()
		return {"ok": false, "error": "Bridge 请求失败: " + str(error)}
	var result: Array = await request.request_completed
	request.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "error": "Bridge 未响应: " + str(result[0])}
	var parsed = JSON.parse_string(result[3].get_string_from_utf8())
	if parsed is Dictionary:
		return parsed
	return {"ok": false, "error": "Bridge 返回非 JSON（HTTP %s）" % result[1]}

func _save() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://.godot"))
	var file := FileAccess.open(CACHE + ".tmp", FileAccess.WRITE)
	if file == null:
		failed.emit("会话恢复文件无法写入；当前会话仍可使用")
		return
	file.store_string(JSON.stringify({"sessionId": session_id, "lastSeq": last_seq, "pending": _pending}))
	file.close()
	var error := DirAccess.rename_absolute(ProjectSettings.globalize_path(CACHE + ".tmp"), ProjectSettings.globalize_path(CACHE))
	if error != OK:
		failed.emit("会话恢复文件无法替换: " + str(error))

func _exit_tree() -> void:
	_generation += 1
