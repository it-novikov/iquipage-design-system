import {requireCondition} from './errors.js';

/** Root depth is zero. Writers and every Planning projection share this limit. */
export const MAX_TASK_DEPTH = 100;

export function requireOpenTask(task: {result: string}) {
  requireCondition(task.result === 'open', 409, 'RESULT_PINNED', 'Принятый результат закреплён в истории.');
}

/** Iterative, memoized validation: a moved subtree must also fit, without recursion. */
export function validateTaskHierarchy(tasks: readonly {id: string; parentId: string | null}[]) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const depths = new Map<string, number>();
  for (const task of tasks) {
    if (depths.has(task.id)) continue;
    const chain: string[] = [];
    const visiting = new Set<string>();
    let current: typeof task | undefined = task;
    let depth = -1;
    while (current) {
      const known = depths.get(current.id);
      if (known !== undefined) { depth = known; break; }
      requireCondition(!visiting.has(current.id), 422, 'TASK_CYCLE', 'Связь создаёт цикл задач.');
      visiting.add(current.id);
      chain.push(current.id);
      if (!current.parentId) break;
      current = byId.get(current.parentId);
      requireCondition(current, 422, 'TASK_PARENT', 'Родительская задача недоступна.');
    }
    for (let index = chain.length - 1; index >= 0; index--) {
      depth++;
      requireCondition(depth <= MAX_TASK_DEPTH, 422, 'HIERARCHY_DEPTH', 'Иерархия глубже 100 уровней не поддерживается.');
      depths.set(chain[index]!, depth);
    }
  }
  return depths;
}
