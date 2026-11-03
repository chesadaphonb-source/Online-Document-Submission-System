import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttachmentSelection, restoreAttachmentSelection, getDraftAttachments,
  getSubmissionAttachments, setPrimaryAttachment, addSupportingAttachments,
  removeSupportingAttachment, promoteSupportingAttachment,
} from '../src/app/lib/submissionAttachments.js';

const primary = Object.freeze({ name: 'petition.pdf', url: 'https://storage.example/petition.pdf', type: 'pdf', size: '10 KB' });
const proofA = Object.freeze({ name: 'proof-a.pdf', url: 'https://storage.example/proof-a.pdf', type: 'pdf', size: '20 KB' });
const proofB = Object.freeze({ name: 'proof-b.pdf', url: 'https://storage.example/proof-b.pdf', type: 'pdf', size: '30 KB' });
const proofC = Object.freeze({ name: 'proof-c.pdf', url: 'https://storage.example/proof-c.pdf', type: 'pdf', size: '40 KB' });
function selected() { return { primary, supporting: [proofA, proofB] }; }

test('legacy first attachment remains the primary and subsequent order remains unchanged', () => {
  const original = Object.freeze([primary, proofA, proofB]);
  const selection = createAttachmentSelection(original);
  assert.deepEqual(selection, selected());
  assert.equal(selection.primary, primary);
  assert.notEqual(selection.supporting, original);
  assert.deepEqual(getSubmissionAttachments(selection), original);
});

test('deleting the primary preserves supports without silently promoting any of them', () => {
  const original = selected();
  const removed = setPrimaryAttachment(original, null);
  assert.equal(removed.primary, null);
  assert.deepEqual(removed.supporting, [proofA, proofB]);
  assert.deepEqual(getDraftAttachments(removed), [proofA, proofB]);
  assert.throws(() => getSubmissionAttachments(removed), /ไฟล์คำร้องหลัก/);
  assert.deepEqual(original, selected());
});

test('versioned explicit null survives JSON draft save/restore even with flattened support attachments', () => {
  const selection = { primary: null, supporting: [proofA, proofB] };
  const draft = JSON.parse(JSON.stringify({
    attachmentSelection: { version: 1, ...selection }, attachments: getDraftAttachments(selection),
  }));
  const restored = restoreAttachmentSelection(draft);
  assert.deepEqual(restored, selection);
  assert.equal(restored.primary, null);
  assert.throws(() => getSubmissionAttachments(restored));
});

test('explicit unversioned selection wins over a stale legacy attachments list', () => {
  assert.deepEqual(restoreAttachmentSelection({
    attachments: [proofC], attachmentSelection: selected(),
  }), selected());
});

test('drafts lacking explicit selection restore the legacy array without guessing file roles', () => {
  assert.deepEqual(restoreAttachmentSelection({ attachments: [primary, proofA, proofB] }), selected());
  assert.deepEqual(restoreAttachmentSelection({}), { primary: null, supporting: [] });
  assert.deepEqual(restoreAttachmentSelection(null), { primary: null, supporting: [] });
});

test('malformed explicit selection fails closed instead of promoting legacy/supporting files', () => {
  for (const value of [
    null, undefined, 'not-selection', [], {},
    { supporting: [proofA] }, { primary: primary },
    { primary: {}, supporting: [proofA] },
    { primary: null, supporting: 'wrong' },
    { primary, supporting: [null] },
    { primary, supporting: [proofA], version: 2 },
    { primary: { ...primary, url: '' }, supporting: [proofA] },
  ]) {
    const result = restoreAttachmentSelection({ attachments: [primary, proofA], attachmentSelection: value });
    assert.deepEqual(result, { primary: null, supporting: [] });
    assert.throws(() => getSubmissionAttachments(result));
  }
});

test('setting/replacing primary never reorders supports or removes their data', () => {
  const withoutPrimary = { primary: null, supporting: [proofA, proofB] };
  const result = setPrimaryAttachment(withoutPrimary, primary);
  assert.deepEqual(result, selected());
  assert.deepEqual(withoutPrimary, { primary: null, supporting: [proofA, proofB] });
});

test('adding/removing supporting files leaves the primary unchanged', () => {
  const original = Object.freeze({ primary, supporting: Object.freeze([proofA]) });
  const added = addSupportingAttachments(original, Object.freeze([proofB, proofC]));
  assert.equal(added.primary, primary);
  assert.deepEqual(added.supporting, [proofA, proofB, proofC]);
  const removed = removeSupportingAttachment(added, 1);
  assert.deepEqual(removed.supporting, [proofA, proofC]);
  assert.equal(removed.primary, primary);
  assert.deepEqual(added.supporting, [proofA, proofB, proofC]);
  assert.deepEqual(original.supporting, [proofA]);
});

test('explicit promotion swaps the old primary into the chosen support slot without data loss', () => {
  const original = Object.freeze({ primary, supporting: Object.freeze([proofA, proofB, proofC]) });
  const result = promoteSupportingAttachment(original, 1);
  assert.equal(result.primary, proofB);
  assert.deepEqual(result.supporting, [proofA, primary, proofC]);
  assert.deepEqual(getSubmissionAttachments(result), [proofB, proofA, primary, proofC]);
  assert.deepEqual(original.supporting, [proofA, proofB, proofC]);
});

test('promotion with no primary removes only the chosen support and preserves remaining order', () => {
  const original = { primary: null, supporting: [proofA, proofB, proofC] };
  const result = promoteSupportingAttachment(original, 1);
  assert.equal(result.primary, proofB);
  assert.deepEqual(result.supporting, [proofA, proofC]);
  assert.deepEqual(original, { primary: null, supporting: [proofA, proofB, proofC] });
});

test('invalid support indexes do not remove or promote files', () => {
  for (const index of [-1, 99, 0.5, NaN, undefined]) {
    assert.deepEqual(removeSupportingAttachment(selected(), index), selected());
    assert.deepEqual(promoteSupportingAttachment(selected(), index), selected());
  }
});

test('submission requires an explicitly selected PDF primary but drafts can retain a legacy image', () => {
  const image = { name: 'legacy.png', url: 'https://storage.example/legacy.png', type: 'image', size: '4 KB' };
  const selection = createAttachmentSelection([image, proofA]);
  assert.deepEqual(getDraftAttachments(selection), [image, proofA]);
  assert.throws(() => getSubmissionAttachments(selection), /PDF/);
  assert.throws(() => getSubmissionAttachments({ primary: null, supporting: [primary] }), /ไฟล์คำร้องหลัก/);
});

test('malformed new attachment arguments are rejected without mutating the source selection', () => {
  const original = selected();
  assert.throws(() => setPrimaryAttachment(original, {}), TypeError);
  assert.throws(() => addSupportingAttachments(original, [proofC, {}]), TypeError);
  assert.deepEqual(original, selected());
});

test('mutating returned arrays cannot change existing draft or selected file order', () => {
  const original = selected();
  const flattened = getDraftAttachments(original);
  flattened.reverse();
  const restored = restoreAttachmentSelection({ attachmentSelection: original });
  restored.supporting.pop();
  assert.deepEqual(original, selected());
});
