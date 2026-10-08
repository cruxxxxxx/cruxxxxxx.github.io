/**
 * Stringify project data the way the hand-written JSON files are laid out:
 * tab indents, objects one key per line, short arrays of plain values on one
 * line, long ones (descriptions) one item per line.
 * Keeps editor saves to minimal, readable git diffs.
 */
const MAX_INLINE_ARRAY_LENGTH = 100;

export function formatProjectJson(value) {
  return format(value, 0);
}

function format(value, depth) {
  if (Array.isArray(value)) {
    return formatArray(value, depth);
  }
  if (value && typeof value === 'object') {
    return formatObject(value, depth);
  }
  return JSON.stringify(value);
}

function formatArray(items, depth) {
  if (items.length === 0) {
    return '[]';
  }
  const oneLine = `[${items.map((item) => JSON.stringify(item)).join(', ')}]`;
  if (items.every(isPlainValue) && oneLine.length <= MAX_INLINE_ARRAY_LENGTH) {
    return oneLine;
  }
  const inner = '\t'.repeat(depth + 1);
  const lines = items.map((item) => inner + format(item, depth + 1));
  return `[\n${lines.join(',\n')}\n${'\t'.repeat(depth)}]`;
}

function formatObject(object, depth) {
  const entries = Object.entries(object);
  if (entries.length === 0) {
    return '{}';
  }
  const inner = '\t'.repeat(depth + 1);
  const lines = entries.map(([key, val]) => `${inner}${JSON.stringify(key)}: ${format(val, depth + 1)}`);
  return `{\n${lines.join(',\n')}\n${'\t'.repeat(depth)}}`;
}

function isPlainValue(value) {
  return value === null || typeof value !== 'object';
}
