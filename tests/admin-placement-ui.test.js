import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { loadAdminPlacementModal } from '../scripts/lib/loadAdminPlacementModal.js';

const { AdminAdjustSignaturesModal } = await loadAdminPlacementModal();
const fixtureSubmission = () => ({
  id: 'fixture-request', formType: 'fixture-form', formName: 'แบบฟอร์มทดสอบตำแหน่ง', studentName: 'ข้อมูลตัวอย่าง',
  updatedAt: '2026-11-03T00:00:00Z',
  attachments: [{ name: 'fixture.pdf', url: 'https://fixture.invalid/document.pdf', type: 'pdf', size: '1 KB' }],
  approvalSteps: [{
    level: 1, roleName: 'ผู้อนุมัติตัวอย่าง', approverId: 'fixture-approver', approverName: 'ผู้ลงนามตัวอย่าง',
    status: 'approved', timestamp: '2026-11-03T00:00:00Z', signatureData: 'fixture-signature',
    signatureX: 10, signatureY: 20, signatureSize: 12, page: 1,
    textBlock: 'ข้อความตัวอย่าง', textBlockX: 20, textBlockY: 30, textBlockSize: 10,
    dateBlock: '03/11/2569', dateX: 20, dateY: 35, dateSize: 10,
    extraSignaturePositions: [{ x: 60, y: 70 }],
    extraTextBlocks: [{ val: 'ข้อความเสริม', x: 60, y: 78, size: 10 }],
  }],
});
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} != ${expected}`);
const host = node => typeof node.type === 'string';
const text = node => typeof node === 'string' ? node : node.children?.map(text).join('') || '';

async function mount({ onSave = async () => true, documentError = false, submission = fixtureSubmission(), pages = 2 } = {}) {
  const savedGlobals = Object.fromEntries(['document', 'FontFace', 'ResizeObserver', '__adminFixture'].map(key => [key, globalThis[key]]));
  const state = { toasts: [], documentError, pages, width: 560, closed: 0, saved: [], renderer: null };
  globalThis.__adminFixture = state;
  globalThis.FontFace = class { load() { return Promise.resolve(this); } };
  globalThis.document = {
    fonts: { add() {} },
    createElement(name) {
      assert.equal(name, 'canvas');
      return { width: 1, height: 1, getContext: () => ({}), toDataURL: () => 'data:image/png;base64,fixture' };
    },
  };
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const pageRect = () => ({ left: 100, top: 80, width: state.width, height: state.width * 297 / 210,
    right: 100 + state.width, bottom: 80 + state.width * 297 / 210 });
  await act(async () => {
    state.renderer = TestRenderer.create(createElement(AdminAdjustSignaturesModal, {
      submission,
      onClose: () => state.closed++,
      onSave: async (steps, targets, source) => { state.saved.push({ steps: structuredClone(steps), targets, source: structuredClone(source) }); return onSave(steps, targets, source); },
    }), { createNodeMock(node) {
      const element = {
        clientWidth: 592, offsetWidth: 560, focus() {}, setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true,
        getBoundingClientRect: pageRect,
        querySelectorAll: () => [],
        querySelector: selector => selector.includes('data-placement-key') ? {
          getBoundingClientRect: () => ({ ...pageRect(), width: state.width * .12, height: state.width * .04 }),
        } : null,
      };
      if (node.props?.['data-placement-key']) {
        element.getBoundingClientRect = () => ({ ...pageRect(), width: state.width * .12, height: state.width * .04 });
      }
      return element;
    } });
  });
  await act(async () => { await Promise.resolve(); });
  const find = label => state.renderer.root.findAll(node => host(node) && node.props['aria-label'] === label)[0];
  return {
    state, find, pageRect,
    async select(key = '1:signature:0') { await act(async () => { find('Placement item').props.onChange({ target: { value: key } }); }); },
    async click(label, event = {}) { await act(async () => { find(label).props.onClick({ shiftKey: false, ...event }); }); },
    saveButton() { return state.renderer.root.findAll(node => host(node) && node.type === 'button' && text(node).includes('บันทึกและอัปเดต'))[0]; },
    async save() { await act(async () => { await this.saveButton().props.onClick(); }); },
    async dispose() {
      await act(async () => { state.renderer.unmount(); });
      for (const [key, value] of Object.entries(savedGlobals)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
    },
  };
}

test('editor nudges in document millimetres, keeps positions through zoom, and supports undo/redo', async () => {
  const ui = await mount();
  try {
    await ui.select();
    close(Number(ui.find('X position (mm)').props.value), 21);
    await ui.click('Move right');
    close(Number(ui.find('X position (mm)').props.value), 21.1);
    await ui.click('Move down', { shiftKey: true });
    close(Number(ui.find('Y position (mm)').props.value), 60.4);
    await act(async () => { ui.find('Zoom').props.onChange({ target: { value: '200' } }); });
    close(Number(ui.find('X position (mm)').props.value), 21.1);
    await ui.click('Undo');
    close(Number(ui.find('Y position (mm)').props.value), 59.4);
    await ui.click('Redo');
    close(Number(ui.find('Y position (mm)').props.value), 60.4);
    await ui.save();
    assert.equal(ui.state.saved.length, 1);
    assert.deepEqual(ui.state.saved[0].targets, []);
    const step = ui.state.saved[0].steps[0];
    assert.equal(step.signatureData, 'fixture-signature');
    assert.equal(step.approverId, 'fixture-approver');
    assert.equal(step.timestamp, '2026-11-03T00:00:00Z');
    assert.equal(step.dateBlock, '03/11/2569');
    close(step.signatureX * 210 / 100, 21.1);
  } finally { await ui.dispose(); }
});

test('numeric coordinate commits only valid input and clamps the measured annotation inside the page', async () => {
  const ui = await mount();
  try {
    await ui.select();
    await act(async () => { ui.find('X position (mm)').props.onChange({ target: { value: '42.3' } }); });
    await act(async () => { ui.find('X position (mm)').props.onBlur(); });
    close(Number(ui.find('X position (mm)').props.value), 42.3);
    await act(async () => { ui.find('X position (mm)').props.onChange({ target: { value: '' } }); });
    await act(async () => { ui.find('X position (mm)').props.onBlur(); });
    close(Number(ui.find('X position (mm)').props.value), 42.3);
    await act(async () => { ui.find('X position (mm)').props.onChange({ target: { value: '999' } }); });
    await act(async () => { ui.find('X position (mm)').props.onBlur(); });
    assert.ok(Number(ui.find('X position (mm)').props.value) <= 184.8);
  } finally { await ui.dispose(); }
});

test('moving extra text changes only that annotation and preserves primary name/date/signature fields', async () => {
  const ui = await mount();
  try {
    await ui.select('1:extraText:0');
    await ui.click('Move left');
    await ui.save();
    const step = ui.state.saved[0].steps[0];
    assert.equal(step.textBlockX, 20);
    assert.equal(step.signatureX, 10);
    assert.equal(step.dateX, 20);
    assert.equal(step.extraTextBlocks[0].val, 'ข้อความเสริม');
    close(step.extraTextBlocks[0].x * 210 / 100, 125.9);
  } finally { await ui.dispose(); }
});

test('a coordinate clamped to the unchanged edge displays the actual saved position', async () => {
  const ui = await mount();
  try {
    await ui.select();
    for (const value of ['0', '-5']) {
      await act(async () => { ui.find('X position (mm)').props.onChange({ target: { value } }); });
      await act(async () => { ui.find('X position (mm)').props.onKeyDown({ key: 'Enter', preventDefault() {} }); });
    }
    close(Number(ui.find('X position (mm)').props.value), 0);
    await ui.save();
    assert.equal(ui.state.saved[0].steps[0].signatureX, 0);
  } finally { await ui.dispose(); }
});

test('a zoomed pointer drag uses the measured document rect and creates one undo step', async () => {
  const ui = await mount();
  try {
    await act(async () => { ui.find('Zoom').props.onChange({ target: { value: '200' } }); });
    ui.state.width = 1120;
    const overlay = () => ui.state.renderer.root.findAll(node => host(node) && node.props['data-placement-key'] === '1:signature:0')[0];
    const page = () => ui.state.renderer.root.findAll(node => host(node) && Object.hasOwn(node.props, 'data-document-page'))[0];
    const grab = { x: 12, y: 8 };
    const rect = ui.pageRect();
    const element = { getBoundingClientRect: () => ({ left: rect.left + .1 * rect.width, top: rect.top + .2 * rect.height,
      width: rect.width * .12, height: rect.width * .04 }),
      focus() {}, setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true };
    const event = { pointerId: 1, button: 0, currentTarget: element, preventDefault() {}, stopPropagation() {},
      clientX: rect.left + .1 * rect.width + grab.x, clientY: rect.top + .2 * rect.height + grab.y };
    await act(async () => { overlay().props.onPointerDown(event); });
    // A second finger must neither end the active gesture nor steal it by
    // pressing another annotation while the first pointer is dragging.
    await act(async () => { page().props.onPointerUp({ pointerId: 2 }); });
    const other = ui.state.renderer.root.findAll(node => host(node) && node.props['data-placement-key'] === '1:text:0')[0];
    await act(async () => { other.props.onPointerDown({ ...event, pointerId: 2 }); });
    for (const x of [.12, .15, .2]) {
      await act(async () => { page().props.onPointerMove({ ...event,
        clientX: rect.left + x * rect.width + grab.x, clientY: rect.top + .25 * rect.height + grab.y }); });
    }
    await act(async () => { page().props.onPointerUp({ pointerId: 1 }); });
    close(Number(ui.find('X position (mm)').props.value), 42);
    close(Number(ui.find('Y position (mm)').props.value), 74.3);
    await ui.click('Undo');
    close(Number(ui.find('X position (mm)').props.value), 21);
    close(Number(ui.find('Y position (mm)').props.value), 59.4);
    assert.equal(ui.find('Undo').props.disabled, true);
    await ui.click('Redo');
    close(Number(ui.find('X position (mm)').props.value), 42);
    await ui.save();
    assert.equal(ui.state.saved[0].steps[0].textBlockX, 20);
  } finally { await ui.dispose(); }
});

test('arrow shortcuts ignore text inputs and work on the editor selection', async () => {
  const ui = await mount();
  try {
    await ui.select();
    const dialog = ui.state.renderer.root.findByProps({ role: 'dialog' });
    const inputTarget = { tagName: 'INPUT', isContentEditable: false, closest: () => ({}) };
    await act(async () => { dialog.props.onKeyDown({ key: 'ArrowRight', target: inputTarget, preventDefault() {} }); });
    close(Number(ui.find('X position (mm)').props.value), 21);
    await act(async () => { dialog.props.onKeyDown({ key: 'ArrowRight', shiftKey: true,
      target: { tagName: 'DIV', isContentEditable: false, closest: () => null }, preventDefault() {} }); });
    close(Number(ui.find('X position (mm)').props.value), 22);
  } finally { await ui.dispose(); }
});

test('failed save keeps the editor open without announcing success', async () => {
  const ui = await mount({ onSave: async () => false });
  try {
    await ui.save();
    assert.equal(ui.state.closed, 0);
    assert.equal(ui.state.saved.length, 1);
    assert.equal(ui.state.toasts.filter(t => t.kind === 'success').length, 0);
  } finally { await ui.dispose(); }
});

test('pending save disables editing and prevents duplicate submissions', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const ui = await mount({ onSave: () => pending });
  let savePromise;
  try {
    await ui.select();
    const saveHandler = ui.saveButton().props.onClick;
    await act(async () => { savePromise = saveHandler(); });
    assert.equal(ui.find('X position (mm)').props.disabled, true);
    assert.equal(ui.find('Move right').props.disabled, true);
    await act(async () => { await saveHandler(); });
    assert.equal(ui.state.saved.length, 1);
    await act(async () => { finish(false); await savePromise; });
    assert.equal(ui.state.closed, 0);
    assert.equal(ui.find('X position (mm)').props.disabled, false);
  } finally { finish(false); await ui.dispose(); }
});

test('document load error prevents saving unknown placement', async () => {
  const previousError = console.error;
  console.error = () => {};
  const ui = await mount({ documentError: true });
  try {
    assert.equal(ui.saveButton().props.disabled, true);
    await act(async () => { await ui.saveButton().props.onClick(); });
    assert.equal(ui.state.saved.length, 0);
  } finally { console.error = previousError; await ui.dispose(); }
});

test('saving retains the opening document version when context props refresh', async () => {
  const ui = await mount();
  try {
    const props = ui.state.renderer.root.findByType(AdminAdjustSignaturesModal).props;
    await act(async () => {
      ui.state.renderer.update(createElement(AdminAdjustSignaturesModal, {
        ...props, submission: { ...fixtureSubmission(), updatedAt: '2026-11-03T01:00:00Z' },
      }));
    });
    await ui.save();
    assert.equal(ui.state.saved[0].source.updatedAt, '2026-11-03T00:00:00Z');
  } finally { await ui.dispose(); }
});

test('an annotation on a missing page blocks save until Admin selects an existing page', async () => {
  const submission = fixtureSubmission();
  submission.approvalSteps[0].page = 2;
  const ui = await mount({ submission, pages: 1 });
  try {
    assert.equal(ui.saveButton().props.disabled, true);
    await act(async () => { await ui.saveButton().props.onClick(); });
    assert.equal(ui.state.saved.length, 0);
    await act(async () => { ui.find('Page for level 1').props.onChange({ target: { value: '1' } }); });
    assert.equal(ui.saveButton().props.disabled, false);
    await ui.save();
    assert.equal(ui.state.saved[0].steps[0].page, 1);
    assert.equal(ui.state.saved[0].steps[0].status, 'approved');
  } finally { await ui.dispose(); }
});
