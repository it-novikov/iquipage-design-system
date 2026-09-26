/** @iquipage/web/work-list — generic windowing and row drag, no product fields. */
export type WindowSegment = {
    kind: 'space';
    from: number;
    to: number;
    height: number;
} | {
    kind: 'rows';
    from: number;
    to: number;
};
/** Generic variable-height index. No product fields, backend or DOM dependencies. */
export declare class WindowIndex {
    private estimate;
    private ids;
    private tree;
    private heights;
    private measured;
    constructor(ids?: string[], estimate?: number);
    get length(): number;
    get total(): number;
    setItems(ids: string[]): void;
    private add;
    offset(index: number): number;
    measure(index: number, height: number): number;
    indexAt(offset: number): number;
    segments(top: number, bottom: number, overscan?: number, pinned?: number[]): WindowSegment[];
}
export interface TableWindowOptions<T> {
    body: HTMLTableSectionElement;
    scrollRoot: HTMLElement;
    columns: number;
    key: (row: T) => string;
    markup: (row: T, index: number) => string;
    decorate?: (node: HTMLTableRowElement, row: T) => void;
    estimate?: number;
}
/** Windowing controller for the supplied native table composition. No product or network model. */
export declare class TableWindow<T> {
    private options;
    private rows;
    private index;
    private enabled;
    private nodes;
    private abort;
    private resize;
    private frame;
    private disposed;
    private byId;
    private pinned;
    constructor(options: TableWindowOptions<T>);
    setRows(rows: T[], enabled?: boolean): void;
    refresh(): void;
    private schedule;
    private render;
    private keydown;
    focusRow(index: number, slot?: number): void;
    destroy(): void;
}
export interface DropTarget {
    groupId: string;
    beforeId: string | null;
    label: string;
}
export interface DragSource {
    id: string;
    label: string;
}
export interface RowDragOptions {
    root: HTMLElement;
    scrollRoot: HTMLElement;
    source: (id: string) => DragSource | null;
    resolve: (source: DragSource, groupId: string, beforeId: string | null) => DropTarget | null;
    targets: (source: DragSource) => DropTarget[];
    commit: (source: DragSource, target: DropTarget) => void;
    onState?: (dragging: boolean) => void;
}
/** Controlled pointer/keyboard intent; never moves, selects or saves caller data. */
export declare function bindRowDrag(options: RowDragOptions): () => void;
