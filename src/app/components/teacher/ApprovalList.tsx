import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { PdfViewerModal } from '../shared/PdfViewerModal';
import { SignatureAndPlaceModal } from '../shared/SignatureAndPlaceModal';
import { generateApprovalPDF, previewSignedAttachmentPDF } from '../../lib/generateApprovalPDF';
import {
  Submission, getSubmissionsForTeacher, mockTeachers, formTemplates,
  formatDateTime,
} from '../../data/mockData';
import {
  CheckCircle, XCircle, FileText, ChevronDown, ChevronUp,
  User, Calendar, Clock, CheckSquare, History, Paperclip, AlertCircle,
  PenLine, ExternalLink, Download, X,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Approval Modal ────────────────────────────────────────────
interface ApprovalModalProps {
  submission: Submission;
  initialSignature?: string;
  onApprove: (
    comment: string,
    signatureData?: string,
    posX?: number,
    posY?: number,
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
    extraSignaturePositions?: Array<{ x: number; y: number }>
  ) => void;
  onReject: (comment: string) => void;
  onClose: () => void;
}

function ApprovalModal({ submission, initialSignature, onApprove, onReject, onClose }: ApprovalModalProps) {
  const [comment, setComment] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [showSignAndPlace, setShowSignAndPlace] = useState(false);

  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!action) return;
    if (action === 'reject' && !comment.trim()) {
      toast.error('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      return;
    }
    if (action === 'approve') {
      try {
        const url = await generateApprovalPDF(submission, true);
        if (typeof url === 'string') {
          setGeneratedPdfUrl(url);
        }
      } catch (e) {
        console.error('Failed to generate preview PDF', e);
      }
      setShowSignAndPlace(true);
    } else {
      onReject(comment);
      onClose();
    }
  };

  if (showSignAndPlace) {
    return (
      <SignatureAndPlaceModal
        initialSignature={initialSignature}
        attachments={submission.attachments || []}
        extraPdfUrl={generatedPdfUrl || undefined}
        extraPdfLabel="แบบฟอร์มคำร้อง (KU-Paper)"
        existingSteps={submission.approvalSteps}
        onConfirm={(sigData, posX, posY, textBlock, textX, textY, textSize, dateBlock, dateX, dateY, checkmarkBlock, checkmarkX, checkmarkY, dateSize, extraTextBlocks, extraSigPos) => {
          onApprove(comment || 'อนุมัติ', sigData, posX, posY, textBlock, textX, textY, textSize, dateBlock, dateX, dateY, checkmarkBlock, checkmarkX, checkmarkY, dateSize, extraTextBlocks, extraSigPos);
          onClose();
        }}
        onCancel={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-green-800 text-base">พิจารณาคำร้อง</h3>
          <p className="text-gray-500 text-xs mt-0.5">{submission.formName}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100 text-sm grid grid-cols-2 gap-2">
            <div><p className="text-xs text-gray-500">นิสิต</p><p className="text-xs text-gray-800">{submission.studentName}</p></div>
            <div><p className="text-xs text-gray-500">ภาควิชา</p><p className="text-xs text-gray-800">{submission.department}</p></div>
            <div><p className="text-xs text-gray-500">วันที่ยื่น</p><p className="text-xs text-gray-800">{formatDateTime(submission.submittedAt)}</p></div>
            <div><p className="text-xs text-gray-500">ขั้นตอน</p><p className="text-xs text-gray-800">ระดับ {submission.currentApprovalLevel}/{submission.approvalSteps.length}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setAction('approve')} className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${action === 'approve' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-200'}`}>
              <CheckCircle size={20} className={action === 'approve' ? 'text-green-600' : 'text-gray-400'} />
              <span className={`text-sm ${action === 'approve' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>อนุมัติ</span>
            </button>
            <button onClick={() => setAction('reject')} className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${action === 'reject' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-red-200'}`}>
              <XCircle size={20} className={action === 'reject' ? 'text-red-600' : 'text-gray-400'} />
              <span className={`text-sm ${action === 'reject' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>ไม่อนุมัติ</span>
            </button>
          </div>
          {action === 'reject' && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 flex gap-2 text-xs text-yellow-800">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              คำร้องจะถูกส่งกลับ Admin เพื่อตรวจสอบเหตุผล ไม่ใช่ส่งตรงถึงนิสิต
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5">
              ความคิดเห็น / เหตุผล
              {action === 'reject' && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={action === 'reject' ? 'ระบุเหตุผลที่ไม่อนุมัติ (บังคับ)' : 'ความคิดเห็นเพิ่มเติม (ไม่บังคับ)'}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-all">ยกเลิก</button>
          <button
            onClick={handleConfirm}
            disabled={!action}
            className={`px-5 py-2 text-sm text-white rounded-lg disabled:opacity-40 transition-all ${action === 'approve' ? 'bg-green-600 hover:bg-green-700' : action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400'}`}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pending Card ──────────────────────────────────────────────
function PendingCard({ sub, teacherId, teacherName, initialSignature }: { sub: Submission; teacherId: string; teacherName: string; initialSignature?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [signedPreviewOpen, setSignedPreviewOpen] = useState(false);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  const [signedPreviewLoading, setSignedPreviewLoading] = useState(false);
  const { approveStep, rejectStep } = useSubmissions();
  const template = formTemplates.find(f => f.id === sub.formType);
  const hasAttachments = sub.attachments && sub.attachments.length > 0;

  useEffect(() => {
    return () => { if (signedPreviewUrl) URL.revokeObjectURL(signedPreviewUrl); };
  }, [signedPreviewUrl]);

  // Check if returned by admin
  const currentStep = sub.approvalSteps.find(s => s.level === sub.currentApprovalLevel);
  const wasReturned = !!currentStep?.returnedByAdminAt;

  const handleOpenSignedPreview = async () => {
    if (!sub.attachments?.length) return;
    const attach = sub.attachments[0];
    setSignedPreviewLoading(true);
    setSignedPreviewOpen(true);
    try {
      const url = await previewSignedAttachmentPDF(sub, attach.url, attach.name);
      setSignedPreviewUrl(url);
    } catch (e) {
      console.error(e);
      toast.error('ไม่สามารถสร้างตัวอย่างเอกสารพร้อมลายเซ็นได้');
      setSignedPreviewOpen(false);
    } finally {
      setSignedPreviewLoading(false);
    }
  };

  const handleApprove = (
    comment: string,
    signatureData?: string,
    posX?: number,
    posY?: number,
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
    extraSignaturePositions?: Array<{ x: number; y: number }>
  ) => {
    approveStep(
      sub.id,
      sub.currentApprovalLevel,
      teacherId,
      teacherName,
      comment,
      signatureData,
      posX,
      posY,
      textBlock,
      textBlockX,
      textBlockY,
      textBlockSize,
      dateBlock,
      dateX,
      dateY,
      checkmarkBlock,
      checkmarkX,
      checkmarkY,
      dateSize,
      extraTextBlocks,
      extraSignaturePositions
    );
    toast.success('อนุมัติคำร้องเรียบร้อยแล้ว');
  };
  const handleReject = (comment: string) => {
    rejectStep(sub.id, sub.currentApprovalLevel, teacherId, teacherName, comment);
    toast.warning('ส่งเรื่องกลับ Admin เพื่อตรวจสอบแล้ว');
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
        {wasReturned && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-700">
            <AlertCircle size={12} />
            Admin ส่งกลับมาพิจารณาใหม่{currentStep?.returnReason ? ` — "${currentStep.returnReason}"` : ''}
            {currentStep?.isSubstitute && <span className="ml-1 bg-amber-100 px-1.5 py-0.5 rounded">ผู้อนุมัติแทน</span>}
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg ${template?.iconBg || 'bg-gray-100'} flex items-center justify-center shrink-0`}>
              <FileText size={18} className={template?.colorClass || 'text-gray-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{sub.formName}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-500 flex items-center gap-1"><User size={11} /> {sub.studentName}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={11} /> {formatDateTime(sub.submittedAt)}</span>
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock size={10} /> ระดับที่ {sub.currentApprovalLevel}
                </span>
                {hasAttachments && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Paperclip size={10} /> {sub.attachments!.length} ไฟล์
                  </span>
                )}
                {sub.deadline && (
                  <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock size={10} /> ครบ {new Date(sub.deadline).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'ซ่อน' : 'ดูข้อมูล'}
          </button>
          {hasAttachments && (
            <button onClick={() => setPdfViewerOpen(true)} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all">
              <Paperclip size={13} /> ดูเอกสารแนบ ({sub.attachments!.length})
            </button>
          )}
          {hasAttachments && (
            <button
              onClick={handleOpenSignedPreview}
              className="flex items-center gap-1.5 text-xs text-violet-700 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-all"
              title="แสดงเอกสารพร้อมลายเซ็นอาจารย์ทุกท่านที่เซ็นแล้ว"
            >
              <PenLine size={13} /> ดูเอกสารที่ลงลายเซ็นแล้ว
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs transition-all">
            <CheckSquare size={14} /> พิจารณา
          </button>
        </div>
        {expanded && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {Object.entries(sub.formData).map(([key, val]) => {
              const field = template?.fields.find(f => f.id === key);
              return (
                <div key={key} className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-gray-400 mb-0.5">{field?.label || key}</p>
                  <p className="text-gray-700">{val}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {modalOpen && <ApprovalModal submission={sub} initialSignature={initialSignature} onApprove={handleApprove} onReject={handleReject} onClose={() => setModalOpen(false)} />}
      {pdfViewerOpen && hasAttachments && (
        <PdfViewerModal attachments={sub.attachments!} submissionName={sub.formName} studentName={sub.studentName} onClose={() => setPdfViewerOpen(false)} />
      )}

      {/* Signed Document Preview Modal */}
      {signedPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-5xl h-[92vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white shrink-0">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <PenLine size={17} className="text-violet-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{sub.formName}</p>
                <p className="text-xs text-gray-500">เอกสารที่ลงลายเซ็นแล้ว — {sub.studentName}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {signedPreviewUrl && (
                  <>
                    <a href={signedPreviewUrl} target="_blank" rel="noopener noreferrer" title="เปิดในแท็บใหม่" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                      <ExternalLink size={16} />
                    </a>
                    <a href={signedPreviewUrl} download={`Signed_${sub.attachments?.[0]?.name || 'document.pdf'}`} title="ดาวน์โหลด" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                      <Download size={16} />
                    </a>
                  </>
                )}
                <button onClick={() => { setSignedPreviewOpen(false); setSignedPreviewUrl(null); }} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 relative bg-gray-200">
              {signedPreviewLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10 gap-3">
                  <div className="w-10 h-10 border-violet-200 border-t-violet-600 rounded-full animate-spin" style={{ borderWidth: 3, borderStyle: 'solid' }} />
                  <p className="text-sm text-gray-500">กำลังประมวลผลลายเซ็น...</p>
                  <p className="text-xs text-gray-400">อาจใช้เวลาสักครู่</p>
                </div>
              )}
              {signedPreviewUrl && !signedPreviewLoading && (
                <iframe
                  src={`${signedPreviewUrl}#toolbar=1`}
                  className="w-full h-full border-0"
                  title="เอกสารที่ลงลายเซ็นแล้ว"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── History Row ───────────────────────────────────────────────
function HistoryRow({ sub, teacherId }: { sub: Submission; teacherId: string }) {
  const [signedPreviewOpen, setSignedPreviewOpen] = useState(false);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  const [signedPreviewLoading, setSignedPreviewLoading] = useState(false);
  const hasAttachments = sub.attachments && sub.attachments.length > 0;

  useEffect(() => {
    return () => { if (signedPreviewUrl) URL.revokeObjectURL(signedPreviewUrl); };
  }, [signedPreviewUrl]);

  const handleOpenSignedPreview = async () => {
    if (!sub.attachments?.length) return;
    const attach = sub.attachments[0];
    setSignedPreviewLoading(true);
    setSignedPreviewOpen(true);
    try {
      const url = await previewSignedAttachmentPDF(sub, attach.url, attach.name);
      setSignedPreviewUrl(url);
    } catch (e) {
      console.error(e);
      toast.error('ไม่สามารถสร้างตัวอย่างเอกสารพร้อมลายเซ็นได้');
      setSignedPreviewOpen(false);
    } finally {
      setSignedPreviewLoading(false);
    }
  };

  const myStep = sub.approvalSteps.find(s => s.approverId === teacherId);

  return (
    <>
      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${myStep?.status === 'approved' ? 'bg-green-50' : 'bg-red-50'}`}>
            {myStep?.status === 'approved' ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{sub.formName}</p>
            <p className="text-xs text-gray-500">{sub.studentName} • {myStep?.timestamp ? formatDateTime(myStep.timestamp) : '-'}</p>
            {myStep?.comment && <p className="text-xs text-gray-400 mt-1 italic">"{myStep.comment}"</p>}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 mt-2 sm:mt-0 shrink-0">
          {hasAttachments && (
            <button
              onClick={handleOpenSignedPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-violet-700 bg-violet-50 hover:bg-violet-100 transition-all font-medium"
              title="แสดงเอกสารพร้อมลายเซ็นอาจารย์ทุกท่านที่เซ็นแล้ว"
            >
              <PenLine size={13} /> ดูเอกสารที่ลงลายเซ็นแล้ว
            </button>
          )}
          <StatusBadge status={sub.status} />
        </div>
      </div>

      {/* Signed Document Preview Modal */}
      {signedPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-5xl h-[92vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white shrink-0">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <PenLine size={17} className="text-violet-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{sub.formName}</p>
                <p className="text-xs text-gray-500">เอกสารที่ลงลายเซ็นแล้ว — {sub.studentName}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {signedPreviewUrl && (
                  <>
                    <a href={signedPreviewUrl} target="_blank" rel="noopener noreferrer" title="เปิดในแท็บใหม่" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                      <ExternalLink size={16} />
                    </a>
                    <a href={signedPreviewUrl} download={`Signed_${sub.attachments?.[0]?.name || 'document.pdf'}`} title="ดาวน์โหลด" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                      <Download size={16} />
                    </a>
                  </>
                )}
                <button onClick={() => { setSignedPreviewOpen(false); setSignedPreviewUrl(null); }} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 relative bg-gray-200">
              {signedPreviewLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10 gap-3">
                  <div className="w-10 h-10 border-violet-200 border-t-violet-600 rounded-full animate-spin" style={{ borderWidth: 3, borderStyle: 'solid' }} />
                  <p className="text-sm text-gray-500">กำลังประมวลผลลายเซ็น...</p>
                  <p className="text-xs text-gray-400">อาจใช้เวลาสักครู่</p>
                </div>
              )}
              {signedPreviewUrl && !signedPreviewLoading && (
                <iframe
                  src={`${signedPreviewUrl}#toolbar=1`}
                  className="w-full h-full border-0"
                  title="เอกสารที่ลงลายเซ็นแล้ว"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────
export function ApprovalList() {
  const { currentUser } = useAuth();
  const { submissions, approveStep } = useSubmissions();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchComment, setBatchComment] = useState('');
  const [showBatchPanel, setShowBatchPanel] = useState(false);

  const teacher = currentUser as any;
  const teacherName = teacher?.name || '';
  const teacherId = currentUser?.id || '';

  const pendingForMe = getSubmissionsForTeacher(teacherId, submissions);
  const historyItems = submissions.filter(s =>
    s.approvalSteps.some(step => step.approverId === teacherId && (step.status === 'approved' || step.status === 'rejected'))
  );

  const handleBatchApprove = () => {
    if (batchSelected.length === 0) return;
    batchSelected.forEach(id => {
      const sub = pendingForMe.find(s => s.id === id);
      if (sub) approveStep(id, sub.currentApprovalLevel, teacherId, teacherName, batchComment || 'อนุมัติ (กลุ่ม)');
    });
    toast.success(`อนุมัติ ${batchSelected.length} รายการเรียบร้อยแล้ว`);
    setBatchSelected([]); setShowBatchPanel(false); setBatchComment('');
  };

  const toggleSelect = (id: string) => setBatchSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const selectAll = () => setBatchSelected(batchSelected.length === pendingForMe.length ? [] : pendingForMe.map(s => s.id));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-green-800 text-xl mb-1">คำร้องที่รอการพิจารณา</h2>
        <p className="text-gray-500 text-sm">พิจารณาและอนุมัติคำร้องของนิสิต</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab('pending')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${tab === 'pending' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'}`}>
          <Clock size={15} /> รอพิจารณา
          {pendingForMe.length > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'pending' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>{pendingForMe.length}</span>}
        </button>
        <button onClick={() => setTab('history')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${tab === 'history' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'}`}>
          <History size={15} /> ประวัติ
        </button>
      </div>

      {tab === 'pending' && (
        <>
          {pendingForMe.length > 1 && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={selectAll} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-green-300 transition-all">
                <CheckSquare size={13} /> {batchSelected.length === pendingForMe.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              {batchSelected.length > 0 && (
                <button onClick={() => setShowBatchPanel(!showBatchPanel)} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs">
                  <CheckCircle size={13} /> อนุมัติ {batchSelected.length} รายการพร้อมกัน
                </button>
              )}
            </div>
          )}
          {showBatchPanel && batchSelected.length > 0 && (
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <p className="text-sm text-green-800 font-medium mb-3">อนุมัติแบบกลุ่ม ({batchSelected.length} รายการ)</p>
              <textarea rows={2} value={batchComment} onChange={e => setBatchComment(e.target.value)} placeholder="ความคิดเห็น (ไม่บังคับ)" className="w-full px-3 py-2 border border-green-200 rounded-lg text-sm focus:outline-none focus:border-green-400 resize-none mb-3" />
              <div className="flex gap-2">
                <button onClick={handleBatchApprove} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"><CheckCircle size={14} /> ยืนยันอนุมัติทั้งหมด</button>
                <button onClick={() => { setShowBatchPanel(false); setBatchSelected([]); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
              </div>
            </div>
          )}
          {pendingForMe.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-green-100">
              <CheckCircle size={40} className="mx-auto text-green-300 mb-3" />
              <p className="text-gray-500 text-sm">ไม่มีคำร้องที่รอการพิจารณา</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingForMe.map(sub => (
                <div key={sub.id} className="relative">
                  {batchSelected.length > 0 && (
                    <div onClick={() => toggleSelect(sub.id)} className={`absolute top-3 left-3 z-10 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${batchSelected.includes(sub.id) ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'}`}>
                      {batchSelected.includes(sub.id) && <CheckCircle size={12} className="text-white" />}
                    </div>
                  )}
                  <div className={batchSelected.length > 0 ? 'ml-8' : ''}>
                    <PendingCard sub={sub} teacherId={teacherId} teacherName={teacherName} initialSignature={teacher?.signatureData} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {historyItems.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-green-100">
              <History size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">ยังไม่มีประวัติการอนุมัติ</p>
            </div>
          ) : (
            historyItems.map(sub => (
              <HistoryRow key={sub.id} sub={sub} teacherId={teacherId} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
