/** Generic variable-height index. No product fields, backend or DOM dependencies. */
export class WindowIndex {
    estimate;
    ids = [];
    tree = [0];
    heights = [];
    measured = new Map();
    constructor(ids = [], estimate = 72) {
        this.estimate = estimate;
        this.setItems(ids);
    }
    get length() { return this.ids.length; }
    get total() { return this.offset(this.length); }
    setItems(ids) {
        if (!Number.isFinite(this.estimate) || this.estimate <= 0 || new Set(ids).size !== ids.length)
            throw new TypeError('Invalid window items or estimate');
        this.ids = [...ids];
        const keep = new Set(ids);
        for (const id of this.measured.keys())
            if (!keep.has(id))
                this.measured.delete(id);
        this.heights = ids.map(id => this.measured.get(id) ?? this.estimate);
        this.tree = Array(ids.length + 1).fill(0);
        for (let i = 0; i < ids.length; i++)
            this.add(i, this.heights[i]);
    }
    add(index, delta) { for (let i = index + 1; i < this.tree.length; i += i & -i)
        this.tree[i] = this.tree[i] + delta; }
    offset(index) { let value = 0; for (let i = Math.min(this.length, Math.max(0, index)); i > 0; i -= i & -i)
        value += this.tree[i]; return value; }
    measure(index, height) {
        if (!Number.isInteger(index) || index < 0 || index >= this.length || !Number.isFinite(height) || height <= 0)
            throw new TypeError('Invalid row measurement');
        const delta = height - this.heights[index];
        if (Math.abs(delta) < 0.5)
            return 0;
        this.heights[index] = height;
        this.measured.set(this.ids[index], height);
        this.add(index, delta);
        return delta;
    }
    indexAt(offset) {
        if (offset <= 0)
            return 0;
        if (offset >= this.total)
            return this.length;
        let index = 0, sum = 0, bit = 1;
        while (bit * 2 <= this.length)
            bit *= 2;
        for (; bit > 0; bit >>= 1) {
            const next = index + bit;
            if (next <= this.length && sum + this.tree[next] <= offset) {
                sum += this.tree[next];
                index = next;
            }
        }
        return index;
    }
    segments(top, bottom, overscan = 4, pinned = []) {
        const visible = new Set();
        if (bottom >= 0 && top < this.total) {
            const start = Math.max(0, this.indexAt(top) - overscan);
            const end = Math.min(this.length, this.indexAt(bottom) + overscan + 1);
            for (let i = start; i < end; i++)
                visible.add(i);
        }
        for (const index of pinned) {
            if (Number.isInteger(index) && index >= 0 && index < this.length)
                visible.add(index);
        }
        const sorted = [...visible].sort((a, b) => a - b);
        const result = [];
        let previous = 0;
        for (const index of sorted) {
            if (index > previous)
                result.push({ kind: 'space', from: previous, to: index, height: this.offset(index) - this.offset(previous) });
            const last = result.at(-1);
            if (last?.kind === 'rows' && last.to === index)
                last.to = index + 1;
            else
                result.push({ kind: 'rows', from: index, to: index + 1 });
            previous = index + 1;
        }
        if (previous < this.length)
            result.push({ kind: 'space', from: previous, to: this.length, height: this.total - this.offset(previous) });
        return result;
    }
}
