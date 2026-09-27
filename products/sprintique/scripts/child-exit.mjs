/** Signals a runner forwards to its child: interrupt, terminate and hang-up (a closed terminal or launcher). */
export const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
/** Resolve after stdio closes. A signal is never a successful test result. */
export function waitForChild(child, {forwardSignals = false} = {}) {
  return new Promise((resolve, reject) => {
    let interrupted = false;
    const stop = () => { interrupted = true; child.kill('SIGTERM'); };
    const cleanup = () => {
      child.off('error', failed);
      child.off('close', closed);
      if (forwardSignals) for (const signal of FORWARDED_SIGNALS) process.off(signal, stop);
    };
    const failed = error => { cleanup(); reject(error); };
    const closed = (code, signal) => {
      cleanup();
      resolve(interrupted || signal || code === null ? 1 : code);
    };
    child.once('error', failed);
    child.once('close', closed);
    if (forwardSignals) for (const signal of FORWARDED_SIGNALS) process.once(signal, stop);
  });
}
