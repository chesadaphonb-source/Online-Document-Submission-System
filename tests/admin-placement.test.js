import test from 'node:test';
import assert from 'node:assert/strict';
import {
  percentToMm, mmToPercent, clampPlacement, pointerToPagePercent,
  getSelectedPlacement, updateSelectedPlacement, getNudgeDeltaMm,
  nudgeSelectedPlacement, createPlacementHistory, placementHistoryReducer,
} from '../src/app/lib/adminPlacement.js';

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function sampleSteps() {
  return [{
    level: 1, approverId: 'synthetic-signer', approverName: 'ผู้ลงนามทดสอบ',
    status: 'approved', signatureData: 'synthetic-image-data', comment: 'keep this',
    timestamp: '2026-11-03T00:00:00Z',
    signatureX: 0, signatureY: 0, signatureSize: 12,
    textBlock: 'ชื่อผู้ลงนามตัวอย่าง', textBlockX: 12, textBlockY: 14, textBlockSize: 10,
    dateBlock: '03/11/2569', dateX: 22, dateY: 24, dateSize: 10,
    checkmarkBlock: '/', checkmarkX: 32, checkmarkY: 34, checkmarkSize: 15,
    extraSignaturePositions: [{ x: 42, y: 44 }, { x: 52, y: 54 }],
    extraTextBlocks: [{ val: 'ตำแหน่งผู้อนุมัติสำหรับทดสอบ', x: 62, y: 64, size: 11, optional: undefined }, { val: 'keep extra text', x: 72, y: 74, size: 9 }],
    optional: undefined,
  }, { level: 2, approverId: 'another-signer', signatureX: 17, signatureY: 19, status: 'pending' }];
}

test('A4 percent/mm conversions round-trip both axes, zero and negative coordinates', () => {
  close(percentToMm(100, 'x'), 210);
  close(percentToMm(100, 'y'), 297);
  for (const axis of ['x', 'y']) for (const value of [-25, 0, 0.1, 53.789, 100]) {
    close(mmToPercent(percentToMm(value, axis), axis), value);
  }
  assert.throws(() => mmToPercent(NaN, 'x'), TypeError);
  assert.throws(() => percentToMm(1, 'z'), RangeError);
});

for (const width of [320, 560, 840]) for (const zoom of [1, 2]) {
  test(`drag with grab offset keeps saved percentage at ${width}px and zoom ${zoom}x`, () => {
    const rect = { left: 37 * zoom, top: 61 * zoom, width: width * zoom, height: width * 297 / 210 * zoom };
    const grab = { x: 13 * zoom, y: 8 * zoom };
    const result = pointerToPagePercent({
      clientX: rect.left + rect.width * 0.45 + grab.x,
      clientY: rect.top + rect.height * 0.63 + grab.y,
    }, rect, grab, { widthPercent: 23, heightPercent: 17 });
    close(result.x, 45);
    close(result.y, 63);
    const edge = pointerToPagePercent({ clientX: 99999, clientY: 99999 }, rect, grab, { widthPercent: 23, heightPercent: 17 });
    assert.deepEqual(edge, { x: 77, y: 83 });
  });
}

test('pointer conversion rejects zero-size or non-finite page measurements', () => {
  const pointer = { clientX: 10, clientY: 10 };
  assert.equal(pointerToPagePercent(pointer, { left: 0, top: 0, width: 0, height: 10 }), null);
  assert.equal(pointerToPagePercent(pointer, { left: 0, top: 0, width: 10, height: 0 }), null);
  assert.equal(pointerToPagePercent(pointer, { left: 0, top: 0, width: Infinity, height: 10 }), null);
  assert.equal(pointerToPagePercent({ clientX: NaN, clientY: 10 }, { left: 0, top: 0, width: 10, height: 10 }), null);
});

test('clamp accounts for both measured dimensions, including long text and zero-size overlays', () => {
  assert.deepEqual(clampPlacement({ x: 90, y: 99 }, { widthPercent: 35, heightPercent: 22 }), { x: 65, y: 78 });
  assert.deepEqual(clampPlacement({ x: 40, y: 80 }, { widthPercent: 88, heightPercent: 60 }), { x: 12, y: 40 });
  assert.deepEqual(clampPlacement({ x: -1, y: -2 }, { widthPercent: 0, heightPercent: 0 }), { x: 0, y: 0 });
  assert.deepEqual(clampPlacement({ x: 100, y: 100 }, { widthPercent: 0, heightPercent: 0 }), { x: 100, y: 100 });
  assert.deepEqual(clampPlacement({ x: 40, y: 80 }, { widthPercent: 120, heightPercent: 105 }), { x: 0, y: 0 });
  assert.deepEqual(clampPlacement({ x: 99, y: 99 }, { widthPercent: 12, heightPercent: 50 }), { x: 88, y: 50 });
});

test('all six selected item types update coordinates without mutating content or other signers', () => {
  const input = deepFreeze(sampleSteps());
  for (const selection of [
    { level: 1, type: 'signature' }, { level: 1, type: 'text' },
    { level: 1, type: 'date' }, { level: 1, type: 'checkmark' },
    { level: 1, type: 'extraSignature', extraIndex: 0 },
    { level: 1, type: 'extraText', extraIndex: 0 },
  ]) {
    const output = updateSelectedPlacement(input, selection, { x: 7, y: 8 });
    assert.deepEqual(getSelectedPlacement(output, selection), { x: 7, y: 8 });
    assert.equal(output[1], input[1]);
    for (const field of ['approverId', 'approverName', 'signatureData', 'comment', 'timestamp', 'status', 'dateBlock', 'textBlock', 'signatureSize']) {
      assert.equal(output[0][field], input[0][field]);
    }
    assert.equal(output[0].extraTextBlocks[0].val, input[0].extraTextBlocks[0].val);
    assert.equal(output[0].extraTextBlocks[1], input[0].extraTextBlocks[1]);
    assert.equal(Object.hasOwn(output[0], 'optional'), true);
  }
  assert.deepEqual(getSelectedPlacement(input, { level: 1, type: 'signature' }), { x: 0, y: 0 });
});

test('missing/invalid selections and identical coordinates preserve the original state reference', () => {
  const input = sampleSteps();
  for (const selection of [null, { level: 99, type: 'text' }, { level: 1, type: 'toString' }, { level: 1, type: 'extraText', extraIndex: -1 }, { level: 1, type: 'extraSignature', extraIndex: 99 }]) {
    assert.equal(getSelectedPlacement(input, selection), null);
    assert.equal(updateSelectedPlacement(input, selection, { x: 1, y: 2 }), input);
  }
  assert.equal(updateSelectedPlacement(input, { level: 1, type: 'signature' }, { x: 0, y: 0 }), input);
});

test('fine and Shift nudges move exactly 0.1mm and 1mm on each axis', () => {
  let input = updateSelectedPlacement(sampleSteps(), { level: 1, type: 'signature' }, { x: 50, y: 50 });
  const selection = { level: 1, type: 'signature' };
  assert.equal(getNudgeDeltaMm(), 0.1);
  assert.equal(getNudgeDeltaMm(true), 1);
  for (const [direction, axis, sign] of [['left', 'x', -1], ['right', 'x', 1], ['up', 'y', -1], ['down', 'y', 1]]) {
    for (const coarse of [false, true]) {
      const output = nudgeSelectedPlacement(input, selection, direction, { widthPercent: 12, heightPercent: 5 }, { coarse });
      const point = getSelectedPlacement(output, selection);
      close(percentToMm(point[axis] - 50, axis), sign * (coarse ? 1 : 0.1));
    }
  }
});

test('nudge respects measured page edges without altering annotation content', () => {
  const selection = { level: 1, type: 'extraText', extraIndex: 0 };
  const input = updateSelectedPlacement(sampleSteps(), selection, { x: 12, y: 40 });
  const output = nudgeSelectedPlacement(input, selection, 'right', { widthPercent: 88, heightPercent: 60 }, { coarse: true });
  assert.equal(output, input);
  assert.equal(output[0].extraTextBlocks[0].val, input[0].extraTextBlocks[0].val);
});

function changedSteps(x) { return updateSelectedPlacement(sampleSteps(), { level: 1, type: 'signature' }, { x, y: 0 }); }
function reduce(state, action) { return placementHistoryReducer(state, action); }

test('history snapshots preserve undefined fields and isolate source/action mutations', () => {
  const original = sampleSteps();
  let state = createPlacementHistory(original);
  original[0].signatureX = 999;
  assert.equal(state.present[0].signatureX, 0);
  const edit = changedSteps(12);
  state = reduce(state, { type: 'change', steps: edit });
  edit[0].extraTextBlocks[0].val = 'externally changed';
  assert.notEqual(state.present[0].extraTextBlocks[0].val, 'externally changed');
  state = reduce(state, { type: 'undo' });
  assert.equal(state.present[0].signatureX, 0);
  assert.equal(Object.hasOwn(state.present[0], 'optional'), true);
  assert.equal(Object.hasOwn(state.present[0].extraTextBlocks[0], 'optional'), true);
  assert.equal(state.present[0].optional, undefined);
});

test('a drag with many pointer updates is a single undo/redo action', () => {
  let state = createPlacementHistory(sampleSteps());
  state = reduce(state, { type: 'begin' });
  for (let x = 1; x <= 20; x++) state = reduce(state, { type: 'change', steps: changedSteps(x) });
  assert.equal(state.past.length, 0);
  state = reduce(state, { type: 'finish' });
  assert.equal(state.past.length, 1);
  state = reduce(state, { type: 'undo' });
  assert.equal(state.present[0].signatureX, 0);
  state = reduce(state, { type: 'redo' });
  assert.equal(state.present[0].signatureX, 20);
});

test('a new edit clears redo, but an unchanged gesture preserves it', () => {
  let state = createPlacementHistory(sampleSteps());
  state = reduce(state, { type: 'change', steps: changedSteps(1) });
  state = reduce(state, { type: 'undo' });
  state = reduce(state, { type: 'begin' });
  state = reduce(state, { type: 'change', steps: changedSteps(2) });
  state = reduce(state, { type: 'change', steps: changedSteps(0) });
  state = reduce(state, { type: 'finish' });
  assert.equal(state.future.length, 1);
  state = reduce(state, { type: 'redo' });
  assert.equal(state.present[0].signatureX, 1);
  state = reduce(state, { type: 'undo' });
  state = reduce(state, { type: 'change', steps: changedSteps(3) });
  assert.equal(state.future.length, 0);
  assert.equal(reduce(state, { type: 'redo' }), state);
});

test('history is bounded, supports zero capacity and resets for a new document', () => {
  let state = createPlacementHistory(sampleSteps(), 2);
  for (let x = 1; x <= 4; x++) state = reduce(state, { type: 'change', steps: changedSteps(x) });
  assert.equal(state.past.length, 2);
  state = reduce(state, { type: 'undo' });
  assert.equal(state.present[0].signatureX, 3);
  state = reduce(state, { type: 'undo' });
  assert.equal(state.present[0].signatureX, 2);
  assert.equal(reduce(state, { type: 'undo' }), state);
  state = reduce(state, { type: 'reset', steps: changedSteps(8) });
  assert.equal(state.present[0].signatureX, 8);
  assert.equal(state.limit, 2);
  assert.deepEqual(state.past, []);
  assert.deepEqual(state.future, []);
  let disabled = createPlacementHistory(sampleSteps(), 0);
  disabled = reduce(disabled, { type: 'change', steps: changedSteps(5) });
  assert.equal(disabled.present[0].signatureX, 5);
  assert.deepEqual(disabled.past, []);
});

test('undo during an active drag finishes that gesture before reverting it', () => {
  let state = createPlacementHistory(sampleSteps());
  state = reduce(state, { type: 'begin' });
  state = reduce(state, { type: 'change', steps: changedSteps(6) });
  state = reduce(state, { type: 'undo' });
  assert.equal(state.present[0].signatureX, 0);
  assert.equal(state.gestureStart, null);
  state = reduce(state, { type: 'redo' });
  assert.equal(state.present[0].signatureX, 6);
});
