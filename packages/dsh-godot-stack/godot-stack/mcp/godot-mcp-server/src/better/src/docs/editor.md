# Editor Tool - Full Documentation

## Overview
Godot Editor lifecycle: launch, status, live_status, scan, play, stop.

## Actions

### launch
Open Godot Editor with a project.
```json
{"action": "launch", "project_path": "/path/to/project"}
```
Launches Godot as a background process.

### status
Check if Godot Editor is currently running.
```json
{"action": "status"}
```

## Parameters
- `project_path` - Path to Godot project directory (optional, uses config default)

## Connected editor actions

`live_status`, `scan`, `play`, `stop` require the Godot Codely editor plugin and desktop Bridge. They act in that project's existing editor, not an unrelated process. `status` retains its tracked-process meaning.

```json
{"action": "scan"}
{"action": "play"}
{"action": "live_status"}
{"action": "stop"}
```

Scan and Play refuse unsaved scenes; save or discard them in the editor. Play refuses an already running scene. A Play response confirms dispatch, so poll `live_status` to observe native playing state. It does not prove gameplay correctness. Timed-out commands are never replayed; inspect status before retrying.
