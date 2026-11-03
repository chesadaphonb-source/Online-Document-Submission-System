import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function loadDocumentOverlay() {
  const outputDirectory = path.join(projectRoot, 'tmp', 'pdfs');
  await mkdir(outputDirectory, { recursive: true });
  const outfile = path.join(outputDirectory, `document-overlay-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(projectRoot, 'src/app/components/shared/DocumentTextOverlay.tsx')],
    outfile, bundle: true, format: 'esm', platform: 'node',
    packages: 'external', jsx: 'automatic', logLevel: 'silent',
    plugins: [{
      name: 'jspdf-node-interop',
      setup(builder) {
        builder.onLoad({ filter: /DocumentTextOverlay\.tsx$/ }, async ({ path: filename }) => ({
          // Vite's browser default import is a constructor; Node's CJS default
          // is a namespace. This changes only module interop in the QA bundle.
          contents: (await readFile(filename, 'utf8')).replace("import jsPDF from 'jspdf';", "import { jsPDF } from 'jspdf';"),
          loader: 'tsx',
        }));
      },
    }],
  });
  return import(pathToFileURL(outfile).href);
}

export async function readEmbeddedFont() {
  const source = await readFile(path.join(projectRoot, 'src/app/lib/fonts/Sarabun.ts'), 'utf8');
  const match = source.match(/['"`]([A-Za-z0-9+/=]{100,})['"`]/);
  if (!match) throw new Error('Embedded document font not found');
  return match[1];
}
