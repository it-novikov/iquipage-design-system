/**
 * Bundle-size ratchet (ENG-01/ENG-03 budget, wave 0). Measures gzip sizes of the built
 * dist after `npm run build`; the baseline stores today's numbers and the test allows
 * at most +2% growth. Real budgets replace the ratchet in a later wave.
 *
 *   node scripts/gates/size.mjs            print current sizes
 *   node scripts/gates/size.mjs --write    rewrite scripts/gates/size-baseline.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const baselinePath = path.join(root, 'scripts/gates/size-baseline.json');
export const TOLERANCE = 0.02;

const gzip = file => gzipSync(fs.readFileSync(path.join(root, file))).length;
const imports = file => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/^import\s+[\w$]+\s+from\s+'\.\/([^']+)';/gm)].map(m => m[1]);

/** dist/core.js plus every dist/modules file it imports transitively. */
export function coreClosure() {
  const files = ['dist/core.js'], queue = imports('dist/core.js').map(f => 'dist/' + f);
  while (queue.length) {
    const f = queue.shift();
    if (files.includes(f)) continue;
    files.push(f);
    for (const dep of imports(f)) queue.push(path.posix.join(path.posix.dirname(f), dep));
  }
  return files;
}

export function measure() {
  for (const f of ['dist/core.js', 'dist/iquipage.css', 'dist/modules/icons.js']) if (!fs.existsSync(path.join(root, f))) throw new Error(`${f} is missing: run \`npm run build\` first`);
  const closure = coreClosure();
  const files = Object.fromEntries(closure.map(f => [f, gzip(f)]));
  return {
    'core-closure-gzip': Object.values(files).reduce((a, b) => a + b, 0),
    'iquipage-css-gzip': gzip('dist/iquipage.css'),
    'icons-gzip': gzip('dist/modules/icons.js'),
    coreClosureFiles: closure.length,
    files,
  };
}
export const METRICS = ['core-closure-gzip', 'iquipage-css-gzip', 'icons-gzip'];

export function buildBaseline(m = measure()) {
  return { note: 'gzip bytes of the built dist today (ENG-01/03 ratchet: +2% max). Regenerate after a deliberate change: npm run gates:update.', tolerance: TOLERANCE, ...m };
}
export function readBaseline() { return fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null; }
export function writeBaseline(m = measure()) { fs.writeFileSync(baselinePath, JSON.stringify(buildBaseline(m), null, 2) + '\n'); return baselinePath; }

/** @returns rows {metric, current, baseline, limit, ok} */
export function check(m, baseline) {
  return METRICS.map(metric => { const b = baseline[metric], limit = Math.floor(b * (1 + (baseline.tolerance ?? TOLERANCE))); return { metric, current: m[metric], baseline: b, limit, ok: m[metric] <= limit }; });
}
export const format = rows => rows.map(r => `${r.metric.padEnd(20)} ${String(r.current).padStart(8)} B  (baseline ${r.baseline}, limit ${r.limit}) ${r.ok ? 'ok' : 'OVER'}`).join('\n');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = measure();
  if (process.argv.includes('--write')) console.log(`Wrote ${writeBaseline(m)}`);
  else { const b = readBaseline(); console.log(b ? format(check(m, b)) : METRICS.map(k => `${k.padEnd(20)} ${m[k]} B`).join('\n')); console.log(`core closure: ${m.coreClosureFiles} files`); }
}
