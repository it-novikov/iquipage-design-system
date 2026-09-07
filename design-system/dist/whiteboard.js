/* Public IQUIPAGE 0.5.7 browser ES entry. */
import {registerCore} from './core.js';
import m0 from './modules/whiteboard.js';
import m1 from './modules/whiteboard-core.js';
export const IqWhiteboard=m0.IqWhiteboard;
const registerBoard=m0.registerWhiteboard;
export const validateWhiteboard=m1.validateBoard;
export function registerWhiteboard(){registerCore();registerBoard();}
