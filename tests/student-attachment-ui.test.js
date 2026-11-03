import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const output = new URL(`../tmp/student-attachment-tests/component-${process.pid}.mjs`, import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await build({
  stdin: { contents: `export { SubmitForm } from './src/app/components/student/SubmitForm.tsx';
    export { AttachmentUploadFields, AttachmentReview } from './src/app/components/student/AttachmentUploadFields.tsx';`,
    resolveDir: projectRoot, sourcefile: 'student-attachment-test-entry.js', loader: 'js' },
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm',
  packages: 'external', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'student-attachment-fixtures', setup(builder) {
    builder.onResolve({ filter: /\/context\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'student-fixture' }));
    builder.onResolve({ filter: /\/context\/SubmissionsContext$/ }, () => ({ path: 'submissions', namespace: 'student-fixture' }));
    builder.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'database', namespace: 'student-fixture' }));
    builder.onResolve({ filter: /\/data\/mockData$/ }, () => ({ path: 'templates', namespace: 'student-fixture' }));
    builder.onResolve({ filter: /\/lib\/fileCache$/ }, () => ({ path: 'cache', namespace: 'student-fixture' }));
    builder.onResolve({ filter: /^react-router$/ }, () => ({ path: 'router', namespace: 'student-fixture' }));
    builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'student-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'student-fixture' }, ({ path }) => ({ contents:
      path === 'auth' ? 'export function useAuth(){return {currentUser:globalThis.__studentAttachmentFixture.user};}'
      : path === 'submissions' ? 'export function useSubmissions(){return {addSubmission:submission=>{globalThis.__studentAttachmentFixture.submitted.push(structuredClone(submission));}};}'
      : path === 'database' ? `export const isSupabaseConfigured=true;
          export const supabase={from:table=>globalThis.__studentAttachmentFixture.query(table),
            storage:{from:bucket=>globalThis.__studentAttachmentFixture.bucket(bucket)}};
          export const supabaseStorage=supabase;`
      : path === 'router' ? 'export function useNavigate(){return path=>globalThis.__studentAttachmentFixture.navigations.push(path);}'
      : path === 'cache' ? 'export async function getCachedFileUrl(url){return url;}'
      : path === 'templates' ? `export const mockStudents=[]; export const formTemplates=[{
          id:'fixture-student-form',name:'คำร้องตัวอย่างทดสอบ',nameEn:'Synthetic test petition',
          description:'Synthetic fixture only',category:'academic',estimatedDays:3,
          approvalLevels:[{level:1,role:'ผู้อนุมัติทดสอบ'}],
          fields:[{id:'request_topic',label:'รายละเอียดทดสอบ',type:'text',required:true,placeholder:'กรอกรายละเอียดทดสอบ'}],
          campus:'bangkhen',degree_level:'all',iconBg:'',bgClass:'',colorClass:''}];`
      : 'export const toast=new Proxy({},{get:(_target,kind)=>(...args)=>globalThis.__studentAttachmentFixture.toasts.push({kind,args})});',
    }));
  } }],
});
const { SubmitForm, AttachmentUploadFields, AttachmentReview } = await import(pathToFileURL(fileURLToPath(output)).href);

const USER_ID = 'synthetic-student';
const DRAFT_KEY = `ku_paper_draft_${USER_ID}`;
const text = node => typeof node === 'string' ? node : node.children?.map(text).join('') || '';
const host = node => typeof node.type === 'string';
const attachment = name => ({ name, url: `https://fixture.invalid/${name}`, type: 'pdf', size: '1 KB' });
const pdfFile = name => new File(['%PDF-synthetic'], name, { type: 'application/pdf' });

async function mount({ draft, storageValues } = {}) {
  const globals = ['localStorage', 'fetch', '__studentAttachmentFixture'];
  const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map(storageValues || []);
  if (draft) values.set(DRAFT_KEY, JSON.stringify(draft));
  const state = {
    user: { id: USER_ID, name: 'ข้อมูลนิสิตจำลอง', email: 'fixture@example.invalid', role: 'student',
      campus: 'bangkhen', level: 'ปริญญาตรี', department: '', faculty: 'คณะทดสอบ' },
    submitted: [], navigations: [], toasts: [], uploads: [], uploadBarrier: null, renderer: null,
    query(table) {
      assert.ok(['forms_library', 'teachers'].includes(table));
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
      return query;
    },
    bucket(bucket) {
      assert.equal(bucket, 'attachments');
      return {
        async upload(path, file) {
          state.uploads.push({ path, name: file.name });
          if (state.uploadBarrier) await state.uploadBarrier;
          return { error: null };
        },
        getPublicUrl(path) { return { data: { publicUrl: `https://fixture.invalid/${path}` } }; },
      };
    },
  };
  Object.defineProperty(globalThis, '__studentAttachmentFixture', { configurable: true, writable: true, value: state });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
  } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: () => { throw new Error('Unexpected network call in hermetic student UI test'); } });
  await act(async () => {
    state.renderer = TestRenderer.create(createElement(SubmitForm), { createNodeMock: () => ({ click() {}, focus() {} }) });
  });
  const findAll = predicate => state.renderer.root.findAll(node => host(node) && predicate(node));
  const button = label => {
    const result = findAll(node => node.type === 'button' && text(node).trim().includes(label));
    assert.equal(result.length, 1, `Expected one button: ${label}`);
    return result[0];
  };
  const input = role => findAll(node => node.type === 'input' && node.props['aria-label'] === (role === 'primary' ? 'เลือกคำร้องหลักสำหรับลงนาม' : 'เลือกเอกสารประกอบ'))[0];
  return {
    state, values, button, input, findAll,
    fields() { return state.renderer.root.findAllByType(AttachmentUploadFields)[0] || null; },
    review() { return state.renderer.root.findAllByType(AttachmentReview)[0] || null; },
    async click(label) { await act(async () => { await button(label).props.onClick(); }); },
    async clickAria(label) {
      const item = findAll(node => node.type === 'button' && node.props['aria-label'] === label)[0];
      assert.ok(item, `Missing action: ${label}`);
      await act(async () => { item.props.onClick(); });
    },
    async upload(role, names) {
      await act(async () => { input(role).props.onChange({ target: { files: names.map(pdfFile), value: 'fixture-selected' } }); });
    },
    async toAttachments() {
      await this.click('คำร้องตัวอย่างทดสอบ');
      await this.click('ถัดไป');
      const field = findAll(node => node.type === 'input' && node.props.placeholder === 'กรอกรายละเอียดทดสอบ')[0];
      assert.ok(field);
      await act(async () => { field.props.onChange({ target: { value: 'รายละเอียดจากการทดสอบจริงผ่านฟอร์ม' } }); });
      await this.click('ถัดไป');
      assert.ok(this.fields());
    },
    async dispose() {
      await act(async () => { state.renderer.unmount(); });
      for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    },
  };
}

test('actual upload fields use one primary input, multiple supports and the correct preview URLs', async () => {
  const ui = await mount();
  try {
    await ui.toAttachments();
    assert.notEqual(ui.input('primary').props.multiple, true);
    assert.equal(ui.input('supporting').props.multiple, true);
    await ui.upload('primary', ['main.pdf']);
    await ui.upload('supporting', ['proof-a.pdf', 'proof-b.pdf']);
    const selection = ui.fields().props.selection;
    assert.equal(selection.primary.name, 'main.pdf');
    assert.deepEqual(selection.supporting.map(file => file.name), ['proof-a.pdf', 'proof-b.pdf']);
    for (const file of [selection.primary, ...selection.supporting]) {
      const link = ui.findAll(node => node.type === 'a' && node.props['aria-label'] === `เปิดตรวจสอบ ${file.name}`)[0];
      assert.equal(link.props.href, file.url);
      assert.equal(link.props.target, '_blank');
    }
  } finally { await ui.dispose(); }
});

test('support-only uploads cannot advance to review or submit a petition', async () => {
  const ui = await mount();
  try {
    await ui.toAttachments();
    await ui.upload('supporting', ['proof.pdf']);
    await ui.click('ถัดไป');
    assert.equal(ui.fields().props.selection.primary, null);
    assert.equal(ui.fields().props.selection.supporting[0].name, 'proof.pdf');
    assert.equal(ui.review(), null);
    assert.equal(ui.findAll(node => node.type === 'button' && text(node).includes('ยืนยันส่งคำร้อง')).length, 0);
    assert.deepEqual(ui.state.submitted, []);
  } finally { await ui.dispose(); }
});

test('deleting the primary retains supports and blocks Next until the student explicitly promotes one', async () => {
  const ui = await mount();
  try {
    await ui.toAttachments();
    await ui.upload('primary', ['main.pdf']);
    await ui.upload('supporting', ['proof.pdf']);
    await ui.clickAria('ลบคำร้องหลัก');
    assert.equal(ui.fields().props.selection.primary, null);
    assert.deepEqual(ui.fields().props.selection.supporting.map(file => file.name), ['proof.pdf']);
    await ui.click('ถัดไป');
    assert.ok(ui.fields());
    assert.equal(ui.review(), null);
    await ui.clickAria('ใช้ proof.pdf เป็นคำร้องหลัก');
    await ui.click('ถัดไป');
    assert.equal(ui.review().props.selection.primary.name, 'proof.pdf');
    assert.deepEqual(ui.review().props.selection.supporting, []);
  } finally { await ui.dispose(); }
});

test('explicit promotion is reflected in the actual review and submitted primary-first attachment array', async () => {
  const ui = await mount();
  try {
    await ui.toAttachments();
    await ui.upload('primary', ['main.pdf']);
    await ui.upload('supporting', ['proof-a.pdf', 'proof-b.pdf']);
    await ui.clickAria('ใช้ proof-b.pdf เป็นคำร้องหลัก');
    await ui.click('ถัดไป');
    const selection = ui.review().props.selection;
    assert.equal(selection.primary.name, 'proof-b.pdf');
    assert.deepEqual(selection.supporting.map(file => file.name), ['proof-a.pdf', 'main.pdf']);
    const primaryPreview = ui.findAll(node => node.type === 'a' && node.props['aria-label'] === 'เปิดตรวจสอบ proof-b.pdf')[0];
    assert.equal(primaryPreview.props.href, selection.primary.url);
    await ui.click('ยืนยันส่งคำร้อง');
    assert.equal(ui.state.submitted.length, 1);
    const submitted = ui.state.submitted[0];
    assert.equal(submitted.formType, 'fixture-student-form');
    assert.equal(submitted.formData.request_topic, 'รายละเอียดจากการทดสอบจริงผ่านฟอร์ม');
    assert.equal(submitted.approvalSteps[0].roleName, 'ผู้อนุมัติทดสอบ');
    assert.deepEqual(submitted.attachments.map(file => file.name), ['proof-b.pdf', 'proof-a.pdf', 'main.pdf']);
    assert.equal(submitted.attachments[0].url, selection.primary.url);
  } finally { await ui.dispose(); }
});

test('a new draft saved after deleting primary restores explicit null instead of promoting its flattened supports', async () => {
  let savedValues;
  const ui = await mount();
  try {
    await ui.toAttachments();
    await ui.upload('primary', ['main.pdf']);
    await ui.upload('supporting', ['proof.pdf']);
    await ui.clickAria('ลบคำร้องหลัก');
    await ui.click('บันทึกร่าง');
    const draft = JSON.parse(ui.values.get(DRAFT_KEY));
    assert.equal(draft.attachmentSelection.primary, null);
    assert.equal(draft.attachments[0].name, 'proof.pdf');
    savedValues = [...ui.values];
  } finally { await ui.dispose(); }
  const restored = await mount({ storageValues: savedValues });
  try {
    await restored.click('โหลดร่าง');
    await restored.click('ถัดไป');
    assert.equal(restored.fields().props.selection.primary, null);
    assert.equal(restored.fields().props.selection.supporting[0].name, 'proof.pdf');
    await restored.click('ถัดไป');
    assert.equal(restored.review(), null);
    assert.deepEqual(restored.state.submitted, []);
  } finally { await restored.dispose(); }
});

test('actual legacy draft loading preserves its first attachment as primary and can review it', async () => {
  const main = attachment('legacy-main.pdf');
  const proof = attachment('legacy-proof.pdf');
  const ui = await mount({ draft: { formId: 'fixture-student-form', formData: { request_topic: 'legacy draft data' },
    attachments: [main, proof], savedAt: '2026-11-03T00:00:00Z' } });
  try {
    await ui.click('โหลดร่าง');
    await ui.click('ถัดไป');
    assert.deepEqual(ui.fields().props.selection.primary, main);
    assert.deepEqual(ui.fields().props.selection.supporting, [proof]);
    await ui.click('ถัดไป');
    assert.deepEqual(ui.review().props.selection.primary, main);
  } finally { await ui.dispose(); }
});

test('a pending upload disables Next, draft, Back and attachment controls until it settles', async () => {
  const ui = await mount();
  let release;
  try {
    await ui.toAttachments();
    const oldNextHandler = ui.button('ถัดไป').props.onClick;
    ui.state.uploadBarrier = new Promise(resolve => { release = resolve; });
    await ui.upload('primary', ['pending.pdf']);
    assert.equal(ui.state.uploads.length, 1);
    for (const label of ['ถัดไป', 'บันทึกร่าง', 'ย้อนกลับ']) assert.equal(ui.button(label).props.disabled, true, label);
    assert.equal(ui.input('primary').props.disabled, true);
    assert.equal(ui.input('supporting').props.disabled, true);
    await act(async () => { oldNextHandler(); });
    assert.ok(ui.fields());
    assert.equal(ui.review(), null);
    assert.equal(ui.values.has(DRAFT_KEY), false);
    assert.deepEqual(ui.state.submitted, []);
    await act(async () => { release(); });
    assert.equal(ui.fields().props.selection.primary.name, 'pending.pdf');
    assert.equal(ui.button('ถัดไป').props.disabled, false);
    assert.equal(ui.button('บันทึกร่าง').props.disabled, false);
    assert.equal(ui.button('ย้อนกลับ').props.disabled, false);
  } finally { release?.(); await ui.dispose(); }
});

test('actual upload handler rejects multiple primary files without uploading or choosing one silently', async () => {
  const ui = await mount();
  try {
    await ui.toAttachments();
    await ui.upload('primary', ['one.pdf', 'two.pdf']);
    assert.deepEqual(ui.state.uploads, []);
    assert.equal(ui.fields().props.selection.primary, null);
    assert.equal(ui.state.toasts.some(item => item.kind === 'error'), true);
  } finally { await ui.dispose(); }
});
