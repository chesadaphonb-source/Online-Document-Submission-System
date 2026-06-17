import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { PdfViewerModal } from '../shared/PdfViewerModal';
import { SignatureAndPlaceModal } from '../shared/SignatureAndPlaceModal';
import { previewSignedAttachmentPDF } from '../../lib/generateApprovalPDF';
import { formatMoney } from '../../lib/exportUtils';
import {
  Submission, getSubmissionsForTeacher, mockTeachers, formTemplates,
  formatDateTime,
} from '../../data/mockData';
import {
  CheckCircle, XCircle, FileText, ChevronDown, ChevronUp,
  User, Calendar, Clock, CheckSquare, History, Paperclip, AlertCircle,
  PenLine, ExternalLink, Download, X, Eye, MessageSquare,
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
    extraSignaturePositions?: Array<{ x: number; y: number }>,
    signatureSize?: number,
    page?: number
  ) => void;
  onReject: (comment: string) => void;
  onClose: () => void;
}

function ApprovalModal({ submission, initialSignature, onApprove, onReject, onClose }: ApprovalModalProps) {
  const [comment, setComment] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [skipSignature, setSkipSignature] = useState(false);
  const [showSignAndPlace, setShowSignAndPlace] = useState(false);

  const handleConfirm = async () => {
    if (!action) return;
    if (action === 'reject' && !comment.trim()) {
      toast.error('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      return;
    }
    if (action === 'approve') {
      if (skipSignature) {
        onApprove(comment || 'อนุมัติ (ผ่านระบบโดยไม่ลงลายเซ็นดิจิทัลเนื่องจากลงนามบนเอกสารจริงแล้ว)');
        onClose();
      } else {
        setShowSignAndPlace(true);
      }
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
        existingSteps={submission.approvalSteps}
        currentLevel={submission.currentApprovalLevel}
        onConfirm={(sigData, posX, posY, textBlock, textX, textY, textSize, dateBlock, dateX, dateY, checkmarkBlock, checkmarkX, checkmarkY, dateSize, extraTextBlocks, extraSigPos, sigSize, page) => {
          onApprove(comment || 'อนุมัติ', sigData, posX, posY, textBlock, textX, textY, textSize, dateBlock, dateX, dateY, checkmarkBlock, checkmarkX, checkmarkY, dateSize, extraTextBlocks, extraSigPos, sigSize, page);
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
          
          {action === 'approve' && (
            <label className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipSignature}
                onChange={e => setSkipSignature(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer mt-0.5 shrink-0"
              />
              <div className="flex-1">
                <span className="font-semibold block text-blue-900">ข้ามการลงลายเซ็นดิจิทัล</span>
                <span className="text-[10px] text-blue-700 block mt-0.5">ใช้กรณีที่นิสิตส่งเอกสารที่เซ็นด้วยปากกาจริงเรียบร้อยแล้ว</span>
              </div>
            </label>
          )}

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
    extraSignaturePositions?: Array<{ x: number; y: number }>,
    signatureSize?: number,
    page?: number
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
      extraSignaturePositions,
      signatureSize,
      page
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
                  <p className="text-gray-700">{formatMoney(val, field?.label || key)}</p>
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

// ── Tracking Timeline ─────────────────────────────────────────
function TrackingTimeline({ submission }: { submission: Submission }) {
  const isTerminated = submission.status === 'rejected';
  const isComplete = submission.status === 'approved';
  const isPendingClose = submission.status === 'pending_close';
  const isAdminPhase = ['submitted', 'admin_reviewing'].includes(submission.status);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">เส้นทางการดำเนินการ</p>
      <div className="relative pl-1">
        {/* Step 0: Admin รับเรื่อง */}
        <div className="relative flex gap-3 pb-3">
          <div className="absolute left-3 top-7 bottom-0 w-0.5 bg-gray-200" />
          <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center z-10 ${
            submission.receivedByAdminAt ? 'bg-blue-500' :
            isAdminPhase ? 'bg-blue-400 animate-pulse' : 'bg-gray-200'
          }`}>
            {submission.receivedByAdminAt
              ? <CheckCircle size={12} className="text-white" />
              : isAdminPhase
                ? <Clock size={12} className="text-white" />
                : <span className="text-[10px] text-gray-400 font-medium">1</span>
            }
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <p className="text-xs font-medium text-gray-800">เจ้าหน้าที่รับเรื่อง</p>
              {submission.receivedByAdminAt
                ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">รับแล้ว</span>
                : isAdminPhase
                  ? <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full animate-pulse">รอรับเรื่อง</span>
                  : <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">ดำเนินการแล้ว</span>
              }
            </div>
            {submission.receivedByAdminAt && (
              <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(submission.receivedByAdminAt)}</p>
            )}
          </div>
        </div>

        {/* Steps: Teacher approvals */}
        {submission.approvalSteps.map((step, i) => {
          const isActive = step.level === submission.currentApprovalLevel && submission.status === 'in-review';
          const isTeacherRejected = step.status === 'rejected' && submission.status === 'teacher_rejected';

          return (
            <div key={i} className="relative flex gap-3 pb-3">
              {i < submission.approvalSteps.length - 1 && (
                <div className={`absolute left-3 top-7 bottom-0 w-0.5 ${step.status === 'approved' ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
              <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center z-10 ${
                step.status === 'approved' ? 'bg-green-500' :
                isTeacherRejected ? 'bg-orange-400' :
                step.status === 'rejected' ? 'bg-red-500' :
                isActive ? 'bg-yellow-400 animate-pulse' :
                'bg-gray-200'
              }`}>
                {step.status === 'approved' ? <CheckCircle size={12} className="text-white" /> :
                 isTeacherRejected ? <AlertCircle size={12} className="text-white" /> :
                 step.status === 'rejected' ? <XCircle size={12} className="text-white" /> :
                 isActive ? <Clock size={12} className="text-white" /> :
                 <span className="text-[10px] text-gray-400 font-medium">{step.level + 1}</span>}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-xs font-medium text-gray-800">{step.roleName}</p>
                  {step.status === 'approved' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">อนุมัติ</span>}
                  {isTeacherRejected && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">รอ Admin ตรวจสอบ</span>}
                  {step.status === 'rejected' && !isTeacherRejected && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">ไม่อนุมัติ</span>}
                  {step.status === 'pending' && isActive && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full animate-pulse">กำลังพิจารณา</span>}
                  {step.status === 'pending' && !isActive && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">รอดำเนินการ</span>}
                </div>
                {step.approverName && <p className="text-[10px] text-gray-500 mt-0.5">{step.approverName}{step.isSubstitute ? ' (ตัวแทน)' : ''}</p>}
                {step.timestamp && <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(step.timestamp)}</p>}
                {step.comment && (
                  <div className="mt-1 p-1.5 bg-gray-50 rounded border border-gray-100">
                    <p className="text-[10px] text-gray-500 flex items-start gap-1">
                      <MessageSquare size={9} className="shrink-0 mt-0.5" /> {step.comment}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Final: Admin ปิดงาน */}
        <div className="relative flex gap-3">
          <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center z-10 ${
            isComplete ? 'bg-green-600' :
            isPendingClose ? 'bg-teal-400 animate-pulse' :
            isTerminated ? 'bg-red-200' : 'bg-gray-200'
          }`}>
            {isComplete ? <CheckCircle size={12} className="text-white" /> :
             isPendingClose ? <Clock size={12} className="text-white" /> :
             isTerminated ? <XCircle size={12} className="text-red-400" /> :
             <span className="text-[10px] text-gray-400 font-medium">✓</span>}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <p className="text-xs font-medium text-gray-800">
                {isTerminated ? 'ไม่อนุมัติ' : 'เจ้าหน้าที่ปิดงาน'}
              </p>
              {isComplete && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">เสร็จสมบูรณ์ ✅</span>}
              {isPendingClose && <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full animate-pulse">รอปิดงาน</span>}
              {isTerminated && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">ปฏิเสธ</span>}
            </div>
            {isComplete && submission.referenceNumber && (
              <p className="text-[10px] text-green-700 font-mono mt-0.5">เลขที่: {submission.referenceNumber}</p>
            )}
            {isComplete && submission.closedAt && (
              <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(submission.closedAt)}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tracking Row ──────────────────────────────────────────────
function TrackingRow({ sub, teacherId }: { sub: Submission; teacherId: string }) {
  const [expanded, setExpanded] = useState(false);
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

  const myStep = sub.approvalSteps.find(s => s.approverId === teacherId && s.status === 'approved');
  
  // Calculate progress percentage
  const approvedSteps = sub.approvalSteps.filter(s => s.status === 'approved').length;
  const totalSteps = sub.approvalSteps.length;
  const progressPct = sub.status === 'approved' ? 100
    : sub.status === 'rejected' ? 0
    : Math.round((approvedSteps / totalSteps) * 100);

  return (
    <>
      <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <FileText size={18} className="text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{sub.formName}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <User size={11} /> {sub.studentName}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">
                    {sub.department}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar size={11} /> เซ็นเมื่อ: {myStep?.timestamp ? formatDateTime(myStep.timestamp) : '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 mt-2 sm:mt-0 shrink-0">
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

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-gray-400 font-medium">ความคืบหน้าของคำร้อง</p>
              <p className="text-[11px] text-gray-500 font-medium">{progressPct}% ({approvedSteps}/{totalSteps} ขั้นตอน)</p>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  sub.status === 'rejected' ? 'bg-red-400' : 'bg-green-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Expander Trigger */}
          <div className="mt-3 flex justify-start">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-800 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'ซ่อนเส้นทางการดำเนินการ' : 'ดูเส้นทางการดำเนินการ'}
            </button>
          </div>

          {expanded && <TrackingTimeline submission={sub} />}
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
  const [tab, setTab] = useState<'pending' | 'history' | 'tracking'>('pending');
  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchComment, setBatchComment] = useState('');
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | 'level1' | 'level2' | 'level3'>('all');

  const teacher = currentUser as any;
  const teacherName = teacher?.name || '';
  const teacherId = currentUser?.id || '';

  const isDeptHead = !!teacher?.isDepartmentHead;
  const isDean = !!teacher?.isDean;
  const showLevelTabs = isDeptHead || isDean;

  const pendingForMe = getSubmissionsForTeacher(teacherId, submissions);
  const historyItems = submissions.filter(s =>
    s.approvalSteps.some(step => step.approverId === teacherId && (step.status === 'approved' || step.status === 'rejected'))
  );
  const trackingItems = submissions.filter(s =>
    s.approvalSteps.some(step => step.approverId === teacherId && step.status === 'approved')
  );

  const pendingLevel1 = pendingForMe.filter(s => s.currentApprovalLevel === 1);
  const pendingLevel2 = pendingForMe.filter(s => s.currentApprovalLevel === 2);
  const pendingLevel3 = pendingForMe.filter(s => s.currentApprovalLevel >= 3);

  const displayedPending = !showLevelTabs ? pendingForMe :
                           levelFilter === 'level1' ? pendingLevel1 :
                           levelFilter === 'level2' ? pendingLevel2 :
                           levelFilter === 'level3' ? pendingLevel3 :
                           pendingForMe;

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
  const selectAll = () => setBatchSelected(batchSelected.length === displayedPending.length ? [] : displayedPending.map(s => s.id));

  // Reset sub-filter when switching main tabs
  useEffect(() => {
    setLevelFilter('all');
    setBatchSelected([]);
    setShowBatchPanel(false);
  }, [tab]);

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
        <button onClick={() => setTab('tracking')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${tab === 'tracking' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'}`}>
          <Eye size={15} /> ติดตามสถานะ
          {trackingItems.length > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'tracking' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>{trackingItems.length}</span>}
        </button>
      </div>

      {tab === 'pending' && showLevelTabs && (
        <div className="flex flex-wrap gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 w-fit animate-fade-in">
          <button
            onClick={() => setLevelFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              levelFilter === 'all'
                ? 'bg-white text-green-700 shadow-sm border border-green-100'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>ทุกระดับ</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              levelFilter === 'all' ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-200 text-gray-600'
            }`}>
              {pendingForMe.length}
            </span>
          </button>
          <button
            onClick={() => setLevelFilter('level1')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              levelFilter === 'level1'
                ? 'bg-white text-green-700 shadow-sm border border-green-100'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>ระดับ 1 (อาจารย์ที่ปรึกษา)</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              levelFilter === 'level1' ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-200 text-gray-600'
            }`}>
              {pendingLevel1.length}
            </span>
          </button>
          {isDeptHead && (
            <button
              onClick={() => setLevelFilter('level2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                levelFilter === 'level2'
                  ? 'bg-white text-green-700 shadow-sm border border-green-100'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>ระดับ 2 (หัวหน้าภาควิชา)</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                levelFilter === 'level2' ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-200 text-gray-600'
              }`}>
                {pendingLevel2.length}
              </span>
            </button>
          )}
          {isDean && (
            <button
              onClick={() => setLevelFilter('level3')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                levelFilter === 'level3'
                  ? 'bg-white text-green-700 shadow-sm border border-green-100'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>ระดับ 3 (คณบดี)</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                levelFilter === 'level3' ? 'bg-green-100 text-green-700 font-bold' : 'bg-gray-200 text-gray-600'
              }`}>
                {pendingLevel3.length}
              </span>
            </button>
          )}
        </div>
      )}

      {tab === 'pending' && (
        <>
          {displayedPending.length > 1 && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={selectAll} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-green-300 transition-all">
                <CheckSquare size={13} /> {batchSelected.length === displayedPending.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              {batchSelected.length > 0 && (
                <button onClick={() => setShowBatchPanel(!showBatchPanel)} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs">
                  <CheckCircle size={13} /> อนุมัติ {batchSelected.length} รายการพร้อมกัน
                </button>
              )}
            </div>
          )}
          {showBatchPanel && batchSelected.length > 0 && (
            <div className="p-4 bg-green-50 rounded-xl border border-green-200 animate-fade-in">
              <p className="text-sm text-green-800 font-medium mb-3">อนุมัติแบบกลุ่ม ({batchSelected.length} รายการ)</p>
              <textarea rows={2} value={batchComment} onChange={e => setBatchComment(e.target.value)} placeholder="ความคิดเห็น (ไม่บังคับ)" className="w-full px-3 py-2 border border-green-200 rounded-lg text-sm focus:outline-none focus:border-green-400 resize-none mb-3" />
              <div className="flex gap-2">
                <button onClick={handleBatchApprove} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"><CheckCircle size={14} /> ยืนยันอนุมัติทั้งหมด</button>
                <button onClick={() => { setShowBatchPanel(false); setBatchSelected([]); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">ยกเลิก</button>
              </div>
            </div>
          )}
          {displayedPending.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-green-100">
              <CheckCircle size={40} className="mx-auto text-green-300 mb-3" />
              <p className="text-gray-500 text-sm">ไม่มีคำร้องที่รอการพิจารณาในระดับนี้</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedPending.map(sub => (
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

      {tab === 'tracking' && (
        <div className="space-y-3">
          {trackingItems.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-green-100">
              <Eye size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">ยังไม่มีเอกสารที่ลงนามเพื่อติดตามสถานะ</p>
            </div>
          ) : (
            trackingItems.map(sub => (
              <TrackingRow key={sub.id} sub={sub} teacherId={teacherId} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
