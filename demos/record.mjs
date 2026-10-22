// Records every scene in demos/stage.html to its own video, plus one combined video.
//
//   node demos/record.mjs                 all scenes
//   node demos/record.mjs recall-first    just the named scenes
//
// Needs Chrome or Chromium and ffmpeg. No npm packages: Chrome is driven over its
// DevTools protocol with Node's built-in WebSocket. Set CHROME to the browser's path
// if it is not found automatically.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_VIDEO = join(HERE, 'videos');
const OUT_GIF = join(HERE, 'gifs');
const WIDTH = 1280, HEIGHT = 720, SCALE = 1.5;   // recorded at 1920x1080
const PORT = 9333;

function findChrome() {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    join(local, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const pw = join(local, 'ms-playwright');
  if (existsSync(pw)) {
    for (const d of readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(join(pw, d, 'chrome-win64/chrome.exe'), join(pw, d, 'chrome-win/chrome.exe'));
    }
  }
  const found = candidates.find(p => p && existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME to its path');
  return found;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not open its debugging port');
}

function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map(), listeners = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      (listeners.get(msg.method) || []).forEach(fn => fn(msg.params));
    }
  };
  return new Promise(res => ws.onopen = () => res({
    send: (method, params = {}) => new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    }),
    on: (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]),
    close: () => ws.close(),
  }));
}

async function evaluate(page, expression) {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}

// Frames arrive only when the screen changes, each with a timestamp; the concat
// list holds every frame for as long as it was on screen.
function encode(frames, dir, name, end) {
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1] ? frames[i + 1].t : end;
    lines.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${Math.max(next - f.t, 0.001).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  const list = join(dir, 'frames.txt');
  writeFileSync(list, lines.join('\n'));
  const mp4 = join(OUT_VIDEO, `${name}.mp4`);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', mp4]);
  ffmpeg(['-i', mp4, '-vf',
    'fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    join(OUT_GIF, `${name}.gif`)]);
  return mp4;
}

async function main() {
  mkdirSync(OUT_VIDEO, { recursive: true });
  mkdirSync(OUT_GIF, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'clozed-mcq-chrome-'));
  const chrome = spawn(findChrome(), [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    const page = await cdp(await connect());
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false });
    await page.send('Page.navigate', { url: pathToFileURL(join(HERE, 'stage.html')).href });
    for (let i = 0; i < 50 && !(await evaluate(page, 'window.stageReady === true')); i++) await sleep(100);

    const ids = await evaluate(page, 'window.SCENE_IDS');
    const wanted = process.argv.slice(2);
    let frames = [], dir = null;
    page.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      if (!dir) return;
      const file = join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ file, t: metadata.timestamp });
    });

    const clips = [];
    for (const [i, id] of ids.entries()) {
      if (wanted.length && !wanted.includes(id)) continue;
      const name = `${String(i).padStart(2, '0')}-${id}`;
      dir = mkdtempSync(join(tmpdir(), `clozed-mcq-${id}-`));
      frames = [];
      await evaluate(page, `stage.reset(0, 0, ''); stage.setNote({ text: '' }); true`);
      await sleep(300);
      await page.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: WIDTH * SCALE, maxHeight: HEIGHT * SCALE, everyNthFrame: 1 });
      await sleep(250);
      frames = frames.slice(-1);   // start from the reset screen
      await evaluate(page, `play(${i})`);
      // Frame timestamps are wall-clock seconds; the last frame lasts until the scene ends
      const end = await evaluate(page, 'Date.now() / 1000') + 0.3;
      await sleep(400);
      await page.send('Page.stopScreencast');
      const keep = dir;
      dir = null;
      if (frames.length < 2) throw new Error(`no frames captured for ${id}`);
      const last = frames[frames.length - 1].t;
      clips.push(encode(frames, keep, name, end > last && end - last < 60 ? end : last + 0.5));
      rmSync(keep, { recursive: true, force: true });
      console.log(`recorded ${name} (${frames.length} frames)`);
    }

    if (!wanted.length) {
      const list = join(profile, 'clips.txt');
      writeFileSync(list, clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
      ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', join(OUT_VIDEO, 'all-features.mp4')]);
      console.log('recorded all-features.mp4');
    }
    page.close();
  } finally {
    chrome.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
