/** Optional placement policy on the separate DS source candidate. Original 05.7 is untouched. */
export async function applyBoardPatches(patch) {
  await patch('src/modules/board-motion.js',
    'function bindBoard(board, onDrop) {',
    `function bindBoard(board, onDrop, options = {}) {
    const tokens = getComputedStyle(board);
    const duration = (name, fallback) => {
        const value = tokens.getPropertyValue(name).trim();
        const number = parseFloat(value);
        return Number.isFinite(number) && number >= 0 ? (value.endsWith('ms') ? number : number * 1000) : fallback;
    };
    const motion = {standard: duration('--iq-motion-standard', 180), enter: duration('--iq-motion-enter', 280), ease: tokens.getPropertyValue('--iq-ease').trim() || 'ease-out', spring: tokens.getPropertyValue('--iq-ease-spring').trim() || 'ease-out'};`);
  await patch('src/modules/board-motion.js',
    '        const ph = state.placeholder;',
    `        if (typeof options.resolvePlacement === 'function') {
            const placement = options.resolvePlacement({id: state.card.dataset.dragId, status: col.dataset.dropStatus, beforeId: before?.dataset.dragId || null, keyboard: state.keyboard});
            state.denied = placement === false;
            if (state.denied) return;
            before = placement?.beforeId ? [...list.children].find(node => node.dataset.dragId === placement.beforeId && node !== state.card) || null : null;
        }
        const ph = state.placeholder;`);
  await patch('src/modules/board-motion.js',
    "{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }",
    '{ duration: motion.standard, easing: motion.ease }');
  await patch('src/modules/board-motion.js',
    "{ duration: 240, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }",
    "{ duration: motion.enter, easing: motion.spring, fill: 'forwards' }");
}

export async function applyBoardLifecyclePatches(patch){
  await patch('src/modules/board-motion.js',
    '        board.classList.add(\'is-dragging\');',
    "        options.onDragStateChange?.(true);\n        board.classList.add('is-dragging');");
  await patch('src/modules/board-motion.js',
    '        state = null;\n    }\n    function cancel()',
    '        state = null;\n        options.onDragStateChange?.(false);\n    }\n    function cancel()');
  await patch('src/modules/board-motion.js',
    '        if (!card)\n            return;',
    "        if (!card || options.canDrag?.({id:card.dataset.dragId}) === false)\n            return;");
  await patch('src/modules/board-motion.js',
    '        const r = card.getBoundingClientRect();',
    "        if(options.canDrag?.({id:card.dataset.dragId}) === false)return;\n        const r = card.getBoundingClientRect();");
}

export async function applyBoardSafetyPatches(patch){
  await patch('src/modules/board-motion.js','        if (!col) {','        if (!col || s.denied) {');
  await patch('src/modules/board-motion.js',
    '        if (col && board.contains(col))\n            finish();',
    '        if (col && board.contains(col) && col === state.placeholder.closest(\'[data-drop-status]\') && !state.denied)\n            finish();');
  await patch('src/modules/board-motion.js',
    "${card.querySelector('.task-card-id').textContent}",
    "${card.querySelector('.task-card-id').textContent.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}");
}
