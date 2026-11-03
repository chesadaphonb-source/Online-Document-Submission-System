// Synthetic, local-only QA. No student information or connected services.
// Run: node scripts/qa-document-overlay.js
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { jsPDF } from 'jspdf';
import { createCanvas, loadImage, GlobalFonts, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { loadDocumentOverlay, readEmbeddedFont, projectRoot } from './lib/loadDocumentOverlay.js';
import { getDocumentTextMetrics, getDocumentCheckmarkMetrics } from '../src/app/lib/documentOverlayGeometry.js';

globalThis.DOMMatrix = DOMMatrix;
globalThis.Path2D = Path2D;
globalThis.ImageData = ImageData;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const standardFontDataUrl = path.join(path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))), 'standard_fonts').replaceAll('\\', '/') + '/';
const overlay = await loadDocumentOverlay();
const font = await readEmbeddedFont();
GlobalFonts.register(Buffer.from(font, 'base64'), overlay.DOCUMENT_PREVIEW_FONT);
const directory = path.join(projectRoot, 'tmp', 'pdfs', 'synthetic-overlay-qa');
await mkdir(directory, { recursive: true });

const signature = createCanvas(320, 90);
const signatureContext = signature.getContext('2d');
signatureContext.strokeStyle = 'rgb(30,63,160)';
signatureContext.lineWidth = 4;
signatureContext.lineCap = 'round';
signatureContext.beginPath();
signatureContext.moveTo(9, 66);
signatureContext.bezierCurveTo(55, 2, 66, 88, 91, 18);
signatureContext.bezierCurveTo(115, 3, 78, 80, 148, 47);
signatureContext.bezierCurveTo(170, 18, 177, 74, 218, 36);
signatureContext.lineTo(307, 26);
signatureContext.stroke();
const signatureUrl = signature.toDataURL('image/png');

const cells = [
  { x: 17, y: 178 }, { x: 109, y: 178 },
  { x: 17, y: 230 }, { x: 109, y: 230 },
];
const texts = [];
const signatures = [];
const checks = [];
for (const [index, cell] of cells.entries()) {
  signatures.push({ id: `signature-${index + 1}`, x: cell.x + 8, y: cell.y + 8, width: 22 });
  if (index === 0) signatures.push({ id: 'extra-signature-1', x: cell.x + 43, y: cell.y + 8, width: 22 });
  texts.push({ id: `name-${index + 1}`, text: `ผู้ลงนามทดสอบลำดับที่ ${index + 1} สำหรับตรวจสอบตำแหน่ง`, x: cell.x + 6, y: cell.y + 25, size: 12 });
  texts.push({ id: `extra-text-${index + 1}`, text: 'ตำแหน่งผู้อนุมัติเอกสารตัวอย่าง', x: cell.x + 6, y: cell.y + 32, size: 12 });
  texts.push({ id: `date-${index + 1}`, text: '03/11/2569', x: cell.x + 48, y: cell.y + 39, size: 10 });
  checks.push({ id: `checkmark-${index + 1}`, x: cell.x + 5, y: cell.y + 2, size: 15 });
}

const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
doc.setFontSize(16);
doc.text('SYNTHETIC SIGNATURE PLACEMENT QA', 17, 24);
doc.setFontSize(10);
doc.text('Four footer boxes / primary and extra signatures / Thai text / dates', 17, 34);
doc.setDrawColor(190, 190, 190);
doc.setLineWidth(0.2);
for (const [index, cell] of cells.entries()) {
  doc.rect(cell.x, cell.y, 84, 48);
  doc.setFontSize(8);
  doc.text(`BOX ${index + 1}`, cell.x + 68, cell.y + 5);
  for (const y of [23, 31, 38, 45]) doc.line(cell.x + 5, cell.y + y, cell.x + 79, cell.y + y);
}
const baseBytes = new Uint8Array(doc.output('arraybuffer'));

// These calls deliberately reproduce the production exporter's existing
// millimetre coordinates, size*.85 point font and sizePt*.27 baseline.
doc.addFileToVFS('THSarabun.ttf', font);
doc.addFont('THSarabun.ttf', 'THSarabun', 'bold');
doc.setFont('THSarabun', 'bold');
for (const item of signatures) doc.addImage(signatureUrl, 'PNG', item.x, item.y, item.width, item.width * 90 / 320);
for (const item of texts) {
  const fontPt = item.size * 0.85;
  doc.setFontSize(fontPt);
  doc.setTextColor(30, 30, 30);
  doc.text(item.text, item.x, item.y + fontPt * 0.27);
}
for (const item of checks) {
  const sizeMm = item.size * 0.352778;
  doc.setDrawColor(30, 60, 180);
  doc.setLineWidth(sizeMm * 0.03);
  doc.line(item.x + sizeMm * 0.35, item.y + sizeMm * 0.95, item.x + sizeMm * 0.85, item.y);
}
const exportBytes = new Uint8Array(doc.output('arraybuffer'));
await writeFile(path.join(directory, 'synthetic-export.pdf'), exportBytes);

async function renderPdf(bytes, width) {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
  const page = await pdf.getPage(1);
  const nativeViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / nativeViewport.width });
  const canvas = createCanvas(width, Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
  await pdf.destroy();
  return canvas;
}

function placeSvg(svg, x, y, width, height) {
  return svg.replace('<svg', `<svg x="${x}" y="${y}"`)
    .replace('width="100%"', `width="${width}"`).replace('height="100%"', `height="${height}"`);
}

function buildPreviewSvg(width, height) {
  // Keep the exact A4 width scale; canvas rounds page height up to a whole pixel.
  // Background and PNG signatures are composited separately because Skia's SVG
  // loader does not implement embedded <image> in this runtime.
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 210 ${height * 210 / width}">`];
  for (const item of texts) {
    const metrics = getDocumentTextMetrics(item.size);
    const textWidth = overlay.getDocumentTextWidthMm(item.text, metrics.fontPt);
    const svg = renderToStaticMarkup(createElement(overlay.DocumentTextSvg, item));
    parts.push(placeSvg(svg, item.x, item.y, Math.max(textWidth, 1), metrics.heightMm));
  }
  for (const item of checks) {
    const html = renderToStaticMarkup(createElement(overlay.DocumentCheckmarkOverlay, { ...item, x: item.x / 210 * 100, y: item.y / 297 * 100 }));
    const svg = html.match(/<svg[\s\S]*<\/svg>/)[0];
    const metrics = getDocumentCheckmarkMetrics(item.size);
    parts.push(placeSvg(svg, item.x, item.y, metrics.sizeMm, metrics.sizeMm));
  }
  parts.push('</svg>');
  return parts.join('');
}

function bounds(canvas, baseCanvas, item, widthMm, heightMm, color) {
  const sx = canvas.width / 210, sy = sx;
  const x0 = Math.max(0, Math.floor(item.x * sx) - 2), y0 = Math.max(0, Math.floor(item.y * sy) - 2);
  const w = Math.min(canvas.width - x0, Math.ceil(widthMm * sx) + 6);
  const h = Math.min(canvas.height - y0, Math.ceil(heightMm * sy) + 6);
  const { data } = canvas.getContext('2d').getImageData(x0, y0, w, h);
  const original = baseCanvas.getContext('2d').getImageData(x0, y0, w, h).data;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, pixels = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    const changed = Math.abs(r - original[i]) + Math.abs(g - original[i + 1]) + Math.abs(b - original[i + 2]) > 20;
    const isInk = changed && (color === 'blue' ? b > r + 6 && b > g + 4 && r < 250 : Math.max(r, g, b) < 245 && Math.max(r, g, b) - Math.min(r, g, b) < 15);
    if (isInk) { left = Math.min(left, x + x0); right = Math.max(right, x + x0); top = Math.min(top, y + y0); bottom = Math.max(bottom, y + y0); pixels++; }
  }
  return pixels ? { left, top, right, bottom, pixels } : null;
}

const results = [];
const contact = createCanvas(1680, 660);
const contactContext = contact.getContext('2d');
contactContext.fillStyle = 'white';
contactContext.fillRect(0, 0, contact.width, contact.height);
for (const [index, width] of [320, 560, 840].entries()) {
  const base = await renderPdf(baseBytes, width);
  const exported = await renderPdf(exportBytes, width);
  const svg = buildPreviewSvg(width, exported.height);
  const previewImage = await loadImage(Buffer.from(svg));
  const preview = createCanvas(width, exported.height);
  const previewContext = preview.getContext('2d');
  previewContext.drawImage(base, 0, 0);
  const scale = width / 210;
  for (const item of signatures) previewContext.drawImage(signature, item.x * scale, item.y * scale, item.width * scale, item.width * 90 / 320 * scale);
  previewContext.drawImage(previewImage, 0, 0);
  await writeFile(path.join(directory, `export-${width}.png`), exported.toBuffer('image/png'));
  await writeFile(path.join(directory, `preview-${width}.png`), preview.toBuffer('image/png'));
  await writeFile(path.join(directory, `preview-${width}.svg`), svg);
  const comparisons = [];
  for (const item of signatures) {
    const pdf = bounds(exported, base, item, item.width, item.width * 90 / 320, 'blue');
    const ui = bounds(preview, base, item, item.width, item.width * 90 / 320, 'blue');
    comparisons.push({ id: item.id, pdf, preview: ui, maxEdgeDifferencePx: pdf && ui ? Math.max(...['left', 'top', 'right', 'bottom'].map(key => Math.abs(pdf[key] - ui[key]))) : null });
  }
  for (const item of checks) {
    const metrics = getDocumentCheckmarkMetrics(item.size);
    const pdf = bounds(exported, base, item, metrics.sizeMm, metrics.sizeMm, 'blue');
    const ui = bounds(preview, base, item, metrics.sizeMm, metrics.sizeMm, 'blue');
    comparisons.push({ id: item.id, pdf, preview: ui, maxEdgeDifferencePx: pdf && ui ? Math.max(...['left', 'top', 'right', 'bottom'].map(key => Math.abs(pdf[key] - ui[key]))) : null });
  }
  for (const item of texts) {
    const metrics = getDocumentTextMetrics(item.size);
    const widthMm = overlay.getDocumentTextWidthMm(item.text, metrics.fontPt);
    const pdf = bounds(exported, base, item, widthMm, metrics.heightMm, 'black');
    const ui = bounds(preview, base, item, widthMm, metrics.heightMm, 'black');
    comparisons.push({ id: item.id, pdf, preview: ui, maxEdgeDifferencePx: pdf && ui ? Math.max(...['left', 'top', 'right', 'bottom'].map(key => Math.abs(pdf[key] - ui[key]))) : null });
  }
  for (const comparison of comparisons) {
    assert.notEqual(comparison.maxEdgeDifferencePx, null, `Missing rendered ink: ${comparison.id} at ${width}px`);
    const tolerance = comparison.id.includes('signature') ? 2 : 1;
    assert.ok(comparison.maxEdgeDifferencePx <= tolerance, `${comparison.id} differs by ${comparison.maxEdgeDifferencePx}px at ${width}px (limit ${tolerance}px)`);
  }
  results.push({ width, height: exported.height, comparisons });
  const cropY = 174 / 297 * exported.height;
  const cropHeight = 110 / 297 * exported.height;
  const left = index * 560;
  contactContext.fillStyle = 'black'; contactContext.font = '18px sans-serif';
  contactContext.fillText(`PDF export / preview: ${width}px`, left + 8, 24);
  const contactHeight = cropHeight / width * 550;
  contactContext.drawImage(exported, 0, cropY, width, cropHeight, left, 40, 550, contactHeight);
  contactContext.drawImage(preview, 0, cropY, width, cropHeight, left, 350, 550, contactHeight);
}
await writeFile(path.join(directory, 'contact-sheet.png'), contact.toBuffer('image/png'));
await writeFile(path.join(directory, 'comparison.json'), JSON.stringify({ note: 'Native SVG/PDF raster comparison; browser font-loading and touch interaction still require real-browser QA.', results }, null, 2));
console.log(JSON.stringify({ directory, cases: results.map(({ width, comparisons }) => ({ width, maxSignatureEdgeDifferencePx: Math.max(...comparisons.filter(item => item.id.includes('signature')).map(item => item.maxEdgeDifferencePx ?? 999)), maxTextEdgeDifferencePx: Math.max(...comparisons.filter(item => !item.id.includes('signature')).map(item => item.maxEdgeDifferencePx ?? 999)) })) }, null, 2));
