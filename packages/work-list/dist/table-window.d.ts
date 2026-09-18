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
