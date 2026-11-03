import { A4_WIDTH_MM, A4_HEIGHT_MM } from './documentOverlayGeometry.js';

const COORDINATE_FIELDS = {
  signature: ['signatureX', 'signatureY'],
  text: ['textBlockX', 'textBlockY'],
  date: ['dateX', 'dateY'],
  checkmark: ['checkmarkX', 'checkmarkY'],
};
const EXTRA_FIELDS = { extraSignature: 'extraSignaturePositions', extraText: 'extraTextBlocks' };

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
}

function pageDimension(axis) {
  if (axis === 'x') return A4_WIDTH_MM;
  if (axis === 'y') return A4_HEIGHT_MM;
  throw new RangeError('Axis must be x or y');
}

export function percentToMm(value, axis) {
  return finite(value, 'Coordinate') / 100 * pageDimension(axis);
}

export function mmToPercent(value, axis) {
  return finite(value, 'Coordinate') / pageDimension(axis) * 100;
}

/** Bounds are measured overlay dimensions relative to the actual page rect. */
export function clampPlacement(position, { widthPercent = 0, heightPercent = 0 } = {}) {
  const width = Math.max(0, finite(widthPercent, 'Overlay width'));
  const height = Math.max(0, finite(heightPercent, 'Overlay height'));
  return {
    x: Math.max(0, Math.min(Math.max(0, 100 - width), finite(position.x, 'X'))),
    y: Math.max(0, Math.min(Math.max(0, 100 - height), finite(position.y, 'Y'))),
  };
}

/**
 * Pointer, page rect and grab offset are all screen CSS pixels. Dividing by the
 * same measured rect makes this independent of browser zoom or preview scale.
 */
export function pointerToPagePercent(pointer, rect, grabOffset = { x: 0, y: 0 }, bounds) {
  if (!rect || ![rect.left, rect.top, rect.width, rect.height, pointer?.clientX, pointer?.clientY, grabOffset.x, grabOffset.y].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0) return null;
  return clampPlacement({
    x: (pointer.clientX - grabOffset.x - rect.left) / rect.width * 100,
    y: (pointer.clientY - grabOffset.y - rect.top) / rect.height * 100,
  }, bounds);
}

function extraIndexIsValid(selection, values) {
  return Array.isArray(values) && Number.isInteger(selection.extraIndex)
    && selection.extraIndex >= 0 && selection.extraIndex < values.length;
}

/** Return null for absent annotations; zero is a valid saved coordinate. */
export function getSelectedPlacement(steps, selection) {
  if (!selection) return null;
  const step = steps.find(item => item.level === selection.level);
  if (!step) return null;
  const fields = Object.prototype.hasOwnProperty.call(COORDINATE_FIELDS, selection.type) ? COORDINATE_FIELDS[selection.type] : undefined;
  let position;
  if (fields) position = { x: step[fields[0]], y: step[fields[1]] };
  else {
    const field = Object.prototype.hasOwnProperty.call(EXTRA_FIELDS, selection.type) ? EXTRA_FIELDS[selection.type] : undefined;
    if (!field || !extraIndexIsValid(selection, step[field])) return null;
    const item = step[field][selection.extraIndex];
    position = { x: item?.x, y: item?.y };
  }
  return Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null;
}

/** Update coordinates only; never replace signer data, text content or dates. */
export function updateSelectedPlacement(steps, selection, position) {
  if (!selection) return steps;
  finite(position.x, 'X');
  finite(position.y, 'Y');
  const index = steps.findIndex(item => item.level === selection.level);
  if (index < 0) return steps;
  const step = steps[index];
  const fields = Object.prototype.hasOwnProperty.call(COORDINATE_FIELDS, selection.type) ? COORDINATE_FIELDS[selection.type] : undefined;
  let changed;
  if (fields) {
    if (step[fields[0]] === position.x && step[fields[1]] === position.y) return steps;
    changed = { ...step, [fields[0]]: position.x, [fields[1]]: position.y };
  } else {
    const field = Object.prototype.hasOwnProperty.call(EXTRA_FIELDS, selection.type) ? EXTRA_FIELDS[selection.type] : undefined;
    if (!field || !extraIndexIsValid(selection, step[field])) return steps;
    const previous = step[field][selection.extraIndex];
    if (previous.x === position.x && previous.y === position.y) return steps;
    const values = step[field].map((item, itemIndex) => itemIndex === selection.extraIndex ? { ...item, ...position } : item);
    changed = { ...step, [field]: values };
  }
  return steps.map((item, itemIndex) => itemIndex === index ? changed : item);
}

export function getNudgeDeltaMm(shift = false) {
  return shift ? 1 : 0.1;
}

export function nudgeSelectedPlacement(steps, selection, direction, bounds, { coarse = false } = {}) {
  const previous = getSelectedPlacement(steps, selection);
  if (!previous) return steps;
  const deltaMm = getNudgeDeltaMm(coarse);
  const next = { ...previous };
  if (direction === 'left') next.x -= mmToPercent(deltaMm, 'x');
  else if (direction === 'right') next.x += mmToPercent(deltaMm, 'x');
  else if (direction === 'up') next.y -= mmToPercent(deltaMm, 'y');
  else if (direction === 'down') next.y += mmToPercent(deltaMm, 'y');
  else throw new RangeError('Direction must be left, right, up or down');
  return updateSelectedPlacement(steps, selection, clampPlacement(next, bounds));
}

// JSON cloning drops explicitly undefined optional fields. Annotation snapshots
// contain plain records/arrays, and this recursive clone keeps those fields.
function cloneSnapshot(value) {
  if (Array.isArray(value)) return value.map(cloneSnapshot);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return new Date(value.getTime());
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneSnapshot(item)]));
  }
  return value;
}

function equalSnapshot(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && a.length !== b.length) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equalSnapshot(a[key], b[key]));
}

export function createPlacementHistory(initialSteps, limit = 50) {
  return {
    past: [], present: cloneSnapshot(initialSteps), future: [], gestureStart: null,
    limit: Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50,
  };
}

function appendPast(state, snapshot) {
  return state.limit === 0 ? [] : [...state.past, cloneSnapshot(snapshot)].slice(-state.limit);
}

/**
 * begin + any number of change actions + finish is one undo entry. A no-op
 * gesture preserves the redo branch; a committed edit clears it.
 */
export function placementHistoryReducer(state, action) {
  if (action.type === 'reset') return createPlacementHistory(action.steps, state.limit);
  if (action.type === 'begin') return state.gestureStart === null
    ? { ...state, gestureStart: cloneSnapshot(state.present) } : state;
  if (action.type === 'change') {
    if (equalSnapshot(state.present, action.steps)) return state;
    return {
      ...state, present: cloneSnapshot(action.steps),
      ...(state.gestureStart !== null ? {} : { past: appendPast(state, state.present), future: [] }),
    };
  }
  if (action.type === 'finish') {
    if (state.gestureStart === null) return state;
    return equalSnapshot(state.gestureStart, state.present)
      ? { ...state, gestureStart: null }
      : { ...state, past: appendPast(state, state.gestureStart), future: [], gestureStart: null };
  }
  if (action.type === 'undo' || action.type === 'redo') {
    const current = state.gestureStart === null ? state : placementHistoryReducer(state, { type: 'finish' });
    if (action.type === 'undo') {
      if (!current.past.length) return current;
      return {
        ...current, past: current.past.slice(0, -1),
        present: cloneSnapshot(current.past[current.past.length - 1]),
        future: [cloneSnapshot(current.present), ...current.future].slice(0, current.limit),
      };
    }
    if (!current.future.length) return current;
    return {
      ...current, past: appendPast(current, current.present),
      present: cloneSnapshot(current.future[0]), future: current.future.slice(1),
    };
  }
  return state;
}
