import { useState } from 'react';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { PdfViewerModal } from '../shared/PdfViewerModal';
import {
  Submission, formTemplates, formatDateTime, SubmissionStatus,
} from '../../data/mockData';
import {
  FileText, Search, ChevronDown, ChevronUp, User,
  Calendar, CheckCircle, Clock, XCircle, AlertCircle, Eye, Paperclip, ShieldCheck
} from 'lucide-react';

// ── Approval flow mini-visualizer ─────────────────────────────
function ApprovalFlowViewer({ sub }: { sub: Submission }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-gray-500 font-medium mb-2">เส้นทางการอนุมัติ</p>
      <div className="flex items-center gap-1 flex-wrap">
        {sub.approvalSteps.map((step, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs min-w-[90px] ${
              step.status === 'approved' ? 'bg-green-50 border-green-200' :
              step.status === 'rejected' ? 'bg-red-50 border-red-200' :
              step.level === sub.currentApprovalLevel ? 'bg-yellow-50 border-yellow-200' :
              'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-1 mb-0.5">
                {step.status === 'approved' && <CheckCircle size={11} className="text-green-500" />}
                {step.status === 'rejected' && <XCircle size={11} className="text-red-500" />}
                {step.status === 'pending' && step.level === sub.currentApprovalLevel && <Clock size={11} className="text-yellow-500" />}
                {step.status === 'pending' && step.level !== sub.currentApprovalLevel && <Clock size={11} className="text-gray-300" />}
                <span className={`font-medium text-xs ${
                  step.status === 'approved' ? 'text-green-700' :
                  step.status === 'rejected' ? 'text-red-700' :
                  step.level === sub.currentApprovalLevel ? 'text-yellow-700' : 'text-gray-400'
                }`}>ระดับ {step.level}</span>
              </div>
              <span className="text-gray-500 text-center leading-tight" style={{ fontSize: '10px' }}>
                {step.approverName ? step.approverName.split(' ')[0] : step.roleName}
              </span>
              {step.comment && (
                <span className="mt-1 italic text-gray-400 text-center" style={{ fontSize: '9px' }}>
                  "{step.comment.length > 20 ? step.comment.slice(0, 20) + '…' : step.comment}"
                </span>
              )}
            </div>
            {i < sub.approvalSteps.length - 1 && (
              <div className={`w-4 h-0.5 shrink-0 ${
                step.status === 'approved' ? 'bg-green-400' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
        {sub.status === 'approved' && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-green-400 shrink-0" />
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-green-100 border border-green-200 text-xs text-green-700 font-medium">
              <CheckCircle size={11} /> ปิดงาน
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Submission Row ─────────────────────────────────────────────
function SubmissionRow({ sub }: { sub: Submission }) {
  const [expanded, setExpanded] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const template = formTemplates.find(f => f.id === sub.formType);
  const hasAttachments = sub.attachments && sub.attachments.length > 0;

  const deadlineDays = sub.deadline
    ? Math.ceil((new Date(sub.deadline).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <>
      <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
        {/* Deadline warning */}
        {deadlineDays !== null && deadlineDays <= 3 && deadlineDays >= 0 && (
          <div className={`px-4 py-1.5 flex items-center gap-2 text-xs ${deadlineDays <= 1 ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
            <AlertCircle size={11} />
            {deadlineDays === 0 ? 'ครบกำหนดวันนี้!' : `เหลืออีก ${deadlineDays} วัน`}
          </div>
        )}
        {deadlineDays !== null && deadlineDays < 0 && (
          <div className="px-4 py-1.5 flex items-center gap-2 text-xs bg-red-100 text-red-800">
            <XCircle size={11} /> เกินกำหนดแล้ว {Math.abs(deadlineDays)} วัน
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg ${template?.iconBg || 'bg-gray-100'} flex items-center justify-center shrink-0`}>
              <FileText size={18} className={template?.colorClass || 'text-gray-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-gray-800">{sub.formName}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><User size={11} /> {sub.studentName}</span>
                    <span className="text-xs text-gray-400">{sub.department}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={11} /> {formatDateTime(sub.submittedAt)}</span>
                    {hasAttachments && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <Paperclip size={9} /> {sub.attachments!.length} ไฟล์
                      </span>
                    )}
                    {sub.referenceNumber && (
                      <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-mono">{sub.referenceNumber}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:block">#{sub.id.slice(-6)}</span>
                  {sub.signatureHash && (
                    <div title="Verified via SHA-256 Digital Signature" className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs border border-emerald-200">
                      <ShieldCheck size={12} />
                      <span className="hidden sm:block font-medium">Verified</span>
                    </div>
                  )}
                  <StatusBadge status={sub.status} />
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-1 mt-3">
            {sub.approvalSteps.map((step, i) => (
              <div key={i} title={step.roleName} className={`flex-1 h-1.5 rounded-full ${
                step.status === 'approved' ? 'bg-green-500' :
                step.status === 'rejected' ? 'bg-red-500' :
                step.level === sub.currentApprovalLevel && sub.status === 'in-review' ? 'bg-yellow-400' : 'bg-gray-200'
              }`} />
            ))}
            {sub.status === 'approved' && <CheckCircle size={14} className="text-green-500 shrink-0" />}
          </div>
        </div>

        {/* Bottom toolbar */}
        <div className="border-t border-gray-100 flex items-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Eye size={13} /> {expanded ? 'ซ่อนรายละเอียด' : 'ดูเส้นทางการอนุมัติ'}
            </span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {hasAttachments && (
            <button
              onClick={() => setPdfViewerOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-blue-600 hover:bg-blue-50 border-l border-gray-100 transition-colors shrink-0"
            >
              <Paperclip size={13} /> ดูเอกสาร ({sub.attachments!.length})
            </button>
          )}
        </div>

        {expanded && (
          <div className="px-4 pb-4">
            <ApprovalFlowViewer sub={sub} />
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-medium mb-2">ข้อมูลที่กรอก</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(sub.formData).slice(0, 4).map(([key, val]) => {
                  const field = template?.fields.find(f => f.id === key);
                  return (
                    <div key={key} className="text-xs">
                      <span className="text-gray-400">{field?.label || key}: </span>
                      <span className="text-gray-700">{val.length > 40 ? val.slice(0, 37) + '...' : val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {pdfViewerOpen && hasAttachments && (
        <PdfViewerModal
          attachments={sub.attachments!}
          submissionName={sub.formName}
          studentName={sub.studentName}
          onClose={() => setPdfViewerOpen(false)}
        />
      )}
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────
export function DocumentFlow() {
  const { submissions } = useSubmissions();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<SubmissionStatus | 'all'>('all');

  const filtered = submissions.filter(s => {
    const matchSearch = search === '' ||
      s.studentName.includes(search) ||
      s.formName.includes(search) ||
      s.id.includes(search) ||
      (s.referenceNumber?.includes(search));
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = {
    total: submissions.length,
    inReview: submissions.filter(s => ['submitted', 'admin_reviewing', 'in-review'].includes(s.status)).length,
    teacherRejected: submissions.filter(s => s.status === 'teacher_rejected').length,
    pendingClose: submissions.filter(s => s.status === 'pending_close').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-green-800 text-xl mb-1">ภาพรวมเอกสาร</h2>
        <p className="text-gray-500 text-sm">ตรวจสอบการไหลและสถานะของเอกสารทั้งหมดในระบบ</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'ทั้งหมด', value: counts.total, color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'กำลังดำเนินการ', value: counts.inReview, color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: 'รออนุมัติใหม่', value: counts.teacherRejected, color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: 'รอปิดงาน', value: counts.pendingClose, color: 'text-teal-700', bg: 'bg-teal-50' },
          { label: 'เสร็จสิ้น', value: counts.approved, color: 'text-green-700', bg: 'bg-green-50' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.bg} rounded-xl p-4 text-center border border-white`}>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อนิสิต ประเภทคำร้อง หมายเลข..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as SubmissionStatus | 'all')}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="submitted">รอรับเรื่อง</option>
          <option value="admin_reviewing">Admin ตรวจสอบ</option>
          <option value="in-review">อยู่ระหว่างพิจารณา</option>
          <option value="teacher_rejected">รอ Admin ตรวจสอบ</option>
          <option value="pending_close">รอ Admin ปิดงาน</option>
          <option value="approved">อนุมัติแล้ว</option>
          <option value="rejected">ไม่อนุมัติ</option>
        </select>
      </div>

      <p className="text-xs text-gray-400">แสดง {filtered.length} รายการ</p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-green-100">
          <FileText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">ไม่พบรายการที่ตรงกัน</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => <SubmissionRow key={sub.id} sub={sub} />)}
        </div>
      )}
    </div>
  );
}
