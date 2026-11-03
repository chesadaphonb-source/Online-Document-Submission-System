import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = new URL('../src/app/context/SubmissionsContext.tsx', import.meta.url);
const output = new URL('../tmp/admin-placement-tests/placement-context.mjs', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await build({ entryPoints: [fileURLToPath(entry)], outfile: fileURLToPath(output), bundle: true,
  platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'placement-context-fixtures', setup(builder) {
    builder.onResolve({ filter: /NotificationContext$/ }, () => ({ path: 'notifications', namespace: 'context-fixture' }));
    builder.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'database', namespace: 'context-fixture' }));
    builder.onResolve({ filter: /generateApprovalPDF$/ }, () => ({ path: 'generator', namespace: 'context-fixture' }));
    builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'context-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'context-fixture' }, ({ path }) => ({ contents:
      path === 'notifications' ? 'export function useNotifications(){ return {addNotification:n=>globalThis.__placementContext.notifications.push(n),addNotifications:n=>globalThis.__placementContext.notifications.push(...n)}; }'
      : path === 'database' ? 'export const isSupabaseConfigured=true; export const supabase=globalThis.__placementContext.client; export const supabaseStorage=supabase;'
      : path === 'generator' ? 'export async function generateCertificateHash(){ return "fixture"; } export async function generateAdjustedPDFBlob(...args){ return globalThis.__placementContext.generate(...args); }'
      : 'export const toast=new Proxy({},{get:(_target,kind)=>(...args)=>{globalThis.__placementContext.toasts.push({kind,args});return "fixture-toast";}});',
    }));
  } }],
});

const rowFixture = () => ({ id: 'context-fixture', form_type: 'fixture-form', form_name: 'แบบทดสอบ',
  status: 'pending_close', submitted_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-03T00:00:00Z',
  approval_steps: [{ level: 1, roleName: 'ผู้อนุมัติ', approverId: 'approver-fixture', approverName: 'ข้อมูลตัวอย่าง',
    status: 'approved', timestamp: '2026-11-03T00:00:00Z', signatureData: 'fixture-image', signatureX: 10, signatureY: 20 }],
  attachments: [{ name: 'fixture.pdf', url: 'https://fixture.invalid/original.pdf', type: 'pdf' }],
});
const fixture = { row: null, calls: [], notifications: [], toasts: [], uploadFailure: false, conflict: false,
  generate: async () => new Blob(['fixture-pdf'], { type: 'application/pdf' }),
};
fixture.client = {
  storage: { from: () => ({
    async upload() { fixture.calls.push('upload'); return { error: fixture.uploadFailure ? new Error('Fixture upload failure') : null }; },
    getPublicUrl: path => ({ data: { publicUrl: `https://fixture.invalid/${path}` } }),
  }) },
  from() { return {
    select: () => ({ order: async () => ({ data: [structuredClone(fixture.row)], error: null }) }),
    update(changes) {
      fixture.calls.push({ update: changes });
      const filters = [];
      const query = { eq(key, value) { filters.push([key, value]); return query; },
        select() { return { async single() {
          fixture.calls.push({ filters });
          return fixture.conflict ? { data: null, error: { code: 'PGRST116' } }
            : { data: { id: fixture.row.id, updated_at: changes.updated_at }, error: null };
        } }; },
      };
      return query;
    },
  }; },
};
globalThis.__placementContext = fixture;
const context = await import(pathToFileURL(fileURLToPath(output)).href);

async function mount() {
  fixture.row = rowFixture(); fixture.calls = []; fixture.notifications = []; fixture.toasts = [];
  fixture.uploadFailure = false; fixture.conflict = false;
  let value;
  function Probe() { value = context.useSubmissions(); return null; }
  let renderer;
  await act(async () => { renderer = TestRenderer.create(createElement(context.SubmissionsProvider, null, createElement(Probe))); });
  const source = structuredClone(value.submissions.find(row => row.id === fixture.row.id));
  return { get value() { return value; }, source,
    edits: source.approvalSteps.map(step => ({ ...step, signatureX: 25 })),
    async dispose() { await act(async () => renderer.unmount()); },
  };
}

test('real Context returns upload failure to the modal contract and retains old positions/file', async () => {
  const ui = await mount(); const originalError = console.error; console.error = () => {};
  try {
    fixture.uploadFailure = true;
    let saved;
    await act(async () => { saved = await ui.value.updateSignaturePositions(ui.source.id, ui.source.formType, ui.edits, [], 'Admin', ui.source); });
    assert.equal(saved, false);
    assert.equal(ui.value.submissions[0].approvalSteps[0].signatureX, 10);
    assert.equal(ui.value.submissions[0].attachments[0].url, ui.source.attachments[0].url);
    assert.equal(fixture.calls.filter(call => call.update).length, 0);
    assert.equal(fixture.notifications.length, 0);
  } finally { console.error = originalError; await ui.dispose(); }
});

test('real Context publishes the new file/coordinates together only after one confirmed CAS update', async () => {
  const ui = await mount();
  try {
    let saved;
    await act(async () => { saved = await ui.value.updateSignaturePositions(ui.source.id, ui.source.formType, ui.edits, [], 'Admin', ui.source); });
    assert.equal(saved, true);
    assert.equal(ui.value.submissions[0].approvalSteps[0].signatureX, 25);
    assert.notEqual(ui.value.submissions[0].attachments[0].url, ui.source.attachments[0].url);
    assert.equal(ui.value.submissions[0].originalAttachmentUrl, ui.source.attachments[0].url);
    assert.equal(ui.value.submissions[0].status, 'pending_close');
    assert.equal(fixture.calls.filter(call => call.update).length, 1);
    assert.deepEqual(fixture.calls.find(call => call.filters).filters, [['id', ui.source.id], ['updated_at', ui.source.updatedAt]]);
    assert.equal(fixture.notifications.length, 0);
  } finally { await ui.dispose(); }
});

test('real Context propagates conflicts and refuses unverified cross-document copies', async () => {
  const ui = await mount(); const originalError = console.error; console.error = () => {};
  try {
    let saved;
    await act(async () => { saved = await ui.value.updateSignaturePositions(ui.source.id, ui.source.formType, ui.edits, ['other-fixture'], 'Admin', ui.source); });
    assert.equal(saved, false);
    assert.equal(fixture.calls.length, 0);
    fixture.conflict = true;
    await act(async () => { saved = await ui.value.updateSignaturePositions(ui.source.id, ui.source.formType, ui.edits, [], 'Admin', ui.source); });
    assert.equal(saved, false);
    assert.equal(ui.value.submissions[0].approvalSteps[0].signatureX, 10);
    assert.equal(ui.value.submissions[0].attachments[0].url, ui.source.attachments[0].url);
  } finally { console.error = originalError; await ui.dispose(); }
});
