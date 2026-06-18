export type UserRole = 'student' | 'teacher' | 'admin';
export type FormTypeId =
  | 'registration-request'
  | 'fee-deferment'
  | 'exam-postponement'
  | 'general-request'
  | 'ku1-registration'
  | 'ku3-add-drop'
  | 'resignation'
  | 'leave-absence';

export type SubmissionStatus =
  | 'draft'
  | 'submitted'          // นิสิตยื่น รอ Admin รับ
  | 'admin_reviewing'    // Admin กำลังตรวจ
  | 'in-review'          // อยู่ในสายอาจารย์
  | 'teacher_rejected'   // อาจารย์ reject รอ Admin ตัดสิน
  | 'pending_close'      // ผ่านครบ รอ Admin ปิดงาน
  | 'approved'
  | 'rejected';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'forwarded';

export interface Student {
  id: string;
  name: string;
  email: string;
  role: 'student';
  studentId: string;
  department: string;
  faculty: string;
  level: string;
  year: number;
  phone: string;
  academicYear: string;
  advisorId: string;
  campus?: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  role: 'teacher';
  department: string;
  faculty: string;
  position: string;
  isAdvisor?: boolean;
  isDepartmentHead?: boolean;
  isDean?: boolean;
  signatureData?: string;
  campus?: string;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  campus?: string;
  department?: string;
}

export type User = Student | Teacher | Admin;

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface FormTemplate {
  id: FormTypeId;
  name: string;
  nameEn: string;
  description: string;
  category: 'academic' | 'financial' | 'administrative';
  estimatedDays: number;
  approvalLevels: { level: number; role: string }[];
  fields: FormField[];
  colorClass: string;
  bgClass: string;
  iconBg: string;
  campus?: string;
  degree_level?: string;
}

export interface ApprovalStep {
  level: number;
  roleName: string;
  approverId?: string;
  approverName?: string;
  status: ApprovalStatus;
  comment?: string;
  timestamp?: string;
  signatureData?: string;
  signatureX?: number;  // % จากซ้าย (0-100) — ตำแหน่งแรก
  signatureY?: number;  // % จากบน (0-100) — ตำแหน่งแรก
  signatureSize?: number; // % ขนาดของลายเซ็น
  extraSignaturePositions?: Array<{ x: number; y: number }>; // ตำแหน่งลายเซ็นเพิ่มเติม (เช่น ลงนาม 2 จุด)
  textBlock?: string;   // ข้อความเพิ่มเติมบนเอกสาร (อันแรก)
  textBlockX?: number;  // % จากซ้าย (0-100)
  textBlockY?: number;  // % จากบน (0-100)
  textBlockSize?: number; // ขนาดฟอนต์ (px)
  extraTextBlocks?: Array<{ val: string; x: number; y: number; size: number }>; // กล่องข้อความเพิ่มเติม
  // Date block fields
  dateBlock?: string;
  dateX?: number;
  dateY?: number;
  dateSize?: number;    // ขนาดฟอนต์วันที่ (px) — ค่าเริ่มต้น 11
  // Checkmark fields
  checkmarkBlock?: string;
  checkmarkX?: number;
  checkmarkY?: number;
  checkmarkSize?: number;  // ขนาดเครื่องหมายถูก (px) — ค่าเริ่มต้น 15
  // Substitute / reassign fields
  isSubstitute?: boolean;        // ถูกแต่งตั้งโดย Admin
  previousApproverId?: string;   // approver เดิมก่อนเปลี่ยน
  previousApproverName?: string;
  returnedByAdminAt?: string;    // Admin ส่งกลับเมื่อไหร่
  returnReason?: string;         // เหตุผลที่ Admin ส่งกลับ
  page?: number;                 // หน้าเอกสารที่ลงนาม (1-based)
}

export interface Attachment {
  name: string;
  url: string;
  type: 'pdf' | 'image';
  size: string;
}

export interface Submission {
  id: string;
  formType: FormTypeId;
  formName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  department: string;
  faculty: string;
  studentLevel?: string;   // ระดับการศึกษา: ปริญญาตรี / ปริญญาโท / ปริญญาเอก
  studentYear?: number;    // ชั้นปี
  status: SubmissionStatus;
  submittedAt: string;
  updatedAt: string;
  approvalSteps: ApprovalStep[];
  currentApprovalLevel: number;
  formData: Record<string, string>;
  semester: string;
  academicYear: string;
  attachments?: Attachment[];
  // Admin workflow fields
  adminNote?: string;            // หมายเหตุ Admin
  receivedByAdminAt?: string;    // เวลา Admin รับเรื่อง
  receivedByAdminName?: string;  // ชื่อ Admin ผู้รับ/ส่งเรื่อง
  closedAt?: string;             // เวลา Admin ปิดงาน
  referenceNumber?: string;      // เลขที่ออกตอนปิดงาน
  // Deadline fields
  deadline?: string;             // วันครบกำหนด (ISO)
  deadlineSetBy?: string;        // adminId ที่กำหนด
  deadlineSetAt?: string;
  isExpired?: boolean;
  // Re-submission
  revisionCount?: number;        // แก้ไขกี่ครั้งแล้ว
  previousSubmissionId?: string; // อ้างอิงจาก submission เดิม
  // Security
  signatureHash?: string;        // SHA-256 Digital Signature hash
  // Signature adjustment by Super Admin
  signatureAdjustedAt?: string;       // เวลาที่ Super Admin ปรับลายเซ็น
  signatureAdjustedBy?: string;       // ชื่อ Super Admin ที่ปรับ
  originalAttachmentUrl?: string;     // URL ไฟล์ต้นฉบับของนิสิต (ก่อนปรับ)
}

// ============================================================
// MOCK USERS
// ============================================================
export const mockStudents: Student[] = [
  {
    id: 'std001',
    name: 'นายสมชาย ใจดี',
    email: 'somchai.j@ku.th',
    role: 'student',
    studentId: '6510450001',
    department: 'ภาควิชาวิศวกรรมคอมพิวเตอร์',
    faculty: 'คณะวิศวกรรมศาสตร์',
    level: 'ปริญญาตรี',
    year: 3,
    phone: '081-234-5678',
    academicYear: '2567',
    advisorId: 'tch001',
  },
  {
    id: 'std002',
    name: 'นางสาวมาลี รักเรียน',
    email: 'malee.r@ku.th',
    role: 'student',
    studentId: '6610450012',
    department: 'ภาควิชาวิทยาการคอมพิวเตอร์',
    faculty: 'คณะวิทยาศาสตร์',
    level: 'ปริญญาตรี',
    year: 2,
    phone: '089-876-5432',
    academicYear: '2567',
    advisorId: 'tch004',
  },
  {
    id: 'std003',
    name: 'นายวิชัย เก่งกาจ',
    email: 'wichai.k@ku.th',
    role: 'student',
    studentId: '6720450005',
    department: 'ภาควิชาวิศวกรรมไฟฟ้า',
    faculty: 'คณะวิศวกรรมศาสตร์',
    level: 'ปริญญาโท',
    year: 1,
    phone: '062-345-6789',
    academicYear: '2567',
    advisorId: 'tch001',
  },
];

export const mockTeachers: Teacher[] = [
  {
    id: 'tch001',
    name: 'ผศ.ดร.สมศักดิ์ วิทยาการ',
    email: 'somsak.w@ku.th',
    role: 'teacher',
    department: 'ภาควิชาวิศวกรรมคอมพิวเตอร์',
    faculty: 'คณะวิศวกรรมศาสตร์',
    position: 'ผู้ช่วยศาสตราจารย์',
    isAdvisor: true,
    isDepartmentHead: false,
    isDean: false,
  },
  {
    id: 'tch002',
    name: 'รศ.ดร.ประภา สุขสันต์',
    email: 'prapa.s@ku.th',
    role: 'teacher',
    department: 'ภาควิชาวิศวกรรมคอมพิวเตอร์',
    faculty: 'คณะวิศวกรรมศาสตร์',
    position: 'รองศาสตราจารย์ (หัวหน้าภาควิชา)',
    isAdvisor: false,
    isDepartmentHead: true,
    isDean: false,
  },
  {
    id: 'tch003',
    name: 'ศ.ดร.อานนท์ ชาญชัย',
    email: 'anon.c@ku.th',
    role: 'teacher',
    department: 'คณะวิศวกรรมศาสตร์',
    faculty: 'คณะวิศวกรรมศาสตร์',
    position: 'ศาสตราจารย์ (คณบดี)',
    isAdvisor: false,
    isDepartmentHead: false,
    isDean: true,
  },
  {
    id: 'tch004',
    name: 'ผศ.ดร.นิดา งามเมือง',
    email: 'nida.n@ku.th',
    role: 'teacher',
    department: 'ภาควิชาวิทยาการคอมพิวเตอร์',
    faculty: 'คณะวิทยาศาสตร์',
    position: 'ผู้ช่วยศาสตราจารย์',
    isAdvisor: true,
    isDepartmentHead: false,
    isDean: false,
  },
];

export const mockAdmin: Admin = {
  id: 'adm001',
  name: 'นายเอกชัย จัดการ',
  email: 'eakkachai.j@ku.th',
  role: 'admin',
};

export const mockUsers: User[] = [...mockStudents, ...mockTeachers, mockAdmin];

// ============================================================
// FORM TEMPLATES
// ============================================================
export const formTemplates: FormTemplate[] = [
  {
    id: 'registration-request',
    name: 'คำร้องขอลงทะเบียนเรียน',
    nameEn: 'Course Registration Request',
    description: 'คำร้องสำหรับขอลงทะเบียนรายวิชาในกรณีพิเศษนอกเหนือจากการลงทะเบียนปกติ',
    category: 'academic',
    estimatedDays: 5,
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50',
    iconBg: 'bg-blue-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
      { level: 3, role: 'คณบดีหรือผู้แทน' },
    ],
    fields: [
      { id: 'subject_code', label: 'รหัสวิชา', type: 'text', required: true, placeholder: 'เช่น 01204311' },
      { id: 'subject_name', label: 'ชื่อวิชา', type: 'text', required: true, placeholder: 'ชื่อวิชาภาษาไทย/อังกฤษ' },
      { id: 'section', label: 'กลุ่มเรียน', type: 'number', required: true, placeholder: 'เช่น 1' },
      { id: 'credits', label: 'หน่วยกิต', type: 'number', required: true, placeholder: '3' },
      { id: 'reason', label: 'เหตุผลในการขอ', type: 'textarea', required: true, placeholder: 'อธิบายเหตุผลที่ต้องการขอลงทะเบียน' },
    ],
  },
  {
    id: 'fee-deferment',
    name: 'คำร้องขอผ่อนผันค่าธรรมเนียมการศึกษา',
    nameEn: 'Tuition Fee Deferment Request',
    description: 'คำร้องสำหรับขอผ่อนผันหรือผ่อนชำระค่าธรรมเนียมการศึกษา',
    category: 'financial',
    estimatedDays: 7,
    colorClass: 'text-yellow-600',
    bgClass: 'bg-yellow-50',
    iconBg: 'bg-yellow-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
      { level: 3, role: 'คณบดีหรือผู้แทน' },
    ],
    fields: [
      { id: 'fee_amount', label: 'จำนวนค่าธรรมเนียม (บาท)', type: 'number', required: true, placeholder: 'เช่น 25000' },
      { id: 'deferment_type', label: 'ประเภทการขอผ่อนผัน', type: 'select', required: true, options: ['ขอผ่อนผัน', 'ขอผ่อนชำระ'] },
      { id: 'installments', label: 'จำนวนงวด (กรณีผ่อนชำระ)', type: 'number', required: false, placeholder: 'เช่น 3' },
      { id: 'reason', label: 'เหตุผลและความจำเป็น', type: 'textarea', required: true, placeholder: 'อธิบายสถานการณ์และความจำเป็น' },
      { id: 'supporting_doc', label: 'เอกสารหลักฐานประกอบ', type: 'text', required: false, placeholder: 'ระบุรายการเอกสาร' },
    ],
  },
  {
    id: 'exam-postponement',
    name: 'คำร้องขอเลื่อนสอบ',
    nameEn: 'Exam Postponement Request',
    description: 'คำร้องสำหรับขอเลื่อนการสอบในกรณีมีเหตุจำเป็นเร่งด่วน',
    category: 'academic',
    estimatedDays: 3,
    colorClass: 'text-orange-600',
    bgClass: 'bg-orange-50',
    iconBg: 'bg-orange-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
    ],
    fields: [
      { id: 'subject_code', label: 'รหัสวิชา', type: 'text', required: true, placeholder: 'เช่น 01204321' },
      { id: 'subject_name', label: 'ชื่อวิชา', type: 'text', required: true },
      { id: 'exam_date', label: 'วันสอบเดิม', type: 'date', required: true },
      { id: 'exam_type', label: 'ประเภทการสอบ', type: 'select', required: true, options: ['สอบกลางภาค', 'สอบปลายภาค', 'สอบย่อย'] },
      { id: 'reason', label: 'เหตุผลในการขอเลื่อน', type: 'textarea', required: true, placeholder: 'อธิบายสาเหตุที่ไม่สามารถเข้าสอบได้' },
    ],
  },
  {
    id: 'general-request',
    name: 'แบบฟอร์มคำร้องทั่วไปคณะ',
    nameEn: 'General Faculty Request Form',
    description: 'แบบฟอร์มสำหรับคำร้องทั่วไปที่ไม่เข้าหมวดหมู่เฉพาะ',
    category: 'administrative',
    estimatedDays: 5,
    colorClass: 'text-purple-600',
    bgClass: 'bg-purple-50',
    iconBg: 'bg-purple-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
      { level: 3, role: 'คณบดีหรือผู้แทน' },
    ],
    fields: [
      { id: 'request_topic', label: 'เรื่องที่ขอ', type: 'text', required: true, placeholder: 'ระบุชื่อเรื่องที่ต้องการยื่นคำร้อง' },
      { id: 'request_detail', label: 'รายละเอียดคำร้อง', type: 'textarea', required: true, placeholder: 'อธิบายรายละเอียดคำร้องของคุณ' },
      { id: 'desired_outcome', label: 'ผลที่ต้องการ', type: 'textarea', required: true, placeholder: 'ระบุสิ่งที่ต้องการให้ดำเนินการ' },
    ],
  },
  {
    id: 'ku1-registration',
    name: 'KU1-Registration-Form',
    nameEn: 'KU1 Registration Form',
    description: 'แบบฟอร์มการลงทะเบียนมาตรฐาน KU1 สำหรับการลงทะเบียนเรียนแต่ละภาคการศึกษา',
    category: 'academic',
    estimatedDays: 3,
    colorClass: 'text-green-600',
    bgClass: 'bg-green-50',
    iconBg: 'bg-green-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
    ],
    fields: [
      { id: 'semester', label: 'ภาคการศึกษา', type: 'select', required: true, options: ['ต้น', 'ปลาย', 'ฤดูร้อน'] },
      { id: 'academic_year', label: 'ปีการศึกษา', type: 'text', required: true, placeholder: 'เช่น 2567' },
      { id: 'total_credits', label: 'จำนวนหน่วยกิตรวม', type: 'number', required: true, placeholder: 'รวมหน่วยกิตทั้งหมด' },
      { id: 'subject_list', label: 'รายการวิชาที่ลงทะเบียน', type: 'textarea', required: true, placeholder: 'ระบุรหัสวิชา ชื่อวิชา หน่วยกิต (แต่ละบรรทัดหนึ่งวิชา)' },
    ],
  },
  {
    id: 'ku3-add-drop',
    name: 'KU3-Add-Drop-Form',
    nameEn: 'KU3 Add/Drop Form',
    description: 'แบบฟอร์มการเพิ่ม-ถอนรายวิชา KU3 ในระหว่างภาคการศึกษา',
    category: 'academic',
    estimatedDays: 2,
    colorClass: 'text-teal-600',
    bgClass: 'bg-teal-50',
    iconBg: 'bg-teal-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
    ],
    fields: [
      { id: 'action', label: 'ประเภทคำร้อง', type: 'select', required: true, options: ['เพิ่มรายวิชา (Add)', 'ถอนรายวิชา (Drop)'] },
      { id: 'subject_code', label: 'รหัสวิชา', type: 'text', required: true, placeholder: 'เช่น 01204311' },
      { id: 'subject_name', label: 'ชื่อวิชา', type: 'text', required: true },
      { id: 'section', label: 'กลุ่มเรียน', type: 'number', required: true, placeholder: 'เช่น 1' },
      { id: 'credits', label: 'หน่วยกิต', type: 'number', required: true },
      { id: 'reason', label: 'เหตุผล', type: 'textarea', required: false, placeholder: 'ระบุเหตุผล (ถ้ามี)' },
    ],
  },
  {
    id: 'resignation',
    name: 'ใบลาออก',
    nameEn: 'Resignation Form',
    description: 'แบบฟอร์มสำหรับยื่นใบลาออกจากการเป็นนิสิตมหาวิทยาลัย',
    category: 'administrative',
    estimatedDays: 14,
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50',
    iconBg: 'bg-red-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
      { level: 3, role: 'คณบดีหรือผู้แทน' },
    ],
    fields: [
      { id: 'effective_date', label: 'วันที่มีผลลาออก', type: 'date', required: true },
      { id: 'reason', label: 'เหตุผลในการลาออก', type: 'textarea', required: true, placeholder: 'อธิบายเหตุผลที่ต้องการลาออก' },
      { id: 'future_plan', label: 'แผนการในอนาคต', type: 'textarea', required: false, placeholder: 'แผนหลังจากลาออก (ถ้ามี)' },
      { id: 'contact_address', label: 'ที่อยู่ติดต่อหลังลาออก', type: 'textarea', required: true, placeholder: 'ที่อยู่สำหรับติดต่อ' },
      { id: 'phone', label: 'เบอร์โทรติดต่อ', type: 'text', required: true, placeholder: 'เบอร์โทรศัพท์' },
    ],
  },
  {
    id: 'leave-absence',
    name: 'ใบลาพักการศึกษา',
    nameEn: 'Leave of Absence Form',
    description: 'แบบฟอร์มสำหรับขอพักการศึกษาชั่วคราว (1-2 ภาคการศึกษา)',
    category: 'administrative',
    estimatedDays: 7,
    colorClass: 'text-indigo-600',
    bgClass: 'bg-indigo-50',
    iconBg: 'bg-indigo-100',
    approvalLevels: [
      { level: 1, role: 'อาจารย์ที่ปรึกษา' },
      { level: 2, role: 'หัวหน้าภาควิชา' },
      { level: 3, role: 'คณบดีหรือผู้แทน' },
    ],
    fields: [
      { id: 'leave_semester', label: 'ภาคการศึกษาที่ต้องการพัก', type: 'select', required: true, options: ['ต้น', 'ปลาย', 'ฤดูร้อน'] },
      { id: 'leave_year', label: 'ปีการศึกษาที่ต้องการพัก', type: 'text', required: true, placeholder: 'เช่น 2567' },
      { id: 'reason', label: 'เหตุผลในการขอพักการศึกษา', type: 'textarea', required: true, placeholder: 'อธิบายสาเหตุที่ต้องพักการศึกษา' },
      { id: 'return_plan', label: 'แผนการกลับมาศึกษา', type: 'textarea', required: false, placeholder: 'ภาคการศึกษาที่วางแผนจะกลับมาเรียน' },
    ],
  },
];

// ============================================================
// MOCK SUBMISSIONS
// ============================================================
// Sample PDF URLs (public, embeddable)
const SAMPLE_PDFS = {
  medical: { name: 'ใบรับรองแพทย์.pdf', url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF2.pdf', type: 'pdf' as const, size: '245 KB' },
  receipt: { name: 'หลักฐานการชำระเงิน.pdf', url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF6.pdf', type: 'pdf' as const, size: '182 KB' },
  id_card: { name: 'สำเนาบัตรประชาชน.pdf', url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1.pdf', type: 'pdf' as const, size: '156 KB' },
  transcript: { name: 'ใบแสดงผลการศึกษา.pdf', url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF7.pdf', type: 'pdf' as const, size: '312 KB' },
  request_form: { name: 'แบบฟอร์มคำร้อง.pdf', url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF9.pdf', type: 'pdf' as const, size: '198 KB' },
};

export const initialSubmissions: Submission[] = [];

// ============================================================
// LOGIN CREDENTIALS
// ============================================================
export const loginCredentials = [
  { email: 'somchai.j@ku.th', password: 'student123', userId: 'std001' },
  { email: 'malee.r@ku.th', password: 'student123', userId: 'std002' },
  { email: 'wichai.k@ku.th', password: 'student123', userId: 'std003' },
  { email: 'somsak.w@ku.th', password: 'teacher123', userId: 'tch001' },
  { email: 'prapa.s@ku.th', password: 'teacher123', userId: 'tch002' },
  { email: 'anon.c@ku.th', password: 'teacher123', userId: 'tch003' },
  { email: 'nida.n@ku.th', password: 'teacher123', userId: 'tch004' },
  { email: 'eakkachai.j@ku.th', password: 'admin123', userId: 'adm001' },
];

// ============================================================
// HELPERS
// ============================================================
export function getSubmissionsForTeacher(teacherId: string, submissions: Submission[]): Submission[] {
  return submissions.filter(sub => {
    // Only show status 'in-review' — teacher_rejected goes to Admin, not teacher
    if (sub.status !== 'in-review') return false;
    const currentStep = sub.approvalSteps.find(s => s.level === sub.currentApprovalLevel);
    if (!currentStep || currentStep.status !== 'pending') return false;

    // 1) Direct assignment match (Works with real DB UUIDs)
    if (currentStep.approverId === teacherId) return true;

    // 2) Fallback: role-based matching using mockTeachers (For legacy mock data)
    const teacher = mockTeachers.find(t => t.id === teacherId);
    if (!teacher) return false;

    if (sub.currentApprovalLevel === 1 && teacher.isAdvisor) {
      const student = mockStudents.find(s => s.id === sub.studentId);
      return student?.advisorId === teacherId;
    }
    if (sub.currentApprovalLevel === 2 && teacher.isDepartmentHead) {
      const student = mockStudents.find(s => s.id === sub.studentId);
      return student?.faculty === teacher.faculty;
    }
    if (sub.currentApprovalLevel === 3 && teacher.isDean) {
      const student = mockStudents.find(s => s.id === sub.studentId);
      return student?.faculty === teacher.faculty;
    }
    return false;
  });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function getStatusLabel(status: SubmissionStatus): string {
  const map: Record<SubmissionStatus, string> = {
    draft: 'ร่าง',
    submitted: 'รอรับเรื่อง',
    admin_reviewing: 'แอดมินกำลังตรวจสอบ',       // <- เพิ่มตัวนี้
    'in-review': 'อยู่ระหว่างพิจารณา',
    teacher_rejected: 'อาจารย์ปฏิเสธ (รอแอดมิน)',   // <- เพิ่มตัวนี้
    pending_close: 'รอแอดมินปิดงาน',             // <- เพิ่มตัวนี้
    approved: 'อนุมัติแล้ว',
    rejected: 'ไม่อนุมัติ',
  };
  return map[status];
}
