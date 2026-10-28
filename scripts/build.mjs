// Build script: bundles src/ with esbuild into dist/ (web app + PWA files).
// Usage: node scripts/build.mjs          -> production build into dist/
//        node scripts/build.mjs --serve  -> dev server on http://localhost:5173
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
const serve = process.argv.includes('--serve');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const buildId = version + '-' + Date.now().toString(36);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(root, 'public'), dist);

// Service worker gets a unique cache name per build so updates roll out.
const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8').replace('__BUILD_ID__', buildId);
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

const options = {
  entryPoints: [path.join(root, 'src', 'main.jsx'), path.join(root, 'src', 'styles.css')],
  bundle: true,
  outdir: path.join(dist, 'assets'),
  entryNames: '[name]',
  format: 'esm',
  target: ['chrome100', 'safari15', 'firefox100'],
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  minify: !serve,
  sourcemap: serve,
  define: {
    'process.env.NODE_ENV': serve ? '"development"' : '"production"',
    '__APP_VERSION__': JSON.stringify(version),
  },
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(dist, p);
    if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(5173, () => console.log('Dev server: http://localhost:5173'));
} else {
  await esbuild.build(options);
  console.log('Built', buildId, 'into', dist);
}
