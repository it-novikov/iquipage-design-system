/** Shared opt-in task controls; never guess when source and rendered marks differ. */
exports.bindMarkdownTasks = function (article, source, onToggle) {
    const marks = [...article.querySelectorAll('.md-task-mark')], positions = [];
    let offset = 0, fence = null;
    for (const line of source.split('\n')) {
        const content = line.replace(/^\s*(?:>\s*)*/, ''), f = /^(`{3,}|~{3,})/.exec(content);
        if (f) {
            if (!fence) fence = f[1];
            else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
        } else if (!fence) {
            const m = /^(?:\s*>)*\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+/.exec(line);
            if (m) positions.push(offset + m[0].lastIndexOf('[') + 1);
        }
        offset += line.length + 1;
    }
    if (positions.length !== marks.length) return;
    marks.forEach((mark, index) => {
        const button = document.createElement('button'), position = positions[index];
        button.type = 'button';
        button.className = mark.className;
        button.textContent = mark.textContent;
        button.dataset.taskPosition = String(position);
        button.setAttribute('role', 'checkbox');
        button.setAttribute('aria-checked', String(source[position].toLowerCase() === 'x'));
        button.setAttribute('aria-label', mark.parentElement.textContent.replace('✓', '').trim());
        button.addEventListener('click', event => {
            event.stopPropagation();
            const checked = source[position].toLowerCase() !== 'x';
            onToggle({source, position, checked, value: source.slice(0, position) + (checked ? 'x' : ' ') + source.slice(position + 1)}, button);
        });
        mark.replaceWith(button);
    });
};
