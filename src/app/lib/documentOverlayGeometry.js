// Keep the preview in the same A4 millimetre coordinate space as the existing
// PDF exporter. Stored coordinates and size values are deliberately unchanged.
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const PT_TO_MM = 25.4 / 72;

export function getDocumentTextMetrics(size = 10) {
  const fontPt = (size || 10) * 0.85;
  const fontMm = fontPt * PT_TO_MM;
  return { fontPt, fontMm, baselineMm: fontPt * 0.27, heightMm: fontMm * 1.5 };
}

export function getDocumentCheckmarkMetrics(size = 15) {
  // Match the exporter's existing conversion and pen stroke exactly.
  const sizeMm = (size || 15) * 0.352778;
  return {
    sizeMm, strokeWidthMm: sizeMm * 0.03,
    x1: sizeMm * 0.35, y1: sizeMm * 0.95,
    x2: sizeMm * 0.85, y2: 0,
  };
}
