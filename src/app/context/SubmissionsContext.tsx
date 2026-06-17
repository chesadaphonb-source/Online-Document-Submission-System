import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import {
  Submission, ApprovalStep, initialSubmissions, SubmissionStatus, mockAdmin, FormTypeId
} from '../data/mockData';
import { useNotifications, Notification } from './NotificationContext';
import { supabase, isSupabaseConfigured, supabaseStorage } from '../lib/supabase';
import { generateCertificateHash, generateAdjustedPDFBlob } from '../lib/generateApprovalPDF';
import { toast } from 'sonner';

interface SubmissionsContextType {
  submissions: Submission[];
  addSubmission: (sub: Submission) => void;
  updateSubmission: (id: string, changes: Partial<Submission>) => void;
  approveStep: (
    submissionId: string,
    level: number,
    approverId: string,
    approverName: string,
    comment: string,
    signatureData?: string,
    signatureX?: number,
    signatureY?: number,
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
  rejectStep: (submissionId: string, level: number, approverId: string, approverName: string, comment: string) => void;
  adminReceive: (submissionId: string, adminId: string, adminName: string) => void;
  adminForward: (submissionId: string, adminId: string, adminName: string, deadline?: string, providedSteps?: ApprovalStep[]) => void;
  adminRejectFinal: (submissionId: string, adminId: string, adminName: string, reason: string) => void;
  adminReturnToTeacher: (submissionId: string, level: number, reason: string, newApproverId?: string, newApproverName?: string) => void;
  adminClose: (submissionId: string, adminId: string, adminName: string, note?: string) => void;
  adminEditFormData: (submissionId: string, formData: Record<string, string>, adminName: string) => void;
  adminSetDeadline: (submissionId: string, deadline: string, adminId: string, adminName: string, affectedUserIds: string[]) => void;
  studentResubmit: (submissionId: string) => void;
  getSubmissionById: (id: string) => Submission | undefined;
  updateSignaturePositions: (
    submissionId: string,
    formType: FormTypeId,
    updatedSteps: ApprovalStep[],
    targetSubmissionIds: string[],
    adminName?: string
  ) => Promise<void>;
}

const SubmissionsContext = createContext<SubmissionsContextType | undefined>(undefined);

// ── Map Supabase row → Submission ─────────────────────────────
function rowToSubmission(row: any): Submission {
  return {
    id: row.id,
    formType: row.form_type,
    formName: row.form_name,
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    department: row.department || '',
    faculty: row.faculty || '',
    status: row.status as SubmissionStatus,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    currentApprovalLevel: row.current_approval_level || 1,
    semester: row.semester || '',
    academicYear: row.academic_year || '',
    formData: row.form_data || {},
    approvalSteps: row.approval_steps || [],
    attachments: row.attachments || [],
    receivedByAdminAt: row.received_by_admin_at,
    receivedByAdminName: row.received_by_admin_name,
    adminNote: row.admin_note,
    closedAt: row.closed_at,
    referenceNumber: row.reference_number,
    deadline: row.deadline,
    deadlineSetBy: row.deadline_set_by,
    deadlineSetAt: row.deadline_set_at,
    revisionCount: row.revision_count || 0,
    signatureHash: row.signature_hash,
    signatureAdjustedAt: row.signature_adjusted_at,
    signatureAdjustedBy: row.signature_adjusted_by,
    originalAttachmentUrl: row.original_attachment_url,
    studentLevel: row.student_level || undefined,
    studentYear: row.student_year || undefined,
  };
}

// ── Map Submission → Supabase row ────────────────────────────
function submissionToRow(sub: Submission) {
  return {
    id: sub.id,
    form_type: sub.formType,
    form_name: sub.formName,
    student_id: sub.studentId,
    student_name: sub.studentName,
    student_email: sub.studentEmail,
    department: sub.department || '',
    faculty: sub.faculty || '',
    status: sub.status,
    submitted_at: sub.submittedAt,
    updated_at: sub.updatedAt || new Date().toISOString(),
    current_approval_level: sub.currentApprovalLevel || 1,
    semester: sub.semester || '',
    academic_year: sub.academicYear || '',
    form_data: sub.formData || {},
    approval_steps: sub.approvalSteps || [],
    attachments: sub.attachments || [],
    received_by_admin_at: sub.receivedByAdminAt || null,
    received_by_admin_name: sub.receivedByAdminName || null,
    admin_note: sub.adminNote || null,
    closed_at: sub.closedAt || null,
    reference_number: sub.referenceNumber || null,
    deadline: sub.deadline || null,
    deadline_set_by: sub.deadlineSetBy || null,
    deadline_set_at: sub.deadlineSetAt || null,
    revision_count: sub.revisionCount || 0,
    signature_hash: sub.signatureHash || null,
    signature_adjusted_at: sub.signatureAdjustedAt || null,
    signature_adjusted_by: sub.signatureAdjustedBy || null,
    original_attachment_url: sub.originalAttachmentUrl || null,
    student_level: sub.studentLevel || null,
    student_year: sub.studentYear || null,
  };
}

// ── Supabase update helper ─────────────────────────────────
async function dbUpdate(id: string, changes: Partial<Submission>) {
  if (!isSupabaseConfigured || !supabase) return;
  const row: any = {};
  if (changes.status !== undefined) row.status = changes.status;
  if (changes.formData !== undefined) row.form_data = changes.formData;
  if (changes.approvalSteps !== undefined) row.approval_steps = changes.approvalSteps;
  if (changes.attachments !== undefined) row.attachments = changes.attachments;
  if (changes.currentApprovalLevel !== undefined) row.current_approval_level = changes.currentApprovalLevel;
  if (changes.receivedByAdminAt !== undefined) row.received_by_admin_at = changes.receivedByAdminAt;
  if (changes.receivedByAdminName !== undefined) row.received_by_admin_name = changes.receivedByAdminName;
  if (changes.adminNote !== undefined) row.admin_note = changes.adminNote;
  if (changes.closedAt !== undefined) row.closed_at = changes.closedAt;
  if (changes.referenceNumber !== undefined) row.reference_number = changes.referenceNumber;
  if (changes.deadline !== undefined) row.deadline = changes.deadline;
  if (changes.deadlineSetBy !== undefined) row.deadline_set_by = changes.deadlineSetBy;
  if (changes.deadlineSetAt !== undefined) row.deadline_set_at = changes.deadlineSetAt;
  if (changes.revisionCount !== undefined) row.revision_count = changes.revisionCount;
  if (changes.signatureHash !== undefined) row.signature_hash = changes.signatureHash;
  if (changes.signatureAdjustedAt !== undefined) row.signature_adjusted_at = changes.signatureAdjustedAt;
  if (changes.signatureAdjustedBy !== undefined) row.signature_adjusted_by = changes.signatureAdjustedBy;
  if (changes.originalAttachmentUrl !== undefined) row.original_attachment_url = changes.originalAttachmentUrl;
  if (changes.studentLevel !== undefined) row.student_level = changes.studentLevel;
  if (changes.studentYear !== undefined) row.student_year = changes.studentYear;
  row.updated_at = new Date().toISOString();
  await supabase.from('submissions').update(row).eq('id', id);
}

export function SubmissionsProvider({ children }: { children: ReactNode }) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const { addNotification, addNotifications } = useNotifications();

  // ── โหลดจาก Supabase เมื่อ mount ──────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      console.warn('[KU-Paper] Supabase not configured, using local state only');
      return;
    }
    supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('[KU-Paper] Failed to load submissions:', error.message);
          return;
        }
        if (data) {
          console.log(`[KU-Paper] Loaded ${data.length} submissions from Supabase`);
          setSubmissions(data.map(rowToSubmission));
        }
      });
  }, []);

  const updateSubmission = useCallback((id: string, changes: Partial<Submission>) => {
    setSubmissions(prev =>
      prev.map(s => s.id === id ? { ...s, ...changes, updatedAt: new Date().toISOString() } : s)
    );
    dbUpdate(id, changes);
  }, []);

  // ── นิสิตยื่นใหม่ ──────────────────────────────────────────
  const addSubmission = useCallback(async (sub: Submission) => {
    setSubmissions(prev => [sub, ...prev]);
    // บันทึกลง Supabase
    if (isSupabaseConfigured && supabase) {
      const row = submissionToRow(sub);
      console.log('[KU-Paper] Inserting submission to Supabase:', sub.id);
      const { error } = await supabase.from('submissions').insert(row);
      if (error) {
        console.error('[KU-Paper] Insert failed:', error.message, error.details);
      } else {
        console.log('[KU-Paper] Submission saved to Supabase:', sub.id);
      }
    }
    // ส่ง notification ให้ทุก admin (ใช้ 'role:admin' แทน hardcoded id)
    addNotification({
      recipientId: 'role:admin',
      submissionId: sub.id,
      submissionName: sub.formName,
      type: 'new_submission',
      title: 'มีคำร้องใหม่รอรับเรื่อง',
      message: `${sub.studentName} (ระดับ${sub.studentLevel || 'ป.ตรี'} ชั้นปี ${sub.studentYear || 1}) ยื่น${sub.formName}`,
      actionUrl: '/admin/inbox',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
      studentLevel: sub.studentLevel,
      studentYear: sub.studentYear,
    });
    // ── แจ้งนิสิตว่ายื่นสำเร็จ (ส่งเมลยืนยัน) ──────────────
    const submittedDate = new Date(sub.submittedAt).toLocaleString('th-TH', {
      dateStyle: 'full', timeStyle: 'short',
    });
    addNotification({
      recipientId: sub.studentId,
      senderId: 'system',
      senderName: 'KU-Paper ระบบยื่นคำร้องออนไลน์',
      submissionId: sub.id,
      submissionName: sub.formName,
      type: 'status_update',
      title: `✅ ยืนยันการยื่นคำร้อง: ${sub.formName}`,
      message: `คำร้องของคุณได้รับการบันทึกเรียบร้อยแล้ว\n\n📄 ประเภทคำร้อง: ${sub.formName}\n👤 ชื่อ: ${sub.studentName}\n🏫 ภาควิชา: ${sub.department}\n🎓 ระดับ: ${sub.studentLevel || 'ปริญญาตรี'} ชั้นปี ${sub.studentYear || 1}\n📅 วันที่ยื่น: ${submittedDate}\n\nขั้นตอนถัดไป: เจ้าหน้าที่จะรับเรื่องและส่งต่อให้อาจารย์พิจารณา คุณสามารถติดตามสถานะได้ที่ระบบ KU-Paper`,
      actionUrl: '/student/track',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
      studentLevel: sub.studentLevel,
      studentYear: sub.studentYear,
    });
  }, [addNotification]);

  // ── Admin รับเรื่อง ────────────────────────────────────────
  const adminReceive = useCallback((submissionId: string, adminId: string, adminName: string) => {
    const now = new Date().toISOString();
    updateSubmission(submissionId, { status: 'admin_reviewing', receivedByAdminAt: now, receivedByAdminName: adminName });
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    addNotification({
      recipientId: sub.studentId,
      senderId: adminId,
      senderName: adminName,
      submissionId,
      submissionName: sub.formName,
      type: 'status_update',
      title: 'รับเรื่องแล้ว',
      message: `${sub.formName} ได้รับเรื่องแล้ว อยู่ระหว่างตรวจสอบเอกสาร`,
      actionUrl: '/student/track',
    });
  }, [submissions, updateSubmission, addNotification]);

  // ── Admin forward ไปอาจารย์ ────────────────────────────────
  const adminForward = useCallback((submissionId: string, adminId: string, adminName: string, deadline?: string, providedSteps?: ApprovalStep[]) => {
    const now = new Date().toISOString();
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    const stepsToUse = providedSteps || sub.approvalSteps;
    const firstStep = stepsToUse.find(s => s.level === 1);
    const firstStepRoleName = firstStep?.roleName || 'อาจารย์ที่ปรึกษา';
    updateSubmission(submissionId, {
      status: 'in-review',
      currentApprovalLevel: 1,
      approvalSteps: stepsToUse,
      receivedByAdminAt: sub.receivedByAdminAt || now,
      receivedByAdminName: adminName,
      ...(deadline ? { deadline, deadlineSetBy: adminId, deadlineSetAt: now } : {}),
    });
    const notifs: Omit<Notification, 'id' | 'createdAt' | 'isRead'>[] = [];
    if (firstStep?.approverId) {
      notifs.push({
        recipientId: firstStep.approverId,
        senderId: adminId,
        senderName: adminName,
        submissionId,
        submissionName: sub.formName,
        type: 'forwarded_to_teacher',
        title: 'มีคำร้องรอการพิจารณา',
        message: `${sub.formName} ของ ${sub.studentName} (${sub.studentLevel || 'ป.ตรี'} ชั้นปี ${sub.studentYear || 1}) ถูกส่งมาให้ท่านพิจารณา`,
        actionUrl: '/teacher/approvals',
        studentName: sub.studentName,
        studentEmail: sub.studentEmail,
        department: sub.department,
        studentId: sub.studentId?.replace('student_', '') || '',
        studentLevel: sub.studentLevel,
        studentYear: sub.studentYear,
      });
    }
    notifs.push({
      recipientId: sub.studentId,
      senderId: adminId,
      senderName: adminName,
      submissionId,
      submissionName: sub.formName,
      type: 'status_update',
      title: `${firstStepRoleName}รับเรื่องแล้ว`,
      message: `${sub.formName} ถูกส่งให้${firstStepRoleName}พิจารณาแล้ว โปรดรอ`,
      actionUrl: '/student/track',
    });
    addNotifications(notifs);
  }, [submissions, updateSubmission, addNotifications]);

  // ── อาจารย์ approve ────────────────────────────────────────
  const approveStep = useCallback((
    submissionId: string,
    level: number,
    approverId: string,
    approverName: string,
    comment: string,
    signatureData?: string,
    signatureX?: number,
    signatureY?: number,
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
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    const now = new Date().toISOString();
    const newSteps: ApprovalStep[] = sub.approvalSteps.map(step =>
      step.level === level
        ? {
            ...step,
            status: 'approved',
            approverId,
            approverName,
            comment,
            timestamp: now,
            signatureData,
            signatureX,
            signatureY,
            signatureSize,
            extraSignaturePositions,
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
            page,
          }
        : step
    );
    const nextLevel = level + 1;
    const hasNextLevel = newSteps.some(s => s.level === nextLevel);
    const nextStep = newSteps.find(s => s.level === nextLevel);
    const newStatus: SubmissionStatus = hasNextLevel ? 'in-review' : 'pending_close';
    const newCurrentLevel = hasNextLevel ? nextLevel : level;

    setSubmissions(prev =>
      prev.map(s => s.id === submissionId
        ? { ...s, approvalSteps: newSteps, status: newStatus, currentApprovalLevel: newCurrentLevel, updatedAt: now }
        : s
      )
    );
    dbUpdate(submissionId, { approvalSteps: newSteps, status: newStatus, currentApprovalLevel: newCurrentLevel });

    const notifs: Omit<Notification, 'id' | 'createdAt' | 'isRead'>[] = [];

    // หา label ของขั้นตอนถัดไป
    const nextRoleLabel = nextStep?.roleName || (
      nextLevel === 1 ? 'อาจารย์ที่ปรึกษา' :
      nextLevel === 2 ? 'หัวหน้าภาควิชา' :
      nextLevel === 3 ? 'คณบดี/ผู้แทน' : `ขั้นตอนที่ ${nextLevel}`
    );

    // แจ้งนิสิต
    if (hasNextLevel) {
      notifs.push({
        recipientId: sub.studentId,
        senderId: approverId,
        senderName: approverName,
        submissionId,
        submissionName: sub.formName,
        type: 'status_update',
        title: `${nextRoleLabel}รับเรื่องแล้ว`,
        message: `${sub.formName} ถูกส่งต่อให้${nextRoleLabel}พิจารณา โปรดรอ`,
        actionUrl: '/student/track',
        studentName: sub.studentName,
        studentEmail: sub.studentEmail,
        department: sub.department,
        studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
      });
    } else {
      notifs.push({
        recipientId: sub.studentId,
        senderId: approverId,
        senderName: approverName,
        submissionId,
        submissionName: sub.formName,
        type: 'status_update',
        title: 'เจ้าหน้าที่ตรวจสอบขั้นสุดท้าย',
        message: `${sub.formName} ผ่านการอนุมัติทุกขั้นตอนแล้ว อยู่ระหว่างเจ้าหน้าที่ตรวจสอบขั้นสุดท้าย`,
        actionUrl: '/student/track',
        studentName: sub.studentName,
        studentEmail: sub.studentEmail,
        department: sub.department,
        studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
      });
    }

    if (hasNextLevel && nextStep?.approverId) {
      notifs.push({
        recipientId: nextStep.approverId,
        senderId: approverId,
        senderName: approverName,
        submissionId,
        submissionName: sub.formName,
        type: 'teacher_approved',
        title: 'มีคำร้องส่งต่อมาให้พิจารณา',
        message: `${sub.formName} ของ ${sub.studentName} ผ่านขั้นตอนที่ ${level} แล้ว`,
        actionUrl: '/teacher/approvals',
      });
    } else if (!hasNextLevel) {
      notifs.push({
        recipientId: 'role:admin',
        senderId: approverId,
        senderName: approverName,
        submissionId,
        submissionName: sub.formName,
        type: 'teacher_approved',
        title: 'คำร้องผ่านครบทุกขั้นตอน รอปิดงาน',
        message: `${sub.formName} ของ ${sub.studentName} ผ่านอนุมัติครบแล้ว`,
        actionUrl: '/admin/inbox',
        studentName: sub.studentName,
        studentEmail: sub.studentEmail,
        department: sub.department,
        studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
        studentLevel: sub.studentLevel,
        studentYear: sub.studentYear,
      });
    }
    addNotifications(notifs);
  }, [submissions, addNotifications]);

  // ── อาจารย์ reject ─────────────────────────────────────────
  const rejectStep = useCallback((submissionId: string, level: number, approverId: string, approverName: string, comment: string) => {
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    const now = new Date().toISOString();
    const newSteps: ApprovalStep[] = sub.approvalSteps.map(step =>
      step.level === level
        ? { ...step, status: 'rejected', approverId, approverName, comment, timestamp: now }
        : step
    );
    setSubmissions(prev =>
      prev.map(s => s.id === submissionId
        ? { ...s, approvalSteps: newSteps, status: 'teacher_rejected', updatedAt: now }
        : s
      )
    );
    dbUpdate(submissionId, { approvalSteps: newSteps, status: 'teacher_rejected' });

    const currentStep = sub.approvalSteps.find(s => s.level === level);
    const roleLabel = currentStep?.roleName || `ระดับที่ ${level}`;

    addNotification({
      recipientId: 'role:admin',
      senderId: approverId,
      senderName: approverName,
      submissionId,
      submissionName: sub.formName,
      type: 'teacher_rejected',
      title: `${roleLabel}ไม่อนุมัติ`,
      message: `${approverName} ไม่อนุมัติ${sub.formName} ของ ${sub.studentName} — "${comment}"`,
      actionUrl: '/admin/inbox',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
      studentLevel: sub.studentLevel,
      studentYear: sub.studentYear,
    });
  }, [submissions, addNotification]);

  // ── Admin ยืนยัน reject ────────────────────────────────────
  const adminRejectFinal = useCallback((submissionId: string, adminId: string, adminName: string, reason: string) => {
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    updateSubmission(submissionId, { status: 'rejected', adminNote: reason });
    addNotification({
      recipientId: sub.studentId,
      senderId: adminId,
      senderName: adminName,
      submissionId,
      submissionName: sub.formName,
      type: 'admin_rejected',
      title: 'คำร้องไม่ได้รับการอนุมัติ',
      message: reason,
      actionUrl: '/student/track',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
    });
  }, [submissions, updateSubmission, addNotification]);

  // ── Admin ส่งกลับอาจารย์ ───────────────────────────────────
  const adminReturnToTeacher = useCallback((
    submissionId: string, level: number, reason: string,
    newApproverId?: string, newApproverName?: string,
  ) => {
    const now = new Date().toISOString();
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    const targetStep = sub.approvalSteps.find(s => s.level === level);
    if (!targetStep) return;
    const isChangingApprover = !!newApproverId && newApproverId !== targetStep.approverId;
    const finalApproverId = newApproverId || targetStep.approverId;
    const finalApproverName = newApproverName || targetStep.approverName;
    const newSteps: ApprovalStep[] = sub.approvalSteps.map(step => {
      if (step.level === level) {
        return {
          ...step,
          status: 'pending',
          comment: undefined,
          timestamp: undefined,
          signatureData: undefined,
          signatureX: undefined,
          signatureY: undefined,
          signatureSize: undefined,
          extraSignaturePositions: undefined,
          textBlock: undefined,
          textBlockX: undefined,
          textBlockY: undefined,
          textBlockSize: undefined,
          dateBlock: undefined,
          dateX: undefined,
          dateY: undefined,
          dateSize: undefined,
          checkmarkBlock: undefined,
          checkmarkX: undefined,
          checkmarkY: undefined,
          extraTextBlocks: undefined,
          page: undefined,
          returnedByAdminAt: now,
          returnReason: reason,
          ...(isChangingApprover ? {
            previousApproverId: step.approverId,
            previousApproverName: step.approverName,
            approverId: finalApproverId,
            approverName: finalApproverName,
            isSubstitute: true,
          } : {}),
        };
      } else if (step.level > level) {
        return {
          ...step,
          status: 'pending',
          comment: undefined,
          timestamp: undefined,
          signatureData: undefined,
          signatureX: undefined,
          signatureY: undefined,
          signatureSize: undefined,
          extraSignaturePositions: undefined,
          textBlock: undefined,
          textBlockX: undefined,
          textBlockY: undefined,
          textBlockSize: undefined,
          dateBlock: undefined,
          dateX: undefined,
          dateY: undefined,
          dateSize: undefined,
          checkmarkBlock: undefined,
          checkmarkX: undefined,
          checkmarkY: undefined,
          extraTextBlocks: undefined,
          page: undefined,
        };
      } else {
        return step;
      }
    });
    setSubmissions(prev =>
      prev.map(s => s.id === submissionId
        ? { ...s, approvalSteps: newSteps, status: 'in-review', currentApprovalLevel: level, updatedAt: now }
        : s
      )
    );
    dbUpdate(submissionId, { approvalSteps: newSteps, status: 'in-review', currentApprovalLevel: level });
    if (finalApproverId) {
      addNotification({
        recipientId: finalApproverId, submissionId, submissionName: sub.formName,
        type: isChangingApprover ? 'approver_changed' : 'returned_to_teacher',
        title: isChangingApprover ? 'ท่านได้รับแต่งตั้งเป็นผู้อนุมัติแทน' : 'คำร้องถูกส่งกลับเพื่อพิจารณาใหม่',
        message: `${sub.formName} ของ ${sub.studentName} — เหตุผล: "${reason}"`,
        actionUrl: '/teacher/approvals',
      });
    }
    addNotification({
      recipientId: sub.studentId, submissionId, submissionName: sub.formName,
      type: 'status_update', title: 'คำร้องถูกส่งกลับเพื่อพิจารณาใหม่',
      message: `${sub.formName} อยู่ระหว่างการพิจารณาใหม่ในขั้นตอนของ${targetStep.roleName || `ขั้นตอนที่ ${level}`}`,
      actionUrl: '/student/track',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
    });
  }, [submissions, addNotification]);

  // ── Admin ปิดงาน ───────────────────────────────────────────
  const adminClose = useCallback(async (submissionId: string, adminId: string, adminName: string, note?: string) => {
    const now = new Date().toISOString();
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    const refNum = `KU-${new Date().getFullYear() + 543}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
    
    // Generate Cryptographic Hash for Verification
    const hash = await generateCertificateHash(sub);

    updateSubmission(submissionId, {
      status: 'approved', closedAt: now, referenceNumber: refNum, signatureHash: hash,
      ...(note ? { adminNote: note } : {}),
    });
    addNotification({
      recipientId: sub.studentId, senderId: adminId, senderName: adminName,
      submissionId, submissionName: sub.formName,
      type: 'completed',
      title: 'เจ้าหน้าที่ตรวจสอบเรียบร้อยแล้ว ✅',
      message: `${sub.formName} สำเร็จสมบูรณ์ เลขที่อ้างอิง: ${refNum}${note ? `\nหมายเหตุ: ${note}` : ''}`,
      actionUrl: '/student/track',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
    });
  }, [submissions, updateSubmission, addNotification]);

  // ── Admin แก้ไขฟอร์ม ──────────────────────────────────────
  const adminEditFormData = useCallback((submissionId: string, formData: Record<string, string>, adminName: string) => {
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    updateSubmission(submissionId, { formData });
    addNotification({
      recipientId: sub.studentId, senderName: adminName,
      submissionId, submissionName: sub.formName,
      type: 'admin_edited', title: 'เจ้าหน้าที่แก้ไขข้อมูลคำร้อง',
      message: `ข้อมูลใน${sub.formName} ถูกแก้ไขโดยเจ้าหน้าที่`,
      actionUrl: '/student/track',
    });
  }, [submissions, updateSubmission, addNotification]);

  // ── Admin ตั้ง Deadline ────────────────────────────────────
  const adminSetDeadline = useCallback((submissionId: string, deadline: string, adminId: string, adminName: string, affectedUserIds: string[]) => {
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    updateSubmission(submissionId, { deadline, deadlineSetBy: adminId, deadlineSetAt: new Date().toISOString() });
    const deadlineDate = new Date(deadline).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const notifs = affectedUserIds.map(uid => ({
      recipientId: uid, senderId: adminId, senderName: adminName,
      submissionId, submissionName: sub.formName,
      type: 'deadline_set' as const, title: 'กำหนดระยะเวลาดำเนินการ',
      message: `${sub.formName} ของ ${sub.studentName} ต้องแล้วเสร็จภายใน ${deadlineDate}`,
      actionUrl: uid === sub.studentId ? '/student/track' : '/teacher/approvals',
    }));
    addNotifications(notifs);
  }, [submissions, updateSubmission, addNotifications]);

  // ── นิสิต submit ใหม่หลัง reject ─────────────────────────
  const studentResubmit = useCallback((submissionId: string) => {
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    const resetSteps: ApprovalStep[] = sub.approvalSteps.map(step => ({
      ...step, status: 'pending', comment: undefined, timestamp: undefined,
      approverId: step.previousApproverId || step.approverId,
      approverName: step.previousApproverName || step.approverName,
      isSubstitute: undefined,
    }));
    updateSubmission(submissionId, {
      status: 'submitted', approvalSteps: resetSteps,
      currentApprovalLevel: 1, revisionCount: (sub.revisionCount || 0) + 1,
    });
    addNotification({
      recipientId: 'role:admin',
      submissionId,
      submissionName: sub.formName,
      type: 'new_submission',
      title: 'นิสิตยื่นคำร้องใหม่อีกครั้ง',
      message: `${sub.studentName} แก้ไขและยื่น${sub.formName} ใหม่อีกครั้ง`,
      actionUrl: '/admin/inbox',
      studentName: sub.studentName,
      studentEmail: sub.studentEmail,
      department: sub.department,
      studentId: sub.studentId?.replace('student_', '') || sub.studentEmail?.replace('@ku.th', '') || '',
      studentLevel: sub.studentLevel,
      studentYear: sub.studentYear,
    });
  }, [submissions, updateSubmission, addNotification]);

  const updateSignaturePositions = useCallback(async (
    submissionId: string,
    formType: FormTypeId,
    updatedSteps: ApprovalStep[],
    targetSubmissionIds: string[],
    adminName?: string
  ) => {
    const now = new Date().toISOString();
    const dbUpdates: { id: string; steps: ApprovalStep[]; extraChanges?: Partial<Submission> }[] = [];

    // ── Step 1: Update approvalSteps in state ──────────────────
    const nextSubmissions = submissions.map(s => {
      if (s.id === submissionId) {
        const extraChanges: Partial<Submission> = {
          signatureAdjustedAt: now,
          signatureAdjustedBy: adminName || 'Super Admin',
          // Save original attachment URL on first adjustment
          originalAttachmentUrl: s.originalAttachmentUrl || s.attachments?.[0]?.url,
        };
        dbUpdates.push({ id: s.id, steps: updatedSteps, extraChanges });
        return { ...s, approvalSteps: updatedSteps, updatedAt: now, ...extraChanges };
      }
      if (targetSubmissionIds.includes(s.id)) {
        const newSteps = s.approvalSteps.map(step => {
          const matchingUpdatedStep = updatedSteps.find(us => us.level === step.level);
          if (!matchingUpdatedStep) return step;

          // Helper to resolve text values (name/role) for the target step
          const resolveText = (textVal: string | undefined) => {
            if (!textVal) return textVal;
            const sourceStep = updatedSteps.find(us => us.level === step.level);
            const sourceName = sourceStep?.approverName || '';
            const sourceRole = sourceStep?.roleName || '';
            const targetName = step.approverName || '';
            const targetRole = step.roleName || '';

            if (sourceName && textVal === sourceName) {
              return targetName;
            }
            if (sourceRole && textVal === sourceRole) {
              return targetRole;
            }
            return textVal;
          };

          const resolvedExtraTextBlocks = matchingUpdatedStep.extraTextBlocks?.map(etb => {
            return {
              ...etb,
              val: resolveText(etb.val) || ''
            };
          });

          return {
            ...step,
            signatureX: matchingUpdatedStep.signatureX,
            signatureY: matchingUpdatedStep.signatureY,
            signatureSize: matchingUpdatedStep.signatureSize,
            extraSignaturePositions: matchingUpdatedStep.extraSignaturePositions,
            checkmarkBlock: matchingUpdatedStep.checkmarkBlock,
            checkmarkX: matchingUpdatedStep.checkmarkX,
            checkmarkY: matchingUpdatedStep.checkmarkY,
            checkmarkSize: matchingUpdatedStep.checkmarkSize,
            dateBlock: matchingUpdatedStep.dateBlock,
            dateX: matchingUpdatedStep.dateX,
            dateY: matchingUpdatedStep.dateY,
            dateSize: matchingUpdatedStep.dateSize,
            textBlock: resolveText(matchingUpdatedStep.textBlock),
            textBlockX: matchingUpdatedStep.textBlockX,
            textBlockY: matchingUpdatedStep.textBlockY,
            textBlockSize: matchingUpdatedStep.textBlockSize,
            extraTextBlocks: resolvedExtraTextBlocks,
          };
        });
        dbUpdates.push({ id: s.id, steps: newSteps });
        return { ...s, approvalSteps: newSteps, updatedAt: now };
      }
      return s;
    });

    setSubmissions(nextSubmissions);

    // ── Step 2: Persist approvalSteps to DB ────────────────────
    for (const { id, steps, extraChanges } of dbUpdates) {
      await dbUpdate(id, { approvalSteps: steps, ...(extraChanges || {}) });
    }

    // ── Step 3: Generate adjusted PDF and upload to Supabase Storage ──
    const targetSub = nextSubmissions.find(s => s.id === submissionId);
    if (targetSub && targetSub.attachments && targetSub.attachments.length > 0) {
      const attach = targetSub.attachments[0];
      // Use the original attachment URL for regeneration (not an already-adjusted one)
      const sourceUrl = targetSub.originalAttachmentUrl || attach.url;
      const toastId = toast.loading('กำลังสร้างเอกสารใหม่พร้อมลายเซ็นที่ปรับตำแหน่งแล้ว...');
      try {
        const pdfBlob = await generateAdjustedPDFBlob(targetSub, sourceUrl, attach.name);

        // Upload to Supabase Storage if configured
        const activeStorage = supabaseStorage || supabase;
        if (isSupabaseConfigured && activeStorage) {
          const storagePath = `submissions/${submissionId}/adjusted_${Date.now()}.pdf`;
          const { error: uploadError } = await activeStorage.storage
            .from('attachments')
            .upload(storagePath, pdfBlob, {
              contentType: 'application/pdf',
              upsert: true,
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            toast.error('อัปโหลดเอกสารที่ปรับแก้ไม่สำเร็จ', { id: toastId });
            return;
          }

          // Get public URL
          const { data: urlData } = activeStorage.storage
            .from('attachments')
            .getPublicUrl(storagePath);

          const newUrl = urlData.publicUrl + `?t=${Date.now()}`;

          // Update the attachment URL in submission state
          const updatedAttachments = [{ ...attach, url: newUrl, name: attach.name.replace(/\.[^.]+$/, '.pdf'), type: 'pdf' as const }, ...targetSub.attachments.slice(1)];

          setSubmissions(prev => prev.map(s =>
            s.id === submissionId
              ? { ...s, attachments: updatedAttachments, updatedAt: new Date().toISOString() }
              : s
          ));

          await dbUpdate(submissionId, { attachments: updatedAttachments });
          toast.success('สร้างเอกสารใหม่และอัปโหลดเรียบร้อยแล้ว', { id: toastId });
        } else {
          // No Supabase — create blob URL for local preview
          const blobUrl = URL.createObjectURL(pdfBlob);
          const updatedAttachments = [{ ...attach, url: blobUrl, name: attach.name.replace(/\.[^.]+$/, '.pdf'), type: 'pdf' as const }, ...targetSub.attachments.slice(1)];

          setSubmissions(prev => prev.map(s =>
            s.id === submissionId
              ? { ...s, attachments: updatedAttachments, updatedAt: new Date().toISOString() }
              : s
          ));
          toast.success('สร้างเอกสารใหม่เรียบร้อยแล้ว (โหมดทดสอบ)', { id: toastId });
        }
      } catch (err) {
        console.error('Failed to generate adjusted PDF:', err);
        toast.error('ไม่สามารถสร้างเอกสารที่ปรับแก้ได้', { id: toastId });
      }
    }
  }, [submissions]);

  const getSubmissionById = useCallback((id: string) =>
    submissions.find(s => s.id === id), [submissions]
  );

  return (
    <SubmissionsContext.Provider value={{
      submissions, addSubmission, updateSubmission,
      approveStep, rejectStep,
      adminReceive, adminForward, adminRejectFinal, adminReturnToTeacher, adminClose, adminEditFormData, adminSetDeadline,
      studentResubmit,
      updateSignaturePositions,
      getSubmissionById,
    }}>
      {children}
    </SubmissionsContext.Provider>
  );
}

export function useSubmissions() {
  const ctx = useContext(SubmissionsContext);
  if (!ctx) throw new Error('useSubmissions must be inside SubmissionsProvider');
  return ctx;
}