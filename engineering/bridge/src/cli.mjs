import {readFileSync} from 'node:fs';
import {relative} from 'node:path';
import {parseArgs} from 'node:util';
import {BridgeError} from './errors.mjs';
import {parseSteps} from './card.mjs';
import {toModel} from './model.mjs';
import {handleClaudeHook} from './hooks.mjs';
import * as operations from './operations.mjs';
import {authorPrompt, briefFor, reviewerPrompt} from './prompt.mjs';
import {runRelay} from './runner.mjs';
import {findRoot, listTaskIds, loadCard, paths, readCardText, requireInitialized, resolveTaskId} from './store.mjs';
import {validateTask} from './validate.mjs';

const HELP = `bridge — передача работы между агентами и людьми (engineering/bridge/README.md)

Задачи
  init                                  Настроить .bridge/ в репозитории
  new <slug> --title T [--risk R] [--owner O] [--branch B] [--base B]
  list [--all]                          Задачи и их состояние
  brief [id] [--budget N]               Сжатая сводка для входящего агента
  show [id] [--json]                    Карточка целиком или в JSON
  check [id]                            Проверить формат и правила (все задачи без id)

Работа
  claim [id] --agent A [--ttl H] [--force --reason R]
  checkpoint [id] [--state S] [--now N] [--next X] [--trap T]... [--verify V] [--uncommitted U|auto]
  step [id] <S#> <todo|active|done|blocked|dropped> [--check all|1,2] [--result R]
  add-step [id] --title T --what W --how H --why Y --accept A [--accept A]... [--depends S1] [--model strong|fast]
  decide [id] "решение — почему"        ask [id] "вопрос" [--to кому]        answer [id] <Q#> "ответ"
  log [id] "заметка"                    status [id] <статус> [--note N]
  release [id]                          handoff [id] --reason planned|limit|error|auth|context|timeout|review|blocked [--to A] [--note N]

Агенты
  prompt [id] [--agent A]               Промпт для агента: протокол + сводка
  review [id] --reviewer A [--base B]   Создать отчёт ревью и вывести пакет ревьюера
  run [id] [--chain a,b] [--rounds N] [--wait] [--quiet] [--dry-run]   Эстафета агентов с передачей по триггерам
  hook claude                           Обработчик хуков Claude Code (JSON на stdin)

id можно опустить, если открыта одна задача или задачу держит BRIDGE_AGENT. Имя агента: --agent или BRIDGE_AGENT.`;

const COMMON = {agent: {type: 'string'}, help: {type: 'boolean', short: 'h'}};

function parse(argv, options) {
  const {values, positionals} = parseArgs({args: argv, options: {...COMMON, ...options}, allowPositionals: true, strict: true});
  return {values, positionals};
}

const agentOf = values => values.agent || process.env.BRIDGE_AGENT || process.env.USER || 'unknown';
const say = text => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);

/** Splits positionals into an optional leading task id and the rest. */
function taskAndRest(root, positionals, restCount) {
  const extra = positionals.length - restCount;
  const given = extra > 0 ? positionals[0] : undefined;
  return {id: resolveTaskId(root, given), rest: positionals.slice(Math.max(0, extra))};
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') return say(HELP);
  const root = findRoot();

  switch (command) {
    case 'init': {
      say(`Мост настроен: ${relative(process.cwd(), operations.init(root)) || '.bridge'}`);
      return;
    }
    case 'new': {
      const {values, positionals} = parse(args, {title: {type: 'string'}, risk: {type: 'string'}, owner: {type: 'string'}, branch: {type: 'string'}, base: {type: 'string'}});
      const id = operations.createTask(root, {slug: positionals[0], title: values.title, risk: values.risk, owner: values.owner, branch: values.branch, base: values.base, actor: agentOf(values)});
      say(`Создана задача ${id}: ${relative(process.cwd(), paths(root).card(id))}`);
      return;
    }
    case 'list': {
      const {values} = parse(args, {all: {type: 'boolean'}});
      requireInitialized(root);
      const rows = listTaskIds(root).map(id => {
        const card = loadCard(root, id);
        const steps = parseSteps(card).filter(step => step.status !== 'dropped');
        return {id, meta: card.meta, done: steps.filter(step => step.status === 'done').length, total: steps.length};
      }).filter(row => values.all || !['done', 'cancelled'].includes(row.meta.status));
      if (!rows.length) return say('Открытых задач нет.');
      for (const row of rows) say(`${row.id}  ${row.meta.status.padEnd(9)} ${String(row.meta.risk).padEnd(8)} ${row.done}/${row.total}  ${row.meta.holder || '—'}  ${row.meta.title}`);
      return;
    }
    case 'brief': {
      const {values, positionals} = parse(args, {budget: {type: 'string'}});
      const {id} = taskAndRest(root, positionals, 0);
      process.stdout.write(briefFor(root, id, {budget: values.budget ? Number(values.budget) : undefined}));
      return;
    }
    case 'show': {
      const {values, positionals} = parse(args, {json: {type: 'boolean'}});
      const {id} = taskAndRest(root, positionals, 0);
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
    case 'claim': {
      const {values, positionals} = parse(args, {ttl: {type: 'string'}, force: {type: 'boolean'}, reason: {type: 'string'}});
      const {id} = taskAndRest(root, positionals, 0);
      operations.claim(root, id, {agent: values.agent || process.env.BRIDGE_AGENT, ttlHours: values.ttl ? Number(values.ttl) : 4, force: values.force, reason: values.reason});
      say(`${id}: задача за ${values.agent || process.env.BRIDGE_AGENT}.`);
      return;
    }
    case 'release': {
      const {values, positionals} = parse(args, {note: {type: 'string'}});
      const {id} = taskAndRest(root, positionals, 0);
      operations.release(root, id, {agent: agentOf(values), note: values.note});
      say(`${id}: задача свободна.`);
      return;
    }
    case 'checkpoint': {
      const {values, positionals} = parse(args, {
        state: {type: 'string'}, now: {type: 'string'}, next: {type: 'string'}, trap: {type: 'string', multiple: true},
        verify: {type: 'string'}, uncommitted: {type: 'string'},
      });
      const {id} = taskAndRest(root, positionals, 0);
      operations.checkpoint(root, id, {agent: agentOf(values), state: values.state, current: values.now, next: values.next, traps: values.trap ?? [], verify: values.verify, uncommitted: values.uncommitted});
      say(`${id}: контрольная точка записана.`);
      return;
    }
    case 'step': {
      const {values, positionals} = parse(args, {check: {type: 'string'}, result: {type: 'string'}});
      const {id, rest: [stepId, status]} = taskAndRest(root, positionals, 2);
      if (!stepId || !status) throw new BridgeError('USAGE', 'bridge step [id] <S#> <статус>');
      operations.setStep(root, id, stepId, status, {agent: agentOf(values), result: values.result, check: values.check});
      say(`${id}: ${stepId.toUpperCase()} → ${status}.`);
      return;
    }
    case 'add-step': {
      const {values, positionals} = parse(args, {
        title: {type: 'string'}, what: {type: 'string'}, how: {type: 'string'}, why: {type: 'string'}, accept: {type: 'string', multiple: true},
        depends: {type: 'string'}, model: {type: 'string'},
      });
      const {id} = taskAndRest(root, positionals, 0);
      const stepId = operations.addStep(root, id, {agent: agentOf(values), title: values.title, what: values.what, how: values.how, why: values.why, accept: values.accept, dependsOn: values.depends, model: values.model});
      say(`${id}: добавлен ${stepId}.`);
      return;
    }
    case 'decide': case 'ask': case 'log': {
      const {values, positionals} = parse(args, {to: {type: 'string'}});
      const {id, rest: [text]} = taskAndRest(root, positionals, 1);
      if (!text) throw new BridgeError('USAGE', `bridge ${command} [id] "текст"`);
      if (command === 'decide') say(`${id}: записано ${operations.decide(root, id, text, {agent: agentOf(values)})}.`);
      else if (command === 'ask') say(`${id}: записан ${operations.ask(root, id, text, {agent: agentOf(values), to: values.to})}.`);
      else { operations.note(root, id, text, {agent: agentOf(values)}); say(`${id}: записано в журнал.`); }
      return;
    }
    case 'answer': {
      const {values, positionals} = parse(args, {});
      const {id, rest: [questionId, text]} = taskAndRest(root, positionals, 2);
      if (!questionId || !text) throw new BridgeError('USAGE', 'bridge answer [id] <Q#> "ответ"');
      operations.answer(root, id, questionId, text, {agent: agentOf(values)});
      say(`${id}: ${questionId.toUpperCase()} отвечен.`);
      return;
    }
    case 'status': {
      const {values, positionals} = parse(args, {note: {type: 'string'}});
      const {id, rest: [status]} = taskAndRest(root, positionals, 1);
      if (!status) throw new BridgeError('USAGE', 'bridge status [id] <статус>');
      operations.setStatus(root, id, status, {agent: values.agent || process.env.BRIDGE_AGENT, note: values.note});
      say(`${id}: статус ${status}.`);
      return;
    }
    case 'handoff': {
      const {values, positionals} = parse(args, {reason: {type: 'string'}, to: {type: 'string'}, note: {type: 'string'}});
      const {id} = taskAndRest(root, positionals, 0);
      const record = operations.handoff(root, id, {agent: agentOf(values), reason: values.reason ?? 'planned', to: values.to, note: values.note});
      say(`${id}: передача записана (${record.reason}). Следующему агенту: ${operations.bridgeCommand(root)} prompt ${id}`);
      return;
    }
    case 'prompt': {
      const {values, positionals} = parse(args, {});
      const {id} = taskAndRest(root, positionals, 0);
      process.stdout.write(authorPrompt(root, id, {agent: agentOf(values)}));
      return;
    }
    case 'review': {
      const {values, positionals} = parse(args, {reviewer: {type: 'string'}, base: {type: 'string'}});
      const {id} = taskAndRest(root, positionals, 0);
      const reviewer = values.reviewer || agentOf(values);
      const {file, baseRef} = operations.startReview(root, id, {reviewer, base: values.base});
      process.stdout.write(reviewerPrompt(root, id, {agent: reviewer, reviewFile: file, baseRef}));
      return;
    }
    case 'run': {
      const {values, positionals} = parse(args, {chain: {type: 'string'}, rounds: {type: 'string'}, wait: {type: 'boolean'}, quiet: {type: 'boolean'}, 'dry-run': {type: 'boolean'}});
      const {id} = taskAndRest(root, positionals, 0);
      const result = await runRelay(root, id, {
        chain: values.chain?.split(',').map(item => item.trim()).filter(Boolean), maxRounds: values.rounds ? Number(values.rounds) : undefined,
        wait: values.wait, quiet: values.quiet, dryRun: values['dry-run'],
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

export function version() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
