/** Date-only helpers. No implicit conversion through the browser's local timezone. */
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
export function addDays(value, amount) {
  if (!validDate(value) || !Number.isSafeInteger(amount)) throw new TypeError('Некорректная дата или число дней.');
  const result = new Date(Date.parse(value + 'T12:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
  if (!validDate(result)) throw new TypeError('Дата вне поддерживаемого диапазона.');
  return result;
}
export function interval(start, end) {
  for (const value of [start, end]) if (value != null && value !== '' && !validDate(value)) throw new TypeError('Укажите корректную календарную дату.');
  if (start && end && start > end) throw new TypeError('Окончание не может быть раньше начала.');
  return {start: start || null, end: end || null};
}
export function dateLabel(value) {
  return validDate(value) ? new Intl.DateTimeFormat('ru', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z')) : 'Без даты';
}
