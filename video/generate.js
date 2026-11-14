// يولّد لقطات السيناريو على Kling ويحمّلها إلى video/clips/<id>.mp4
// الاستخدام: node video/generate.js [رقم اللقطة ...]
// المصادقة: KLING_TOKEN (توكن جاهز) أو KLING_ACCESS_KEY + KLING_SECRET_KEY عبر server.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { createKlingToken } = require(path.join(ROOT, 'server.js'));
const API = (process.env.KLING_API_BASE || 'https://api-singapore.klingai.com').replace(/\/+$/, '');
const MODEL = process.env.KLING_MODEL || 'kling-v2-1-master';
const OUT = path.join(__dirname, 'clips');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'shots.json'), 'utf8'));

const token = () => process.env.KLING_TOKEN || createKlingToken();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) throw new Error(`${res.status} ${json.code}: ${json.message}`);
  return json.data;
}

async function makeShot(shot) {
  const file = path.join(OUT, `${shot.id}.mp4`);
  if (fs.existsSync(file)) { console.log(`[${shot.id}] موجودة مسبقاً`); return; }
  const data = await call('POST', '/v1/videos/text2video', {
    model_name: MODEL,
    prompt: shot.prompt,
    negative_prompt: cfg.negative_prompt,
    mode: process.env.KLING_MODE || 'std',
    aspect_ratio: '16:9',
    duration: '5',
    cfg_scale: 0.5,
  });
  console.log(`[${shot.id}] أُرسلت: ${data.task_id}`);
  for (;;) {
    await wait(15000);
    const t = await call('GET', `/v1/videos/text2video/${data.task_id}`);
    if (t.task_status === 'failed') throw new Error(`[${shot.id}] فشلت: ${t.task_status_msg}`);
    if (t.task_status === 'succeed') {
      const url = t.task_result.videos[0].url;
      const vid = await fetch(url);
      fs.writeFileSync(file, Buffer.from(await vid.arrayBuffer()));
      console.log(`[${shot.id}] تم ← ${path.relative(ROOT, file)}`);
      return;
    }
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const shots = cfg.shots.filter((s) => !only.length || only.includes(s.id));
  const results = await Promise.allSettled(shots.map((s, i) => wait(i * 2000).then(() => makeShot(s))));
  results.forEach((r, i) => r.status === 'rejected' && console.error(`[${shots[i].id}] خطأ: ${r.reason.message}`));
  if (results.some((r) => r.status === 'rejected')) process.exit(1);
})();
