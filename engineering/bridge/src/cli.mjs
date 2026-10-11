import {relative} from 'node:path';
import {parseArgs} from 'node:util';
import {BridgeError} from './errors.mjs';
import {parseSteps} from './card.mjs';
import {handleClaudeHook} from './hooks.mjs';
import {liveLease} from './lease.mjs';
import {toModel} from './model.mjs';
import * as operations from './operations.mjs';
import {authorPrompt, briefFor, reviewerPrompt} from './prompt.mjs';
import {runRelay} from './runner.mjs';
import {collectStats} from './stats.mjs';
import {pullCard, pushCard, remoteClient} from './remote.mjs';
import {findRoot, listTaskIds, loadCard, paths, readCardText, readCards, requireInitialized, resolveTaskId} from './store.mjs';
import {validateTask} from './validate.mjs';

const HELP = `bridge — передача работы между агентами и людьми (engineering/bridge/README.md)

Кто действует: --agent или BRIDGE_AGENT; без них — human:<пользователь>. Задачу можно не называть, если открыта
одна или её держит этот агент. Изменяющие команды отказываются, если задачу держит другой (код 3); --force --because "почему".

Задачи
  init                                  Настроить .bridge/ в репозитории
  new <slug> --title T [--risk R] [--owner O] [--branch B] [--base B]
  list [--all]                          Задачи, держатели, прогресс
  brief [id] [--budget N]               Сжатая сводка для входящего агента
  show [id] [--json]                    Карточка целиком или её проекция в JSON
  pull <id> --url U --project P --task T --token-env E [--transport mcp|rest]
  push <id> --url U --project P --task T --token-env E [--transport mcp|rest]
                                        Карточка сервера; CAS, MCP по умолчанию, REST только spk_ token
                                        pull --accept-remote заменяет локальную карточку после сохранения копии
                                        push --create импортирует карточку в отсутствующий план существующей задачи
  check [id]                            Проверить формат и правила (все задачи без id)
  stats [--since YYYY-MM-DD] [--json]   Время цикла, раунды ревью, передачи

Работа
  claim [id] [--ttl H]                  Взять задачу (аренда общая для всех worktree)
  checkpoint [id] [--state S] [--now N] [--next X] [--trap T]... [--verify V] [--uncommitted U]
  step [id] <S#> <todo|active|done|blocked|dropped> [--check all|1,2] [--result R]
  add-step [id] --title T --what W --how H --why Y --accept A... [--covers A1,A2] [--depends S1] [--model strong|fast]
  accept [id] "критерий"                Добавить критерий приёмки задачи (A#)
  accept [id] --done A1                 Отметить критерий выполненным
  decide [id] "решение — почему"        ask [id] "вопрос" [--to кому]        answer [id] <Q#> "ответ"
  log [id] "заметка"                    status [id] <статус> [--note N]
  release [id]                          handoff [id] --reason planned|limit|error|auth|context|timeout|review|blocked [--to A] [--note N]

Агенты
  prompt [id]                           Промпт для агента: протокол + сводка
  review [id] --reviewer A [--base B] [--round N] [--since R1,R2]   Отчёт ревью и пакет ревьюера
  run [id] [--chain a,b] [--after A] [--rounds N] [--wait] [--quiet] [--dry-run]   Эстафета агентов
  hook claude                           Обработчик хуков Claude Code (JSON на stdin)`;

// `--because` justifies `--force`; `--reason` is the handoff reason.
const COMMON = {agent: {type: 'string'}, force: {type: 'boolean'}, because: {type: 'string'}, help: {type: 'boolean', short: 'h'}};

function parse(argv, options) {
  const {values, positionals} = parseArgs({args: argv, options: {...COMMON, ...options}, allowPositionals: true, strict: true});
  if (values.force && !values.because) throw new BridgeError('REASON_REQUIRED', '--force требует --because "почему".');
  return {values, positionals};
}

const say = text => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);

/** Splits positionals into an optional leading task id and the rest. */
function taskAndRest(root, positionals, restCount, agent) {
  const extra = positionals.length - restCount;
  const given = extra > 0 ? positionals[0] : undefined;
  return {id: resolveTaskId(root, given, {heldBy: () => operations.heldBy(root, agent)}), rest: positionals.slice(Math.max(0, extra))};
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function writerOptions(values) {
  return {agent: operations.actorName(values.agent), force: Boolean(values.force)};
}

export async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') return say(HELP);
  const root = findRoot();

  switch (command) {
    case 'pull': case 'push': {
      const {values, positionals} = parse(args, {url: {type: 'string'}, project: {type: 'string'}, task: {type: 'string'},
        'token-env': {type: 'string'}, transport: {type: 'string'}, 'accept-remote': {type: 'boolean'}, create: {type: 'boolean'}});
      if (positionals.length !== 1 || values.force || (command === 'push' && values['accept-remote']) || (command === 'pull' && values.create)) throw new BridgeError('USAGE', 'bridge pull|push <id> --url U --project P --task T --token-env E [--transport mcp|rest]');
      const client = remoteClient({url: values.url, project: values.project, task: values.task, tokenEnv: values['token-env'], transport: values.transport});
      const revision = command === 'pull' ? await pullCard(root, positionals[0], client, {acceptRemote: values['accept-remote']}) : await pushCard(root, positionals[0], client, {create: values.create});
      say(`${positionals[0]}: ${command === 'pull' ? 'карточка получена' : 'карточка записана'}, ревизия ${revision}.`);
      return;
    }
    case 'init': {
      say(`Мост настроен: ${relative(process.cwd(), operations.init(root)) || '.bridge'}`);
      return;
    }
    case 'new': {
      const {values, positionals} = parse(args, {title: {type: 'string'}, risk: {type: 'string'}, owner: {type: 'string'}, branch: {type: 'string'}, base: {type: 'string'}});
      const id = operations.createTask(root, {slug: positionals[0], title: values.title, risk: values.risk, owner: values.owner, branch: values.branch, base: values.base, actor: operations.actorName(values.agent)});
      say(`Создана задача ${id}: ${relative(process.cwd(), paths(root).card(id))}`);
      return;
    }
    case 'list': {
      const {values} = parse(args, {all: {type: 'boolean'}});
      requireInitialized(root);
      const readable = new Set();
      const rows = readCards(root).map(({id, card}) => {
        readable.add(id);
        const steps = parseSteps(card).filter(step => step.status !== 'dropped');
        return {id, meta: card.meta, lease: liveLease(root, id), done: steps.filter(step => step.status === 'done').length, total: steps.length};
      }).filter(row => values.all || !['done', 'cancelled'].includes(row.meta.status));
      for (const row of rows) say(`${row.id}  ${row.meta.status.padEnd(9)} ${String(row.meta.risk).padEnd(8)} ${row.done}/${row.total}  ${row.lease?.holder ?? '—'}  ${row.meta.title}`);
      for (const id of listTaskIds(root).filter(item => !readable.has(item))) say(`${id}  ✗ карточка не читается: bridge check ${id}`);
      if (!rows.length && readable.size === listTaskIds(root).length) say('Открытых задач нет.');
      return;
    }
    case 'brief': {
      const {values, positionals} = parse(args, {budget: {type: 'string'}});
      const {id} = taskAndRest(root, positionals, 0, operations.actorName(values.agent));
      process.stdout.write(briefFor(root, id, {budget: values.budget ? Number(values.budget) : undefined}));
      return;
    }
    case 'show': {
      const {values, positionals} = parse(args, {json: {type: 'boolean'}});
      const {id} = taskAndRest(root, positionals, 0, operations.actorName(values.agent));
      if (!values.json) return void process.stdout.write(readCardText(root, id));
      say(JSON.stringify(toModel(loadCard(root, id)), null, 2));
      return;
    }
    case 'check': {
      const {positionals} = parse(args, {});
      requireInitialized(root);
      const ids = positionals.length ? [resolveTaskId(root, positionals[0])] : listTaskIds(root);
      let failed = 0;
      for (const id of ids) {
        const {errors, warnings} = validateTask(root, id);
        if (errors.length) failed++;
        say(`${errors.length ? '✗' : '✓'} ${id}${errors.length ? `: ошибок ${errors.length}` : ''}${warnings.length ? `, предупреждений ${warnings.length}` : ''}`);
        for (const error of errors) say(`  ошибка: ${error}`);
        for (const warning of warnings) say(`  внимание: ${warning}`);
      }
      if (failed) throw new BridgeError('CHECK_FAILED', `Проверка не пройдена: ${failed} из ${ids.length}.`);
      return;
    }
    case 'stats': {
      const {values} = parse(args, {since: {type: 'string'}, json: {type: 'boolean'}});
      requireInitialized(root);
      const stats = collectStats(root, {since: values.since ?? ''});
      if (values.json) return say(JSON.stringify(stats, null, 2));
      const format = value => (value === null ? '—' : value.toFixed(1));
      for (const [risk, group] of Object.entries(stats.byRisk)) {
        say(`${risk.padEnd(8)} задач ${group.tasks}, готово ${group.done}, медиана цикла ${format(group.medianCycleHours)} ч, раундов ревью ${format(group.medianReviewRounds)}, P0/P1 ${group.blockingFindings}`);
      }
      say(`передачи: ${Object.entries(stats.handoffs).map(([reason, count]) => `${reason} ${count}`).join(', ') || 'нет'}`);
      return;
    }
    case 'claim': {
      const {values, positionals} = parse(args, {ttl: {type: 'string'}});
      const agent = operations.actorName(values.agent);
      const {id} = taskAndRest(root, positionals, 0, agent);
      operations.claim(root, id, {agent, ttlHours: values.ttl ? Number(values.ttl) : 4, force: values.force, reason: values.because});
      say(`${id}: задача за ${agent}.`);
      return;
    }
    case 'release': {
      const {values, positionals} = parse(args, {note: {type: 'string'}});
      const options = writerOptions(values);
      const {id} = taskAndRest(root, positionals, 0, options.agent);
      operations.release(root, id, {...options, note: values.note});
      say(`${id}: задача свободна.`);
      return;
    }
    case 'checkpoint': {
      const {values, positionals} = parse(args, {
        state: {type: 'string'}, now: {type: 'string'}, next: {type: 'string'}, trap: {type: 'string', multiple: true},
        verify: {type: 'string'}, uncommitted: {type: 'string'},
      });
      const options = writerOptions(values);
      const {id} = taskAndRest(root, positionals, 0, options.agent);
      operations.checkpoint(root, id, {...options, state: values.state, current: values.now, next: values.next, traps: values.trap ?? [], verify: values.verify, uncommitted: values.uncommitted});
      say(`${id}: контрольная точка записана.`);
      return;
    }
    case 'step': {
      const {values, positionals} = parse(args, {check: {type: 'string'}, result: {type: 'string'}});
      const options = writerOptions(values);
      const {id, rest: [stepId, status]} = taskAndRest(root, positionals, 2, options.agent);
      if (!stepId || !status) throw new BridgeError('USAGE', 'bridge step [id] <S#> <статус>');
      operations.setStep(root, id, stepId, status, {...options, result: values.result, check: values.check});
      say(`${id}: ${stepId.toUpperCase()} → ${status}.`);
      return;
    }
    case 'add-step': {
      const {values, positionals} = parse(args, {
        title: {type: 'string'}, what: {type: 'string'}, how: {type: 'string'}, why: {type: 'string'}, accept: {type: 'string', multiple: true},
        covers: {type: 'string'}, depends: {type: 'string'}, model: {type: 'string'},
      });
      const options = writerOptions(values);
      const {id} = taskAndRest(root, positionals, 0, options.agent);
      const stepId = operations.addStep(root, id, {...options, title: values.title, what: values.what, how: values.how, why: values.why, accept: values.accept, covers: values.covers, dependsOn: values.depends, model: values.model});
      say(`${id}: добавлен ${stepId}.`);
      return;
    }
    case 'accept': {
      const {values, positionals} = parse(args, {done: {type: 'string'}});
      const options = writerOptions(values);
      if (values.done) {
        const {id} = taskAndRest(root, positionals, 0, options.agent);
        operations.acceptCriterion(root, id, values.done, options);
        return say(`${id}: ${values.done.toUpperCase()} выполнен.`);
      }
      const {id, rest: [text]} = taskAndRest(root, positionals, 1, options.agent);
      if (!text) throw new BridgeError('USAGE', 'bridge accept [id] "критерий" | bridge accept [id] --done A1');
      say(`${id}: записан ${operations.addAcceptance(root, id, text, options)}.`);
      return;
    }
    case 'decide': case 'ask': case 'log': {
      const {values, positionals} = parse(args, {to: {type: 'string'}});
      const options = writerOptions(values);
      const {id, rest: [text]} = taskAndRest(root, positionals, 1, options.agent);
      if (!text) throw new BridgeError('USAGE', `bridge ${command} [id] "текст"`);
      if (command === 'decide') say(`${id}: записано ${operations.decide(root, id, text, options)}.`);
      else if (command === 'ask') say(`${id}: записан ${operations.ask(root, id, text, {...options, to: values.to})}.`);
      else { operations.note(root, id, text, options); say(`${id}: записано в журнал.`); }
      return;
    }
    case 'answer': {
      const {values, positionals} = parse(args, {});
      const agent = operations.actorName(values.agent);
      const {id, rest: [questionId, text]} = taskAndRest(root, positionals, 2, agent);
      if (!questionId || !text) throw new BridgeError('USAGE', 'bridge answer [id] <Q#> "ответ"');
      operations.answer(root, id, questionId, text, {agent});
      say(`${id}: ${questionId.toUpperCase()} отвечен.`);
      return;
    }
    case 'status': {
      const {values, positionals} = parse(args, {note: {type: 'string'}});
      const options = writerOptions(values);
      const {id, rest: [status]} = taskAndRest(root, positionals, 1, options.agent);
      if (!status) throw new BridgeError('USAGE', 'bridge status [id] <статус>');
      operations.setStatus(root, id, status, {...options, note: values.note, reason: values.because});
      say(`${id}: статус ${status}.`);
      return;
    }
    case 'handoff': {
      const {values, positionals} = parse(args, {reason: {type: 'string'}, to: {type: 'string'}, note: {type: 'string'}});
      const options = writerOptions(values);
      const {id} = taskAndRest(root, positionals, 0, options.agent);
      const record = operations.handoff(root, id, {...options, reason: values.reason ?? 'planned', to: values.to, note: values.note});
      say(`${id}: передача записана (${record.reason}). Следующему агенту: ${operations.bridgeCommand(root)} prompt ${id}`);
      return;
    }
    case 'prompt': {
      const {values, positionals} = parse(args, {});
      const agent = operations.actorName(values.agent);
      const {id} = taskAndRest(root, positionals, 0, agent);
      process.stdout.write(authorPrompt(root, id, {agent}));
      return;
    }
    case 'review': {
      const {values, positionals} = parse(args, {reviewer: {type: 'string'}, base: {type: 'string'}, round: {type: 'string'}, since: {type: 'string'}});
      const reviewer = values.reviewer || operations.actorName(values.agent);
      const {id} = taskAndRest(root, positionals, 0, reviewer);
      const started = operations.startReview(root, id, {reviewer, base: values.base, round: values.round ? Number(values.round) : undefined, since: values.since});
      process.stdout.write(reviewerPrompt(root, id, {agent: reviewer, reviewFile: started.file, baseRef: started.baseRef, previous: started.previous}));
      return;
    }
    case 'run': {
      const {values, positionals} = parse(args, {chain: {type: 'string'}, after: {type: 'string'}, rounds: {type: 'string'}, wait: {type: 'boolean'}, quiet: {type: 'boolean'}, 'dry-run': {type: 'boolean'}});
      const {id} = taskAndRest(root, positionals, 0, operations.actorName(values.agent));
      const result = await runRelay(root, id, {
        chain: values.chain?.split(',').map(item => item.trim()).filter(Boolean), maxRounds: values.rounds ? Number(values.rounds) : undefined,
        wait: values.wait, quiet: values.quiet, dryRun: values['dry-run'], after: values.after,
      });
      if (result.prompt) process.stdout.write(result.prompt);
      if (result.outcome === 'exhausted') process.exitCode = 75;
      else if (['stalled', 'max-rounds', 'blocked'].includes(result.outcome)) process.exitCode = 2;
      return;
    }
    case 'hook': {
      if (args[0] !== 'claude') throw new BridgeError('USAGE', 'bridge hook claude');
      // A hook never fails the session: errors go to stderr and the exit code stays 0.
      try {
        const raw = await readStdin();
        const output = handleClaudeHook(root, raw.trim() ? JSON.parse(raw) : {});
        if (output) process.stdout.write(output);
      } catch (error) {
        process.stderr.write(`bridge hook: ${error.message}\n`);
      }
      return;
    }
    default:
      throw new BridgeError('USAGE', `Неизвестная команда «${command}». bridge help — список команд.`);
  }
}

