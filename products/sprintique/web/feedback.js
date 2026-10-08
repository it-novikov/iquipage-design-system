import {autoPending,mountActivityLine,watchConnection} from '@iquipage/web/core';
/**
 * Action feedback for the whole product, wired once (DS vnext.35, feedback.js). Every request of the product's HTTP
 * client goes through trackedFetch: after 1 s it lights the line under the top bar, after 8 s a calm «Связь медленная»
 * notice says the action is still running, and a request that starts right after a press of a DS button holds that
 * button pending (spinner at the same width after 150 ms, no second click). A failed press is reported next to its
 * button with «Повторить» (failed()); offline is a notice that stays until the connection is back, then the open
 * section reads again. Background reads (polls, prefetch, read markers) go through background() and stay silent.
 */
let line=null;
/** The line sits under the product's top bar; before the shell exists (sign-in) it runs along the top of the window. */
export function placeActivityLine(host){line?.();line=mountActivityLine(host||null);}

/** Turns the system on: automatic button feedback, the connection notices, and what to refresh when back online. */
export function installFeedback({onOnline}={}){autoPending();placeActivityLine(null);return watchConnection({onOnline});}

export {failed,act,pending,background,trackedFetch,track} from '../ui/src/action-feedback.js';
