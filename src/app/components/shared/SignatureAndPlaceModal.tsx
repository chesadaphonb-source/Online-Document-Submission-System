import React, { useRef, useState, useCallback, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import {
  PenTool, Move, Check, X, RotateCcw, ZoomIn, ZoomOut,
  FileText, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import type { Attachment, ApprovalStep } from '../../data/mockData';

// ── Render PDF page to image URL (offscreen canvas) ──────────
// Fetches the PDF as bytes first (avoids pdf.js CORS XHR issue),
// renders to offscreen canvas, and returns a stable image data URL.
function usePdfPageImage(url: string | null, pageNum: number) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) { setImageUrl(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImageUrl(null);

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');

        // Use Vite-bundled worker to avoid CDN version mismatch
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href;

        // ── Fetch bytes ourselves → avoids pdf.js XHR CORS issues ──
        let pdfData: ArrayBuffer;
        if (url.startsWith('blob:') || url.startsWith('data:')) {
          // Blob/data URLs are same-origin — pass URL directly
          const res = await fetch(url);
          pdfData = await res.arrayBuffer();
        } else {
          // External URL (Supabase Storage, etc.) — fetch with cors mode
          const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          pdfData = await res.arrayBuffer();
        }

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);

        const page = await pdf.getPage(Math.min(pageNum, pdf.numPages));
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 2.0 });

        // Render to an OFFSCREEN canvas — no DOM dependency
        const offscreen = document.createElement('canvas');
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const ctx = offscreen.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport } as any).promise;

        if (!cancelled) {
          setImageUrl(offscreen.toDataURL('image/jpeg', 0.92));
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error('[SignatureModal] PDF render error:', err);
          setError('ไม่สามารถแสดง PDF ได้ (CORS หรือ URL ไม่ถูกต้อง)');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url, pageNum]);

  return { imageUrl, numPages, loading, error };
}


// ── Component ─────────────────────────────────────────────────
interface SignatureAndPlaceModalProps {
  attachments?: Attachment[];          // Student-uploaded files from submission
  extraPdfUrl?: string;               // Generated KU-Paper PDF (passed separately)
  extraPdfLabel?: string;
  existingSteps?: ApprovalStep[];     // ขั้นตอนที่อนุมัติไปแล้วเพื่อซ้อนลายเซ็น
  initialSignature?: string;
  onConfirm: (
    signatureData: string,
    posX: number,
    posY: number,
    textBlock?: string,
    textBlockX?: number,
    textBlockY?: number,
    textBlockSize?: number,
    dateBlock?: string,
    dateX?: number,
    dateY?: number,
    checkmarkBlock?: string,
    checkmarkX?: number,
    checkmarkY?: number,
    dateSize?: number,
    extraTextBlocks?: Array<{ val: string; x: number; y: number; size: number }>,
    extraSignaturePositions?: Array<{ x: number; y: number }>,
    signatureSize?: number
  ) => void;
  onCancel: () => void;
}

export function SignatureAndPlaceModal({
  initialSignature,
  attachments = [],
  extraPdfUrl,
  extraPdfLabel = 'แบบฟอร์มคำร้อง (KU-Paper)',
  existingSteps = [],
  onConfirm,
  onCancel,
}: SignatureAndPlaceModalProps) {

  // ── Drawing ──────────────────────────────────────────────────
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [useExisting, setUseExisting] = useState(!!initialSignature);
  const [signatureData, setSignatureData] = useState<string | null>(initialSignature || null);

  // ── Placement ────────────────────────────────────────────────
  // sigPositions[0] = ตำแหน่งหลัก, sigPositions[1..] = ตำแหน่งเพิ่มเติม (เช่น ลงนาม 2 จุด)
  const [sigPositions, setSigPositions] = useState<{ x: number; y: number }[]>([{ x: 30, y: 65 }]);
  const [sigSize, setSigSize] = useState(12);

  // Text block states — multiple draggable text annotations
  type TextItem = { val: string; pos: { x: number; y: number }; size: number };
  const [textItems, setTextItems] = useState<TextItem[]>([
    { val: '', pos: { x: 30, y: 72 }, size: 14 },
  ]);

  // Date block helper & states
  const getThaiDateString = (sep = '/') => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear() + 543; // BE Year
    return `${day}${sep}${month}${sep}${year}`;
  };

  const [useDate, setUseDate] = useState(true);
  const [dateSep, setDateSep] = useState<'/' | '-' | ' ' | 'custom'>('/');
  const [dateVal, setDateVal] = useState(getThaiDateString('/'));
  const [datePos, setDatePos] = useState({ x: 45, y: 78 });
  const [dateSize, setDateSize] = useState(11);

  // Checkmark states
  const [useCheckmark, setUseCheckmark] = useState(false);
  const [checkmarkVal, setCheckmarkVal] = useState('✓');
  const [checkmarkPos, setCheckmarkPos] = useState({ x: 25, y: 72 });

  // Dragging — type carries index for text items
  const draggingItem = useRef<{ type: 'signature' | 'text' | 'date' | 'checkmark'; index: number } | null>(null);

  const pageContainerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ── Tab ──────────────────────────────────────────────────────
  const [tab, setTab] = useState<'sign' | 'place'>(initialSignature ? 'place' : 'sign');

  // ── PDF selection ────────────────────────────────────────────
  // Build the full list: student uploads first, then generated PDF
  const pdfOptions: Array<{ label: string; url: string }> = [
    ...attachments
      .filter(a => a.type === 'pdf')
      .map(a => ({ label: a.name, url: a.url })),
    ...(extraPdfUrl ? [{ label: extraPdfLabel, url: extraPdfUrl }] : []),
  ];

  const [selectedPdfIdx, setSelectedPdfIdx] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);

  const selectedPdf = pdfOptions[selectedPdfIdx] ?? null;

  const { imageUrl: pdfImageUrl, numPages, loading: pdfLoading, error: pdfError } =
    usePdfPageImage(selectedPdf?.url ?? null, pdfPage);

  // Reset page when switching file
  useEffect(() => { setPdfPage(1); }, [selectedPdfIdx]);

  // Resize signature canvas on mount
  useEffect(() => {
    if (tab === 'sign' && !useExisting) {
      setTimeout(() => {
        if (sigCanvas.current) {
          const canvas = sigCanvas.current.getCanvas();
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext('2d')?.scale(ratio, ratio);
          sigCanvas.current.clear();
        }
      }, 50);
    }
  }, [tab, useExisting]);

  const handleDrawEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setSignatureData(sigCanvas.current.getTrimmedCanvas().toDataURL('image/png'));
      setHasDrawn(true);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setHasDrawn(false);
    if (!useExisting) setSignatureData(null);
  };

  // ── Drag handlers ────────────────────────────────────────────
  const getPagePos = useCallback((clientX: number, clientY: number, size: number) => {
    if (!pageContainerRef.current) return null;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const relX = ((clientX - dragOffset.current.x - rect.left) / rect.width) * 100;
    const relY = ((clientY - dragOffset.current.y - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100 - size, relX)),
      y: Math.max(0, Math.min(95, relY)),
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent<HTMLElement>, itemType: 'signature' | 'text' | 'date' | 'checkmark', idx = 0) => {
    e.preventDefault();
    const elem = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - elem.left, y: e.clientY - elem.top };
    dragging.current = true;
    draggingItem.current = { type: itemType, index: idx };
    const activeSize = itemType === 'signature' ? sigSize : (itemType === 'checkmark' ? 5 : 15);

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !draggingItem.current) return;
      const p = getPagePos(ev.clientX, ev.clientY, activeSize);
      if (p) {
        const { type, index } = draggingItem.current;
        if (type === 'signature') setSigPositions(prev => prev.map((p2, i) => i === index ? p : p2));
        else if (type === 'text') setTextItems(prev => prev.map((it, i) => i === index ? { ...it, pos: p } : it));
        else if (type === 'date') setDatePos(p);
        else if (type === 'checkmark') setCheckmarkPos(p);
      }
    };
    const onUp = () => {
      dragging.current = false;
      draggingItem.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLElement>, itemType: 'signature' | 'text' | 'date' | 'checkmark', idx = 0) => {
    const touch = e.touches[0];
    const elem = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: touch.clientX - elem.left, y: touch.clientY - elem.top };
    dragging.current = true;
    draggingItem.current = { type: itemType, index: idx };
    const activeSize = itemType === 'signature' ? sigSize : (itemType === 'checkmark' ? 5 : 15);

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      if (!dragging.current || !draggingItem.current) return;
      const t = ev.touches[0];
      const p = getPagePos(t.clientX, t.clientY, activeSize);
      if (p) {
        const { type, index } = draggingItem.current;
        if (type === 'signature') setSigPositions(prev => prev.map((p2, i) => i === index ? p : p2));
        else if (type === 'text') setTextItems(prev => prev.map((it, i) => i === index ? { ...it, pos: p } : it));
        else if (type === 'date') setDatePos(p);
        else if (type === 'checkmark') setCheckmarkPos(p);
      }
    };
    const onEnd = () => {
      dragging.current = false;
      draggingItem.current = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const canGoToPlace = useExisting ? !!initialSignature : hasDrawn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-gray-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full" style={{ maxWidth: 840, maxHeight: '94vh' }}>

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2 font-medium text-gray-800 text-sm">
            <PenTool size={16} className="text-green-600" />
            ลงลายมือชื่ออนุมัติเอกสาร
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          <button
            onClick={() => setTab('sign')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
              tab === 'sign' ? 'text-green-700 border-b-2 border-green-600 bg-green-50/40' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <PenTool size={13} /> 1. เขียนลายเซ็น
          </button>
          <button
            onClick={() => canGoToPlace && setTab('place')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
              tab === 'place'
                ? 'text-green-700 border-b-2 border-green-600 bg-green-50/40'
                : canGoToPlace ? 'text-gray-500 hover:text-gray-700' : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            <Move size={13} /> 2. วางตำแหน่งบนเอกสาร
            {!canGoToPlace && <span className="text-xs">(เซ็นก่อน)</span>}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0">

          {/* ── Tab 1: SIGN ── */}
          {tab === 'sign' && (
            <div className="p-4 space-y-3">
              {initialSignature && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setUseExisting(true); setSignatureData(initialSignature); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${useExisting ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >ใช้ลายเซ็นเดิม</button>
                  <button
                    onClick={() => { setUseExisting(false); setSignatureData(null); setHasDrawn(false); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${!useExisting ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >วาดใหม่</button>
                </div>
              )}

              {useExisting && initialSignature ? (
                <div className="border border-gray-200 rounded-xl bg-gray-50 h-40 flex items-center justify-center p-4">
                  <img src={initialSignature} alt="ลายเซ็น" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 relative">
                    <SignatureCanvas
                      ref={sigCanvas}
                      onEnd={handleDrawEnd}
                      canvasProps={{ className: 'w-full h-40 cursor-crosshair touch-none' }}
                      penColor="#1a3fa0"
                      backgroundColor="rgba(0,0,0,0)"
                      minWidth={0.8}
                      maxWidth={2.0}
                      velocityFilterWeight={0.7}
                    />
                    <div className="absolute inset-x-4 bottom-8 border-b border-gray-300 border-dashed pointer-events-none opacity-40" />
                    <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none select-none">
                      เซ็นชื่อในกรอบด้านบน
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={clearSignature} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
                      <RotateCcw size={12} /> ล้าง
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (useExisting && initialSignature) setSignatureData(initialSignature);
                  setTab('place');
                }}
                disabled={!canGoToPlace}
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                ถัดไป: วางตำแหน่งบนเอกสาร →
              </button>
            </div>
          )}

          {/* ── Tab 2: PLACE ── */}
          {tab === 'place' && signatureData && (
            <div className="p-3 space-y-3">

              {/* ── PDF File selector (always visible when options exist) ── */}
              {pdfOptions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 px-0.5">เลือกเอกสารที่ต้องการวางลายเซ็น</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {pdfOptions.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedPdfIdx(i)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border shrink-0 transition-colors ${
                          selectedPdfIdx === i
                            ? 'bg-green-50 border-green-400 text-green-800 shadow-sm'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <FileText size={12} />
                        {opt.label}
                        {selectedPdfIdx === i && <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-0.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pdfOptions.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ ไม่พบไฟล์ PDF ที่แนบ — จะวางลายเซ็นบนหน้าเปล่า
                </p>
              )}

              {/* Hint */}
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <Move size={12} className="shrink-0" />
                ลากลายเซ็นและกล่องข้อความไปวางบนเอกสาร จากนั้นกด "ยืนยันและอนุมัติ"
              </p>

              {/* Placement Tools Card System (3 Columns) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-150 text-xs shadow-sm">

                {/* Column 1: Multiple Text Blocks + Signature Controls */}
                <div className="space-y-2 bg-white p-2.5 rounded-lg border border-gray-200">
                  {/* Signature position controls */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block font-semibold text-gray-700">🖊️ ลายเซ็น ({sigPositions.length} ตำแหน่ง):</label>
                      <button
                        onClick={() => setSigPositions(prev => [...prev, { x: 55, y: 65 + (prev.length - 1) * 10 }])}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-purple-50 border border-purple-300 text-purple-700 rounded hover:bg-purple-100 transition-colors"
                      >
                        + เพิ่มตำแหน่ง
                      </button>
                    </div>
                    {sigPositions.length > 1 && (
                      <p className="text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">
                        ✅ ลายเซ็นจะปรากฏ {sigPositions.length} จุดบนเอกสาร — ลากแยกกันได้
                      </p>
                    )}
                    {sigPositions.length > 1 && (
                      <div className="flex gap-1 flex-wrap">
                        {sigPositions.map((_, i) => (
                          i > 0 && (
                            <button
                              key={i}
                              onClick={() => setSigPositions(prev => prev.filter((_, idx) => idx !== i))}
                              className="text-[10px] px-1.5 py-0.5 border border-red-200 text-red-500 rounded hover:bg-red-50"
                            >
                              ลบตำแหน่ง {i + 1}
                            </button>
                          )
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Signature size slider (always shown) */}
                  <div className="space-y-1 pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium">
                      <span>ขนาดลายเซ็น:</span>
                      <span className="bg-gray-100 px-1 rounded">{sigSize}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setSigSize(s => Math.max(5, s - 2))} className="p-0.5 border border-gray-200 bg-white rounded text-gray-500 hover:bg-gray-50"><ZoomOut size={10} /></button>
                      <input type="range" min={5} max={40} value={sigSize} onChange={e => setSigSize(Number(e.target.value))} className="flex-1 accent-green-600 h-1" />
                      <button onClick={() => setSigSize(s => Math.min(40, s + 2))} className="p-0.5 border border-gray-200 bg-white rounded text-gray-500 hover:bg-gray-50"><ZoomIn size={10} /></button>
                    </div>
                  </div>

                  {/* Text items section */}
                  <div className="space-y-1 pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-semibold text-gray-600">✍️ ข้อความบนเอกสาร:</label>
                      <button
                        onClick={() => setTextItems(prev => [...prev, { val: '', pos: { x: 30, y: 72 + prev.length * 6 }, size: 14 }])}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-green-50 border border-green-300 text-green-700 rounded hover:bg-green-100 transition-colors"
                      >
                        + เพิ่มข้อความ
                      </button>
                    </div>
                  </div>

                  {/* Each text item */}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                    {textItems.map((item, idx) => (
                      <div key={idx} className="border border-gray-100 rounded-lg p-2 space-y-1.5 bg-gray-50">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-medium text-gray-400 shrink-0">{idx + 1}.</span>
                          <input
                            type="text"
                            value={item.val}
                            onChange={e => setTextItems(prev => prev.map((it, i) => i === idx ? { ...it, val: e.target.value } : it))}
                            placeholder="เช่น ชื่อเต็ม, ตำแหน่ง..."
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-green-500"
                          />
                          {textItems.length > 1 && (
                            <button
                              onClick={() => setTextItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-600 shrink-0 p-0.5"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        {item.val && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setTextItems(prev => prev.map((it, i) => i === idx ? { ...it, size: Math.max(8, it.size - 1) } : it))} className="p-0.5 border border-gray-200 bg-white rounded text-gray-500 hover:bg-gray-50"><ZoomOut size={9} /></button>
                            <input type="range" min={8} max={24} value={item.size}
                              onChange={e => setTextItems(prev => prev.map((it, i) => i === idx ? { ...it, size: Number(e.target.value) } : it))}
                              className="flex-1 accent-green-600 h-1" />
                            <button onClick={() => setTextItems(prev => prev.map((it, i) => i === idx ? { ...it, size: Math.min(24, it.size + 1) } : it))} className="p-0.5 border border-gray-200 bg-white rounded text-gray-500 hover:bg-gray-50"><ZoomIn size={9} /></button>
                            <span className="text-[10px] text-gray-400 w-7 text-right shrink-0">{item.size}px</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Column 2: Date Tool */}
                <div className="space-y-2 bg-white p-2.5 rounded-lg border border-gray-200 flex flex-col justify-between">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 font-semibold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useDate}
                        onChange={e => setUseDate(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-green-600 border-gray-300 focus:ring-green-500 accent-green-600"
                      />
                      <span>📅 เพิ่มวันที่ลงนามบนเอกสาร</span>
                    </label>
                    <p className="text-[10px] text-gray-400">ลากไปวางไว้บนบรรทัดวันที่ในฟอร์มได้สะดวก</p>
                  </div>

                  {/* Date format selector */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-gray-500 font-medium">รูปแบบวันที่:</p>
                    <div className="grid grid-cols-2 gap-1">
                      {([['/', 'วว/ดด/ปป'], ['-', 'วว-ดด-ปป'], [' ', 'วว ดด ปป'], ['custom', 'กำหนดเอง']] as [typeof dateSep, string][]).map(([sep, label]) => (
                        <button
                          key={sep}
                          disabled={!useDate}
                          onClick={() => {
                            setDateSep(sep);
                            if (sep !== 'custom') setDateVal(getThaiDateString(sep));
                          }}
                          className={`text-[10px] py-0.5 rounded border transition-colors ${
                            dateSep === sep
                              ? 'bg-blue-100 border-blue-400 text-blue-700 font-medium'
                              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                          } disabled:opacity-40`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={dateVal}
                      onChange={e => { setDateVal(e.target.value); setDateSep('custom'); }}
                      disabled={!useDate}
                      placeholder="วัน/เดือน/ปี เช่น 22/05/2569"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-green-500 disabled:bg-gray-50 disabled:text-gray-400 font-medium"
                    />
                    {/* Date size slider */}
                    <div className="space-y-0.5 pt-1 border-t border-gray-100">
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>ขนาดวันที่:</span>
                        <span className="bg-gray-100 px-1 rounded">{dateSize}px</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setDateSize(s => Math.max(7, s - 1))} disabled={!useDate} className="p-0.5 border border-gray-200 bg-white rounded text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ZoomOut size={10} /></button>
                        <input type="range" min={7} max={20} value={dateSize} onChange={e => setDateSize(Number(e.target.value))} disabled={!useDate} className="flex-1 accent-green-600 h-1 disabled:opacity-40" />
                        <button onClick={() => setDateSize(s => Math.min(20, s + 1))} disabled={!useDate} className="p-0.5 border border-gray-200 bg-white rounded text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ZoomIn size={10} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 3: Checkmark (Tick) Tool helper */}
                <div className="space-y-2 bg-white p-2.5 rounded-lg border border-gray-200 flex flex-col justify-between">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 font-semibold text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCheckmark}
                        onChange={e => setUseCheckmark(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-green-600 border-gray-300 focus:ring-green-500 accent-green-600"
                      />
                      <span>✅ เพิ่มเครื่องหมายติ๊กถูก (✓)</span>
                    </label>
                    <p className="text-[10px] text-gray-400">ลากไปวางในช่องสี่เหลี่ยม [ ] เลือก อนุมัติ/ไม่อนุมัติ</p>
                  </div>
                  <div className="pt-2">
                    <select
                      value={checkmarkVal}
                      onChange={e => setCheckmarkVal(e.target.value)}
                      disabled={!useCheckmark}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-green-500 disabled:bg-gray-50 disabled:text-gray-400 bg-white font-medium cursor-pointer"
                    >
                      <option value="✓">✓ เครื่องหมายถูกมาตรฐาน (✓)</option>
                      <option value="✔">✔ เครื่องหมายหนาเข้ม (✔)</option>
                      <option value="✗">✗ เครื่องหมายผิด/กากบาท (✗)</option>
                    </select>
                  </div>
                </div>

              </div>

              {/* Document preview with draggable elements */}
              <div className="flex flex-col items-center gap-2">
                <div
                  ref={pageContainerRef}
                  className="relative bg-white border border-gray-300 shadow-md select-none overflow-hidden w-full"
                  style={{ maxWidth: 560, aspectRatio: '1 / 1.414' }}
                >
                  {/* PDF as image */}
                  {selectedPdf ? (
                    <>
                      {pdfLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 gap-2" style={{ minHeight: 320 }}>
                          <Loader2 size={28} className="text-green-500 animate-spin" />
                          <p className="text-xs text-gray-500">กำลังโหลดเอกสาร...</p>
                        </div>
                      )}
                      {pdfError && (
                        <div className="flex items-center justify-center bg-gray-50 text-sm text-red-500 py-12">
                          {pdfError}
                        </div>
                      )}
                      {pdfImageUrl && (
                        <img
                          src={pdfImageUrl}
                          alt="เอกสาร PDF"
                          className="absolute inset-0 w-full h-full block select-none pointer-events-none object-fill"
                          draggable={false}
                        />
                      )}
                      {/* Placeholder height while loading */}
                      {pdfLoading && <div style={{ paddingBottom: '141.4%' }} />}
                    </>
                  ) : (
                    /* Blank A4 fallback */
                    <div style={{ aspectRatio: '1 / 1.414', backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #e5e7eb 27px, #e5e7eb 28px)' }}>
                      <div className="p-6 opacity-15 space-y-2 pointer-events-none">
                        <div className="h-3 bg-gray-500 rounded w-1/2 mx-auto" />
                        <div className="h-2 bg-gray-400 rounded w-full mt-2" />
                        <div className="h-2 bg-gray-400 rounded w-5/6" />
                      </div>
                    </div>
                  )}

                  {/* ── Overlay Existing Signatures & Text Blocks ── */}
                  {(pdfImageUrl || !selectedPdf) && existingSteps && existingSteps.map((step) => (
                    <React.Fragment key={step.level}>
                      {step.signatureData && step.signatureX !== undefined && step.signatureY !== undefined && (
                        <img
                          src={step.signatureData}
                          alt={`ลายเซ็น ระดับ ${step.level}`}
                          className="absolute pointer-events-none select-none mix-blend-multiply"
                          style={{
                            left: `${step.signatureX}%`,
                            top: `${step.signatureY}%`,
                            width: `12%`,
                            transform: 'translateY(-2%)',
                          }}
                        />
                      )}
                      {/* Extra signature positions from previous approved steps */}
                      {step.extraSignaturePositions?.map((esp, ei) => (
                        step.signatureData && (
                          <img
                            key={ei}
                            src={step.signatureData}
                            alt={`ลายเซ็น ระดับ ${step.level} ตำแหน่ง ${ei + 2}`}
                            className="absolute pointer-events-none select-none mix-blend-multiply"
                            style={{
                              left: `${esp.x}%`,
                              top: `${esp.y}%`,
                              width: `12%`,
                              transform: 'translateY(-2%)',
                            }}
                          />
                        )
                      ))}
                      {step.textBlock && step.textBlockX !== undefined && step.textBlockY !== undefined && (
                        <div
                          className="absolute pointer-events-none select-none text-gray-800 font-medium whitespace-nowrap"
                          style={{
                            left: `${step.textBlockX}%`,
                            top: `${step.textBlockY}%`,
                            fontSize: `${step.textBlockSize || 13}px`,
                            fontFamily: 'THSarabun, sans-serif',
                            background: 'transparent',
                            lineHeight: 1,
                          }}
                        >
                          {step.textBlock}
                        </div>
                      )}
                      {/* Extra text blocks from previous steps */}
                      {step.extraTextBlocks?.map((eb, ei) => (
                        <div
                          key={ei}
                          className="absolute pointer-events-none select-none text-gray-800 font-medium whitespace-nowrap"
                          style={{
                            left: `${eb.x}%`,
                            top: `${eb.y}%`,
                            fontSize: `${eb.size || 13}px`,
                            fontFamily: 'THSarabun, sans-serif',
                            background: 'transparent',
                            lineHeight: 1,
                          }}
                        >
                          {eb.val}
                        </div>
                      ))}
                      {step.dateBlock && step.dateX !== undefined && step.dateY !== undefined && (
                        <div
                          className="absolute pointer-events-none select-none text-gray-800 font-medium whitespace-nowrap"
                          style={{
                            left: `${step.dateX}%`,
                            top: `${step.dateY}%`,
                            fontSize: `${step.dateSize || 11}px`,
                            fontFamily: 'THSarabun, sans-serif',
                            background: 'transparent',
                            lineHeight: 1,
                          }}
                        >
                          {step.dateBlock}
                        </div>
                      )}
                      {step.checkmarkBlock && step.checkmarkX !== undefined && step.checkmarkY !== undefined && (
                        <div
                          className="absolute pointer-events-none select-none text-green-700 font-bold"
                          style={{
                            left: `${step.checkmarkX}%`,
                            top: `${step.checkmarkY}%`,
                            fontSize: `15px`,
                            lineHeight: 1,
                          }}
                        >
                          {step.checkmarkBlock}
                        </div>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Draggable Signatures — one per sigPosition */}
                  {(pdfImageUrl || !selectedPdf) && sigPositions.map((sp, idx) => (
                    <React.Fragment key={idx}>
                      <img
                        src={signatureData}
                        alt={idx === 0 ? 'ลายเซ็น' : `ลายเซ็น ตำแหน่ง ${idx + 1}`}
                        draggable={false}
                        onMouseDown={(e) => onMouseDown(e, 'signature', idx)}
                        onTouchStart={(e) => onTouchStart(e, 'signature', idx)}
                        className="absolute cursor-grab active:cursor-grabbing select-none mix-blend-multiply"
                        style={{
                          left: `${sp.x}%`,
                          top: `${sp.y}%`,
                          width: `${sigSize}%`,
                          filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.25))',
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      />
                      <div
                        className={`absolute border-2 border-dashed rounded pointer-events-none ${idx === 0 ? 'border-green-500/80' : 'border-purple-500/80'}`}
                        style={{
                          left: `${sp.x}%`,
                          top: `${sp.y}%`,
                          width: `${sigSize}%`,
                          height: '7%',
                          transform: 'translateY(-4%)',
                        }}
                      />
                      {idx > 0 && (
                        <div
                          className="absolute text-[9px] bg-purple-600 text-white px-1 rounded pointer-events-none"
                          style={{ left: `${sp.x}%`, top: `${sp.y - 3.5}%` }}
                        >
                          ตำแหน่ง {idx + 1}
                        </div>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Draggable Text Blocks — all items in textItems */}
                  {(pdfImageUrl || !selectedPdf) && textItems.map((item, idx) =>
                    item.val ? (
                      <React.Fragment key={idx}>
                        <div
                          onMouseDown={(e) => onMouseDown(e, 'text', idx)}
                          onTouchStart={(e) => onTouchStart(e, 'text', idx)}
                          className="absolute cursor-grab active:cursor-grabbing select-none font-medium whitespace-nowrap text-gray-900"
                          style={{
                            left: `${item.pos.x}%`,
                            top: `${item.pos.y}%`,
                            fontSize: `${item.size}px`,
                            fontFamily: 'THSarabun, sans-serif',
                            background: 'transparent',
                            lineHeight: 1,
                            userSelect: 'none',
                            touchAction: 'none',
                          }}
                        >
                          {item.val}
                        </div>
                        <div
                          className="absolute border border-dashed border-blue-500/70 rounded pointer-events-none"
                          style={{
                            left: `${item.pos.x - 0.5}%`,
                            top: `${item.pos.y - 1}%`,
                            width: `${item.val.length * (item.size * 0.45)}px`,
                            height: `${item.size + 4}px`,
                          }}
                        />
                      </React.Fragment>
                    ) : null
                  )}

                  {/* Draggable Date Block */}
                  {(pdfImageUrl || !selectedPdf) && useDate && dateVal && (
                    <>
                      <div
                        onMouseDown={(e) => onMouseDown(e, 'date', 0)}
                        onTouchStart={(e) => onTouchStart(e, 'date', 0)}
                        className="absolute cursor-grab active:cursor-grabbing select-none font-medium whitespace-nowrap text-blue-850 bg-blue-50/10 px-1 border border-blue-200/25 rounded"
                        style={{
                          left: `${datePos.x}%`,
                          top: `${datePos.y}%`,
                          fontSize: `${dateSize}px`,
                          fontFamily: 'THSarabun, sans-serif',
                          lineHeight: 1,
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      >
                        {dateVal}
                      </div>
                      {/* Date placement guide border */}
                      <div
                        className="absolute border border-dashed border-blue-400/80 rounded pointer-events-none"
                        style={{
                          left: `${datePos.x - 0.5}%`,
                          top: `${datePos.y - 1}%`,
                          width: `${dateVal.length * (dateSize * 0.55)}px`,
                          height: `${dateSize + 4}px`,
                        }}
                      />
                    </>
                  )}

                  {/* Draggable Checkmark Block */}
                  {(pdfImageUrl || !selectedPdf) && useCheckmark && checkmarkVal && (
                    <>
                      <div
                        onMouseDown={(e) => onMouseDown(e, 'checkmark')}
                        onTouchStart={(e) => onTouchStart(e, 'checkmark')}
                        className="absolute cursor-grab active:cursor-grabbing select-none font-extrabold text-green-700 bg-green-50/10 px-0.5 border border-green-300/25 rounded"
                        style={{
                          left: `${checkmarkPos.x}%`,
                          top: `${checkmarkPos.y}%`,
                          fontSize: `17px`,
                          lineHeight: 1,
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      >
                        {checkmarkVal}
                      </div>
                      {/* Checkmark placement guide border */}
                      <div
                        className="absolute border border-dashed border-green-500/80 rounded pointer-events-none"
                        style={{
                          left: `${checkmarkPos.x - 1}%`,
                          top: `${checkmarkPos.y - 1}%`,
                          width: `18px`,
                          height: `20px`,
                        }}
                      />
                    </>
                  )}
                </div>

                {/* Page controls (multi-page PDF) */}
                {numPages > 1 && (
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPdfPage(p => Math.max(1, p - 1))} disabled={pdfPage <= 1} className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={14} /></button>
                    <span className="text-xs text-gray-500">หน้า {pdfPage} / {numPages}</span>
                    <button onClick={() => setPdfPage(p => Math.min(numPages, p + 1))} disabled={pdfPage >= numPages} className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0 rounded-b-2xl">
          {tab === 'place' && (
            <button onClick={() => setTab('sign')} className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
              ← เซ็นใหม่
            </button>
          )}
          <button
            onClick={() => {
              if (!signatureData) return;
              // First text item → textBlock params (backward compat)
              const first = textItems[0];
              const hasFirst = first?.val?.trim();
              // Extra text blocks (index 1..n)
              const extras = textItems.slice(1).filter(it => it.val.trim());
              // Extra signature positions (index 1..n)
              const extraSigPos = sigPositions.slice(1).length > 0 ? sigPositions.slice(1) : undefined;
              onConfirm(
                signatureData,
                sigPositions[0].x,
                sigPositions[0].y,
                hasFirst ? first.val : undefined,
                hasFirst ? first.pos.x : undefined,
                hasFirst ? first.pos.y : undefined,
                hasFirst ? first.size : undefined,
                useDate ? dateVal : undefined,
                useDate ? datePos.x : undefined,
                useDate ? datePos.y : undefined,
                useCheckmark ? checkmarkVal : undefined,
                useCheckmark ? checkmarkPos.x : undefined,
                useCheckmark ? checkmarkPos.y : undefined,
                useDate ? dateSize : undefined,
                extras.length > 0 ? extras.map(it => ({ val: it.val, x: it.pos.x, y: it.pos.y, size: it.size })) : undefined,
                extraSigPos,
                sigSize
              );
            }}
            disabled={!signatureData || tab !== 'place'}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Check size={15} /> ยืนยันและอนุมัติ
          </button>
        </div>

      </div>
    </div>
  );
}
