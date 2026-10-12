// [sovereign] Godot 版 AI 出图工具（移植自 cocos-mcp-bridge/lib/tools/image-gen.js）。
// 零引擎运行时依赖：仅依赖 VOLC_ARK_API_KEY（火山方舟）写 PNG/JPG 进 Godot 工程 assets/。
// Godot 4 在 rescan 时会自动为新增图片生成 .import，因此此处不手写 .meta/.import。
// 由 createImageGenTools({ createSchema, getRuntimeContext }) 注入聚合器。
//
// 多模态端点（2026-10-12 扩展，用户自备 key 即开箱）：
//   - 图像：火山方舟（默认，VOLC_ARK_API_KEY + VOLC_IMAGE_ENDPOINT=ep-xxx）
//           或通用 OpenAI 兼容 images/generations 端点
//           （GODOT_CODELY_IMAGE_BASE_URL + GODOT_CODELY_IMAGE_MODEL + GODOT_CODELY_IMAGE_API_KEY）
//   - 语音：GODOT_CODELY_TTS_BASE_URL + GODOT_CODELY_TTS_MODEL + GODOT_CODELY_TTS_API_KEY
//           （DashScope multimodal-generation 格式，qwen-audio-3.0-tts-plus 等）

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ESM shim：本包 package.json 为 "type":"module"，编译后无 __dirname/__filename。
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// 火山方舟（Volcengine Ark）文生图封装
// ---------------------------------------------------------------------------
const DEFAULT_BASE = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-5.0-lite-260128';
// 实测可用接入点（2026-08-15 验证出图成功）：本账号仅 ep- 接入点能出图，模型名直调必 404。
// 用户必须配置 VOLC_IMAGE_ENDPOINT 环境变量（火山方舟接入点 ID）

function loadEnvCandidates(): void {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(home, '.claude', 'skills', 'volcengine-generation', '.env'),
    path.join(home, '.arkcli', '.env'),
  ];
  for (const f of candidates) {
    if (!f || !fs.existsSync(f)) continue;
    try {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        const k = m[1];
        const v = m[2].trim().replace(/^["']|["']$/g, '');
        // ep- 接入点是可信信号：.env 里的 ep-xxx 覆盖进程级同名端点（避免不可用的通用 URL 遮蔽可用接入点）
        if (process.env[k] === undefined || (/^ep-/i.test(v) && k.toUpperCase().includes('ENDPOINT'))) {
          process.env[k] = v;
        }
      }
    } catch (_) { /* ignore unreadable .env */ }
  }
}
loadEnvCandidates();

function resolveTarget(): { url: string; model: string } {
  // 通用 OpenAI 兼容图像端点优先（GODOT_CODELY_IMAGE_*）
  const genericUrl = process.env.GODOT_CODELY_IMAGE_BASE_URL?.trim()
  if (genericUrl) {
    const model = process.env.GODOT_CODELY_IMAGE_MODEL?.trim()
    if (!model) throw new Error('已配置 GODOT_CODELY_IMAGE_BASE_URL 但缺 GODOT_CODELY_IMAGE_MODEL')
    return { url: genericUrl, model }
  }
  const rawEp = process.env.VOLC_IMAGE_ENDPOINT || process.env.VOLCENGINE_IMAGE_ENDPOINT || '';
  const ep = rawEp.trim();
  if (/^ep-/i.test(ep)) {
    return { url: DEFAULT_BASE, model: ep };
  }
  if (/^https?:\/\//i.test(ep)) {
    const m = process.env.VOLC_IMAGE_MODEL;
    if (m) return { url: ep, model: m };
    throw new Error('未配置火山方舟接入点。请设置环境变量 VOLC_IMAGE_ENDPOINT=ep-xxxx');
  }
  if (process.env.VOLC_IMAGE_MODEL) {
    return { url: DEFAULT_BASE, model: process.env.VOLC_IMAGE_MODEL };
  }
  throw new Error('未配置图像生成端点。可选：\n' +
    '  1) 火山方舟：VOLC_IMAGE_ENDPOINT=ep-xxxx + VOLC_ARK_API_KEY\n' +
    '  2) 通用 OpenAI 兼容：GODOT_CODELY_IMAGE_BASE_URL + GODOT_CODELY_IMAGE_MODEL + GODOT_CODELY_IMAGE_API_KEY\n' +
    '（当前 token-plan 套餐与火山模型直调均不可用，需用户自备可用端点）');
}

function genImage(opts: { prompt: string; width?: number; height?: number; apiKey?: string }): Promise<Buffer> {
  const genericKey = process.env.GODOT_CODELY_IMAGE_API_KEY
  const apiKey = opts.apiKey || genericKey || process.env.VOLC_ARK_API_KEY || process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    throw new Error(
      '未找到图像 API Key。可在 godot-mcp-server 的配置文件（godot-mcp-server.config.json 的 volcArkApiKey 字段）' +
      '或环境变量 GODOT_CODELY_IMAGE_API_KEY / VOLC_ARK_API_KEY / VOLCENGINE_API_KEY 中填写' +
      '（也可放一份含 VOLCENGINE_API_KEY 的 .env 到 ~/.claude/skills/volcengine-generation/.env）。'
    );
  }
  const { url, model } = resolveTarget();
  const width = opts.width || 1024;
  const height = opts.height || 1024;

  // 通用 OpenAI 兼容端点（images/generations：model/prompt/size/n）
  const generic = process.env.GODOT_CODELY_IMAGE_BASE_URL?.trim()
  const payload = generic
    ? {
        model,
        prompt: opts.prompt,
        size: `${width}x${height}`,
        n: 1,
      }
    : {
        req_key: 'high_aes_general',
        model,
        prompt: opts.prompt,
        width,
        height,
        use_prompt_embed: true,
        return_url: true,
        n: 1,
      };

  const body = JSON.stringify(payload);

  return new Promise<Buffer>((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error('图像 endpoint 非法: ' + url));
    }
    const req = https.request(
      u,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode! < 200 || res.statusCode! >= 300) {
            return reject(new Error(`图像 API HTTP ${res.statusCode}: ${text.slice(0, 600)}`));
          }
          try {
            const json = JSON.parse(text);
            const item = (json.data && json.data[0]) || {};
            const imgUrl = item.url || item.image_url || item.b64_json;
            if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) return fetchUrl(imgUrl).then(resolve, reject);
            if (typeof imgUrl === 'string') return resolve(Buffer.from(imgUrl, 'base64'));
            return reject(new Error('图像 API 返回无图像数据: ' + text.slice(0, 300)));
          } catch (e: any) {
            return reject(new Error('解析图像响应失败: ' + e.message + ' / ' + text.slice(0, 300)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'https:' ? https : http;
    client.get(u, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode! < 200 || res.statusCode! >= 300) {
          return reject(new Error(`拉取图像 URL HTTP ${res.statusCode}`));
        }
        resolve(Buffer.concat(chunks));
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Godot 资产落盘：写 PNG/JPG（不写 .meta，Godot 自动 import）
// ---------------------------------------------------------------------------
function uuidHex(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function imageSize(buf: Buffer): [number, number] {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) {
    if (buf.length < 24) throw new Error('PNG 文件过短');
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return jpegSize(buf);
  }
  throw new Error('非 PNG/JPEG 文件，无法读取尺寸');
}

function jpegSize(buf: Buffer): [number, number] {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return [w, h];
    }
    const len = buf.readUInt16BE(i + 2);
    if (len <= 0) throw new Error('JPEG 尺寸解析失败');
    i += 2 + len;
  }
  throw new Error('JPEG 尺寸解析失败');
}

function writeAsset(targetDir: string, fileBase: string, buf: Buffer): { path: string; width: number; height: number; uuid: string } {
  fs.mkdirSync(targetDir, { recursive: true });
  const [w, h] = imageSize(buf);
  const isPng = buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47;
  const ext = isPng ? 'png' : 'jpg';
  const imgPath = path.join(targetDir, `${fileBase}.${ext}`);
  fs.writeFileSync(imgPath, buf);
  return { path: imgPath, width: w, height: h, uuid: uuidHex() };
}

// ---------------------------------------------------------------------------
// 提示词组装 + 工具定义
// ---------------------------------------------------------------------------
function buildPrompt(a: { prompt?: string; style_anchor?: string; ui_mode?: boolean }): string {
  let p = a.prompt || '';
  if (a.style_anchor) p = `${a.style_anchor}，${p}`;
  if (a.ui_mode) {
    p += '，游戏 UI 图标，居中构图，透明背景，统一描边，清晰边缘，扁平或像素风';
  } else {
    p += '，透明背景，游戏资产设定图，高清 PNG';
  }
  return p;
}

async function generateImageInternal(args: any): Promise<string> {
  const size = Array.isArray(args.size) ? args.size : [1024, 1024];
  const width = size[0] || 1024;
  const height = size[1] || 1024;
  const prompt = buildPrompt(args);

  // 面板/配置文件填写的 key 优先于环境变量（getRuntimeContext().config.volcArkApiKey）
  const runtimeContext = args.getRuntimeContext ? args.getRuntimeContext() : undefined;
  const panelApiKey = runtimeContext && runtimeContext.config && runtimeContext.config.volcArkApiKey;

  const buf = await genImage({ prompt, width, height, apiKey: panelApiKey });

  const projectRoot = args.project_root || (args.getRuntimeContext && args.getRuntimeContext().projectPath) || process.cwd();
  const targetDir = args.target_dir
    ? path.resolve(args.target_dir)
    : path.join(projectRoot, 'assets', 'textures');
  const fileBase = `${args.category || 'prop'}_${args.name || 'asset'}`;

  const out = writeAsset(targetDir, fileBase, buf);
  return (
    `✅ 已生成「${fileBase}」\n` +
    `尺寸: ${out.width}x${out.height}\n` +
    `图片: ${out.path}\n` +
    `（Godot 4 会在 rescan 时自动生成 .import，无需手写 meta）\n` +
    `工程根: ${projectRoot}`
  );
}

// ---------------------------------------------------------------------------
// 语音合成（TTS）：DashScope multimodal-generation 格式（qwen-audio-3.0-tts-plus 等）
// 配置：GODOT_CODELY_TTS_BASE_URL（默认 dashscope multimodal-generation）
//       GODOT_CODELY_TTS_MODEL + GODOT_CODELY_TTS_API_KEY + GODOT_CODELY_TTS_VOICE
// ---------------------------------------------------------------------------
function postJson(url: string, key: string, payload: any, timeoutMs = 120000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(url); } catch (e) { return reject(new Error('TTS endpoint 非法: ' + url)); }
    const body = JSON.stringify(payload);
    const req = https.request(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('TTS 请求超时')));
    req.write(body);
    req.end();
  });
}

async function generateTtsInternal(args: any): Promise<string> {
  const baseUrl = process.env.GODOT_CODELY_TTS_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  const model = process.env.GODOT_CODELY_TTS_MODEL?.trim() || 'qwen-audio-3.0-tts-plus'
  const apiKey = process.env.GODOT_CODELY_TTS_API_KEY?.trim() || ''
  const voice = process.env.GODOT_CODELY_TTS_VOICE?.trim() || args.voice || 'Cherry'
  if (!apiKey) {
    throw new Error(
      '未配置 TTS API Key。设置环境变量 GODOT_CODELY_TTS_API_KEY（+ GODOT_CODELY_TTS_MODEL / GODOT_CODELY_TTS_BASE_URL）。\n' +
      '注意：token-plan 套餐的 qwen-audio 模型当前无法经网关调用，需自备支持多模态的 DashScope/百炼 key。'
    )
  }
  const text = args.text || ''
  if (!text) throw new Error('text 必填')
  const sampleRate = args.sample_rate || 24000
  const format = args.format || 'wav'

  const r = await postJson(baseUrl, apiKey, {
    model,
    input: { text, voice },
    parameters: { format, sample_rate: sampleRate },
  })
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`TTS API HTTP ${r.status}: ${r.text.slice(0, 600)}`)
  }
  const json = JSON.parse(r.text)
  const out = json.output || {}
  let audioBuf: Buffer | null = null
  if (out.audio) audioBuf = Buffer.from(out.audio, 'base64')
  else if (out.url) audioBuf = await fetchUrl(out.url)
  if (!audioBuf) throw new Error('TTS 返回无音频数据: ' + r.text.slice(0, 300))

  const projectRoot = args.project_root || (args.getRuntimeContext && args.getRuntimeContext().projectPath) || process.cwd()
  const targetDir = args.target_dir ? path.resolve(args.target_dir) : path.join(projectRoot, 'assets', 'audio')
  fs.mkdirSync(targetDir, { recursive: true })
  const fileBase = `${args.name || 'voice'}_${uuidHex().slice(0, 8)}`
  const ext = format === 'mp3' ? 'mp3' : 'wav'
  const outPath = path.join(targetDir, `${fileBase}.${ext}`)
  fs.writeFileSync(outPath, audioBuf)
  return `✅ 已生成语音「${fileBase}.${ext}」\n文本: ${text.slice(0, 60)}\n音频: ${outPath}\n工程根: ${projectRoot}`
}

// 返回符合 MCP JSON Schema 的工具定义（供聚合器 ListTools 直出）
export function createImageGenTools(getRuntimeContext?: () => any): any[] {
  const run = (args: any) => generateImageInternal({ ...args, getRuntimeContext });
  return [
    {
      name: 'generate_sprite',
      description: '[image] 生成 2D 游戏精灵（角色/敌人/道具/头像），写入 Godot 工程 assets/，返回路径。需 VOLC_ARK_API_KEY。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '自然语言描述，如 "绿色史莱姆，正面，透明背景"' },
          category: { type: 'string', enum: ['char', 'enemy', 'prop', 'ui', 'fx', 'bg'], description: '命名前缀', default: 'prop' },
          name: { type: 'string', description: '资产名，如 slime_green' },
          size: { type: 'array', items: { type: 'number' }, description: '默认 [1024,1024]' },
          style_anchor: { type: 'string', description: '风格锚词（同项目必带，保证一致性）' },
          ui_mode: { type: 'boolean', description: 'UI 图标专用构图' },
          target_dir: { type: 'string', description: '落盘目录，默认 <project>/assets/textures' },
          project_root: { type: 'string', description: 'Godot 工程根，默认运行时项目路径或 cwd' },
        },
        required: ['prompt', 'name'],
      },
      handler: async (args: any) => run(args),
    },
    {
      name: 'generate_image',
      description: '[image] 生成任意图像（概念/场景/宣发/UI），写入 Godot 工程 assets/。ui_mode=true 用 UI 专用构图。需 VOLC_ARK_API_KEY。',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          size: { type: 'array', items: { type: 'number' } },
          style_anchor: { type: 'string' },
          ui_mode: { type: 'boolean', description: 'UI 图标/UI 图专用构图（居中、透明、统一描边）' },
          target_dir: { type: 'string' },
          project_root: { type: 'string' },
        },
        required: ['prompt'],
      },
      handler: async (args: any) => run(args),
    },
    {
      name: 'text_to_speech',
      description: '[audio] 语音合成（TTS）：把文本转成 wav/mp3 写入 Godot 工程 assets/audio/。需 GODOT_CODELY_TTS_API_KEY（自备支持多模态的 DashScope/百炼 key）。',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要合成的文本' },
          voice: { type: 'string', description: '音色，默认环境变量 GODOT_CODELY_TTS_VOICE 或 Cherry' },
          format: { type: 'string', enum: ['wav', 'mp3'], default: 'wav' },
          sample_rate: { type: 'number', default: 24000 },
          name: { type: 'string', description: '文件名前缀' },
          target_dir: { type: 'string', description: '落盘目录，默认 <project>/assets/audio' },
          project_root: { type: 'string', description: 'Godot 工程根' },
        },
        required: ['text'],
      },
      handler: async (args: any) => generateTtsInternal({ ...args, getRuntimeContext }),
    },
  ];
}
