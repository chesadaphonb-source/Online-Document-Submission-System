import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { Submission, formatDateTime, formTemplates } from '../../data/mockData';
import { generateSignedAttachmentPDF } from '../../lib/generateApprovalPDF';
import { formatMoney } from '../../lib/exportUtils';
import {
  FileText, Search, ChevronDown, ChevronUp, CheckCircle,
  XCircle, Clock, Eye, MessageSquare, Calendar, AlertCircle,
  RotateCcw, Paperclip, RefreshCw, Info, Download, Award,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Approval Timeline (enhanced) ──────────────────────────────
function ApprovalTimeline({ submission }: { submission: Submission }) {
  const isTerminated = submission.status === 'rejected';
  const isComplete = submission.status === 'approved';
  const isPendingClose = submission.status === 'pending_close';
  const isAdminPhase = ['submitted', 'admin_reviewing'].includes(submission.status);

  return (
    <div className="space-y-3 mt-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">เส้นทางการดำเนินการ</p>
      <div className="relative">
        {/* Step 0: Admin รับเรื่อง */}
        <div className="relative flex gap-4 pb-4">
          <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-gray-200" />
          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center z-10 ${
            submission.receivedByAdminAt ? 'bg-blue-500' :
            isAdminPhase ? 'bg-blue-400 animate-pulse' : 'bg-gray-200'
          }`}>
            {submission.receivedByAdminAt
              ? <CheckCircle size={15} className="text-white" />
              : isAdminPhase
                ? <Clock size={15} className="text-white" />
                : <span className="text-xs text-gray-400 font-medium">1</span>
            }
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <p className="text-sm font-medium text-gray-800">เจ้าหน้าที่รับเรื่อง</p>
              {submission.receivedByAdminAt
                ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">รับแล้ว</span>
                : isAdminPhase
                  ? <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full animate-pulse">รอรับเรื่อง</span>
                  : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">ดำเนินการแล้ว</span>
              }
            </div>
            {submission.receivedByAdminAt && (
              <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(submission.receivedByAdminAt)}</p>
            )}
            {submission.adminNote && !isComplete && (
              <div className="mt-1.5 p-2 bg-orange-50 rounded-lg border border-orange-100">
                <p className="text-xs text-orange-700 flex items-start gap-1">
                  <Info size={11} className="shrink-0 mt-0.5" /> {submission.adminNote}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Steps: Teacher approvals */}
        {submission.approvalSteps.map((step, i) => {
          const isActive = step.level === submission.currentApprovalLevel && submission.status === 'in-review';
          const isTeacherRejected = step.status === 'rejected' && submission.status === 'teacher_rejected';

          return (
            <div key={i} className="relative flex gap-4 pb-4">
              {i < submission.approvalSteps.length - 1 && (
                <div className={`absolute left-4 top-8 bottom-0 w-0.5 ${step.status === 'approved' ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center z-10 ${
                step.status === 'approved' ? 'bg-green-500' :
                isTeacherRejected ? 'bg-orange-400' :
                step.status === 'rejected' ? 'bg-red-500' :
                isActive ? 'bg-yellow-400 animate-pulse' :
                'bg-gray-200'
              }`}>
                {step.status === 'approved' ? <CheckCircle size={15} className="text-white" /> :
                 isTeacherRejected ? <AlertCircle size={15} className="text-white" /> :
                 step.status === 'rejected' ? <XCircle size={15} className="text-white" /> :
                 isActive ? <Clock size={15} className="text-white" /> :
                 <span className="text-xs text-gray-400 font-medium">{step.level + 1}</span>}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-sm font-medium text-gray-800">{step.roleName}</p>
                  {step.status === 'approved' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">อนุมัติ</span>}
                  {isTeacherRejected && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">รอ Admin ตรวจสอบ</span>}
                  {step.status === 'rejected' && !isTeacherRejected && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ไม่อนุมัติ</span>}
                  {step.status === 'pending' && isActive && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full animate-pulse">กำลังพิจารณา</span>}
                  {step.status === 'pending' && !isActive && <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">รอดำเนินการ</span>}
                </div>
                {step.approverName && <p className="text-xs text-gray-500 mt-0.5">{step.approverName}{step.isSubstitute ? ' (ตัวแทน)' : ''}</p>}
                {step.timestamp && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(step.timestamp)}</p>}
                {step.comment && (
                  <div className="mt-1.5 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs text-gray-500 flex items-start gap-1">
                      <MessageSquare size={10} className="shrink-0 mt-0.5" /> {step.comment}
                    </p>
                  </div>
                )}
                {step.returnReason && (
                  <div className="mt-1.5 p-2 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-700 flex items-start gap-1">
                      <RotateCcw size={10} className="shrink-0 mt-0.5" /> Admin ส่งกลับ: {step.returnReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Final: Admin ปิดงาน */}
        <div className="relative flex gap-4">
          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center z-10 ${
            isComplete ? 'bg-green-600' :
            isPendingClose ? 'bg-teal-400 animate-pulse' :
            isTerminated ? 'bg-red-200' : 'bg-gray-200'
          }`}>
            {isComplete ? <CheckCircle size={15} className="text-white" /> :
             isPendingClose ? <Clock size={15} className="text-white" /> :
             isTerminated ? <XCircle size={15} className="text-red-400" /> :
             <span className="text-xs text-gray-400 font-medium">✓</span>}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <p className="text-sm font-medium text-gray-800">
                {isTerminated ? 'ไม่อนุมัติ' : 'เจ้าหน้าที่ปิดงาน'}
              </p>
              {isComplete && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">เสร็จสมบูรณ์ ✅</span>}
              {isPendingClose && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full animate-pulse">รอปิดงาน</span>}
              {isTerminated && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ปฏิเสธ</span>}
            </div>
            {isComplete && submission.referenceNumber && (
              <p className="text-xs text-green-700 font-mono mt-0.5">เลขที่: {submission.referenceNumber}</p>
            )}
            {isComplete && submission.closedAt && (
              <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(submission.closedAt)}</p>
            )}
            {isComplete && submission.adminNote && (
              <div className="mt-1.5 p-2 bg-green-50 rounded-lg border border-green-100">
                <p className="text-xs text-green-700">{submission.adminNote}</p>
              </div>
            )}
            {isTerminated && submission.adminNote && (
              <div className="mt-1.5 p-2 bg-red-50 rounded-lg border border-red-100">
                <p className="text-xs text-red-700 flex items-start gap-1">
                  <Info size={11} className="shrink-0 mt-0.5" /> {submission.adminNote}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Submission Card ────────────────────────────────────────────
function SubmissionCard({ sub }: { sub: Submission }) {
  const [expanded, setExpanded] = useState(false);
  const { studentResubmit } = useSubmissions();
  const template = formTemplates.find(f => f.id === sub.formType);

  const canResubmit = sub.status === 'rejected';
  const isApproved = sub.status === 'approved';
  const deadlineDays = sub.deadline
    ? Math.ceil((new Date(sub.deadline).getTime() - Date.now()) / 86400000)
    : null;

  const progressPct = sub.status === 'approved' ? 100
    : sub.status === 'rejected' ? 0
    : Math.round((sub.approvalSteps.filter(s => s.status === 'approved').length / sub.approvalSteps.length) * 100);

  const handleResubmit = () => {
    studentResubmit(sub.id);
    toast.success('ยื่นคำร้องใหม่อีกครั้งแล้ว รอ Admin รับเรื่อง');
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const handleDownloadSignedDoc = async () => {
    const pdfAttach = sub.attachments?.find(a => a.type === 'pdf');
    if (!pdfAttach) {
      toast.error('ไม่พบเอกสาร PDF แนบในคำร้องนี้');
      return;
    }
    setDownloadingPdf(true);
    try {
      await generateSignedAttachmentPDF(sub, pdfAttach.url, pdfAttach.name);
    } catch (e) {
      toast.error('ไม่สามารถสร้าง PDF พร้อมลายเซ็นได้');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
      {/* Approved banner */}
      {isApproved && sub.referenceNumber && (
        <div className="px-4 py-2 bg-green-600 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award size={15} className="text-white shrink-0" />
            <span className="text-white text-xs font-medium">อนุมัติแล้ว — เลขอ้างอิง: <span className="font-mono">{sub.referenceNumber}</span></span>
          </div>
          <button
            onClick={handleDownloadSignedDoc}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs transition-all disabled:opacity-60 shrink-0"
          >
            {downloadingPdf
              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Download size={12} />}
            ดาวน์โหลดคำร้องพร้อมลายเซ็น
          </button>
        </div>
      )}
      {/* Deadline banner */}
      {deadlineDays !== null && deadlineDays <= 3 && (
        <div className={`px-4 py-1.5 flex items-center gap-2 text-xs ${
          deadlineDays < 0 ? 'bg-red-100 text-red-700' :
          deadlineDays <= 1 ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'
        }`}>
          <AlertCircle size={11} />
          {deadlineDays < 0 ? `เกินกำหนดแล้ว ${Math.abs(deadlineDays)} วัน` :
           deadlineDays === 0 ? 'ครบกำหนดวันนี้!' : `เหลือเวลาอีก ${deadlineDays} วัน`}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg ${template?.iconBg || 'bg-gray-100'} flex items-center justify-center shrink-0`}>
            <FileText size={18} className={template?.colorClass || 'text-gray-500'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{sub.formName}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">#{sub.id.slice(-8)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {sub.revisionCount && sub.revisionCount > 0 && (
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                    ยื่นซ้ำ ×{sub.revisionCount}
                  </span>
                )}
                <StatusBadge status={sub.status} />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar size={11} /> {formatDateTime(sub.submittedAt)}
              </span>
              {sub.deadline && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={11} /> ครบ {new Date(sub.deadline).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {sub.attachments && sub.attachments.length > 0 && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Paperclip size={11} /> {sub.attachments.length} ไฟล์
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">ความคืบหน้า</p>
            <p className="text-xs text-gray-500">{progressPct}%</p>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                sub.status === 'rejected' ? 'bg-red-400' :
                sub.status === 'teacher_rejected' ? 'bg-orange-400' :
                'bg-green-500'
              }`}
              style={{ width: sub.status === 'rejected' ? '20%' : `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-100 flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Eye size={13} /> {expanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {isApproved && !sub.referenceNumber && (
          <button
            onClick={handleDownloadSignedDoc}
            disabled={downloadingPdf}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-green-600 hover:bg-green-50 border-l border-gray-100 transition-colors shrink-0 disabled:opacity-60"
          >
            {downloadingPdf ? <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /> : <Download size={13} />}
            ดาวน์โหลดคำร้องพร้อมลายเซ็น
          </button>
        )}
        {canResubmit && (
          <button
            onClick={handleResubmit}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-purple-600 hover:bg-purple-50 border-l border-gray-100 transition-colors shrink-0"
          >
            <RefreshCw size={13} /> ยื่นใหม่อีกครั้ง
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50">
          {/* Form data */}
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-600 mb-2">ข้อมูลที่กรอก</p>
            <div className="space-y-1">
              {Object.entries(sub.formData).map(([key, val]) => {
                const field = template?.fields.find(f => f.id === key);
                return (
                  <div key={key} className="flex gap-3 text-xs">
                    <span className="text-gray-500 w-36 shrink-0">{field?.label || key}:</span>
                    <span className="text-gray-700">{formatMoney(val, field?.label || key)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attachments */}
          {sub.attachments && sub.attachments.length > 0 && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-600 mb-2">เอกสารแนบ</p>
              <div className="space-y-1.5">
                {sub.attachments.map((file, i) => (
                  <a
                    key={i}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-[#1a5c2e] hover:underline font-medium"
                  >
                    <Paperclip size={12} />
                    {file.name} ({file.size})
                  </a>
                ))}
              </div>
            </div>
          )}

          <ApprovalTimeline submission={sub} />
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export function TrackStatus() {
  const { currentUser } = useAuth();
  const { submissions } = useSubmissions();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const mySubmissions = submissions.filter(s => s.studentId === currentUser?.id);

  const filtered = mySubmissions.filter(sub => {
    const matchSearch = sub.formName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || sub.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const inProgress = mySubmissions.filter(s =>
    ['submitted', 'admin_reviewing', 'in-review', 'teacher_rejected', 'pending_close'].includes(s.status)
  ).length;

  const filterOptions = [
    { value: 'all', label: 'ทั้งหมด', count: mySubmissions.length },
    { value: 'inprogress', label: 'กำลังดำเนินการ', count: inProgress },
    { value: 'approved', label: 'อนุมัติแล้ว', count: mySubmissions.filter(s => s.status === 'approved').length },
    { value: 'rejected', label: 'ไม่อนุมัติ', count: mySubmissions.filter(s => s.status === 'rejected').length },
  ];

  const filteredDisplay = filterStatus === 'inprogress'
    ? mySubmissions.filter(s => ['submitted', 'admin_reviewing', 'in-review', 'teacher_rejected', 'pending_close'].includes(s.status))
      .filter(sub => sub.formName.toLowerCase().includes(search.toLowerCase()))
    : filtered;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-green-800 text-xl mb-1">ติดตามสถานะคำร้อง</h2>
        <p className="text-gray-500 text-sm">ตรวจสอบสถานะและความคืบหน้าของคำร้องทุกรายการ</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterStatus(opt.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              filterStatus === opt.value
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
            }`}
          >
            {opt.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === opt.value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {opt.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="ค้นหาคำร้อง..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 bg-white"
        />
      </div>

      {/* List */}
      <div className="space-y-4">
        {filteredDisplay.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-green-100">
            <FileText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">ไม่พบคำร้องที่ตรงกับเงื่อนไข</p>
          </div>
        ) : (
          filteredDisplay.map(sub => <SubmissionCard key={sub.id} sub={sub} />)
        )}
      </div>
    </div>
  );
}
