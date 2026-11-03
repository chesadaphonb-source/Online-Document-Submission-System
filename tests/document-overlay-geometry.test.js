import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { jsPDF } from 'jspdf';
import { loadDocumentOverlay, readEmbeddedFont } from '../scripts/lib/loadDocumentOverlay.js';
import { A4_WIDTH_MM, A4_HEIGHT_MM, getDocumentTextMetrics, getDocumentCheckmarkMetrics } from '../src/app/lib/documentOverlayGeometry.js';

const overlay = await loadDocumentOverlay();
const font = await readEmbeddedFont();
const exportDocument = new jsPDF({ unit: 'mm', format: 'a4' });
exportDocument.addFileToVFS('THSarabun.ttf', font);
exportDocument.addFont('THSarabun.ttf', 'THSarabun', 'bold');
exportDocument.setFont('THSarabun', 'bold');

const samples = [
  { text: 'ข้อความชื่อผู้ลงนามทดสอบที่มีความยาวเพื่อทดสอบตำแหน่ง', x: 12, y: 70, size: 14 },
  { text: 'ตำแหน่งผู้อนุมัติเอกสารตัวอย่างสำหรับทดสอบ', x: 58, y: 88, size: 10 },
  { text: '03/11/2569', x: 18, y: 93, size: 10 },
];

function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

for (const width of [320, 560, 840]) {
  test(`actual preview SVG retains PDF font size, baseline and anchors at ${width}px page width`, () => {
    const height = width * A4_HEIGHT_MM / A4_WIDTH_MM;
    for (const sample of samples) {
      const html = renderToStaticMarkup(createElement(overlay.DocumentTextOverlay, sample));
      const svg = renderToStaticMarkup(createElement(overlay.DocumentTextSvg, sample));
      const metrics = getDocumentTextMetrics(sample.size);
      const wrapperWidthPercent = Number(html.match(/width:([\d.]+)%/)[1]);
      const wrapperHeightPercent = Number(html.match(/height:([\d.]+)%/)[1]);
      const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      const fontMm = Number(svg.match(/font-size="([^"]+)"/)[1]);
      const baselineMm = Number(svg.match(/<text[^>]* y="([^"]+)"/)[1]);
      const scaleX = wrapperWidthPercent / 100 * width / viewBox[2];
      const scaleY = wrapperHeightPercent / 100 * height / viewBox[3];
      close(scaleX, width / 210);
      close(scaleY, width / 210);
      close(fontMm * scaleX, sample.size * 0.85 * 25.4 / 72 * width / 210);
      close(baselineMm * scaleY, sample.size * 0.85 * 0.27 * width / 210);
      assert.ok(html.includes(`left:${sample.x}%`));
      assert.ok(html.includes(`top:${sample.y}%`));
      close(metrics.fontPt, sample.size * 0.85);
    }
  });
}

test('long Thai primary/extra text and date use the same text width as the actual PDF font', () => {
  for (const sample of samples) {
    exportDocument.setFontSize(sample.size * 0.85);
    const expectedWidth = exportDocument.getTextWidth(sample.text);
    close(overlay.getDocumentTextWidthMm(sample.text, sample.size * 0.85), expectedWidth);
    const svg = renderToStaticMarkup(createElement(overlay.DocumentTextSvg, sample));
    close(Number(svg.match(/textLength="([^"]+)"/)[1]), expectedWidth);
    assert.ok(svg.includes('lengthAdjust="spacingAndGlyphs"'));
    assert.ok(svg.includes(overlay.DOCUMENT_PREVIEW_FONT));
  }
});

test('no text is painted using an unverified fallback font while the exact font is loading', () => {
  const svg = renderToStaticMarkup(createElement(overlay.DocumentTextSvg, { text: samples[0].text, size: 10, fontReady: false }));
  assert.equal(svg.includes('<text'), false);
});

test('checkmark geometry follows the existing PDF pen stroke rather than a browser glyph', () => {
  for (const size of [7, 15, 24]) {
    const metrics = getDocumentCheckmarkMetrics(size);
    close(metrics.sizeMm, size * 0.352778);
    close(metrics.strokeWidthMm, size * 0.352778 * 0.03);
    close(metrics.x1, metrics.sizeMm * 0.35);
    close(metrics.y1, metrics.sizeMm * 0.95);
    close(metrics.x2, metrics.sizeMm * 0.85);
    close(metrics.y2, 0);
  }
});
