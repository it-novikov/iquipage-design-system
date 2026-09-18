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
