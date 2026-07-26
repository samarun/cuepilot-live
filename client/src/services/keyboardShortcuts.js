export function historyActionFromEvent(event) {
  const key = String(event?.key || '').toLowerCase();
  const modifier = Boolean(event?.metaKey || event?.ctrlKey);
  if (modifier && key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (event?.ctrlKey && key === 'y') return 'redo';
  return null;
}

export function isTextEditingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = String(target.tagName || '').toLowerCase();
  if (tagName === 'textarea') return true;
  if (tagName !== 'input') return false;
  const type = String(target.type || 'text').toLowerCase();
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(type);
}

export function isShortcutEntryTarget(target) {
  if (isTextEditingTarget(target)) return true;
  const tagName = String(target?.tagName || '').toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'textarea';
}
