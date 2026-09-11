const fs = require('fs');
const { resolve, join, basename, extname, dirname, relative } = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { Compiler } = require('./compiler');
const toml = require('toml');

const root = resolve(__dirname, '../');

const fontPaths = [
  resolve(root, 'fonts'),
  resolve(root, 'assets/fonts'),
  resolve(root, 'asset/fonts'),
  resolve(root, 'static/fonts'),
  resolve(root, 'themes/apollo/static/fonts')
]

const themes = ['light', 'dark'];

function printWithDepth(depth, ...args) {
  if(depth > 0) {
    depth -= 1;
    console.log('    '.repeat(depth) + '|---', ...args);
  }
}

function isWorkspace(dir) {
  const res = fs.readdirSync(dir, { withFileTypes: true })
    .find((d) => 
        d.isFile() && (
          d.name === 'main.typ' || d.name === 'build-config.toml'
        )
    );
  return res;
}

function parseBuildConfig(path) {
  const content = fs.readFileSync(path);
  const config = toml.parse(content);

  let res = {};

  for (const [name, { entry }] of Object.entries(config.entries)) {
    res[name] = entry
  }

  return res;
}

function compileEntry(compiler, typstRoot, entry, artifactRoot, outputPath, depth) {
  compiler.evictCache();
  const entryPath = join(typstRoot, entry);
  const artifactPath = join(artifactRoot, outputPath);
  for (const theme of themes) {
    printWithDepth(depth + 1, 'Theme:', theme);
    fs.mkdirSync(join(artifactPath, theme), { recursive: true });
    
    const vec = compiler.vector(entryPath, theme);

    fs.writeFileSync(join(artifactPath, theme, 'main.multi.sir.in'), vec);
  }

  printWithDepth(depth + 1, 'PDF:');
  const pdf = compiler.pdf(entryPath);
  fs.writeFileSync(join(artifactPath, 'main.pdf'), pdf);
}

function compileWorkspace(compiler, typstRoot, path, artifactRoot, depth) {
  fs.mkdirSync(join(artifactRoot, path), { recursive: true });
  printWithDepth(depth, 'Compile Workspace: ', path);
  const workspacePath = join(typstRoot, path);

  const configPath = fs.readdirSync(workspacePath, { withFileTypes: true })
    .find((d) => 
        d.isFile() && d.name === 'build-config.toml'
    );

  if (configPath) {
    const config = parseBuildConfig(join(workspacePath, 'build-config.toml'));
    for (const [name, entry] of Object.entries(config)) {
      const entryPath = join(path, entry);
      printWithDepth(depth + 1, `Compile: ${entryPath}:${name}`);
      compileEntry(compiler, typstRoot, join(path, entry), artifactRoot, join(path, name), depth + 1);
    }
  } else {
    const mainPath = join(path, 'main.typ')
    printWithDepth(depth + 1, 'Compile:', mainPath);
    compileEntry(compiler, typstRoot, mainPath, artifactRoot, path, depth + 1);
  }
}

function compileFile(compiler, typstRoot, path, name, artifactRoot, depth) {
  const base = basename(name, '.typ');
  const filePath = join(path, name);
  printWithDepth(depth, 'Compile:', filePath);
  compileEntry(compiler, typstRoot, filePath, artifactRoot, join(path, base), depth);
}

/// Downloads a file with a timeout.
async function downloadFile(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'VZstless.github.io avatar fetcher' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/// Detects the image format from magic bytes.
function sniffImage(buf) {
  if (buf.length > 8 && buf[0] == 0x89 && buf.subarray(1, 4).toString('latin1') == 'PNG') return 'png';
  if (buf.length > 3 && buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff) return 'jpg';
  if (buf.length > 6 && buf.subarray(0, 3).toString('latin1') == 'GIF') return 'gif';
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString('latin1') == 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') == 'WEBP'
  ) return 'webp';
  if (buf.subarray(0, 512).toString('latin1').includes('<svg')) return 'svg';
  throw new Error('unsupported/unknown image format');
}

/// Downloads avatars referenced by `friends.toml` manifests into a local,
/// gitignored cache, and writes `avatars.json` (a list of cache paths, in the
/// same order as the `[[friend]]` entries) next to each manifest. Entries
/// without an avatar or with an unreachable URL map to `null`, for which the
/// Typst page renders a placeholder.
async function prefetchAvatars(typstDir) {
  const manifests = [];
  (function walk(dir) {
    for (const p of fs.readdirSync(dir, { withFileTypes: true })) {
      if (p.name === 'avatars') continue; // the cache directory itself
      const full = join(dir, p.name);
      if (p.isDirectory()) walk(full);
      else if (p.name === 'friends.toml') manifests.push(full);
    }
  })(typstDir);

  for (const manifestPath of manifests) {
    const workspaceDir = dirname(manifestPath);
    const avatarDir = join(workspaceDir, 'avatars');
    fs.mkdirSync(avatarDir, { recursive: true });

    const friends = toml.parse(fs.readFileSync(manifestPath, 'utf-8')).friend || [];
    console.log('[avatars]', manifestPath, `(${friends.length} friends)`);

    const resolved = [];
    for (const friend of friends) {
      const url = friend.avatar;
      if (!url) {
        resolved.push(null);
        continue;
      }

      // Deterministic cache name, so re-builds skip known avatars.
      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
      const cached = fs
        .readdirSync(avatarDir)
        .find(name => name.startsWith(hash + '.'));
      if (cached) {
        resolved.push(join(avatarDir, cached));
        continue;
      }

      try {
        const buf = await downloadFile(url);
        const ext = sniffImage(buf);
        const file = join(avatarDir, `${hash}.${ext}`);
        fs.writeFileSync(file, buf);
        console.log('  [avatars] downloaded:', friend.name, '->', url);
        resolved.push(file);
      } catch (e) {
        console.warn(`  [avatars] WARNING: failed to fetch avatar for "${friend.name}" (${url}): ${e.message}`);
        resolved.push(null);
      }
    }

    // Paths are relative to the directory of the manifest (the Typst
    // workspace of the friends page), since Typst resolves file paths
    // relative to the main file.
    fs.writeFileSync(
      join(workspaceDir, 'avatars.json'),
      JSON.stringify(resolved.map(p => (p == null ? null : relative(workspaceDir, p))), null, 2)
    );
  }
}

function compileDirectory(compiler, typstRoot, dir, artifactRoot, depth = 0) {
  printWithDepth(depth, 'Compile Dir: ', dir);

  for (const p of fs.readdirSync(join(typstRoot, dir), { withFileTypes: true })) {
    const subPath = join(dir, p.name);
    if(p.isFile()) {
      if(extname(p.name) === '.typ') {
        compileFile(compiler, typstRoot, dir, p.name, artifactRoot, depth + 1);
      } else {
        printWithDepth(depth + 1, 'Skip:', subPath);
      }
    } else if(isWorkspace(join(typstRoot, subPath))) {
      compileWorkspace(compiler, typstRoot, subPath, artifactRoot, depth + 1);
    } else {
      compileDirectory(compiler, typstRoot, subPath, artifactRoot, depth + 1);
    }
  }
}

async function main() {
  const typstDir = resolve(root, 'typ');
  /// Creates artifact directory
  const artifactRoot = resolve(root, 'static/typst');
  fs.mkdirSync(artifactRoot, { recursive: true });
  /// Links Apollo package
  try {
    execSync(`typst-ts-cli package link --manifest ${root}/packages/typst-apollo/typst.toml`);
  } catch {}

  console.log('[typst] using fonts:');
  for (const fontPath of fontPaths) {
    console.log(`- ${fontPath}`);
  }

  const compiler = new Compiler({ baseDir: root, fontPaths: fontPaths });

  await prefetchAvatars(typstDir);

  compileDirectory(compiler, typstDir, '.', artifactRoot);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
