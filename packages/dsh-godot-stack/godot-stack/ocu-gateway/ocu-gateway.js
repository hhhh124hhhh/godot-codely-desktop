#!/usr/bin/env node
/**
 * ocu-gateway.js — open-codex-computer-use (OCU) 门禁代理
 *
 * 位置：dsh 的 mcp-ocu 注册 command 指向本文件；
 * 本文件作为 stdio MCP 代理，把请求转发给 OCU server，并在转发前做三层门禁：
 *
 *   1. 工具分类：读类（list/inspect/screenshot）放行；写类（click/type/key/scroll/drag/set_value）受限
 *   2. 档位控制（环境变量 OCU_GATE_LEVEL）：
 *        read-only        → 写类工具一律拒绝（返回 isError）
 *        write-approve    → 写类工具需通过目标 app 白名单（OCU_ALLOWED_APPS，逗号分隔，支持 * 通配）
 *   3. app 白名单：目标窗口 app 名必须匹配 OCU_ALLOWED_APPS 之一（默认 Godot*）
 *
 * 用途：让 AI 能操作 Godot 编辑器 GUI（原生文件对话框/设置面板），
 *       同时不让模型无约束地操作任意窗口。
 *
 * 用法：
 *   OCU_GATE_LEVEL=write-approve OCU_ALLOWED_APPS="Godot*,godot*" \
 *     node ocu-gateway.js -- <ocu-server-command...>
 */
'use strict';

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// ── 门禁配置（环境变量）──────────────────────────────
const GATE_LEVEL = process.env.OCU_GATE_LEVEL || 'write-approve'; // read-only | write-approve
const ALLOWED_APPS = (process.env.OCU_ALLOWED_APPS || 'Godot*,godot*,Godot_*').split(',').map(s => s.trim()).filter(Boolean);

// ── 工具分类表（按 open-computer-use v1.0.0 真实工具集校准）─────────
const READ_TOOLS = new Set([
  'list_apps', 'get_app_state', // 带 readOnlyHint 标注的读类工具
]);
const WRITE_TOOLS = new Set([
  'click', 'drag', 'perform_secondary_action', 'press_key', 'scroll',
  'set_value', 'type_text',
]);
const ALL_TOOLS = new Set([...READ_TOOLS, ...WRITE_TOOLS]);

// ── 匹配辅助 ─────────────────────────────────────────
function wildcardMatch(name, patterns) {
  const n = String(name || '').toLowerCase();
  return patterns.some(p => {
    const re = p.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${re}$`).test(n);
  });
}

// ── 工具参数里提取目标 app 名（OCU 全部工具都要求 app 参数）────────
function targetAppOf(tool, params) {
  const p = params || {};
  return p.app || null;
}

// ── 启动 OCU server（剩余参数原样传递）──────────────────
const ocuArgs = process.argv.slice(2);
if (ocuArgs.length === 0) {
  console.error('[ocu-gateway] usage: OCU_GATE_LEVEL=... OCU_ALLOWED_APPS=... node ocu-gateway.js -- <ocu server cmd> [args...]');
  process.exit(1);
}
// 允许 -- 分隔符：剥离首个 '--'
if (ocuArgs[0] === '--') ocuArgs.shift();
const ocuCmd = ocuArgs[0];
const ocuRest = ocuArgs.slice(1);

// server 命令解析：Windows 下 npm bin（ocu.ps1）需要 shell；Unix 直接 spawn
const child = spawn(ocuCmd, ocuRest, { stdio: ['pipe', 'pipe', 'inherit'], shell: process.platform === 'win32' });
// 客户端请求流 = 本进程 stdin；OCU 响应流 = child.stdout
const rl = createInterface({ input: process.stdin });

// 会话内请求 id → 需门禁的工具名（response 阶段不重复判定）
const pendingGate = new Map();

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

// ── 门禁判定 ─────────────────────────────────────────
function gateTool(tool, params) {
  if (!ALL_TOOLS.has(tool)) {
    // 未分类工具：读类默认放行、写类默认拒绝（fail-closed）
    if (/^(get|list|read|inspect|query|screenshot|status|info|tree)/i.test(tool)) return null;
    return `[ocu-gateway] 未分类工具 "${tool}" 默认拒绝（fail-closed）`;
  }
  if (READ_TOOLS.has(tool)) return null; // 读类放行
  if (GATE_LEVEL === 'read-only') return `[ocu-gateway] 当前档位 read-only：写类工具 "${tool}" 被拒绝`;
  // write-approve：目标 app 白名单
  const app = targetAppOf(tool, params);
  if (app && !wildcardMatch(app, ALLOWED_APPS)) {
    return `[ocu-gateway] 目标窗口 "${app}" 不在白名单（${ALLOWED_APPS.join(', ')}），写操作被拒绝`;
  }
  return null;
}

// ── MCP 请求转发 ─────────────────────────────────────
rl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'tools/call') {
    const tool = msg.params && msg.params.name;
    const blocked = gateTool(tool, msg.params && msg.params.arguments);
    if (blocked) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: blocked }],
          isError: true,
        },
      });
      return;
    }
    if (tool) pendingGate.set(String(msg.id), tool);
  }
  child.stdin.write(line + '\n');
});

// ── MCP 响应转发 ─────────────────────────────────────
const childRl = createInterface({ input: child.stdout });
childRl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { send(line); return; }
  // 写类工具成功响应附门禁水印，便于审计
  if (msg.id && pendingGate.has(String(msg.id))) {
    const tool = pendingGate.get(String(msg.id));
    pendingGate.delete(String(msg.id));
    if (WRITE_TOOLS.has(tool) && msg.result && msg.result.content) {
      msg.result.content = msg.result.content.concat([
        { type: 'text', text: `[ocu-gateway] 写操作 ${tool} 已执行（白名单内）` },
      ]);
    }
  }
  send(msg);
});

child.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
