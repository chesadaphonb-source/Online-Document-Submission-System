import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSignaturePlacement } from '../src/app/lib/saveSignaturePlacement.js';

const BEFORE = '2026-11-03T00:00:00Z';
const AFTER = '2026-11-03T01:00:00.000Z';

function fixture() {
  const submission = {
    id: 'synthetic-document', formType: 'synthetic-form', status: 'approved', updatedAt: BEFORE,
    signatureHash: 'unchanged-verification-hash',
    attachments: [{ name: 'petition.png', type: 'image', url: 'unsigned-source.png', size: '1 KB' }, { name: 'proof.pdf', type: 'pdf', url: 'proof.pdf' }],
    approvalSteps: [{
      level: 1, roleName: 'อาจารย์ที่ปรึกษา', status: 'approved', approverId: 'synthetic-approver',
      approverName: 'ผู้ลงนามทดสอบ', timestamp: BEFORE, comment: 'original approval',
      signatureData: 'synthetic-image', signatureX: 30, signatureY: 60,
      dateBlock: '03/11/2569', dateX: 40, dateY: 70,
      extraTextBlocks: [{ val: 'ข้อความทดสอบ', x: 20, y: 22, size: 10, optional: undefined }],
      optional: undefined,
    }],
  };
  const updatedSteps = structuredClone(submission.approvalSteps);
  updatedSteps[0].signatureX = 33;
  updatedSteps[0].dateY = 72;
  return { submission, updatedSteps };
}

function harness({ uploadError, dbError, row, generationError, generationBlob, transportError } = {}) {
  const events = [];
  const filters = [];
  const updates = [];
  const paths = [];
  const bucket = {
    async upload(storagePath, blob, options) {
      events.push('upload'); paths.push(storagePath);
      assert.equal(blob.type, 'application/pdf');
      assert.deepEqual(options, { contentType: 'application/pdf', upsert: false });
      return { error: uploadError };
    },
    getPublicUrl(storagePath) { events.push('url'); return { data: { publicUrl: `https://storage.example/${storagePath}` } }; },
  };
  const storage = { from(name) { assert.equal(name, 'attachments'); return bucket; } };
  const query = {
    update(changes) { events.push('update'); updates.push(changes); return query; },
    eq(key, value) { filters.push([key, value]); return query; },
    select(columns) { assert.equal(columns, 'id,updated_at'); return query; },
    async single() {
      events.push('confirm');
      if (transportError) throw transportError;
      return { error: dbError, data: row === undefined ? { id: 'synthetic-document', updated_at: AFTER } : row };
    },
  };
  const client = { from(name) { assert.equal(name, 'submissions'); return query; } };
  async function generatePdf(candidate, source, filename) {
    events.push('generate');
    if (generationError) throw generationError;
    assert.equal(candidate.status, 'approved');
    assert.equal(candidate.approvalSteps[0].signatureX, 33);
    assert.equal(candidate.originalAttachmentUrl, source);
    assert.equal(filename, 'petition.png');
    return generationBlob ?? new Blob(['%PDF-synthetic'], { type: 'application/pdf' });
  }
  return { client, storage, generatePdf, events, filters, updates, paths };
}

function options(value, extra = {}) { return { ...fixture(), ...value, adminName: 'ผู้ดูแลทดสอบ', now: AFTER, ...extra }; }

test('generate then upload then one CAS update; complete metadata is returned only after confirmation', async () => {
  const dependencies = harness();
  const input = fixture();
  const original = structuredClone(input);
  const result = await saveSignaturePlacement(options(dependencies, input));
  assert.deepEqual(dependencies.events, ['generate', 'upload', 'url', 'update', 'confirm']);
  assert.equal(dependencies.updates.length, 1);
  assert.deepEqual(dependencies.filters, [['id', input.submission.id], ['updated_at', BEFORE]]);
  assert.deepEqual(Object.keys(dependencies.updates[0]).sort(), [
    'approval_steps', 'attachments', 'original_attachment_url', 'signature_adjusted_at', 'signature_adjusted_by', 'updated_at',
  ].sort());
  assert.equal(result.changes.approvalSteps[0].signatureX, 33);
  assert.equal(result.changes.signatureAdjustedAt, AFTER);
  assert.equal(result.changes.signatureAdjustedBy, 'ผู้ดูแลทดสอบ');
  assert.equal(result.changes.originalAttachmentUrl, 'unsigned-source.png');
  assert.equal(result.changes.attachments[0].name, 'petition.pdf');
  assert.equal(result.changes.attachments[0].type, 'pdf');
  assert.deepEqual(result.changes.attachments[1], input.submission.attachments[1]);
  assert.equal(result.changes.updatedAt, AFTER);
  assert.match(result.storagePath, /^submissions\/synthetic-document\/adjusted_[0-9a-f-]{36}\.pdf$/);
  assert.deepEqual(input, original);
});

test('PDF generation failure or empty result cannot upload or modify database', async () => {
  for (const settings of [{ generationError: new Error('missing original') }, { generationBlob: new Blob([]) }]) {
    const dependencies = harness(settings);
    await assert.rejects(saveSignaturePlacement(options(dependencies)), error => error.code === 'generation');
    assert.deepEqual(dependencies.events, ['generate']);
  }
});

test('database is not touched while generation or upload is still pending', async () => {
  const dependencies = harness();
  let finishGeneration;
  let finishUpload;
  const generationBarrier = new Promise(resolve => { finishGeneration = resolve; });
  const uploadBarrier = new Promise(resolve => { finishUpload = resolve; });
  const originalGenerate = dependencies.generatePdf;
  dependencies.generatePdf = async (...args) => {
    dependencies.events.push('generation-start');
    await generationBarrier;
    return originalGenerate(...args);
  };
  const bucket = dependencies.storage.from('attachments');
  const originalUpload = bucket.upload;
  bucket.upload = async (...args) => {
    const result = await originalUpload(...args);
    await uploadBarrier;
    return result;
  };
  const pending = saveSignaturePlacement(options(dependencies));
  await Promise.resolve();
  assert.deepEqual(dependencies.events, ['generation-start']);
  assert.deepEqual(dependencies.updates, []);
  finishGeneration();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(dependencies.events, ['generation-start', 'generate', 'upload']);
  assert.deepEqual(dependencies.updates, []);
  finishUpload();
  await pending;
  assert.deepEqual(dependencies.events, ['generation-start', 'generate', 'upload', 'url', 'update', 'confirm']);
});

test('upload failure leaves database untouched and propagates a clear failure', async () => {
  const dependencies = harness({ uploadError: new Error('storage denied') });
  await assert.rejects(saveSignaturePlacement(options(dependencies)), error => error.code === 'upload');
  assert.deepEqual(dependencies.events, ['generate', 'upload']);
  assert.deepEqual(dependencies.updates, []);
});

test('stale version / no affected row is a conflict after upload, never a successful save', async () => {
  for (const settings of [{ row: null }, { row: null, dbError: { code: 'PGRST116' } }]) {
    const dependencies = harness(settings);
    await assert.rejects(saveSignaturePlacement(options(dependencies)), error => error.code === 'conflict');
    assert.deepEqual(dependencies.filters, [['id', 'synthetic-document'], ['updated_at', BEFORE]]);
    assert.equal(dependencies.updates.length, 1);
    assert.deepEqual(dependencies.events, ['generate', 'upload', 'url', 'update', 'confirm']);
  }
});

test('database error or transport rejection propagates failure without a second write or file deletion', async () => {
  for (const settings of [{ dbError: { code: '42501', message: 'denied' } }, { transportError: new Error('offline') }]) {
    const dependencies = harness(settings);
    await assert.rejects(saveSignaturePlacement(options(dependencies)), error => error.code === 'database');
    assert.equal(dependencies.updates.length, 1);
    assert.equal(dependencies.paths.length, 1);
    assert.equal(dependencies.events.includes('delete'), false);
  }
});

test('missing attachment/source/version is rejected before generating or uploading', async () => {
  for (const edit of [
    submission => { submission.attachments = []; },
    submission => { submission.attachments[0].url = ''; },
    submission => { submission.updatedAt = ''; },
  ]) {
    const dependencies = harness();
    const input = fixture(); edit(input.submission);
    await assert.rejects(saveSignaturePlacement(options(dependencies, input)));
    assert.deepEqual(dependencies.events, []);
  }
});

test('workflow changes cannot be hidden inside position edits', async () => {
  for (const field of ['level', 'roleName', 'status', 'approverId', 'approverName', 'timestamp']) {
    const dependencies = harness();
    const input = fixture(); input.updatedSteps[0][field] = `changed-${field}`;
    await assert.rejects(saveSignaturePlacement(options(dependencies, input)), error => error.code === 'invalid-workflow');
    assert.deepEqual(dependencies.events, []);
  }
});

test('non-layout approval evidence and undefined optional fields are preserved', async () => {
  const dependencies = harness();
  const input = fixture();
  input.updatedSteps[0].comment = 'must not overwrite approved comment';
  const result = await saveSignaturePlacement(options(dependencies, input));
  assert.equal(result.changes.approvalSteps[0].comment, 'original approval');
  assert.equal(result.changes.approvalSteps[0].approverId, input.submission.approvalSteps[0].approverId);
  assert.equal(result.changes.approvalSteps[0].dateBlock, '03/11/2569');
  assert.equal(Object.hasOwn(result.changes.approvalSteps[0], 'optional'), true);
  assert.equal(Object.hasOwn(result.changes.approvalSteps[0].extraTextBlocks[0], 'optional'), true);
  assert.equal(Object.hasOwn(result.changes, 'status'), false);
  assert.equal(Object.hasOwn(result.changes, 'signatureHash'), false);
});

test('raw upload, previously adjusted document and independent documents keep their own originals', async () => {
  for (const source of ['unsigned-source.png', 'second-source.png', 'third-source.png']) {
    const dependencies = harness();
    const input = fixture();
    if (source === 'unsigned-source.png') input.submission.attachments[0].url = source;
    else {
      input.submission.originalAttachmentUrl = source;
      input.submission.attachments[0].url = 'already-adjusted.pdf';
    }
    let actualSource;
    const generate = dependencies.generatePdf;
    dependencies.generatePdf = (...args) => { actualSource = args[1]; return generate(...args); };
    const result = await saveSignaturePlacement(options(dependencies, input));
    assert.equal(actualSource, source);
    assert.equal(result.changes.originalAttachmentUrl, source);
  }
});

test('mock mode generates before creating its attachment and never uses storage or database', async () => {
  const dependencies = harness();
  const result = await saveSignaturePlacement(options(dependencies, { client: null }));
  assert.deepEqual(dependencies.events, ['generate']);
  assert.equal(result.storagePath, undefined);
  assert.match(result.changes.attachments[0].url, /^blob:/);
  assert.equal(result.changes.approvalSteps[0].signatureX, 33);
  URL.revokeObjectURL(result.changes.attachments[0].url);
});

test('confirmed server timestamp is retained for the next compare-and-set save', async () => {
  const serverTime = '2026-11-03T01:00:00.123456+00:00';
  const dependencies = harness({ row: { id: 'synthetic-document', updated_at: serverTime } });
  const result = await saveSignaturePlacement(options(dependencies));
  assert.equal(result.changes.updatedAt, serverTime);
});

test('equal or behind device clocks still advance the opening CAS timestamp by at least 1ms', async () => {
  const expected = '2026-11-03T00:00:00.001Z';
  for (const now of [BEFORE, '2026-11-02T23:59:59.999Z']) {
    const dependencies = harness({ row: { id: 'synthetic-document', updated_at: expected } });
    const result = await saveSignaturePlacement(options(dependencies, { now }));
    assert.equal(dependencies.updates[0].updated_at, expected);
    assert.equal(result.changes.updatedAt, expected);
    assert.equal(result.changes.signatureAdjustedAt, expected);
    assert.deepEqual(dependencies.filters, [['id', 'synthetic-document'], ['updated_at', BEFORE]]);
  }
});

test('a PostgreSQL microsecond opening version is followed by a strictly later canonical ISO timestamp', async () => {
  const input = fixture();
  input.submission.updatedAt = '2026-11-03T00:00:00.123456+00:00';
  const expected = '2026-11-03T00:00:00.124Z';
  const dependencies = harness({ row: { id: 'synthetic-document', updated_at: expected } });
  const result = await saveSignaturePlacement(options(dependencies, { ...input, now: '2026-11-03T00:00:00.123Z' }));
  assert.equal(result.changes.updatedAt, expected);
  assert.equal(dependencies.filters[1][1], input.submission.updatedAt);
});

test('valid offset timestamps are normalized to ISO UTC before persistence', async () => {
  const dependencies = harness();
  await saveSignaturePlacement(options(dependencies, { now: () => '2026-11-03T08:00:00+07:00' }));
  assert.equal(dependencies.updates[0].updated_at, AFTER);
});

test('invalid supplied or opening timestamps fail before generation, upload or persistence', async () => {
  for (const now of ['not-a-date', '', '2026-99-99T00:00:00Z', NaN]) {
    const dependencies = harness();
    await assert.rejects(saveSignaturePlacement(options(dependencies, { now })), error => error.code === 'invalid-time');
    assert.deepEqual(dependencies.events, []);
  }
  const dependencies = harness();
  const input = fixture(); input.submission.updatedAt = 'invalid-opening-version';
  await assert.rejects(saveSignaturePlacement(options(dependencies, input)), error => error.code === 'invalid-version');
  assert.deepEqual(dependencies.events, []);
});
