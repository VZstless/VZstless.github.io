/**
 * Fetches the fonts used by the site.
 *
 * Two different things are needed:
 *
 * 1. Typst needs real font files (it cannot use a webfont), and they are much
 *    too large to keep in git, so they are downloaded on demand into
 *    `<root>/fonts`. That directory is one of the font paths passed to Typst by
 *    `scripts/compiler.js`, and it lives outside `static/`, so it is not
 *    deployed with the site. Only the Typst pipeline uses it.
 *
 * 2. Browsers need a webfont. It is *not* hotlinked from a third-party CDN: on
 *    networks where the CDN is slow or blocked the font silently fell back to
 *    Noto Serif on every page that is rendered from HTML (post lists, tags,
 *    search, markdown pages, ...), while pages whose body is rendered by Typst
 *    still showed the font baked into the SVG. Mirrored here instead: the
 *    unicode-range subsetted woff2 files are copied into
 *    `<root>/static/webfonts/lxgw-wenkai`, which is deployed with the site, so
 *    every page gets the font from the same origin. (`static/webfonts` rather
 *    than `static/fonts`, because the latter is a Typst font path and Typst
 *    must not pick up the browser-only woff2 chunks.)
 *
 * Downloads are cached (an existing file is left untouched) and resumable, as
 * the release assets are served slowly from some networks.
 */
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { resolve, join, dirname } = require('path');

const root = resolve(__dirname, '..');

const FONTS = [
  {
    name: 'LXGW WenKai Screen',
    file: 'LXGWWenKaiScreen.ttf',
    url: 'https://github.com/lxgw/LxgwWenKai-Screen/releases/download/v1.530/LXGWWenKaiScreen.ttf',
  },
];

// Mirrored into `static/`, so it ends up on the deployed site and is used by
// every page (see `templates/partials/header.html`). The stylesheet references
// its `./files/*.woff2` subsets with relative URLs, so the layout is kept as-is.
const WEB_FONT = {
  name: 'LXGW WenKai Screen (web)',
  cssUrl: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/lxgwwenkaiscreen.css',
  dir: resolve(root, 'static/webfonts/lxgw-wenkai'),
};

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

/**
 * Fetches `url` and returns its body, retrying a few times on failure.
 */
async function fetchBuffer(url, { attempts = 5 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'VZstless.github.io font fetcher' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const buf = Buffer.from(await res.arrayBuffer());
      // `content-length` describes the (possibly compressed) transfer body,
      // while `fetch` hands us the decoded bytes, so it is only comparable when
      // the response was not compressed.
      const expected = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length') ?? 0);
      if (expected > 0 && buf.length !== expected) {
        throw new Error(`incomplete download: ${buf.length} of ${expected} bytes`);
      }
      if (buf.length === 0) throw new Error('empty response');
      return buf;
    } catch (e) {
      lastError = e;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastError;
}

/**
 * Mirrors the unicode-range subsetted webfont (stylesheet + `.woff2` chunks)
 * into `static/`, so that it is deployed with the site instead of being loaded
 * from a third-party CDN at runtime.
 */
async function fetchWebFont() {
  const cssPath = join(WEB_FONT.dir, 'lxgwwenkaiscreen.css');

  let css;
  if (sizeOf(cssPath) > 0) {
    css = fs.readFileSync(cssPath, 'utf8');
  } else {
    css = (await fetchBuffer(WEB_FONT.cssUrl)).toString('utf8');
    fs.mkdirSync(dirname(cssPath), { recursive: true });
    fs.writeFileSync(cssPath, css);
    console.log(`[fonts] ${WEB_FONT.name}: stylesheet saved (${cssPath})`);
  }

  const files = [...new Set([...css.matchAll(/\.\/files\/([\w.-]+\.woff2)/g)].map((m) => m[1]))];
  const fileDir = join(WEB_FONT.dir, 'files');
  fs.mkdirSync(fileDir, { recursive: true });
  const missing = files.filter((file) => sizeOf(join(fileDir, file)) === 0);

  if (missing.length === 0) {
    console.log(`[fonts] ${WEB_FONT.name}: cached (${files.length} subsets)`);
    return;
  }

  // The subsets are small, but there are ~100 of them: fetch a few at a time.
  const baseUrl = WEB_FONT.cssUrl.replace(/[^/]+$/, 'files/');
  const queue = [...missing];
  let done = 0;
  const failed = [];

  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          const buf = await fetchBuffer(baseUrl + file);
          fs.writeFileSync(join(fileDir, file), buf);
          done += 1;
        } catch (e) {
          failed.push(`${file} (${e.message})`);
        }
      }
    }),
  );

  if (failed.length > 0) {
    const shown = failed.slice(0, 5).join(', ') + (failed.length > 5 ? ', ...' : '');
    console.warn(`[fonts] WARNING: ${failed.length}/${missing.length} ${WEB_FONT.name} subsets failed: ${shown}`);
    console.warn('[fonts] Browsers will fall back to the next font for the missing glyphs.');
  }
  console.log(`[fonts] ${WEB_FONT.name}: saved ${done} subsets to ${WEB_FONT.dir}`);
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

  try {
    await fetchWebFont();
  } catch (e) {
    console.warn(`[fonts] WARNING: failed to fetch the ${WEB_FONT.name} webfont (${WEB_FONT.cssUrl}): ${e.message}`);
    console.warn('[fonts] Browsers will fall back to the next font in the stack.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
