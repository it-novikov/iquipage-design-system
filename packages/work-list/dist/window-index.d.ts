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
