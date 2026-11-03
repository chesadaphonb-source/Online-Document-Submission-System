import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { projectRoot } from './loadDocumentOverlay.js';

/** Load the actual editor with deterministic, network-free service adapters. */
export async function loadAdminPlacementModal() {
  const directory = path.join(projectRoot, 'tmp', 'admin-placement-tests');
  await mkdir(directory, { recursive: true });
  const outfile = path.join(directory, `admin-modal-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(projectRoot, 'src/app/components/admin/AdminAdjustSignaturesModal.tsx')],
    outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external',
    jsx: 'automatic', logLevel: 'silent',
    plugins: [{
      name: 'isolated-admin-editor-services',
      setup(builder) {
        builder.onResolve({ filter: /(?:^|\/)lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'admin-fixture' }));
        builder.onResolve({ filter: /(?:^|\/)lib\/fileCache$/ }, () => ({ path: 'file-cache', namespace: 'admin-fixture' }));
        builder.onResolve({ filter: /^pdfjs-dist$/ }, () => ({ path: 'pdfjs', namespace: 'admin-fixture' }));
        builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toasts', namespace: 'admin-fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'admin-fixture' }, ({ path: name }) => {
          if (name === 'supabase') return { contents: 'export const supabase = null; export const isSupabaseConfigured = false;' };
          if (name === 'file-cache') return { contents: `export async function getCachedFileBlob() {
            if (globalThis.__adminFixture?.documentError) throw new Error('Fixture document unavailable');
            return new Blob(['fixture-pdf'], {type:'application/pdf'});
          }` };
          if (name === 'pdfjs') return { contents: `export const GlobalWorkerOptions = {};
            export function getDocument() { return { promise: Promise.resolve({
              numPages: globalThis.__adminFixture?.pages || 2,
              async getPage() { return {
                getViewport() { return {width:560,height:792}; },
                render() { return {promise:Promise.resolve()}; }, cleanup() {},
              }; }, destroy() {},
            }) }; }` };
          if (name === 'toasts') return { contents: `export const toast = new Proxy({}, {get:(_target, kind)=>(...args)=>{
            globalThis.__adminFixture?.toasts.push({kind, args}); return 'fixture-toast';
          }});` };
          throw new Error(`Unexpected mock ${name}`);
        });
        builder.onLoad({ filter: /DocumentTextOverlay\.tsx$/ }, async ({ path: filename }) => ({
          contents: (await readFile(filename, 'utf8')).replace("import jsPDF from 'jspdf';", "import { jsPDF } from 'jspdf';"),
          loader: 'tsx',
        }));
      },
    }],
  });
  return import(pathToFileURL(outfile).href);
}
