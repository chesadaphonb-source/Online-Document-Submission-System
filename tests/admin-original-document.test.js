import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const sourceFile = new URL('../src/app/lib/generateApprovalPDF.ts', import.meta.url);
const outputFile = new URL('../tmp/admin-placement-tests/original-source-test.mjs', import.meta.url);
await mkdir(new URL('.', outputFile), { recursive: true });
const source = (await readFile(sourceFile, 'utf8'))
  .replace("import jsPDF from 'jspdf';", "import { jsPDF } from 'jspdf';")
  + '\nexport { resolveAttachmentBlob };\n';
const bundle = await build({
  stdin: { contents: source, loader: 'ts', sourcefile: fileURLToPath(sourceFile), resolveDir: fileURLToPath(new URL('.', sourceFile)) },
  bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'missing-original-fixture', setup(builder) {
    builder.onResolve({ filter: /fileCache$/ }, () => ({ path: 'cache', namespace: 'original-fixture' }));
    builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toasts', namespace: 'original-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'original-fixture' }, ({ path }) => ({
      contents: path === 'cache'
        ? 'export async function getCachedFileBlob() { throw new Error("Synthetic missing original"); }'
        : 'export const toast = {error(){},loading(){},success(){}};',
    }));
  } }],
});
await writeFile(outputFile, bundle.outputFiles[0].contents);
const { generateAdjustedPDFBlob, resolveAttachmentBlob } = await import(pathToFileURL(fileURLToPath(outputFile)).href);

test('Admin adjusted-PDF save rejects missing original without fetching or signing a replacement template', async () => {
  const originalFetch = globalThis.fetch;
  let templateRequests = 0;
  globalThis.fetch = async () => {
    templateRequests++;
    throw new Error('No network is allowed in this test');
  };
  try {
    await assert.rejects(generateAdjustedPDFBlob({ id: 'fixture', formType: 'fee-deferment', formName: 'ผ่อนผันทดสอบ', approvalSteps: [] },
      'https://fixture.invalid/missing.pdf', 'missing.pdf'), /เอกสารต้นฉบับ/);
    assert.equal(templateRequests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('the separate existing preview/download fallback policy is preserved by the Admin-only guard', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarning = console.warn;
  const originalLog = console.log;
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['fixture'.repeat(200)], { type: 'application/pdf' }) });
  console.warn = () => {};
  console.log = () => {};
  try {
    const result = await resolveAttachmentBlob({ id: 'fixture', formType: 'fixture' }, 'https://fixture.invalid/missing.pdf');
    assert.equal(result.isFallback, true);
    assert.ok(result.blob.size > 1000);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarning;
    console.log = originalLog;
  }
});
