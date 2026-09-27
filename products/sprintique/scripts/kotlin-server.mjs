// The Kotlin backend for tests and the local stand: locating JDK 25, building the local artifact, applying
// migrations and starting servers. Nothing here reaches Docker or a database other than the one it is given.
import {existsSync, readFileSync} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {join, resolve} from 'node:path';

export const SERVER_DIR = resolve(import.meta.dirname, '..', 'server');
export const LOCAL_JAR = join(SERVER_DIR, 'build', 'libs', 'sprintique-server-local.jar');

/** Whether `home` is a JDK of major version 25, read from its `release` file rather than trusted by path. */
function isJdk25(home) {
  if (!home || !existsSync(join(home, 'bin', 'java'))) return false;
  const release = [join(home, 'release'), join(home, 'libexec', 'openjdk.jdk', 'Contents', 'Home', 'release')].find(existsSync);
  return Boolean(release) && /JAVA_VERSION="25[."]/.test(readFileSync(release, 'utf8'));
}

/** JDK 25: SPRINTIQUE_JAVA_HOME, then Homebrew and common Linux paths, then the macOS registry. */
export function javaHome() {
  const candidates = [process.env.SPRINTIQUE_JAVA_HOME, '/opt/homebrew/opt/openjdk@25', '/usr/lib/jvm/temurin-25-jdk', '/usr/lib/jvm/java-25-openjdk'];
  // java_home falls back to another version when 25 is absent, so its answer is verified like any other.
  const registry = spawnSync('/usr/libexec/java_home', ['-v', '25'], {encoding: 'utf8'});
  if (registry.status === 0) candidates.push(registry.stdout.trim());
  const found = candidates.find(isJdk25);
  if (!found) throw Error('JDK 25 not found: set SPRINTIQUE_JAVA_HOME');
  return found;
}

export const java = () => join(javaHome(), 'bin', 'java');

function gradle(args, env = {}) {
  const run = spawnSync(join(SERVER_DIR, 'gradlew'), ['--quiet', '--console=plain', ...args], {
    cwd: SERVER_DIR, stdio: 'inherit', env: {...process.env, JAVA_HOME: javaHome(), ...env},
  });
  if (run.status !== 0) throw Error(`gradle ${args.join(' ')} failed`);
}

/** Builds the local artifact unless SPRINTIQUE_SKIP_SERVER_BUILD asks to reuse an existing one. */
export function buildServer() {
  if (process.env.SPRINTIQUE_SKIP_SERVER_BUILD === '1' && existsSync(LOCAL_JAR)) return;
  gradle(['localBootJar']);
}

/** Applies the migration ledger with the owner's credentials; returns only after the command exits. */
export function migrate({migrationUrl, runtimeRole, workerRole}) {
  const run = spawnSync(java(), ['-jar', LOCAL_JAR, 'migrate'], {
    stdio: 'inherit',
    env: {...process.env, SPRINTIQUE_MIGRATION_DATABASE_URL: migrationUrl, SPRINTIQUE_DATABASE_RUNTIME_ROLE: runtimeRole, SPRINTIQUE_DATABASE_WORKER_ROLE: workerRole ?? ''},
  });
  if (run.status !== 0) throw Error('Kotlin migrate failed');
}

export function integrationTests(env) {
  gradle(['integrationTest'], env);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

/**
 * Starts the local artifact on a free loopback port and waits for /health. `env` holds SPRINTIQUE_* settings.
 * Resolves to {url, port, process, stop()}; rejects with the server's output when it exits during start.
 */
export async function startServer(env, {port: fixedPort, timeoutMs = 60000} = {}) {
  const port = fixedPort ?? await freePort();
  const child = spawn(java(), ['-XX:TieredStopAtLevel=1', '-Xshare:auto', '-jar', LOCAL_JAR], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, SPRINTIQUE_HOST: '127.0.0.1', SPRINTIQUE_PORT: String(port), ...env},
  });
  let output = '';
  const keep = chunk => { output = (output + chunk.toString()).slice(-20000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  const url = `http://127.0.0.1:${port}`;
  const exited = new Promise(resolveExit => child.once('exit', code => resolveExit(code)));
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const early = await Promise.race([exited, new Promise(resolveWait => setTimeout(() => resolveWait(undefined), 150))]);
    if (early !== undefined) throw Object.assign(Error(`Kotlin server exited with ${early}:\n${output}`), {output, code: early});
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw Error(`Kotlin server did not start in ${timeoutMs} ms:\n${output}`);
    }
  }
  return {
    url, port, process: child, output: () => output,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
      await exited;
      clearTimeout(timer);
    },
  };
}
