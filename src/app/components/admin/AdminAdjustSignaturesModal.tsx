import React, { useRef, useState, useEffect } from 'react';
import { Move, Check, X, Loader2, Plus, Calendar, Type } from 'lucide-react';
import type { Submission, ApprovalStep } from '../../data/mockData';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getCachedFileBlob } from '../../lib/fileCache';
import { DocumentTextOverlay, DocumentCheckmarkOverlay, loadDocumentPreviewFont } from '../shared/DocumentTextOverlay';
import { AdminPlacementToolbar } from './AdminPlacementToolbar';
import { useAdminPlacement } from './useAdminPlacement';
import { percentToMm } from '../../lib/adminPlacement.js';

// Helper to generate Thai Buddhist Era date string
function getThaiDateString(sep = '/') {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}${sep}${month}${sep}${year}`;
}

// ── Render PDF page to image URL (offscreen canvas) ──────────
function usePdfPageImage(url: string | null, pageNum: number, fileName?: string) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) { setImageUrl(null); return; }
    let cancelled = false;
    let createdBlobUrl: string | null = null;
    setLoading(true);
    setError(null);
    setImageUrl(null);

    const fnLower = (fileName || '').toLowerCase();
    const urlLower = (url || '').toLowerCase();
    const isUrlImage = urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') || urlLower.endsWith('.png') || urlLower.includes('.jpg?') || urlLower.includes('.jpeg?') || urlLower.includes('.png?');
    const isImage = fnLower.endsWith('.jpg') || fnLower.endsWith('.jpeg') || fnLower.endsWith('.png') || isUrlImage;

    (async () => {
      try {
        if (isImage) {
          let finalUrl = url;
          if (!url.startsWith('blob:') && !url.startsWith('data:')) {
            const blob = await getCachedFileBlob(url);
            finalUrl = URL.createObjectURL(blob);
            createdBlobUrl = finalUrl;
          }

          if (cancelled) {
            if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
            return;
          }

          setImageUrl(finalUrl);
          setNumPages(1);
          setLoading(false);
          return;
        }

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
          const blob = await getCachedFileBlob(url);
          pdfData = await blob.arrayBuffer();
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
          console.error('[AdminAdjustModal] PDF/Image render error:', err);
          setError('ไม่สามารถแสดงไฟล์ได้ (CORS หรือ URL ไม่ถูกต้อง)');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [url, pageNum, fileName]);

  return { imageUrl, numPages, loading, error };
}

interface AdminAdjustSignaturesModalProps {
  submission: Submission;
  onClose: () => void;
  onSave: (updatedSteps: ApprovalStep[], targetSubmissionIds: string[], sourceSubmission?: Submission) => boolean | void | Promise<boolean | void>;
}

export function AdminAdjustSignaturesModal({
  submission: latestSubmission,
  onClose,
  onSave,
}: AdminAdjustSignaturesModalProps) {
  // The opening version is the one being edited. A later context refresh must
  // not silently turn this editor into an overwrite of someone else's changes.
  const submission = useRef(latestSubmission).current;
  const [pageNum, setPageNum] = useState(1);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [fontReady, setFontReady] = useState(false);
  const [fontError, setFontError] = useState(false);
  const [dbSignatures, setDbSignatures] = useState<Record<string, string>>({});
  const attach = submission.attachments?.[0];
  const sourceUrl = submission.originalAttachmentUrl || attach?.url || null;
  const { imageUrl, numPages, loading: pdfLoading, error: pdfError } = usePdfPageImage(sourceUrl, pageNum, attach?.name);
  const blocked = saving || pdfLoading || !!pdfError || !imageUrl || !fontReady || fontError;
  const precision = useAdminPlacement(submission.approvalSteps, blocked, pageNum);
  const {
    steps, setSteps, pageContainerRef, dialogRef, scrollAreaRef,
    onPointerDown, onPointerMove, finishDrag, onDialogKeyDown,
    selectedItem, selectedKey, selectedPosition, choices, itemKey,
    zoom, setZoom, pageBaseWidth, pageWidth, showGuides, setShowGuides,
  } = precision;
  const invalidPage = steps.some(step => !Number.isInteger(step.page ?? 1) || (step.page ?? 1) < 1 || (step.page ?? 1) > numPages);

  useEffect(() => {
    let active = true;
    loadDocumentPreviewFont().then(() => { if (active) setFontReady(true); })
      .catch(() => { if (active) setFontError(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const approverIds = steps
      .map(s => s.approverId)
      .filter((id): id is string => !!id);
    if (approverIds.length === 0) return;

    (async () => {
      try {
        // Stage 1: Query teachers table
        const { data: teachersData, error: teachersError } = await supabase
          .from('teachers')
          .select('user_id, signature_data')
          .in('user_id', approverIds);

        const mapping: Record<string, string> = {};
        if (teachersData && !teachersError) {
          teachersData.forEach(row => {
            if (row.signature_data) {
              mapping[row.user_id] = row.signature_data;
            }
          });
        }

        // Identify which approvers are still missing signature data
        const missingIds = approverIds.filter(id => !mapping[id]);

        // Stage 2: Fallback - query submissions table for last 50 submissions
        if (missingIds.length > 0) {
          const { data: subsData, error: subsError } = await supabase
            .from('submissions')
            .select('approval_steps')
            .order('updated_at', { ascending: false })
            .limit(50);

          if (subsData && !subsError) {
            for (const sub of subsData) {
              const stepsArray = sub.approval_steps;
              if (Array.isArray(stepsArray)) {
                for (const step of stepsArray) {
                  if (step && step.approverId && step.signatureData) {
                    if (missingIds.includes(step.approverId) && !mapping[step.approverId]) {
                      mapping[step.approverId] = step.signatureData;
                    }
                  }
                }
              }
            }
          }
        }

        setDbSignatures(mapping);
      } catch (err) {
        console.error('Failed to load DB signatures:', err);
      }
    })();
  }, [submission]);
  
  const handleSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, signatureSize: newSize } : s));
  };

  const handleDateSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, dateSize: newSize } : s));
  };

  const handleCheckmarkSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, checkmarkSize: newSize } : s));
  };

  const handleTextBlockSizeChange = (level: number, newSize: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, textBlockSize: newSize } : s));
  };

  // Add a new text block for a step (e.g., teacher name)
  const handleAddTextBlock = (level: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level) return s;
      const name = s.approverName || s.roleName || '';
      return { ...s, textBlock: name, textBlockX: (s.signatureX ?? 30), textBlockY: (s.signatureY ?? 65) + 5, textBlockSize: 10 };
    }));
  };

  // Add a new date block for a step
  const handleAddDateBlock = (level: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level) return s;
      return { ...s, dateBlock: getThaiDateString('/'), dateX: (s.signatureX ?? 30), dateY: (s.signatureY ?? 65) + 8, dateSize: 10 };
    }));
  };

  // Update text block content
  const handleTextBlockChange = (level: number, val: string) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, textBlock: val } : s));
  };

  // Update date block content
  const handleDateBlockChange = (level: number, val: string) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, dateBlock: val } : s));
  };

  // Remove text block
  const handleRemoveTextBlock = (level: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, textBlock: undefined, textBlockX: undefined, textBlockY: undefined, textBlockSize: undefined } : s));
  };

  // Remove date block
  const handleRemoveDateBlock = (level: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, dateBlock: undefined, dateX: undefined, dateY: undefined, dateSize: undefined } : s));
  };

  // Delete signature block for a level
  const handleDeleteSignature = (level: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level) return s;
      return {
        ...s,
        signatureData: undefined,
        signatureX: undefined,
        signatureY: undefined,
        signatureSize: undefined,
        extraSignaturePositions: undefined,
      };
    }));
  };

  // Add extra signature block for a level
  const handleAddExtraSignature = (level: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level) return s;
      const extras = s.extraSignaturePositions ? [...s.extraSignaturePositions] : [];
      // Position it slightly offset from the primary signature
      const baseX = s.signatureX ?? 30;
      const baseY = s.signatureY ?? 65;
      extras.push({ x: baseX + 5, y: baseY + 5 });
      return { ...s, extraSignaturePositions: extras };
    }));
  };

  // Remove extra signature block for a level
  const handleRemoveExtraSignature = (level: number, idx: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level || !s.extraSignaturePositions) return s;
      const extras = s.extraSignaturePositions.filter((_, i) => i !== idx);
      return { ...s, extraSignaturePositions: extras.length > 0 ? extras : undefined };
    }));
  };

  // Add a new checkmark block for a step
  const handleAddCheckmarkBlock = (level: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level) return s;
      return { ...s, checkmarkBlock: '/', checkmarkX: (s.signatureX ?? 30) - 5, checkmarkY: (s.signatureY ?? 65), checkmarkSize: 15 };
    }));
  };

  // Update checkmark block type
  const handleCheckmarkBlockChange = (level: number, val: string) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, checkmarkBlock: val } : s));
  };

  // Remove checkmark block
  const handleRemoveCheckmarkBlock = (level: number) => {
    setSteps(prev => prev.map(s => s.level === level ? { ...s, checkmarkBlock: undefined, checkmarkX: undefined, checkmarkY: undefined, checkmarkSize: undefined } : s));
  };

  // Add extra text block
  const handleAddExtraTextBlock = (level: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level) return s;
      const extras = s.extraTextBlocks ? [...s.extraTextBlocks] : [];
      // Position near extra signature if available, otherwise near primary sig
      const extraSigPos = s.extraSignaturePositions?.[extras.length];
      const baseX = extraSigPos?.x ?? (s.signatureX ?? 60);
      const baseY = extraSigPos?.y ?? (s.signatureY ?? 65);
      extras.push({ val: s.approverName || '', x: baseX, y: baseY + 5, size: 10 });
      return { ...s, extraTextBlocks: extras };
    }));
  };

  // Edit extra text block value
  const handleExtraTextBlockChange = (level: number, idx: number, val: string) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level || !s.extraTextBlocks) return s;
      const extras = [...s.extraTextBlocks];
      extras[idx] = { ...extras[idx], val };
      return { ...s, extraTextBlocks: extras };
    }));
  };

  // Edit extra text block size
  const handleExtraTextBlockSizeChange = (level: number, idx: number, size: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level || !s.extraTextBlocks) return s;
      const extras = [...s.extraTextBlocks];
      extras[idx] = { ...extras[idx], size };
      return { ...s, extraTextBlocks: extras };
    }));
  };

  // Remove extra text block
  const handleRemoveExtraTextBlock = (level: number, idx: number) => {
    setSteps(prev => prev.map(s => {
      if (s.level !== level || !s.extraTextBlocks) return s;
      const extras = s.extraTextBlocks.filter((_, i) => i !== idx);
      return { ...s, extraTextBlocks: extras.length > 0 ? extras : undefined };
    }));
  };

  const handleSave = async () => {
    if (blocked || saveLock.current) return;
    if (invalidPage) {
      toast.error('กรุณาเลือกหน้าเอกสารที่มีอยู่จริงให้ครบก่อนบันทึก');
      return;
    }
    finishDrag();
    saveLock.current = true;
    setSaving(true);
    try {
      if (await onSave(precision.historyRef.current.present, [], submission) === false) return;
      toast.success('บันทึกปรับปรุงตำแหน่งลายเซ็นเรียบร้อยแล้ว');
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('เกิดข้อผิดพลาดระหว่างบันทึก');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  // Color mappings for each step level
  const borderColors = ['border-blue-500', 'border-emerald-500', 'border-purple-500', 'border-orange-500'];
  const badgeBgs = ['bg-blue-50 text-blue-700 border-blue-200', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-purple-50 text-purple-700 border-purple-200', 'bg-orange-50 text-orange-700 border-orange-200'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-gray-900/70 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="ปรับตำแหน่งลายเซ็น"
        tabIndex={-1} onKeyDown={onDialogKeyDown}
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl h-[94vh] focus:outline-none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-[#1a5c2e] text-base font-semibold flex items-center gap-2">
              <Move size={18} /> ปรับตำแหน่งลายเซ็นและข้อความ
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">{submission.formName} — {submission.studentName}</p>
          </div>
          <button aria-label="Close" onClick={onClose} disabled={saving} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <AdminPlacementToolbar
          choices={choices} selectedKey={selectedKey}
          onSelect={key => precision.setSelectedItem(choices.find(choice => choice.key === key)?.item || null)}
          xMm={selectedPosition ? percentToMm(selectedPosition.x, 'x') : null}
          yMm={selectedPosition ? percentToMm(selectedPosition.y, 'y') : null}
          onCoordinate={precision.setCoordinate} onNudge={precision.nudge}
          onUndo={precision.undo} onRedo={precision.redo}
          canUndo={precision.canUndo} canRedo={precision.canRedo}
          zoom={zoom} onZoom={setZoom} showGuides={showGuides} onShowGuides={setShowGuides}
          disabled={blocked}
        />

        {/* Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          
          {/* Left Sidebar: Controls */}
          <fieldset disabled={blocked} aria-label="Annotation details"
            className="w-full md:w-80 min-w-0 border-r border-gray-100 p-4 overflow-y-auto space-y-4 shrink-0 bg-gray-50/50">
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
              {steps.filter(s => s.status === 'approved' || s.signatureData || s.textBlock || s.dateBlock || s.checkmarkBlock).map((step, idx) => {
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

                    {imageUrl && (
                      <div className="flex items-center justify-between text-[11px] border-t border-gray-100 pt-1.5 mt-1">
                        <span className="text-gray-400 font-medium">แสตมป์ลงบนหน้า:</span>
                        <select
                          aria-label={`Page for level ${step.level}`}
                          value={step.page ?? 1}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setSteps(prev => prev.map(s => s.level === step.level ? { ...s, page: val } : s));
                          }}
                          className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white font-semibold text-gray-700 focus:outline-none focus:border-[#1a5c2e]"
                        >
                          {((step.page ?? 1) > numPages || (step.page ?? 1) < 1) && (
                            <option value={step.page} disabled>หน้า {step.page} (ไม่พบในเอกสาร)</option>
                          )}
                          {Array.from({ length: numPages }, (_, i) => (
                            <option key={i + 1} value={i + 1}>หน้า {i + 1}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      {/* Signature size slider */}
                      {step.signatureData ? (
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
                          <div className="flex justify-end pt-1 gap-1.5">
                            <button
                              onClick={() => handleAddExtraSignature(step.level)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 border border-blue-100 hover:border-blue-200 px-1.5 py-0.5 rounded bg-blue-50/50 hover:bg-blue-50 transition-colors"
                            >
                              <Plus size={10} /> เพิ่มลายเซ็นเสริม
                            </button>
                            <button
                              onClick={() => handleDeleteSignature(step.level)}
                              className="text-[10px] text-red-500 hover:text-red-700 font-medium flex items-center gap-0.5 border border-red-100 hover:border-red-200 px-1.5 py-0.5 rounded bg-red-50/50 hover:bg-red-50 transition-colors"
                            >
                              <X size={10} /> ลบลายเซ็นหลัก
                            </button>
                          </div>
                          {(step.extraSignaturePositions || []).length > 0 && (
                            <div className="space-y-1.5 pt-1.5 border-t border-gray-100 mt-2">
                              <span className="text-[10px] text-gray-400 font-semibold block">ลายเซ็นเสริม:</span>
                              {(step.extraSignaturePositions || []).map((pos, exIdx) => (
                                <div key={exIdx} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded border border-gray-100 text-[10px]">
                                  <span className="text-gray-500 font-medium">จุดที่ {exIdx + 2}</span>
                                  <button
                                    onClick={() => handleRemoveExtraSignature(step.level, exIdx)}
                                    className="text-red-500 hover:text-red-700 font-semibold"
                                  >
                                    ลบ
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-2 text-center italic">
                            ไม่มีภาพลายเซ็น (เซ็นสดบนเอกสาร)
                          </div>
                          {step.approverId && dbSignatures[step.approverId] ? (
                            <button
                              type="button"
                              onClick={async () => {
                                const sig = dbSignatures[step.approverId!];
                                setSteps(prev => prev.map(s => s.level === step.level ? {
                                  ...s,
                                  signatureData: sig,
                                  signatureX: s.signatureX ?? 30,
                                  signatureY: s.signatureY ?? 65,
                                  signatureSize: s.signatureSize ?? 12
                                } : s));
                                toast.success('นำเข้าลายเซ็นจากระบบเรียบร้อยแล้ว');

                                if (isSupabaseConfigured && supabase) {
                                  try {
                                    const { error } = await supabase
                                      .from('teachers')
                                      .update({ signature_data: sig })
                                      .eq('user_id', step.approverId);
                                    if (error) {
                                      console.error('Failed to auto-save signature to profile:', error);
                                    } else {
                                      toast.success('บันทึกรูปภาพลายเซ็นไปยังโปรไฟล์อาจารย์สำเร็จ');
                                    }
                                  } catch (dbErr) {
                                    console.error('DB update exception:', dbErr);
                                  }
                                }
                              }}
                              className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              <Plus size={12} /> นำเข้าลายเซ็นจากระบบของอาจารย์
                            </button>
                          ) : (
                            step.approverId && (
                              <div className="text-[9px] text-gray-400 text-center">
                                * ไม่พบลายเซ็นดิจิทัลของอาจารย์ท่านนี้ในระบบ
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* Text block (teacher name) */}
                      <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                        {step.textBlock ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Type size={10} /> ข้อความ (ชื่อ)</span>
                              <button onClick={() => handleRemoveTextBlock(step.level)} className="text-[10px] text-red-400 hover:text-red-600">ลบ</button>
                            </div>
                            <input
                              type="text"
                              value={step.textBlock}
                              onChange={e => handleTextBlockChange(step.level, e.target.value)}
                              className="w-full text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a5c2e] bg-white"
                              placeholder="ชื่ออาจารย์"
                            />
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>ขนาดข้อความ</span>
                              <span className="font-semibold text-gray-700">{step.textBlockSize || 10}px</span>
                            </div>
                            <input
                              type="range"
                              min={8}
                              max={24}
                              value={step.textBlockSize || 10}
                              onChange={e => handleTextBlockSizeChange(step.level, Number(e.target.value))}
                              className="w-full accent-[#1a5c2e] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </>
                        ) : (
                          <button
                            onClick={() => handleAddTextBlock(step.level)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-[#1a5c2e] bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            <Plus size={12} /> เพิ่มข้อความ (ชื่ออาจารย์)
                          </button>
                        )}
                      </div>

                      {/* Date block */}
                      <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                        {step.dateBlock ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Calendar size={10} /> วันที่</span>
                              <button onClick={() => handleRemoveDateBlock(step.level)} className="text-[10px] text-red-400 hover:text-red-600">ลบ</button>
                            </div>
                            <input
                              type="text"
                              value={step.dateBlock}
                              onChange={e => handleDateBlockChange(step.level, e.target.value)}
                              className="w-full text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a5c2e] bg-white"
                              placeholder="วว/ดด/ปปปป"
                            />
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>ขนาดวันที่</span>
                              <span className="font-semibold text-gray-700">{step.dateSize || 10}px</span>
                            </div>
                            <input
                              type="range"
                              min={6}
                              max={30}
                              value={step.dateSize || 10}
                              onChange={e => handleDateSizeChange(step.level, Number(e.target.value))}
                              className="w-full accent-[#1a5c2e] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </>
                        ) : (
                          <button
                            onClick={() => handleAddDateBlock(step.level)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-[#1a5c2e] bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            <Plus size={12} /> เพิ่มวันที่
                          </button>
                        )}
                      </div>

                      {/* Checkmark block */}
                      <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                        {step.checkmarkBlock ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span className="flex items-center gap-1">/ เครื่องหมาย (ขีด)</span>
                              <button onClick={() => handleRemoveCheckmarkBlock(step.level)} className="text-[10px] text-red-400 hover:text-red-600">ลบ</button>
                            </div>
                            <div className="text-center py-1 border border-gray-100 rounded-lg bg-gray-50 text-xl font-bold text-gray-700">/</div>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>ขนาดเครื่องหมาย</span>
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
                          </>
                        ) : (
                          <button
                            onClick={() => handleAddCheckmarkBlock(step.level)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-[#1a5c2e] bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            <Plus size={12} /> เพิ่มเครื่องหมาย (/)
                          </button>
                        )}
                      </div>

                      {/* Extra text blocks (additional name/date annotations) */}
                      <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span className="font-semibold">ข้อความเสริม</span>
                          <span className="text-[10px] text-gray-400">{(step.extraTextBlocks || []).length} รายการ</span>
                        </div>
                        {(step.extraTextBlocks || []).map((tb, tbIdx) => (
                          <div key={tbIdx} className="bg-gray-50 p-2 rounded-lg border border-gray-100 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-400">จุด {tbIdx + 1}</span>
                              <button
                                onClick={() => handleRemoveExtraTextBlock(step.level, tbIdx)}
                                className="text-[10px] text-red-400 hover:text-red-600"
                              >ลบ</button>
                            </div>
                            <input
                              type="text"
                              value={tb.val}
                              onChange={e => handleExtraTextBlockChange(step.level, tbIdx, e.target.value)}
                              className="w-full text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1a5c2e] bg-white"
                              placeholder="ข้อความ เช่น ชื่ออาจารย์ หรือ วันที่"
                            />
                            <div className="flex items-center justify-between text-[10px] text-gray-400">
                              <span>ขนาด</span>
                              <span>{tb.size}px</span>
                            </div>
                            <input
                              type="range" min={6} max={24} value={tb.size}
                              onChange={e => handleExtraTextBlockSizeChange(step.level, tbIdx, Number(e.target.value))}
                              className="w-full accent-[#1a5c2e] h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => handleAddExtraTextBlock(step.level)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Plus size={12} /> เพิ่มข้อความเสริม (ชื่อ/วันที่)
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {steps.filter(s => s.status === 'approved' || s.signatureData || s.textBlock || s.dateBlock || s.checkmarkBlock).length === 0 && (
                <p className="text-xs text-gray-400 italic text-center py-6">ไม่มีรายชื่อผู้อนุมัติหรือข้อมูลลงนาม</p>
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
          </fieldset>

          {/* Right Area: PDF Preview Canvas */}
          <div ref={scrollAreaRef} data-document-scroll="" className="flex-1 min-w-0 bg-gray-100 p-4 overflow-auto min-h-[400px]">
            <div className="flex justify-center" style={{ width: Math.max(pageWidth, pageBaseWidth), minWidth: '100%' }}>
            <div
              ref={pageContainerRef}
              data-document-page=""
              onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
              className="relative bg-white outline outline-1 outline-gray-300 shadow-md select-none overflow-hidden shrink-0"
              style={{ width: pageWidth, aspectRatio: '210 / 297' }}
            >
              {pdfLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 gap-2">
                  <Loader2 size={28} className="text-green-600 animate-spin" />
                  <p className="text-xs text-gray-500 font-medium">กำลังโหลดแบบฟอร์มเอกสาร...</p>
                </div>
              )}
              {(pdfError || fontError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-sm text-red-500 p-6 text-center">
                  {pdfError || 'ไม่สามารถแสดงข้อความได้ กรุณาเปิดเอกสารอีกครั้ง'}
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

              {showGuides && imageUrl && (
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none z-20"
                  style={{ backgroundImage: 'linear-gradient(to right, rgba(59,130,246,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,.18) 1px, transparent 1px)', backgroundSize: `${5 / 210 * 100}% ${5 / 297 * 100}%` }} />
              )}
              {showGuides && selectedPosition && (
                <>
                  <div className="absolute top-0 bottom-0 border-l border-amber-500 pointer-events-none z-20" style={{ left: `${selectedPosition.x}%` }} />
                  <div className="absolute left-0 right-0 border-t border-amber-500 pointer-events-none z-20" style={{ top: `${selectedPosition.y}%` }} />
                </>
              )}

              {/* Draggable signatures and text overlays */}
              {!pdfLoading && imageUrl && steps.map((step, idx) => {
                const stepPage = step.page || 1;
                if (stepPage !== pageNum) return null;
                const colorIdx = idx % borderColors.length;
                const sigSize = step.signatureSize || 12;
                const outlineHex = step.level === 1 ? 'outline-blue-500' : step.level === 2 ? 'outline-emerald-500' : 'outline-purple-500';
                const bgHex = step.level === 1 ? 'bg-blue-600' : step.level === 2 ? 'bg-emerald-600' : 'bg-purple-600';
                return (
                  <React.Fragment key={step.level}>
                    {/* Primary Signature */}
                    {step.signatureData && step.signatureX !== undefined && step.signatureY !== undefined && (
                      <div className="absolute" style={{ left: `${step.signatureX}%`, top: `${step.signatureY}%`, width: `${sigSize}%` }}>
                        <img
                          src={step.signatureData}
                          alt={`ลายเซ็นระดับ ${step.level}`}
                          data-placement-key={itemKey({ level: step.level, type: 'signature' })}
                          data-placement-selected={selectedKey === itemKey({ level: step.level, type: 'signature' })}
                          onPointerDown={e => onPointerDown(e, step.level, 'signature')}
                          className={`w-full h-auto cursor-grab active:cursor-grabbing select-none mix-blend-multiply outline outline-2 outline-dashed ${outlineHex}`}
                          draggable={false}
                          style={{ touchAction: 'none', outlineColor: selectedKey === itemKey({ level: step.level, type: 'signature' }) ? '#f59e0b' : undefined }}
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
                          data-placement-key={itemKey({ level: step.level, type: 'extraSignature', extraIndex: exIdx })}
                          data-placement-selected={selectedKey === itemKey({ level: step.level, type: 'extraSignature', extraIndex: exIdx })}
                          onPointerDown={e => onPointerDown(e, step.level, 'extraSignature', exIdx)}
                          className={`w-full h-auto cursor-grab active:cursor-grabbing select-none mix-blend-multiply outline outline-2 outline-dashed ${outlineHex} opacity-90`}
                          draggable={false}
                          style={{ touchAction: 'none', outlineColor: selectedKey === itemKey({ level: step.level, type: 'extraSignature', extraIndex: exIdx }) ? '#f59e0b' : undefined }}
                        />
                        <div className={`absolute -top-3.5 left-0 text-[8px] font-semibold text-white px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap ${bgHex} pointer-events-none`}>
                          ระดับ {step.level} (จุด {exIdx + 2})
                        </div>
                      </div>
                    ))}

                    {step.checkmarkBlock && step.checkmarkX !== undefined && step.checkmarkY !== undefined && (
                      <DocumentCheckmarkOverlay
                        x={step.checkmarkX} y={step.checkmarkY} size={step.checkmarkSize || 15}
                        data-placement-key={itemKey({ level: step.level, type: 'checkmark' })}
                        data-placement-selected={selectedKey === itemKey({ level: step.level, type: 'checkmark' })}
                        onPointerDown={e => onPointerDown(e, step.level, 'checkmark')}
                        style={{ outlineColor: selectedKey === itemKey({ level: step.level, type: 'checkmark' }) ? '#f59e0b' : undefined }}
                        className="cursor-grab active:cursor-grabbing outline outline-1 outline-dashed outline-gray-500 rounded"
                      />
                    )}

                    {/* Date Block */}
                    {step.dateBlock && step.dateX !== undefined && step.dateY !== undefined && (
                      <DocumentTextOverlay
                        text={step.dateBlock} x={step.dateX} y={step.dateY} size={step.dateSize || 10}
                        data-placement-key={itemKey({ level: step.level, type: 'date' })}
                        data-placement-selected={selectedKey === itemKey({ level: step.level, type: 'date' })}
                        onPointerDown={e => onPointerDown(e, step.level, 'date')}
                        style={{ outlineColor: selectedKey === itemKey({ level: step.level, type: 'date' }) ? '#f59e0b' : undefined }}
                        className="cursor-grab active:cursor-grabbing outline outline-1 outline-dashed outline-gray-400 rounded"
                      />
                    )}

                    {/* Text Block */}
                    {step.textBlock && step.textBlockX !== undefined && step.textBlockY !== undefined && (
                      <DocumentTextOverlay
                        text={step.textBlock} x={step.textBlockX} y={step.textBlockY} size={step.textBlockSize || 10}
                        data-placement-key={itemKey({ level: step.level, type: 'text' })}
                        data-placement-selected={selectedKey === itemKey({ level: step.level, type: 'text' })}
                        onPointerDown={e => onPointerDown(e, step.level, 'text')}
                        style={{ outlineColor: selectedKey === itemKey({ level: step.level, type: 'text' }) ? '#f59e0b' : undefined }}
                        className="cursor-grab active:cursor-grabbing outline outline-1 outline-dashed outline-gray-400 rounded"
                      />
                    )}

                    {/* Extra Text Blocks */}
                    {step.extraTextBlocks?.map((tb, tbIdx) => (
                      <DocumentTextOverlay
                        key={`extra-text-${step.level}-${tbIdx}`}
                        text={tb.val} x={tb.x} y={tb.y} size={tb.size || 10}
                        data-placement-key={itemKey({ level: step.level, type: 'extraText', extraIndex: tbIdx })}
                        data-placement-selected={selectedKey === itemKey({ level: step.level, type: 'extraText', extraIndex: tbIdx })}
                        onPointerDown={e => onPointerDown(e, step.level, 'extraText', tbIdx)}
                        style={{ outlineColor: selectedKey === itemKey({ level: step.level, type: 'extraText', extraIndex: tbIdx }) ? '#f59e0b' : undefined }}
                        className="cursor-grab active:cursor-grabbing outline outline-1 outline-dashed outline-blue-400 rounded"
                      >
                        <div className={`absolute -top-3 left-0 text-[7px] font-semibold text-white px-1 py-0.5 rounded shadow-xs whitespace-nowrap ${bgHex} pointer-events-none`}>
                          เสริม {tbIdx + 1}
                        </div>
                      </DocumentTextOverlay>
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 rounded-b-2xl">
          <p role={invalidPage ? 'alert' : undefined} className={`text-xs ${invalidPage ? 'text-red-600' : 'text-gray-500'}`}>
            {invalidPage ? 'กรุณาเลือกหน้าเอกสารที่มีอยู่จริงให้ครบก่อนบันทึก' : 'ปรับเฉพาะคำร้องนี้'}
          </p>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-xs font-semibold text-gray-600 transition-colors disabled:opacity-50">
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={blocked || invalidPage}
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
