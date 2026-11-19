/**
 * Fetches the fonts used by the Typst pipeline.
 *
 * Typst needs real font files (it cannot use the webfont served to browsers),
 * and they are much too large to keep in git, so they are downloaded on demand
 * into `<root>/fonts`. That directory is one of the font paths passed to Typst
 * by `scripts/compiler.js`, and it lives outside `static/`, so it is not
 * deployed with the site.
 *
 * Downloads are cached (an existing file is left untouched) and resumable, as
 * the release assets are served slowly from some networks.
 */
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { resolve, join } = require('path');

const root = resolve(__dirname, '..');

const FONTS = [
  {
    name: 'LXGW WenKai Screen',
    file: 'LXGWWenKaiScreen.ttf',
    url: 'https://github.com/lxgw/LxgwWenKai-Screen/releases/download/v1.530/LXGWWenKaiScreen.ttf',
  },
];

function sizeOf(path) {
  try {
    return fs.statSync(path).size;
  } catch {
    return 0;
  }
}

function humanSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

/**
 * Downloads `url` to `dest`, resuming from `<dest>.part` if a previous attempt
 * was interrupted. Retries until the expected number of bytes has arrived.
 */
async function downloadWithResume(url, dest, { attempts = 8, idleTimeout = 60000 } = {}) {
  const tmp = `${dest}.part`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Bytes already on disk are kept across attempts.
    let start = sizeOf(tmp);
    const headers = { 'User-Agent': 'VZstless.github.io font fetcher' };
    if (start > 0) headers.Range = `bytes=${start}-`;

    const controller = new AbortController();
    let idleTimer = setTimeout(() => controller.abort(), idleTimeout);
    const keepAlive = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), idleTimeout);
    };

    try {
      const res = await fetch(url, { redirect: 'follow', headers, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      // A server that ignores `Range` answers 200 and restarts from scratch.
      const appending = start > 0 && res.status === 206;
      if (!appending) start = 0;

      const expected = start + Number(res.headers.get('content-length') ?? 0);

      const out = fs.createWriteStream(tmp, { flags: appending ? 'a' : 'w' });
      const body = Readable.fromWeb(res.body);
      body.on('data', keepAlive);
      await pipeline(body, out);
      clearTimeout(idleTimer);

      const got = sizeOf(tmp);
      if (expected > 0 && got < expected) {
        throw new Error(`incomplete download: ${humanSize(got)} of ${humanSize(expected)}`);
      }

      fs.renameSync(tmp, dest);
      return got;
    } catch (e) {
      clearTimeout(idleTimer);
      lastError = e;
      const got = sizeOf(tmp);
      console.warn(
        `[fonts] attempt ${attempt}/${attempts} failed: ${e.message}` +
          (got > 0 ? ` (kept ${humanSize(got)}, resuming)` : ''),
      );
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  throw lastError;
}

async function main() {
  const fontDir = resolve(root, 'fonts');
  fs.mkdirSync(fontDir, { recursive: true });

  for (const font of FONTS) {
    const dest = join(fontDir, font.file);

    if (sizeOf(dest) > 0) {
      console.log(`[fonts] ${font.name}: cached (${font.file})`);
      continue;
    }

    console.log(`[fonts] ${font.name}: downloading ${font.url}`);
    try {
      const size = await downloadWithResume(font.url, dest);
      console.log(`[fonts] ${font.name}: saved ${humanSize(size)} to ${dest}`);
    } catch (e) {
      console.warn(`[fonts] WARNING: failed to download ${font.name} (${font.url}): ${e.message}`);
      console.warn('[fonts] Typst will fall back to the next font in the stack.');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
