import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Move, Check, X, Loader2 } from 'lucide-react';
import type { Submission, ApprovalStep } from '../../data/mockData';
import { toast } from 'sonner';

// ── Render PDF page to image URL (offscreen canvas) ──────────
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

        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href;

        let pdfData: ArrayBuffer;
        if (url.startsWith('blob:') || url.startsWith('data:')) {
          const res = await fetch(url);
          pdfData = await res.arrayBuffer();
        } else {
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
          console.error('[AdminAdjustModal] PDF render error:', err);
          setError('ไม่สามารถแสดง PDF ได้ (CORS หรือ URL ไม่ถูกต้อง)');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url, pageNum]);

  return { imageUrl, numPages, loading, error };
}

interface AdminAdjustSignaturesModalProps {
  submission: Submission;
  onClose: () => void;
  onSave: (updatedSteps: ApprovalStep[], applyToAllActive: boolean) => void | Promise<void>;
}

interface DraggableItem {
  level: number;
  type: 'signature' | 'checkmark' | 'date' | 'text' | 'extraSignature';
  extraIndex?: number;
}

export function AdminAdjustSignaturesModal({
  submission,
  onClose,
  onSave,
}: AdminAdjustSignaturesModalProps) {
  const [pageNum, setPageNum] = useState(1);
  const [steps, setSteps] = useState<ApprovalStep[]>(() => JSON.parse(JSON.stringify(submission.approvalSteps)));
  const [applyToAllActive, setApplyToAllActive] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const draggingItem = useRef<DraggableItem | null>(null);

  const attach = submission.attachments?.[0];
  const sourceUrl = submission.originalAttachmentUrl || attach?.url || null;
  const { imageUrl, numPages, loading: pdfLoading, error: pdfError } = usePdfPageImage(sourceUrl, pageNum);

  const getPagePos = useCallback((clientX: number, clientY: number, sizeWidthPercent: number) => {
    if (!pageContainerRef.current) return null;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const relX = ((clientX - dragOffset.current.x - rect.left) / rect.width) * 100;
    const relY = ((clientY - dragOffset.current.y - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100 - sizeWidthPercent, relX)),
      y: Math.max(0, Math.min(95, relY)),
    };
  }, []);

  const onMouseDown = (
    e: React.MouseEvent<HTMLElement>,
    level: number,
    type: DraggableItem['type'],
    extraIndex?: number
  ) => {
    e.preventDefault();
    const elem = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - elem.left, y: e.clientY - elem.top };
    dragging.current = true;
    draggingItem.current = { level, type, extraIndex };

    const step = steps.find(s => s.level === level);
    const activeWidth = type === 'signature' || type === 'extraSignature' ? (step?.signatureSize || 12) : 10;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !draggingItem.current) return;
      const p = getPagePos(ev.clientX, ev.clientY, activeWidth);
      if (p) {
        setSteps(prev => prev.map(s => {
          if (s.level === level) {
            if (type === 'signature') {
              return { ...s, signatureX: p.x, signatureY: p.y };
            }
            if (type === 'checkmark') {
              return { ...s, checkmarkX: p.x, checkmarkY: p.y };
            }
            if (type === 'date') {
              return { ...s, dateX: p.x, dateY: p.y };
            }
            if (type === 'text') {
              return { ...s, textBlockX: p.x, textBlockY: p.y };
            }
            if (type === 'extraSignature' && extraIndex !== undefined && s.extraSignaturePositions) {
              const newExtras = [...s.extraSignaturePositions];
              newExtras[extraIndex] = { x: p.x, y: p.y };
              return { ...s, extraSignaturePositions: newExtras };
            }
          }
          return s;
        }));
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

  const onTouchStart = (
    e: React.TouchEvent<HTMLElement>,
    level: number,
    type: DraggableItem['type'],
    extraIndex?: number
  ) => {
    const touch = e.touches[0];
    const elem = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: touch.clientX - elem.left, y: touch.clientY - elem.top };
    dragging.current = true;
    draggingItem.current = { level, type, extraIndex };

    const step = steps.find(s => s.level === level);
    const activeWidth = type === 'signature' || type === 'extraSignature' ? (step?.signatureSize || 12) : 10;

    const onMove = (ev: TouchEvent) => {
      if (!dragging.current || !draggingItem.current) return;
      const t = ev.touches[0];
      const p = getPagePos(t.clientX, t.clientY, activeWidth);
      if (p) {
        setSteps(prev => prev.map(s => {
          if (s.level === level) {
            if (type === 'signature') {
              return { ...s, signatureX: p.x, signatureY: p.y };
            }
            if (type === 'checkmark') {
              return { ...s, checkmarkX: p.x, checkmarkY: p.y };
            }
            if (type === 'date') {
              return { ...s, dateX: p.x, dateY: p.y };
            }
            if (type === 'text') {
              return { ...s, textBlockX: p.x, textBlockY: p.y };
            }
            if (type === 'extraSignature' && extraIndex !== undefined && s.extraSignaturePositions) {
              const newExtras = [...s.extraSignaturePositions];
              newExtras[extraIndex] = { x: p.x, y: p.y };
              return { ...s, extraSignaturePositions: newExtras };
            }
          }
          return s;
        }));
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

  const handleSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, signatureSize: newSize } : s));
  };

  const handleDateSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, dateSize: newSize } : s));
  };

  const handleCheckmarkSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, checkmarkSize: newSize } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(steps, applyToAllActive);
      toast.success('บันทึกปรับปรุงตำแหน่งลายเซ็นเรียบร้อยแล้ว');
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('เกิดข้อผิดพลาดระหว่างบันทึก');
    } finally {
      setSaving(false);
    }
  };

  // Color mappings for each step level
  const borderColors = ['border-blue-500', 'border-emerald-500', 'border-purple-500', 'border-orange-500'];
  const badgeBgs = ['bg-blue-50 text-blue-700 border-blue-200', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-purple-50 text-purple-700 border-purple-200', 'bg-orange-50 text-orange-700 border-orange-200'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-gray-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-[#1a5c2e] text-base font-semibold flex items-center gap-2">
              <Move size={18} /> ปรับแก้ตำแหน่งลายเซ็นอาจารย์ (Super Admin)
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">{submission.formName} — {submission.studentName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          
          {/* Left Sidebar: Controls */}
          <div className="w-full md:w-80 border-r border-gray-100 p-4 overflow-y-auto space-y-4 shrink-0 bg-gray-50/50">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1.5">
              <p className="font-semibold flex items-center gap-1">💡 คำแนะนำ:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>ลากลายเซ็นหรือข้อความในหน้าเอกสารด้านขวาเพื่อขยับตำแหน่ง</li>
                <li>ใช้แถบสไลด์ด้านล่างเพื่อขยายหรือย่อขนาดลายเซ็นของอาจารย์แต่ละท่าน</li>
                <li>กด "บันทึกและอัปเดต" เพื่อยืนยันการตั้งค่าลงบนระบบ</li>
              </ul>
            </div>

            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">ขนาดลายเซ็นแต่ละระดับ</h4>
            
            <div className="space-y-4">
              {steps.filter(s => s.signatureData).map((step, idx) => {
                const colorIdx = idx % borderColors.length;
                return (
                  <div key={step.level} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${badgeBgs[colorIdx]}`}>
                        ระดับ {step.level}
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium truncate max-w-[120px]" title={step.approverName}>
                        {step.approverName || step.roleName}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      {/* Signature size slider */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>ขนาดลายเซ็น</span>
                          <span className="font-semibold text-gray-700">{step.signatureSize || 12}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={40}
                          value={step.signatureSize || 12}
                          onChange={e => handleSizeChange(step.level, Number(e.target.value))}
                          className="w-full accent-[#1a5c2e] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Date size slider */}
                      {step.dateBlock && (
                        <div className="space-y-1 pt-1 border-t border-gray-100">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>ขนาดวันที่</span>
                            <span className="font-semibold text-gray-700">{step.dateSize || 11}px</span>
                          </div>
                          <input
                            type="range"
                            min={6}
                            max={30}
                            value={step.dateSize || 11}
                            onChange={e => handleDateSizeChange(step.level, Number(e.target.value))}
                            className="w-full accent-[#1a5c2e] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Checkmark size slider */}
                      {step.checkmarkBlock && (
                        <div className="space-y-1 pt-1 border-t border-gray-100">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>ขนาดเครื่องหมายถูก</span>
                            <span className="font-semibold text-gray-700">{step.checkmarkSize || 15}px</span>
                          </div>
                          <input
                            type="range"
                            min={8}
                            max={40}
                            value={step.checkmarkSize || 15}
                            onChange={e => handleCheckmarkSizeChange(step.level, Number(e.target.value))}
                            className="w-full accent-[#1a5c2e] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {steps.filter(s => s.signatureData).length === 0 && (
                <p className="text-xs text-gray-400 italic text-center py-6">เอกสารนี้ยังไม่มีลายเซ็นอาจารย์ลงนาม</p>
              )}
            </div>

            {numPages > 1 && (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">หน้าเอกสาร</p>
                <div className="flex items-center justify-between gap-2">
                  <button
                    disabled={pageNum <= 1}
                    onClick={() => setPageNum(p => p - 1)}
                    className="flex-1 py-1.5 px-3 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-gray-600 transition-colors"
                  >
                    ก่อนหน้า
                  </button>
                  <span className="text-xs font-medium text-gray-700 whitespace-nowrap">หน้า {pageNum} / {numPages}</span>
                  <button
                    disabled={pageNum >= numPages}
                    onClick={() => setPageNum(p => p + 1)}
                    className="flex-1 py-1.5 px-3 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-gray-600 transition-colors"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Area: PDF Preview Canvas */}
          <div className="flex-1 bg-gray-100 p-4 overflow-auto flex items-start justify-center min-h-[400px]">
            <div
              ref={pageContainerRef}
              className="relative bg-white border border-gray-300 shadow-md select-none overflow-hidden w-full shrink-0"
              style={{ maxWidth: 560, aspectRatio: '1 / 1.414' }}
            >
              {pdfLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 gap-2">
                  <Loader2 size={28} className="text-green-600 animate-spin" />
                  <p className="text-xs text-gray-500 font-medium">กำลังโหลดแบบฟอร์มเอกสาร...</p>
                </div>
              )}
              {pdfError && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-sm text-red-500 p-6 text-center">
                  {pdfError}
                </div>
              )}

              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="แบบฟอร์มเอกสาร"
                  className="absolute inset-0 w-full h-full block select-none pointer-events-none object-fill"
                  draggable={false}
                />
              )}

              {/* Draggable signatures and text overlays */}
              {!pdfLoading && imageUrl && steps.map((step, idx) => {
                const colorIdx = idx % borderColors.length;
                const sigSize = step.signatureSize || 12;
                const borderHex = step.level === 1 ? 'border-blue-500' : step.level === 2 ? 'border-emerald-500' : 'border-purple-500';
                const bgHex = step.level === 1 ? 'bg-blue-600' : step.level === 2 ? 'bg-emerald-600' : 'bg-purple-600';
                return (
                  <React.Fragment key={step.level}>
                    {/* Primary Signature */}
                    {step.signatureData && step.signatureX !== undefined && step.signatureY !== undefined && (
                      <div className="absolute" style={{ left: `${step.signatureX}%`, top: `${step.signatureY}%`, width: `${sigSize}%` }}>
                        <img
                          src={step.signatureData}
                          alt={`ลายเซ็นระดับ ${step.level}`}
                          onMouseDown={e => onMouseDown(e, step.level, 'signature')}
                          onTouchStart={e => onTouchStart(e, step.level, 'signature')}
                          className={`w-full h-auto cursor-grab active:cursor-grabbing select-none mix-blend-multiply border-2 border-dashed ${borderHex} hover:scale-102 transition-transform`}
                          draggable={false}
                          style={{ touchAction: 'none' }}
                        />
                        <div className={`absolute -top-3.5 left-0 text-[8px] font-semibold text-white px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap ${bgHex} pointer-events-none`}>
                          ระดับ {step.level}
                        </div>
                      </div>
                    )}

                    {/* Extra signatures if any */}
                    {step.signatureData && step.extraSignaturePositions?.map((pos, exIdx) => (
                      <div key={exIdx} className="absolute" style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${sigSize}%` }}>
                        <img
                          src={step.signatureData}
                          alt={`ลายเซ็นระดับ ${step.level} (พิเศษ ${exIdx + 2})`}
                          onMouseDown={e => onMouseDown(e, step.level, 'extraSignature', exIdx)}
                          onTouchStart={e => onTouchStart(e, step.level, 'extraSignature', exIdx)}
                          className={`w-full h-auto cursor-grab active:cursor-grabbing select-none mix-blend-multiply border-2 border-dashed ${borderHex} opacity-90`}
                          draggable={false}
                          style={{ touchAction: 'none' }}
                        />
                        <div className={`absolute -top-3.5 left-0 text-[8px] font-semibold text-white px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap ${bgHex} pointer-events-none`}>
                          ระดับ {step.level} (จุด {exIdx + 2})
                        </div>
                      </div>
                    ))}

                    {/* Checkmark */}
                    {step.checkmarkBlock && step.checkmarkX !== undefined && step.checkmarkY !== undefined && (
                      <div
                        onMouseDown={e => onMouseDown(e, step.level, 'checkmark')}
                        onTouchStart={e => onTouchStart(e, step.level, 'checkmark')}
                        className={`absolute cursor-grab active:cursor-grabbing select-none font-bold text-green-700 border border-dashed border-green-500 bg-transparent rounded flex items-center justify-center`}
                        style={{
                          left: `${step.checkmarkX}%`,
                          top: `${step.checkmarkY}%`,
                          fontSize: `${step.checkmarkSize || 15}px`,
                          lineHeight: 1,
                          touchAction: 'none'
                        }}
                      >
                        {step.checkmarkBlock}
                      </div>
                    )}

                    {/* Date Block */}
                    {step.dateBlock && step.dateX !== undefined && step.dateY !== undefined && (
                      <div
                        onMouseDown={e => onMouseDown(e, step.level, 'date')}
                        onTouchStart={e => onTouchStart(e, step.level, 'date')}
                        className={`absolute cursor-grab active:cursor-grabbing select-none text-gray-800 font-semibold border border-dashed border-gray-400 bg-transparent rounded whitespace-nowrap`}
                        style={{
                          left: `${step.dateX}%`,
                          top: `${step.dateY}%`,
                          fontSize: `${step.dateSize || 11}px`,
                          fontFamily: 'THSarabun, sans-serif',
                          lineHeight: 1,
                          touchAction: 'none'
                        }}
                      >
                        {step.dateBlock}
                      </div>
                    )}

                    {/* Text Block */}
                    {step.textBlock && step.textBlockX !== undefined && step.textBlockY !== undefined && (
                      <div
                        onMouseDown={e => onMouseDown(e, step.level, 'text')}
                        onTouchStart={e => onTouchStart(e, step.level, 'text')}
                        className={`absolute cursor-grab active:cursor-grabbing select-none text-gray-800 font-semibold border border-dashed border-gray-400 bg-transparent rounded whitespace-nowrap`}
                        style={{
                          left: `${step.textBlockX}%`,
                          top: `${step.textBlockY}%`,
                          fontSize: `12px`,
                          fontFamily: 'THSarabun, sans-serif',
                          lineHeight: 1,
                          touchAction: 'none'
                        }}
                      >
                        {step.textBlock}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 rounded-b-2xl">
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyToAllActive}
                onChange={e => setApplyToAllActive(e.target.checked)}
                disabled={saving}
                className="rounded border-gray-300 text-[#1a5c2e] focus:ring-[#1a5c2e] h-3.5 w-3.5 transition-colors cursor-pointer"
              />
              อัปเดตตำแหน่งเหล่านี้ไปยังทุกเอกสารประเภทนี้ที่ยังอนุมัติไม่ครบด้วย
            </label>
            <p className="text-[10px] text-gray-400 pl-5.5">ระบบจะสร้าง PDF ใหม่พร้อมลายเซ็นที่ปรับตำแหน่งแล้ว อาจใช้เวลาสักครู่</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-600 transition-colors disabled:opacity-50">
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#1a5c2e] hover:bg-green-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed min-w-[160px] justify-center"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  กำลังประมวลผล...
                </>
              ) : (
                <>
                  <Check size={14} /> บันทึกและอัปเดต
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
