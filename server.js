// خادم ربط CODEWAY مع Kling AI (بدون أي مكتبات خارجية)
// يحتفظ بالمفاتيح السرية على الخادم ويوقّع الطلبات بـ JWT قبل إرسالها إلى Kling.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const ACCESS_KEY = process.env.KLING_ACCESS_KEY || '';
const SECRET_KEY = process.env.KLING_SECRET_KEY || '';
const API_BASE = (process.env.KLING_API_BASE || 'https://api-singapore.klingai.com').replace(/\/+$/, '');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- JWT (HS256) ----------
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createKlingToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: ACCESS_KEY, exp: now + 1800, nbf: now - 5 };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${signature}`;
}

// ---------- Kling API ----------
async function klingRequest(method, apiPath, body) {
  const res = await fetch(API_BASE + apiPath, {
    method,
    headers: {
      Authorization: `Bearer ${createKlingToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { code: res.status, message: text }; }
  return { status: res.status, json };
}

// الأنواع المسموح بها: نص→فيديو، صورة→فيديو، نص→صورة
const TASK_TYPES = {
  text2video: '/v1/videos/text2video',
  image2video: '/v1/videos/image2video',
  image: '/v1/images/generations',
};

function buildPayload(type, input) {
  const prompt = String(input.prompt || '').trim().slice(0, 2500);
  const negative = String(input.negative_prompt || '').trim().slice(0, 2500);
  const aspect = ['16:9', '9:16', '1:1'].includes(input.aspect_ratio) ? input.aspect_ratio : '16:9';

  if (type === 'image') {
    if (!prompt) throw new Error('يرجى كتابة وصف للصورة');
    const n = Math.min(Math.max(parseInt(input.n, 10) || 1, 1), 4);
    return { model_name: input.model_name || 'kling-v1', prompt, negative_prompt: negative || undefined, n, aspect_ratio: aspect };
  }

  const base = {
    model_name: input.model_name || 'kling-v1',
    prompt,
    negative_prompt: negative || undefined,
    mode: input.mode === 'pro' ? 'pro' : 'std',
    duration: input.duration === '10' ? '10' : '5',
    cfg_scale: 0.5,
  };
  if (type === 'text2video') {
    if (!prompt) throw new Error('يرجى كتابة وصف للفيديو');
    return { ...base, aspect_ratio: aspect };
  }
  // image2video: صورة كرابط URL أو Base64 (بدون البادئة data:)
  let image = String(input.image || '').trim();
  if (!image) throw new Error('يرجى إضافة صورة');
  image = image.replace(/^data:image\/[a-z]+;base64,/i, '');
  return { ...base, image };
}

// ---------- HTTP helpers ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('حجم الطلب كبير جداً')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('صيغة JSON غير صحيحة')); }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('غير موجود'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- Router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean); // ['api','kling',type,(taskId)]

  if (parts[0] !== 'api') return serveStatic(req, res, url.pathname);

  if (url.pathname === '/api/kling/status' && req.method === 'GET') {
    return sendJson(res, 200, { configured: Boolean(ACCESS_KEY && SECRET_KEY), apiBase: API_BASE });
  }

  if (parts[1] !== 'kling' || !TASK_TYPES[parts[2]]) return sendJson(res, 404, { message: 'مسار غير معروف' });
  if (!ACCESS_KEY || !SECRET_KEY) {
    return sendJson(res, 500, { message: 'لم يتم ضبط مفاتيح Kling. أضف KLING_ACCESS_KEY و KLING_SECRET_KEY في ملف .env' });
  }

  const type = parts[2];
  const taskId = parts[3];
  try {
    if (req.method === 'POST' && !taskId) {
      const payload = buildPayload(type, await readBody(req));
      const { status, json } = await klingRequest('POST', TASK_TYPES[type], payload);
      return sendJson(res, status, json);
    }
    if (req.method === 'GET' && taskId) {
      if (!/^[\w-]{1,128}$/.test(taskId)) return sendJson(res, 400, { message: 'معرّف المهمة غير صالح' });
      const { status, json } = await klingRequest('GET', `${TASK_TYPES[type]}/${taskId}`);
      return sendJson(res, status, json);
    }
    return sendJson(res, 405, { message: 'طريقة غير مدعومة' });
  } catch (err) {
    return sendJson(res, 400, { message: err.message || 'حدث خطأ' });
  }
});

// ---------- .env loader ----------
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`CODEWAY × Kling AI يعمل على http://localhost:${PORT}`);
    if (!ACCESS_KEY || !SECRET_KEY) console.warn('تنبيه: مفاتيح Kling غير مضبوطة بعد (.env)');
  });
}

module.exports = { createKlingToken, buildPayload, server };
