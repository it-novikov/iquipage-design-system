/**
 * Rewrites every ratchet baseline from the current tree (`npm run gates:update`).
 * Run it deliberately after a cleanup, never to silence a regression. The size
 * baseline needs a fresh `npm run build`.
 */
import { writeBaseline as contrast } from './contrast.mjs';
import { writeBaseline as styles } from './styles.mjs';
import { writeBaseline as size } from './size.mjs';

for (const write of [contrast, styles, size]) console.log('Wrote ' + write());
