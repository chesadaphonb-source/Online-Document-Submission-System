import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const output = new URL('../tmp/attachment-reader-tests/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: {
    viewer: fileURLToPath(new URL('../src/app/components/shared/PdfViewerModal.tsx', import.meta.url)),
    signing: fileURLToPath(new URL('../src/app/components/shared/SignatureAndPlaceModal.tsx', import.meta.url)),
  },
  outdir: fileURLToPath(output), outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'synthetic-attachment-reader-services', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', external: true }));
    builder.onResolve({ filter: /(?:^|\/)fileCache$/ }, () => ({ path: 'cache', namespace: 'reader-fixture' }));
    builder.onResolve({ filter: /(?:^|\/)generateApprovalPDF$/ }, () => ({ path: 'exporter', namespace: 'reader-fixture' }));
    builder.onResolve({ filter: /(?:^|\/)DocumentTextOverlay$/ }, () => ({ path: 'overlays', namespace: 'reader-fixture' }));
    builder.onResolve({ filter: /^pdfjs-dist$/ }, () => ({ path: 'pdf', namespace: 'reader-fixture' }));
    builder.onResolve({ filter: /^react-signature-canvas$/ }, () => ({ path: 'canvas', namespace: 'reader-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'reader-fixture' }, ({ path }) => ({ contents:
      path === 'cache' ? `export function getCachedFileUrl(url) { return globalThis.__attachmentReader.cache(url); }
        export async function getCachedFileBlob(url) {
          globalThis.__attachmentReader.blobs.push(url);
          return new Blob(['synthetic-fixture'], {type: /\\.(?:png|jpg|jpeg)$/i.test(url) ? 'image/png' : 'application/pdf'});
        }`
      : path === 'exporter' ? 'export function generateSignedAttachmentPDF(...args) { globalThis.__attachmentReader.signed.push(args); }'
      : path === 'overlays' ? `import { createElement } from 'react';
        export function DocumentTextOverlay({text,children}) { return createElement('div',null,text,children); }
        export function DocumentCheckmarkOverlay() { return null; }`
      : path === 'canvas' ? 'export default function SyntheticCanvas() { return null; }'
      : `export const GlobalWorkerOptions = {};
        export function getDocument() { return {promise:Promise.resolve({numPages:1,
          async getPage() { return {getViewport:()=>({width:560,height:792}),render:()=>({promise:Promise.resolve()})}; }
        })}; }`,
    }));
  } }],
});
const { PdfViewerModal } = await import(pathToFileURL(fileURLToPath(new URL('viewer.mjs', output))).href);
const { SignatureAndPlaceModal } = await import(pathToFileURL(fileURLToPath(new URL('signing.mjs', output))).href);

const mainPdf = { name: 'synthetic-main.pdf', url: 'https://fixture.invalid/main.pdf', type: 'pdf', size: '1 KB' };
const supportPdf = { name: 'synthetic-proof.pdf', url: 'https://fixture.invalid/proof.pdf', type: 'pdf', size: '1 KB' };
const mainImage = { name: 'synthetic-main.png', url: 'https://fixture.invalid/main.png', type: 'image', size: '1 KB' };
const generatedUrl = 'https://fixture.invalid/generated.pdf';
const treeText = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(treeText).join('') : node?.children?.map(treeText).join('') || '';
const isHost = node => typeof node.type === 'string';

async function mount(Component, props, cache) {
  const oldFixture = globalThis.__attachmentReader;
  const oldDocument = globalThis.document;
  const fixture = { signed: [], blobs: [], cacheRequests: [], cache: async url => {
    fixture.cacheRequests.push(url);
    return cache ? cache(url) : `blob:synthetic-${url.split('/').pop()}`;
  } };
  globalThis.__attachmentReader = fixture;
  globalThis.document = { createElement() { return { getContext: () => ({}), toDataURL: () => 'data:image/png;base64,c3ludGhldGlj' }; } };
  let renderer;
  await act(async () => { renderer = TestRenderer.create(createElement(Component, props)); });
  await act(async () => { await Promise.resolve(); });
  return {
    renderer, fixture,
    text: () => treeText(renderer.toJSON()),
    signedButtons: () => renderer.root.findAll(node => isHost(node) && node.type === 'button' && treeText(node).includes('ดาวน์โหลดพร้อมลายเซ็น')),
    async dispose() {
      await act(async () => renderer.unmount());
      oldFixture === undefined ? delete globalThis.__attachmentReader : globalThis.__attachmentReader = oldFixture;
      oldDocument === undefined ? delete globalThis.document : globalThis.document = oldDocument;
    },
  };
}

function viewerProps(attachments) {
  return { attachments, submissionName: 'คำร้องจำลอง', studentName: 'ผู้ยื่นจำลอง', submission: { id: 'synthetic-request' }, onClose() {} };
}
function signingProps(attachments, extra = {}) {
  return { attachments, initialSignature: 'data:image/png;base64,c3ludGhldGlj', existingSteps: [], onConfirm() {}, onCancel() {}, ...extra };
}

test('single-file viewer identifies primary petition and exports only its signed copy', async () => {
  const ui = await mount(PdfViewerModal, viewerProps([mainPdf]));
  try {
    assert.match(ui.text(), /คำร้องหลัก · ใช้ลงนาม/);
    assert.equal(ui.signedButtons().length, 1);
    await act(async () => ui.signedButtons()[0].props.onClick());
    assert.equal(ui.fixture.signed[0][2], mainPdf.name);
  } finally { await ui.dispose(); }
});

test('supporting PDF remains viewable/downloadable but has no signed export and never inherits previous cached URL', async () => {
  let finishSupport;
  const pending = new Promise(resolve => { finishSupport = resolve; });
  const ui = await mount(PdfViewerModal, viewerProps([mainPdf, supportPdf]), url => url === supportPdf.url ? pending : Promise.resolve('blob:synthetic-main'));
  try {
    const button = ui.renderer.root.findByProps({ 'aria-label': `เอกสารประกอบ: ${supportPdf.name}` });
    await act(async () => button.props.onClick());
    assert.equal(ui.signedButtons().length, 0);
    let original = ui.renderer.root.findAll(node => isHost(node) && node.type === 'a' && node.props.download === supportPdf.name)[0];
    assert.equal(original.props.href, supportPdf.url);
    assert.equal(ui.renderer.root.findByType('iframe').props.src, '');
    await act(async () => { finishSupport('blob:synthetic-proof'); await pending; });
    original = ui.renderer.root.findAll(node => isHost(node) && node.type === 'a' && node.props.download === supportPdf.name)[0];
    assert.equal(original.props.href, 'blob:synthetic-proof');
    assert.match(ui.text(), /เอกสารประกอบ/);
  } finally { finishSupport('blob:synthetic-proof'); await ui.dispose(); }
});

test('primary image does not make a supporting PDF eligible for signed export', async () => {
  const ui = await mount(PdfViewerModal, viewerProps([mainImage, supportPdf]));
  try {
    assert.equal(ui.signedButtons().length, 0);
    await act(async () => ui.renderer.root.findByProps({ 'aria-label': `เอกสารประกอบ: ${supportPdf.name}` }).props.onClick());
    assert.equal(ui.signedButtons().length, 0);
  } finally { await ui.dispose(); }
});

test('signing uses only first PDF and explains supporting files without offering alternate targets', async () => {
  const ui = await mount(SignatureAndPlaceModal, signingProps([mainPdf, supportPdf], { extraPdfUrl: generatedUrl, extraPdfLabel: 'generated-extra.pdf' }));
  try {
    assert.deepEqual(ui.fixture.blobs, [mainPdf.url]);
    assert.match(ui.text(), /คำร้องหลัก · ใช้ลงนาม/);
    assert.match(ui.text(), /synthetic-main\.pdf/);
    assert.match(ui.text(), /เอกสารประกอบ 1 ไฟล์/);
    assert.match(ui.text(), /เปิดตรวจได้จากหน้าดูเอกสารแนบ/);
    assert.doesNotMatch(ui.text(), /synthetic-proof\.pdf|generated-extra\.pdf|เลือกเอกสารที่ต้องการวางลายเซ็น/);
  } finally { await ui.dispose(); }
});

test('primary image stays the signing target ahead of supporting or generated PDF', async () => {
  const ui = await mount(SignatureAndPlaceModal, signingProps([mainImage, supportPdf], { extraPdfUrl: generatedUrl }));
  try {
    assert.deepEqual(ui.fixture.blobs, [mainImage.url]);
    assert.match(ui.text(), /synthetic-main\.png/);
    assert.doesNotMatch(ui.text(), /synthetic-proof\.pdf/);
    assert.ok(ui.renderer.root.findByProps({ alt: 'คำร้องหลัก' }).props.src.startsWith('blob:'));
  } finally { await ui.dispose(); }
});

test('generated PDF fallback remains available only when attachments are absent', async () => {
  const ui = await mount(SignatureAndPlaceModal, signingProps([], { extraPdfUrl: generatedUrl, extraPdfLabel: 'legacy-generated.pdf' }));
  try {
    assert.deepEqual(ui.fixture.blobs, [generatedUrl]);
    assert.match(ui.text(), /legacy-generated\.pdf/);
    assert.match(ui.text(), /เอกสารประกอบ 0 ไฟล์/);
  } finally { await ui.dispose(); }
});

test('unavailable primary is not replaced by supporting PDF or generated copy', async () => {
  const ui = await mount(SignatureAndPlaceModal, signingProps([{ ...mainPdf, url: '' }, supportPdf], { extraPdfUrl: generatedUrl }));
  try {
    assert.deepEqual(ui.fixture.blobs, []);
    assert.match(ui.text(), /ไม่พบคำร้องหลักที่เปิดได้/);
    const confirm = ui.renderer.root.findAll(node => isHost(node) && node.type === 'button' && treeText(node).includes('ยืนยันและอนุมัติ'))[0];
    assert.equal(confirm.props.disabled, true);
  } finally { await ui.dispose(); }
});
