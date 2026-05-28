import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { PdfViewerModal } from '../shared/PdfViewerModal';
import { Submission, formTemplates, formatDateTime } from '../../data/mockData';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  Inbox, CheckCircle, XCircle, FileText, ChevronDown, ChevronUp,
  User, Calendar, AlertCircle, Send, RotateCcw, Clock, Paperclip,
  Lock, Edit3, Check, Search, UserCheck, Download, PenLine, X, Maximize2, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateApprovalPDF, generateSignedAttachmentPDF, previewSignedAttachmentPDF } from '../../lib/generateApprovalPDF';

interface DBTeacher { id: string; name: string; department?: string; position?: string; is_advisor?: boolean; is_department_head?: boolean; is_dean?: boolean; }

// ── Deadline Picker ───────────────────────────────────────────
function DeadlinePicker({ onSet }: { onSet: (date: string) => void }) {
  const [date, setDate] = useState('');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        type="date"
        min={minDate}
        value={date}
        onChange={e => setDate(e.target.value)}
        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-green-400"
      />
      <button
        onClick={() => date && onSet(date)}
        disabled={!date}
        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs disabled:opacity-40 hover:bg-green-700 transition-all"
      >
        กำหนด
      </button>
    </div>
  );
}

// ── Submission Card for Admin Inbox ───────────────────────────
function InboxCard({ sub, mode, teachers }: { sub: Submission; mode: 'new' | 'teacher_rejected' | 'pending_close'; teachers: DBTeacher[] }) {
  const { currentUser } = useAuth();
  const { adminReceive, adminForward, adminRejectFinal, adminReturnToTeacher, adminClose, adminSetDeadline, updateSubmission, adminEditFormData } = useSubmissions();
  const [expanded, setExpanded] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showDeadline, setShowDeadline] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [newApproverId, setNewApproverId] = useState('');
  // กำหนดผู้อนุมัติแต่ละระดับ
  const [assignedStep, setAssignedStep] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    // Pre-fill from existing steps
    sub.approvalSteps.forEach(s => { if (s.approverId) init[s.level] = s.approverId; });
    return init;
  });
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState(sub.formData);
  const [signedPreviewOpen, setSignedPreviewOpen] = useState(false);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  const [signedPreviewLoading, setSignedPreviewLoading] = useState(false);

  // Cleanup blob URL on unmount
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

  // filter อาจารย์ตาม dept ด้วย partial match, fallback แสดงทั้งหมดถ้าไม่เจอ
  const deptTeachers = (dept: string) => {
    if (!dept || teachers.length === 0) return teachers;
    const matched = teachers.filter(t => {
      if (!t.department) return false;
      const d1 = t.department.trim();
      const d2 = dept.trim();
      return d1 === d2 || d1.includes(d2) || d2.includes(d1);
    });
    return matched.length > 0 ? matched : teachers; // fallback ถ้าไม่เจอแสดงทั้งหมด
  };
  const levelLabel = (role: string) => role === 'อาจารย์ที่ปรึกษา' ? 'อาจารย์ที่ปรึกษา' : role === 'หัวหน้าภาควิชา' ? 'หัวหน้าภาค' : 'คณบดี';

  const template = formTemplates.find(f => f.id === sub.formType);
  const hasAttachments = sub.attachments && sub.attachments.length > 0;
  const adminId = currentUser?.id || '';
  const adminName = currentUser?.name || '';

  // The rejected step
  const rejectedStep = sub.approvalSteps.find(s => s.status === 'rejected');
  const affectedUserIds = [
    sub.studentId,
    ...sub.approvalSteps.filter(s => s.approverId).map(s => s.approverId!),
  ];

  const handleAssignAndForward = () => {
    // อัปเดต approval_steps ด้วยอาจารย์ที่ admin เลือก
    const newSteps = sub.approvalSteps.map(step => {
      const tid = assignedStep[step.level];
      if (!tid) return step;
      const t = teachers.find(x => x.id === tid);
      return { ...step, approverId: tid, approverName: t?.name || step.approverName };
    });
    // รวบยอดเป็น transaction เดียวเพื่อป้องกัน Supabase race condition
    adminForward(sub.id, adminId, adminName, undefined, newSteps);
    toast.success('กำหนดผู้อนุมัติและส่งต่อแล้ว');
    setShowAssignForm(false);
  };

  const handleAdminReject = () => {
    if (!rejectReason.trim()) { toast.error('กรุณาระบุเหตุผล'); return; }
    adminRejectFinal(sub.id, adminId, adminName, rejectReason);
    toast.error('ส่งผลไม่อนุมัติให้นิสิตแล้ว');
  };
  const handleReturn = () => {
    if (!returnReason.trim()) { toast.error('กรุณาระบุเหตุผล'); return; }
    if (!rejectedStep) return;
    const newTeacher = teachers.find(t => t.id === newApproverId);
    adminReturnToTeacher(sub.id, rejectedStep.level, returnReason, newApproverId || undefined, newTeacher?.name);
    toast.success(newApproverId ? 'เปลี่ยนผู้อนุมัติและส่งกลับแล้ว' : 'ส่งกลับอาจารย์แล้ว');
    setShowReturnForm(false);
  };

  const handleClose = () => {
    adminClose(sub.id, adminId, adminName);
    toast.success('ปิดงานเรียบร้อย ออกเลขที่แล้ว');
  };

  const handleSaveEdit = () => {
    adminEditFormData(sub.id, editedData, adminName);
    toast.success('บันทึกการแก้ไขแล้ว');
    setEditMode(false);
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
        {/* Mode indicator */}
        {mode === 'teacher_rejected' && rejectedStep && (
          <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 flex items-start gap-2 text-xs text-orange-700">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">{rejectedStep.approverName}</span> (ระดับ {rejectedStep.level}) ไม่อนุมัติ
              {rejectedStep.comment && <span className="ml-1">— "{rejectedStep.comment}"</span>}
            </div>
          </div>
        )}
        {mode === 'pending_close' && (
          <div className="px-4 py-2.5 bg-teal-50 border-b border-teal-100 flex items-center gap-2 text-xs text-teal-700">
            <CheckCircle size={13} className="shrink-0" />
            ผ่านอนุมัติครบทุกขั้นตอนแล้ว — รอ Admin ปิดงาน
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg ${template?.iconBg || 'bg-gray-100'} flex items-center justify-center shrink-0`}>
              <FileText size={18} className={template?.colorClass || 'text-gray-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">{sub.formName}</p>
                <StatusBadge status={sub.status} />
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-700 font-medium flex items-center gap-1"><User size={11} className="text-blue-500" /> {sub.studentName || 'ไม่ระบุชื่อ'}</span>
                {sub.department && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{sub.department}</span>}
                <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={11} /> {formatDateTime(sub.submittedAt)}</span>
                {hasAttachments && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Paperclip size={9} /> {sub.attachments!.length} ไฟล์</span>}
                {sub.revisionCount && sub.revisionCount > 0 && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">ยื่นซ้ำ ครั้งที่ {sub.revisionCount}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            ดูข้อมูล
          </button>
          {hasAttachments && (
            <button onClick={() => setPdfOpen(true)} className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all">
              <Paperclip size={13} /> ดูเอกสาร
            </button>
          )}
          {hasAttachments && (
            <button
              onClick={handleOpenSignedPreview}
              className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-all"
              title="แสดงตัวอย่างเอกสารที่มีลายเซ็นอาจารย์ทั้งหมดซ้อนทับ"
            >
              <PenLine size={13} /> ดูเอกสารที่ลงลายเซ็นแล้ว
            </button>
          )}

          <button
            onClick={async () => {
              try {
                await generateApprovalPDF(sub);
                toast.success('ดาวน์โหลดใบพิจารณาอนุมัติเรียบร้อยแล้ว');
              } catch (e) {
                console.error(e);
                toast.error('ไม่สามารถสร้างใบอนุมัติได้');
              }
            }}
            className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-all"
            title="ดาวน์โหลดใบพิจารณาอนุมัติสีเขียว (Certificate)"
          >
            <Download size={13} /> ดาวน์โหลดใบอนุมัติ (KU-Paper)
          </button>

          {hasAttachments && sub.attachments!.some(a => a.type === 'pdf') && (
            <button
              onClick={async () => {
                const pdfAttach = sub.attachments!.find(a => a.type === 'pdf')!;
                await generateSignedAttachmentPDF(sub, pdfAttach.url, pdfAttach.name);
              }}
              className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
              title="ดาวน์โหลดแบบฟอร์มคำร้องจริงที่นิสิตแนบมา พร้อมลายเซ็นที่อาจารย์ลงนามไว้บนเอกสาร"
            >
              <Download size={13} /> ดาวน์โหลดแบบฟอร์มคำร้องจริงพร้อมลายเซ็น
            </button>
          )}

          <div className="flex-1" />

          {mode === 'new' && (
            <>
              <button onClick={() => setShowDeadline(!showDeadline)} className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-all">
                <Clock size={13} /> กำหนด Deadline
              </button>
              <button onClick={() => setShowRejectForm(!showRejectForm)} className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all">
                <XCircle size={13} /> ตีกลับ
              </button>
              <button onClick={() => setShowAssignForm(!showAssignForm)} className="flex items-center gap-1.5 text-xs text-white bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded-lg transition-all">
                <UserCheck size={13} /> กำหนดผู้อนุมัติ & ส่งต่อ
              </button>
            </>
          )}

          {mode === 'teacher_rejected' && (
            <>
              <button onClick={() => setShowRejectForm(!showRejectForm)} className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all">
                <XCircle size={13} /> ยืนยันไม่อนุมัติ
              </button>
              <button onClick={() => setShowReturnForm(!showReturnForm)} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-all">
                <RotateCcw size={13} /> ส่งกลับพิจารณาใหม่
              </button>
            </>
          )}

          {mode === 'pending_close' && (
            <>
              <button onClick={() => setEditMode(!editMode)} className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-all">
                <Edit3 size={13} /> {editMode ? 'ยกเลิกแก้ไข' : 'แก้ไขข้อมูล'}
              </button>
              <button onClick={handleClose} className="flex items-center gap-1.5 text-xs text-white bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded-lg transition-all">
                <Lock size={13} /> ปิดงาน / ออกเลขที่
              </button>
            </>
          )}
        </div>

        {/* Deadline picker */}
        {showDeadline && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-600 font-medium mb-1">กำหนดวันครบกำหนดดำเนินการ</p>
            <DeadlinePicker onSet={date => {
              adminSetDeadline(sub.id, date + 'T23:59:59', adminId, adminName, affectedUserIds);
              setShowDeadline(false);
              toast.success('กำหนด deadline แล้ว แจ้งเตือนทุกคนเรียบร้อย');
            }} />
          </div>
        )}

        {/* Assign approvers & forward panel */}
        {showAssignForm && mode === 'new' && (
          <div className="px-4 pb-4 border-t border-green-100 pt-3 space-y-3 bg-green-50/50">
            <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5"><UserCheck size={13} /> กำหนดผู้อนุมัติในแต่ละระดับ</p>
            {sub.approvalSteps.length === 0 && <p className="text-xs text-gray-400">คำร้องนี้ไม่มีขั้นตอนอนุมัติ</p>}
            {sub.approvalSteps.map(step => (
              <div key={step.level}>
                <p className="text-xs text-gray-500 mb-1">ระดับ {step.level} — {step.roleName}</p>

                {step.roleName === 'อาจารย์ที่ปรึกษา' && (
                  // ระดับ 1: อาจารย์ที่ปรึกษา filter ตาม dept
                  <select
                    value={assignedStep[step.level] || ''}
                    onChange={e => setAssignedStep(prev => ({ ...prev, [step.level]: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-green-200 rounded-lg text-xs focus:outline-none focus:border-green-500 bg-white"
                  >
                    <option value="">— เลือกอาจารย์ที่ปรึกษา —</option>
                    {deptTeachers(sub.department).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}

                {step.roleName === 'หัวหน้าภาควิชา' && (() => {
                  // ระดับ 2: หัวหน้าภาค — แสดงหัวหน้าภาคก่อน
                  const deptList = deptTeachers(sub.department);
                  const deptHeads = deptList.filter(t => t.is_department_head);
                  const others = deptList.filter(t => !t.is_department_head);
                  return (
                    <select
                      value={assignedStep[step.level] || ''}
                      onChange={e => setAssignedStep(prev => ({ ...prev, [step.level]: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-green-200 rounded-lg text-xs focus:outline-none focus:border-green-500 bg-white"
                    >
                      <option value="">— เลือกหัวหน้าภาค —</option>
                      {deptHeads.length > 0 && (
                        <optgroup label="★ หัวหน้าภาควิชา">
                          {deptHeads.map(t => <option key={t.id} value={t.id}>● {t.name}</option>)}
                        </optgroup>
                      )}
                      {others.length > 0 && (
                        <optgroup label="-- อาจารย์ประจำภาค">
                          {others.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  );
                })()}



                {step.roleName.includes('คณบดี') && (() => {
                  // ระดับ 3: คณบดี — แยกเป็น คณบดี vs ผู้แทนคณบดี (Default เป็น อ.ตุลวิทย์)
                  const allDeans = teachers.filter(t => t.is_dean);
                  const primaryDean = allDeans.find(t => t.name.includes('ตุลวิทย์'));
                  const deputyDeans = allDeans.filter(t => !t.name.includes('ตุลวิทย์'));
                  
                  const defaultId = primaryDean?.id || allDeans[0]?.id || '';
                  const currentVal = assignedStep[step.level] || defaultId;

                  // Sync default กลับเข้า state
                  if (!assignedStep[step.level] && defaultId) {
                    Promise.resolve().then(() =>
                      setAssignedStep(prev =>
                        prev[step.level] ? prev : { ...prev, [step.level]: defaultId }
                      )
                    );
                  }

                  return (
                    <select
                      value={currentVal}
                      onChange={e => setAssignedStep(prev => ({ ...prev, [step.level]: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-green-200 rounded-lg text-xs focus:outline-none focus:border-green-500 bg-white"
                    >
                      <option value="">— เลือกคณบดี/ผู้แทน —</option>
                      {primaryDean && (
                        <optgroup label="★ คณบดี">
                          <option value={primaryDean.id}>● {primaryDean.name}{primaryDean.position ? ` (${primaryDean.position})` : ''}</option>
                        </optgroup>
                      )}
                      {deputyDeans.length > 0 && (
                        <optgroup label="-- ผู้แทนคณบดี">
                          {deputyDeans.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name}{t.position ? ` (${t.position})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {allDeans.length === 0 && (
                        <option disabled>ไม่พบคณบดีในระบบ</option>
                      )}
                    </select>
                  );
                })()}

                {step.roleName !== 'อาจารย์ที่ปรึกษา' && step.roleName !== 'หัวหน้าภาควิชา' && !step.roleName.includes('คณบดี') && (
                  <select
                    value={assignedStep[step.level] || ''}
                    onChange={e => setAssignedStep(prev => ({ ...prev, [step.level]: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-green-200 rounded-lg text-xs focus:outline-none focus:border-green-500 bg-white"
                  >
                    <option value="">— เลือกผู้อนุมัติสำหรับ {step.roleName} —</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.department ? ` (${t.department})` : ''}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}

            <button
              onClick={handleAssignAndForward}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs transition-all w-full justify-center"
            >
              <Send size={13} /> ยืนยันและส่งต่ออาจารย์
            </button>
          </div>
        )}


        {/* Reject form */}
        {showRejectForm && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-700 font-medium mb-2">{mode === 'new' ? 'เหตุผลที่ตีกลับ' : 'เหตุผลที่ยืนยันไม่อนุมัติ'}</p>
            <textarea rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="ระบุเหตุผล (บังคับ)" className="w-full px-3 py-2 border border-red-200 rounded-lg text-xs focus:outline-none focus:border-red-400 resize-none mb-2" />
            <button onClick={handleAdminReject} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs transition-all">
              <XCircle size={13} /> ยืนยัน{mode === 'new' ? 'ตีกลับ' : 'ไม่อนุมัติ'}และแจ้งนิสิต
            </button>
          </div>
        )}

        {/* Return to teacher form */}
        {showReturnForm && rejectedStep && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs text-gray-700 font-medium">ส่งกลับพร้อมเหตุผล / เปลี่ยนผู้อนุมัติ</p>
            <textarea rows={2} value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="เหตุผลที่ส่งกลับ (บังคับ)" className="w-full px-3 py-2 border border-amber-200 rounded-lg text-xs focus:outline-none focus:border-amber-400 resize-none" />
            <div>
              <p className="text-xs text-gray-500 mb-1">เปลี่ยนผู้อนุมัติ (ไม่บังคับ — ถ้าไม่เลือก จะส่งคืนอาจารย์เดิม)</p>
              <select value={newApproverId} onChange={e => setNewApproverId(e.target.value)} className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-green-400">
                <option value="">— ส่งคืนอาจารย์เดิม ({rejectedStep.approverName || 'ไม่ระบุ'}) —</option>
                {teachers.filter(t => t.id !== rejectedStep.approverId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}{t.department ? ` (${t.department})` : ''}</option>
                ))}
              </select>
            </div>
            <button onClick={handleReturn} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs transition-all">
              <RotateCcw size={13} /> ส่งกลับพิจารณา
            </button>
          </div>
        )}

        {/* Expanded form data */}
        {expanded && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 grid grid-cols-2 gap-2">
            {Object.entries(editMode ? editedData : sub.formData).map(([key, val]) => {
              const field = template?.fields.find(f => f.id === key);
              return (
                <div key={key} className="text-xs">
                  <p className="text-gray-400 mb-0.5">{field?.label || key}</p>
                  {editMode ? (
                    <input value={val} onChange={e => setEditedData(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-2 py-1 border border-purple-200 rounded focus:outline-none focus:border-purple-400" />
                  ) : (
                    <p className="text-gray-700">{val}</p>
                  )}
                </div>
              );
            })}
            {editMode && (
              <div className="col-span-2 flex gap-2 pt-2">
                <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 transition-all">
                  <Check size={13} /> บันทึกการแก้ไข (Admin)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {pdfOpen && hasAttachments && (
        <PdfViewerModal attachments={sub.attachments!} submissionName={sub.formName} studentName={sub.studentName} submission={sub} onClose={() => setPdfOpen(false)} />
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

// ── Priority helpers ─────────────────────────────────────────
function getDaysLeft(deadline?: string): number | null {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function PriorityBadge({ deadline }: { deadline?: string }) {
  const days = getDaysLeft(deadline);
  if (days === null) return null;
  if (days <= 0) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><AlertCircle size={10} /> เกินกำหนด</span>;
  if (days <= 3) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">🔴 เร่งด่วน ({days}ว.)</span>;
  if (days <= 7) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">🟡 ใกล้ครบ ({days}ว.)</span>;
  return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🟢 {days} วัน</span>;
}

// ── Main Component ────────────────────────────────────────────
export function AdminInbox() {
  const { submissions } = useSubmissions();
  const [tab, setTab] = useState<'new' | 'teacher_rejected' | 'pending_close'>('new');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterFaculty, setFilterFaculty] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'deadline'>('newest');
  const [teachers, setTeachers] = useState<DBTeacher[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase
      .from('users')
      .select('id,name,department,teachers(position,is_advisor,is_department_head,is_dean)')
      .eq('role', 'teacher')
      .then(({ data }) => {
        if (data) {
          const mapped = (data as any[]).map(u => ({
            id: u.id, name: u.name, department: u.department,
            position: u.teachers?.position ?? '',
            is_advisor: u.teachers?.is_advisor ?? false,
            is_department_head: u.teachers?.is_department_head ?? false,
            is_dean: u.teachers?.is_dean ?? false,
          }));
          setTeachers(mapped);
        }
      });
  }, []);

  const newSubs = submissions.filter(s => s.status === 'submitted' || s.status === 'admin_reviewing');
  const rejectedSubs = submissions.filter(s => s.status === 'teacher_rejected');
  const closeSubs = submissions.filter(s => s.status === 'pending_close');

  const tabs = [
    { key: 'new' as const, label: 'รอรับเรื่อง', count: newSubs.length, color: 'text-blue-600', dot: 'bg-blue-500' },
    { key: 'teacher_rejected' as const, label: 'อาจารย์ปฏิเสธ', count: rejectedSubs.length, color: 'text-orange-600', dot: 'bg-orange-500' },
    { key: 'pending_close' as const, label: 'รอปิดงาน', count: closeSubs.length, color: 'text-teal-600', dot: 'bg-teal-500' },
  ];

  // ── รายการตาม Tab ปัจจุบัน
  const rawItems = tab === 'new' ? newSubs : tab === 'teacher_rejected' ? rejectedSubs : closeSubs;

  // ── คณะที่มีในรายการนั้น (สำหรับ dropdown กรอง)
  const faculties = Array.from(new Set(rawItems.map(s => s.faculty).filter(Boolean)));

  // ── Apply filter + sort (ไม่กระทบ count บน tab)
  const currentItems = rawItems
    .filter(s => {
      const matchSearch = !search ||
        s.studentName.toLowerCase().includes(search.toLowerCase()) ||
        s.formName.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || s.formType.includes(filterType);
      const matchFaculty = filterFaculty === 'all' || s.faculty === filterFaculty;
      return matchSearch && matchType && matchFaculty;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      if (sortBy === 'oldest') return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      // deadline — เร่งด่วนขึ้นก่อน, ไม่มี deadline ลงล่าง
      const da = getDaysLeft(a.deadline) ?? 9999;
      const db = getDaysLeft(b.deadline) ?? 9999;
      return da - db;
    });

  const formTypeOptions = [
    { val: 'all', label: 'ทุกประเภท' },
    { val: 'add-drop', label: 'เพิ่ม-ถอน' },
    { val: 'exam', label: 'เลื่อนสอบ' },
    { val: 'fee', label: 'การเงิน' },
    { val: 'leave', label: 'ลา/พัก' },
    { val: 'registration', label: 'ลงทะเบียน' },
    { val: 'general', label: 'คำร้องทั่วไป' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-green-800 text-xl mb-1">รับ-ส่งเรื่อง</h2>
        <p className="text-gray-500 text-sm">จัดการคำร้องที่ต้องดำเนินการโดย Admin</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {tabs.map(t => (
          <div key={t.key} className="bg-white rounded-xl border border-green-100 p-4 text-center">
            <p className={`text-2xl font-bold ${t.color}`}>{t.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${tab === t.key ? 'bg-green-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'}`}>
            <Inbox size={15} />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20 text-white' : `${t.dot.replace('bg-', 'bg-').replace('500', '100')} ${t.color}`}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white rounded-xl border border-green-100 p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อนิสิตหรือประเภทคำร้อง..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Filter ประเภท */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-green-400 bg-white">
            {formTypeOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>

          {/* Filter คณะ */}
          <select value={filterFaculty} onChange={e => setFilterFaculty(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-green-400 bg-white">
            <option value="all">ทุกคณะ</option>
            {faculties.map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-green-400 bg-white">
            <option value="newest">วันที่ล่าสุด</option>
            <option value="oldest">วันที่เก่าสุด</option>
            <option value="deadline">เร่งด่วนก่อน ⚡</option>
          </select>

          {/* Reset */}
          {(search || filterType !== 'all' || filterFaculty !== 'all' || sortBy !== 'newest') && (
            <button onClick={() => { setSearch(''); setFilterType('all'); setFilterFaculty('all'); setSortBy('newest'); }}
              className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-all">
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Result count */}
        <p className="text-xs text-gray-400">
          แสดง {currentItems.length} จาก {rawItems.length} รายการ
          {search || filterType !== 'all' || filterFaculty !== 'all' ? ' (กรองแล้ว)' : ''}
        </p>
      </div>

      {/* Content */}
      {currentItems.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-green-100">
          <CheckCircle size={40} className="mx-auto text-green-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {rawItems.length === 0 ? 'ไม่มีรายการที่ต้องดำเนินการ' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentItems.map(sub => (
            <div key={sub.id}>
              {/* Priority badge เหนือ card ถ้ามี deadline */}
              {sub.deadline && (
                <div className="flex justify-end mb-1">
                  <PriorityBadge deadline={sub.deadline} />
                </div>
              )}
              <InboxCard sub={sub} mode={tab} teachers={teachers} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

