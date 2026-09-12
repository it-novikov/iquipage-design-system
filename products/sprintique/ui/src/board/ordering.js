import {requireValue} from '../common.js';
import {taskOrder} from '../tasks.js';

export const BOARD_SORTS = Object.freeze({priority:'По приоритету', due:'По сроку', created:'Сначала новые', manual:'Ручной порядок'});
const weights = {critical:0, high:1, normal:2, low:3};
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const deadline = value => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
const compare = (a,b) => a === b ? 0 : a < b ? -1 : 1;
const tie = (a,b) => String(a.id).localeCompare(String(b.id));

/** Only projects an order. Never modifies priority, status or source records. */
export function boardComparator(mode='priority') {
  requireValue(Object.hasOwn(BOARD_SORTS,mode),'BOARD_SORT','Неизвестная сортировка.');
  if(mode==='manual') return taskOrder;
  return (a,b) => {
    if(mode==='created') return time(b.createdAt)-time(a.createdAt)||tie(a,b);
    if(mode==='due') return compare(deadline(a.due),deadline(b.due))||tie(a,b);
    return (weights[a.priority]??2)-(weights[b.priority]??2)
      || time(a.statusEnteredAt||a.createdAt)-time(b.statusEnteredAt||b.createdAt) || tie(a,b);
  };
}
