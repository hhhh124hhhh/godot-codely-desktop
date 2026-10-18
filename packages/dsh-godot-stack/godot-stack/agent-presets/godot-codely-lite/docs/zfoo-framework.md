# godot-framework / zfoo（按需加载）

工程已经接入 [godot-fun/godot-framework](https://github.com/godot-fun/godot-framework) 时，优先用框架 API，不要手写等价逻辑。
工程没有 `zfoo/` 时不要自行塞进框架；先看项目现有写法。

框架以 Autoload 加载（`GodotFramework.tscn` → 全局类名 `gdf`）。

| 场景 | 框架 API | 不要手写 |
| --- | --- | --- |
| 播放音乐 | `Audio.play_music("res://audio/bgm.mp3")` | AudioStreamPlayer 节点 |
| 播放音效 | `Audios.play("res://audio/click.mp3", 0.8)` | AudioStreamPlayer2D |
| 场景切换 | `await SceneHelper.async_change_scene_to_file("res://scene/Main.tscn")` | `get_tree().change_scene_to_file()` |
| 异步加载资源 | `await ResourceHelper.async_load("res://assets/icon.svg")` | 阻塞主线程的 `load()` |
| 日志 | `Log.info("msg:[{}]", val)` / `Log.error(...)` | `print()` / `push_error()` |
| 持久化配置 | `Setting.get_bool("key", false)` / `Setting.set_string("key", "val")` + `Setting.save()` | 自己包一层 ConfigFile |
| 定时任务 | `SchedulerBus.schedule(func(): do_something(), 1000)` | Timer 节点 |
| HTTP 请求 | `await HttpHelper.async_get("https://...")` | HTTPRequest 节点 |
| 主线程回调 | `gdf.callable_deferred(func(): refresh_ui())` | `call_deferred` 的字符串形式 |
| 安全退出 | `await gdf.quit()` | `get_tree().quit()` |
| 精灵表动画 | `EffectAnimation2D.spawn(pos, parent, "res://effects/attack.png", Vector2i(4,4), 0.5, 13)` | 手写 AnimatedSprite2D |
| Toast | `Alert.alert("Saved", Colors.success)` | Label + Tween |

注册 Autoload：Project → Project Settings → Autoload → GodotFramework（`res://zfoo/GodotFramework.tscn`）。

MCP 侧的集成检查（参数以 `mcp__godot__help` 为准）：

- `check`：看 `project_path` 下有没有 `zfoo/`，以及 Autoload 是否指向 `res://zfoo/GodotFramework.tscn`
- `bootstrap`：从 `framework_source_path` 复制 `zfoo/` 并注册 Autoload；目标里已经有 `zfoo/` 就跳过复制

类型安全仍按工程习惯：显式标注（`var x: int`、`Array[int]`），报错定位到文件和行再改那一处。
技能 `gdscript` 里的表与本文一致；改表时两处一起改。
