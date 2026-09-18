/* Backward-compatible full entry. Use core/advanced/whiteboard for lazy loading. */
export * from './core.js';
export * from './advanced.js';
export * from './whiteboard.js';
import {registerCore} from './core.js';
import {registerAdvanced} from './advanced.js';
import {registerWhiteboard} from './whiteboard.js';
export function registerIquipage(){registerCore();registerAdvanced();registerWhiteboard();}
