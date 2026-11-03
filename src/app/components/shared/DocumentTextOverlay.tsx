import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import jsPDF from 'jspdf';
import { THSarabun_Base64 } from '../../lib/fonts/Sarabun';
import {
  A4_WIDTH_MM, A4_HEIGHT_MM, getDocumentTextMetrics, getDocumentCheckmarkMetrics,
} from '../../lib/documentOverlayGeometry.js';

export const DOCUMENT_PREVIEW_FONT = 'KU-Paper-Document-Regular';
let fontPromise: Promise<void> | null = null;
let textMeasureDocument: jsPDF | null = null;

export function loadDocumentPreviewFont(): Promise<void> {
  if (!fontPromise) {
    fontPromise = Promise.resolve().then(() => new FontFace(
      DOCUMENT_PREVIEW_FONT,
      `url(data:font/ttf;base64,${THSarabun_Base64})`,
      { style: 'normal', weight: '400' },
    ).load()).then(face => { document.fonts.add(face); });
  }
  return fontPromise;
}

export function getDocumentTextWidthMm(text: string, fontPt: number): number {
  if (!textMeasureDocument) {
    textMeasureDocument = new jsPDF({ unit: 'mm', format: 'a4' });
    textMeasureDocument.addFileToVFS('THSarabun.ttf', THSarabun_Base64);
    // The exporter registers these same Regular bytes under its bold alias.
    textMeasureDocument.addFont('THSarabun.ttf', 'THSarabun', 'bold');
    textMeasureDocument.setFont('THSarabun', 'bold');
  }
  textMeasureDocument.setFontSize(fontPt);
  return textMeasureDocument.getTextWidth(text);
}

interface OverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  x: number;
  y: number;
  size?: number;
  children?: ReactNode;
}

interface DocumentTextOverlayProps extends OverlayProps {
  text: string;
}

/** SVG user units are millimetres, as in jsPDF; no CSS font scaling is involved. */
export function DocumentTextSvg({ text, size = 10, fontReady = true }: {
  text: string; size?: number; fontReady?: boolean;
}) {
  const { fontPt, fontMm, baselineMm, heightMm } = getDocumentTextMetrics(size);
  const textWidthMm = getDocumentTextWidthMm(text, fontPt);
  const widthMm = Math.max(textWidthMm, 1);
  return (
    <svg
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      width="100%" height="100%" preserveAspectRatio="none"
      className="block pointer-events-none overflow-visible"
      style={{ overflow: 'visible', pointerEvents: 'none', display: 'block' }}
      aria-hidden="true"
    >
      {fontReady && (
        <text
          x={0} y={baselineMm} fill="rgb(30,30,30)"
          fontFamily={DOCUMENT_PREVIEW_FONT} fontWeight={400} fontSize={fontMm}
          textLength={textWidthMm || undefined} lengthAdjust="spacingAndGlyphs"
          style={{ fontSynthesis: 'none', whiteSpace: 'pre' }}
        >{text}</text>
      )}
    </svg>
  );
}

/** A responsive preview of the existing PDF text, including its baseline. */
export function DocumentTextOverlay({
  text, x, y, size = 10, className = '', style, children, ...events
}: DocumentTextOverlayProps) {
  const [fontReady, setFontReady] = useState(false);
  const [fontError, setFontError] = useState(false);
  useEffect(() => {
    let active = true;
    loadDocumentPreviewFont().then(() => { if (active) setFontReady(true); })
      .catch(error => {
        console.error('Document preview font could not be loaded:', error);
        if (active) setFontError(true);
      });
    return () => { active = false; };
  }, []);

  const { fontPt, heightMm } = getDocumentTextMetrics(size);
  const textWidthMm = getDocumentTextWidthMm(text, fontPt);
  const widthMm = Math.max(textWidthMm, 1);
  return (
    <div
      {...events}
      aria-label={text}
      data-document-text-overlay=""
      data-font-ready={fontReady}
      title={fontError ? 'ไม่สามารถแสดงข้อความได้ กรุณาเปิดเอกสารอีกครั้ง' : events.title}
      className={`absolute select-none ${className}`}
      style={{
        ...style, left: `${x}%`, top: `${y}%`,
        width: `${widthMm / A4_WIDTH_MM * 100}%`,
        height: `${heightMm / A4_HEIGHT_MM * 100}%`,
        touchAction: 'none',
      }}
    >
      <DocumentTextSvg text={text} size={size} fontReady={fontReady} />
      {children}
    </div>
  );
}

/** Match the thin diagonal pen stroke used by the PDF, without font fallback. */
export function DocumentCheckmarkOverlay({
  x, y, size = 15, className = '', style, children, ...events
}: OverlayProps) {
  const { sizeMm, strokeWidthMm, x1, y1, x2, y2 } = getDocumentCheckmarkMetrics(size);
  return (
    <div
      {...events}
      aria-label="/"
      className={`absolute select-none ${className}`}
      style={{
        ...style, left: `${x}%`, top: `${y}%`,
        width: `${sizeMm / A4_WIDTH_MM * 100}%`,
        height: `${sizeMm / A4_HEIGHT_MM * 100}%`,
        touchAction: 'none',
      }}
    >
      <svg viewBox={`0 0 ${sizeMm} ${sizeMm}`} width="100%" height="100%"
        className="block pointer-events-none overflow-visible" aria-hidden="true">
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="rgb(30,60,180)" strokeWidth={strokeWidthMm} />
      </svg>
      {children}
    </div>
  );
}
