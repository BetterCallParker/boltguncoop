// Builds dist/lanternbound.html: the whole game (client, the in-browser copy of the
// authoritative simulation and three.js) in one self-contained page that plays offline,
// solo or couch co-op. `npm run demo`
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}`;
// three.js stays external (loaded from the CDN through an import map); /shared/ maps to disk
const paths = {
  name: 'lanternbound-paths',
  setup(b) {
    b.onResolve({ filter: /^\/shared\// }, (a) => ({ path: path.join(ROOT, a.path) }));
    b.onResolve({ filter: /^three(\/.*)?$/ }, (a) => ({ path: a.path, external: true }));
  },
};

const out = await esbuild.build({
  entryPoints: [path.join(ROOT, 'client/js/main.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2020', legalComments: 'none', plugins: [paths],
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'client/style.css'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');
const body = index.slice(index.indexOf('<body>') + 6, index.indexOf('</body>')).replace(/<script type="module" src="js\/main.js"><\/script>/, '');
const fonts = index.match(/<link href="https:\/\/fonts.googleapis.com[^>]*>/)[0];
const html = `<title>Lanternbound</title>
<meta name="description" content="A co-op Vampire-Survivors-like in an HD-2D style." />
${fonts}
<script type="importmap">{ "imports": { "three": "${CDN}/build/three.module.js", "three/addons/": "${CDN}/examples/jsm/" } }</script>
<style>:root { color-scheme: dark; }
${css}</style>
${body.trim()}
<script>window.LB_OFFLINE = true;</script>
<script type="module">${js}</script>
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/lanternbound.html'), html);
console.log(`dist/lanternbound.html  ${(html.length / 1024).toFixed(0)} KB`);
