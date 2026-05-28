import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { formTemplates, FormTemplate, mockStudents, Submission, ApprovalStep, Attachment } from '../../data/mockData';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  ChevronRight, ChevronLeft, Check, FileText, Upload,
  AlertCircle, Paperclip, X, Search, Save, Trash2,
  Download, ChevronDown, ChevronUp, BookOpen
} from 'lucide-react';
import { toast } from 'sonner';

interface LibraryForm {
  id: string;
  name: string;
  description?: string;
  category?: string;
  file_url?: string;
  file_name?: string;
  required_docs?: string[];
  workflow_steps?: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  registration: 'ลงทะเบียน', exam: 'การสอบ', finance: 'การเงิน',
  leave: 'การลา', general: 'ทั่วไป', academic: 'วิชาการ',
};

const FORM_INSTRUCTIONS: Record<string, string[]> = {
  'KU1-Registration-Form.pdf': ['กรอกรายวิชาที่ต้องการลงทะเบียน', 'ลายเซ็นอาจารย์ที่ปรึกษา', 'ยื่นที่สำนักงานคณะ'],
  'KU3-Add-Drop-Form.pdf': ['กรอกรายวิชาที่ต้องการเพิ่มหรือถอน', 'ระบุเหตุผล', 'รอการอนุมัติจากอาจารย์และคณะ'],
  'course_registration.pdf': ['กรอกรายวิชา', 'แนบหลักฐานประกอบ', 'ส่งภายในระยะเวลาที่กำหนด'],
  'exam_deferment.pdf': ['กรอกชื่อวิชาและวันที่สอบ', 'ระบุเหตุผลการเลื่อนสอบ', 'แนบเอกสารหลักฐาน เช่น ใบรับรองแพทย์', 'ยื่นก่อนวันสอบอย่างน้อย 3 วัน'],
  'faculty_general_request.pdf': ['กรอกชื่อ รหัสนิสิต', 'ระบุเรื่องที่ต้องการร้องขอ', 'แนบหลักฐานที่เกี่ยวข้อง'],
  'leave_of_absence.pdf': ['กรอกระยะเวลาที่ต้องการลาพัก', 'ระบุเหตุผล', 'แนบเอกสารประกอบ', 'รอการอนุมัติ 7-14 วันทำการ'],
  'resignation.pdf': ['กรอกข้อมูลส่วนตัวให้ครบถ้วน', 'ระบุวันที่ต้องการลาออก', 'นัดพบอาจารย์ที่ปรึกษาก่อนยื่น', 'คืนบัตรนิสิตและหลักฐานต่างๆ'],
  'tuition_fee_deferment.pdf': ['กรอกจำนวนเงินและงวดที่ต้องการผ่อน', 'แนบหลักฐานทางการเงิน', 'รอการพิจารณาจากฝ่ายการเงิน'],
};

function FormDownloadSection() {
  const [forms, setForms] = useState<LibraryForm[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.from('forms_library').select('id,name,description,category,file_url,file_name,required_docs')
      .eq('is_active', true).order('category')
      .then(({ data }) => { if (data) setForms(data); });
  }, []);

  if (forms.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 hover:bg-blue-100 transition-all"
      >
        <span className="flex items-center gap-2 font-medium">
          <BookOpen size={16} className="text-blue-600" />
          ดาวน์โหลดแบบฟอร์ม ({forms.length} รายการ)
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="mt-2 bg-white border border-blue-100 rounded-xl overflow-hidden">
          <div className="p-3 bg-blue-50 border-b border-blue-100">
            <p className="text-xs text-blue-600">📥 ดาวน์โหลดแบบฟอร์ม กรอก พิมพ์ แล้วแนบมาพร้อมคำร้อง</p>
          </div>
          <div className="divide-y divide-gray-100">
            {forms.map(form => (
              <div key={form.id}>
                <div className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{form.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(form.category ? CATEGORY_LABELS[form.category] : '') || form.category}
                      {form.description && ` — ${form.description}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setExpandedForm(expandedForm === form.id ? null : form.id)}
                      className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1"
                    >
                      <BookOpen size={11} /> วิธีใช้
                    </button>
                    <a
                      href={form.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                    >
                      <Download size={12} /> ดาวน์โหลด
                    </a>
                  </div>
                </div>
                {expandedForm === form.id && (
                  <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-600 mt-2 mb-1">วิธีการใช้งาน:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {((form.file_name ? FORM_INSTRUCTIONS[form.file_name] : undefined) || ['ดาวน์โหลดและกรอกข้อมูลให้ครบถ้วน', 'แนบมาพร้อมกับการยื่นคำร้องออนไลน์']).map((step: string, i: number) => (
                        <li key={i} className="text-xs text-gray-600">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Real File Upload ─────────────────────────────────────────
async function uploadFileToSupabase(file: File): Promise<{ url: string; name: string; size: string }> {
  if (!isSupabaseConfigured || !supabase) {
    // fallback: object URL (local only)
    return { url: URL.createObjectURL(file), name: file.name, size: formatFileSize(file.size) };
  }
  const filePath = `submissions/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from('attachments').upload(filePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
  return { url: urlData.publicUrl, name: file.name, size: formatFileSize(file.size) };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const steps = ['เลือกแบบฟอร์ม', 'กรอกข้อมูล', 'แนบเอกสาร', 'ตรวจสอบและส่ง'];

const categoryLabels: Record<string, string> = {
  academic: 'วิชาการ',
  financial: 'การเงิน',
  administrative: 'บริหาร',
};

const categoryColors: Record<string, string> = {
  academic: 'bg-blue-100 text-blue-700',
  financial: 'bg-yellow-100 text-yellow-700',
  administrative: 'bg-purple-100 text-purple-700',
};

// Draft storage key per user
const getDraftKey = (userId: string) => `ku_paper_draft_${userId}`;

interface DraftData {
  formId: string;
  formData: Record<string, string>;
  attachments: Attachment[];
  savedAt: string;
}

export function SubmitForm() {
  const { currentUser } = useAuth();
  const { addSubmission } = useSubmissions();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedForm, setSelectedForm] = useState<FormTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftInfo, setDraftInfo] = useState<DraftData | null>(null);
  const [libraryForms, setLibraryForms] = useState<LibraryForm[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [advisorList, setAdvisorList] = useState<{
    id: string;
    name: string;
    department?: string;
    isAdvisor?: boolean;
    isDepartmentHead?: boolean;
    isDean?: boolean;
  }[]>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState('');
  const [isLoadingAdvisors, setIsLoadingAdvisors] = useState(true);

  // โหลดรายชื่ออาจารย์ที่ปรึกษาจาก Supabase พร้อมบทบาทหน้าที่
  // Fallback: ถ้าไม่พบอาจารย์ที่ is_advisor=true ให้โหลดอาจารย์ทั้งหมดแทน
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setIsLoadingAdvisors(false); return; }
    supabase.from('teachers').select('user_id,is_advisor,is_department_head,is_dean,users!inner(id,name,department)')
      .eq('is_advisor', true)
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          setAdvisorList((data as any[]).map(r => ({
            id: r.users.id,
            name: r.users.name,
            department: r.users.department,
            isAdvisor: r.is_advisor,
            isDepartmentHead: r.is_department_head,
            isDean: r.is_dean,
          })));
        } else {
          // ไม่มีอาจารย์ที่ตั้งค่า is_advisor=true → ดึงอาจารย์ทุกคนเป็น fallback
          const { data: all } = await supabase!
            .from('teachers').select('user_id,is_advisor,is_department_head,is_dean,users!inner(id,name,department)');
          if (all && all.length > 0) {
            setAdvisorList((all as any[]).map(r => ({
              id: r.users.id,
              name: r.users.name,
              department: r.users.department,
              isAdvisor: r.is_advisor,
              isDepartmentHead: r.is_department_head,
              isDean: r.is_dean,
            })));
          }
        }
        setIsLoadingAdvisors(false);
      });
  }, []);

  // โหลด required_docs และ workflow_steps จาก library
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.from('forms_library').select('id,name,file_name,required_docs,workflow_steps')
      .eq('is_active', true)
      .then(({ data }) => { if (data) setLibraryForms(data); });
  }, []);

  const student = mockStudents.find(s => s.id === currentUser?.id);

  // ── ตรวจสอบ Draft เมื่อโหลดหน้า
  useEffect(() => {
    if (!currentUser) return;
    const raw = localStorage.getItem(getDraftKey(currentUser.id));
    if (raw) {
      try {
        const draft: DraftData = JSON.parse(raw);
        setDraftInfo(draft);
        setHasDraft(true);
      } catch { localStorage.removeItem(getDraftKey(currentUser.id!)); }
    }
  }, [currentUser]);

  // ── บันทึกร่าง
  const handleSaveDraft = () => {
    if (!currentUser || !selectedForm) {
      toast.error('กรุณาเลือกประเภทคำร้องก่อนบันทึกร่าง');
      return;
    }
    const draft: DraftData = {
      formId: selectedForm.id,
      formData,
      attachments,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getDraftKey(currentUser.id), JSON.stringify(draft));
    setHasDraft(true);
    setDraftInfo(draft);
    toast.success('บันทึกฉบับร่างแล้ว — สามารถกลับมาแก้ไขได้ภายหลัง');
  };

  // ── โหลดร่าง
  const handleLoadDraft = () => {
    if (!draftInfo) return;
    const form = formTemplates.find(f => f.id === draftInfo.formId);
    if (!form) { toast.error('ไม่พบประเภทคำร้องในร่าง'); return; }
    setSelectedForm(form);
    setFormData(draftInfo.formData);
    setAttachments(draftInfo.attachments);
    setHasDraft(false); // ซ่อน banner หลังโหลดแล้ว
    setCurrentStep(1); // ข้ามไปขั้นตอนกรอกข้อมูลเลย
    toast.success(`โหลดร่าง "${form.name}" เรียบร้อยแล้ว`);
  };

  // ── ลบร่าง
  const handleDeleteDraft = () => {
    if (!currentUser) return;
    localStorage.removeItem(getDraftKey(currentUser.id));
    setHasDraft(false);
    setDraftInfo(null);
    toast.info('ลบฉบับร่างแล้ว');
  };

  const filteredForms = formTemplates.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = filterCategory === 'all' || f.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const validateStep1 = () => selectedForm !== null;

  const validateStep2 = () => {
    if (!selectedForm) return false;
    const newErrors: Record<string, string> = {};
    selectedForm.fields.forEach(field => {
      if (field.required && !formData[field.id]?.trim()) {
        newErrors[field.id] = `กรุณากรอก${field.label}`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 0 && !validateStep1()) {
      toast.error('กรุณาเลือกแบบฟอร์ม');
      return;
    }
    if (currentStep === 1 && !validateStep2()) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    if (currentStep === 2 && attachments.length === 0) {
      toast.error('กรุณาแนบเอกสารหลักฐานอย่างน้อย 1 ไฟล์');
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => setCurrentStep(prev => prev - 1);

  const handleFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) setErrors(prev => ({ ...prev, [fieldId]: '' }));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} เกิน 20MB`); continue; }
        const isImage = file.type.startsWith('image/');
        const isPdf = file.type === 'application/pdf';
        if (!isPdf && !isImage) { toast.error(`${file.name} ไม่รองรับ`); continue; }

        const { url, name, size } = await uploadFileToSupabase(file);
        const att: Attachment = { name, url, type: isPdf ? 'pdf' : 'image', size };
        setAttachments(prev => [...prev, att]);
        toast.success(`เพิ่ม ${name} สำเร็จ`);
      }
    } catch (err: any) {
      toast.error('อัปโหลดไม่สำเร็จ: ' + (err.message || 'ไม่ทราบสาเหตุ'));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── ฟังก์ชัน normalize string สำหรับ matching ──────────────────
  // ลบ hyphen, space, underscore, dot แล้ว lowercase เพื่อเปรียบเทียบแบบ fuzzy
  const normStr = (s: string) => (s || '').toLowerCase().replace(/[-_\s.]/g, '');

  // หา record จาก forms_library ที่ตรงกับฟอร์มที่นิสิตเลือก
  // strategy 1: file_name ตรงกับ id+'.pdf' (case+hyphen insensitive)
  // strategy 2: file_name มี id เป็น substring (KU1-Registration-Form.pdf contains ku1-registration)
  // strategy 3: file_name มี name เป็น substring
  // strategy 4: name ตรงกัน (exact หรือ normalized)
  const currentFormRecord = selectedForm
    ? libraryForms.find(f => {
        const fn = normStr(f.file_name || '');
        const fn2 = normStr(f.name || '');
        const sid = normStr(selectedForm.id);
        const sname = normStr(selectedForm.name);
        return fn === normStr(selectedForm.id + '.pdf')   // exact file_name match (normalized)
          || fn === normStr(selectedForm.name + '.pdf')   // exact name+pdf match
          || fn.includes(sid)                              // file_name contains id (e.g. ku1registration inside ku1registrationformpdf)
          || fn.includes(sname)                            // file_name contains name
          || fn2 === sname                                 // DB name matches template name (normalized)
          || f.name === selectedForm.name;                 // exact DB name match
      })
    : null;

  const selectedRequiredDocs: string[] = currentFormRecord?.required_docs || [];

  const displayApprovalLevels = (currentFormRecord?.workflow_steps && Array.isArray(currentFormRecord.workflow_steps) && currentFormRecord.workflow_steps.length > 0)
    ? currentFormRecord.workflow_steps.map((stepType, index) => {
        let role = 'ระดับที่ ' + (index + 1);
        if (stepType === 'advisor') role = 'อาจารย์ที่ปรึกษา';
        else if (stepType === 'department_head' || stepType === 'head') role = 'หัวหน้าภาควิชา';
        else if (stepType === 'dean') role = 'คณบดีหรือผู้แทน';
        return { level: index + 1, role };
      })
    : (selectedForm?.approvalLevels || []);

  const handleSubmit = async () => {
    if (!selectedForm || !currentUser) return;

    if (attachments.length === 0) {
      toast.error('กรุณาแนบเอกสารหลักฐานอย่างน้อย 1 ไฟล์');
      return;
    }

    // Check if advisor selection is required but not selected
    const hasAdvisorStep = displayApprovalLevels.some(l => l.role === 'อาจารย์ที่ปรึกษา');
    if (hasAdvisorStep && !selectedAdvisorId && advisorList.length > 0) {
      toast.error('กรุณาเลือกอาจารย์ที่ปรึกษาก่อนยื่นคำร้อง');
      return;
    }

    setIsSubmitting(true);

    // ── ดึงอาจารย์จาก Supabase ตาม department ของนิสิต ──
    let approvalSteps: ApprovalStep[] = [];
    const dept = (currentUser as any)?.department;

    if (isSupabaseConfigured && supabase && dept) {
      // ถ้านิสิตเลือกอาจารย์ที่ปรึกษาเอง ใช้ตัวนั้น
      // มิฉะนั้น ใช้อาจารย์แรกจาก advisorList ที่โหลดไว้แล้ว (รองรับกรณีไม่มี is_advisor=true)
      let advisorId: string | undefined;
      let advisorName: string | undefined;
      if (selectedAdvisorId) {
        const picked = advisorList.find(a => a.id === selectedAdvisorId);
        advisorId = picked?.id;
        advisorName = picked?.name;
      } else {
        // Fallback: หาจาก advisorList ที่โหลดมาแล้ว (กรองตาม dept ก่อน ถ้าไม่มีก็ใช้อันแรก)
        const deptMatch = advisorList.find(a => a.department && (
          a.department.trim() === dept.trim() ||
          a.department.trim().includes(dept.trim()) ||
          dept.trim().includes(a.department.trim())
        ));
        const fallback = deptMatch || advisorList[0];
        advisorId = fallback?.id;
        advisorName = fallback?.name;
      }

      // ดึง dept head ของภาคนิสิต
      const { data: deptHeads } = await supabase
        .from('teachers').select('user_id,users!inner(id,name,email)')
        .eq('is_department_head', true)
        .eq('users.department', dept).limit(1);

      // ดึง dean (คณบดี — ไม่จำกัด dept)
      const { data: deans } = await supabase
        .from('teachers').select('user_id,users!inner(id,name,email)')
        .eq('is_dean', true);

      const defaultDean = deans?.find(d => (d.users as any)?.name?.includes('ตุลวิทย์')) || deans?.[0];
      const deanId = (defaultDean as any)?.users?.id;
      const deanName = (defaultDean as any)?.users?.name;

      // ตรวจสอบ Workflow Steps จากฟอร์มที่เลือก
      // (ดึงจาก forms_library โดยจับคู่ชื่อฟอร์ม หรือใช้ default)
      const configuredSteps = (currentFormRecord?.workflow_steps && currentFormRecord.workflow_steps.length > 0)
        ? currentFormRecord.workflow_steps
        : ['advisor', 'department_head', 'dean'];

      // ตรวจสอบว่าหาอาจารย์ที่ปรึกษาได้ไหม (เฉพาะกรณีที่ workflow ต้องการ advisor)
      if (configuredSteps.includes('advisor') && !advisorId) {
        toast.error('ไม่พบอาจารย์ที่ปรึกษาสำหรับภาควิชาของคุณ กรุณาติดต่อสำนักงานคณะ');
        setIsSubmitting(false);
        return;
      }

      let stepLevel = 1;
      approvalSteps = [];

      configuredSteps.forEach(stepType => {
        if (stepType === 'advisor') {
          approvalSteps.push({
            level: stepLevel++,
            roleName: 'อาจารย์ที่ปรึกษา',
            approverId: advisorId,
            approverName: advisorName,
            status: 'pending',
          });
        } else if (stepType === 'department_head' || stepType === 'head') {
          approvalSteps.push({
            level: stepLevel++,
            roleName: 'หัวหน้าภาควิชา',
            approverId: (deptHeads?.[0] as any)?.users?.id,
            approverName: (deptHeads?.[0] as any)?.users?.name,
            status: 'pending',
          });
        } else if (stepType === 'dean') {
          approvalSteps.push({
            level: stepLevel++,
            roleName: 'คณบดี/ผู้แทน',
            approverId: deanId,
            approverName: deanName,
            status: 'pending',
          });
        }
      });

      // ถ้าไม่มี step ไหนเลย ให้สร้างขั้นตอนเดียวเป็น Admin (หรือเว้นว่างไว้เพื่อเข้ากระบวนการแอดมินปิดงาน)
      if (approvalSteps.length === 0) {
        approvalSteps = [];
      }
    } else {
      // Fallback: ใช้ approvalLevels จาก template
      approvalSteps = selectedForm.approvalLevels.map(lvl => ({
        level: lvl.level,
        roleName: lvl.role,
        status: 'pending' as const,
      }));
    }

    // ── คำนวณ semester/academicYear ปัจจุบัน ──
    const now2 = new Date();
    const thaiYear = String(now2.getFullYear() + 543);
    const month = now2.getMonth() + 1; // 1-12
    const semester = (month >= 6 && month <= 10) ? '1' : month >= 11 ? '2' : '2';

    const newSub: Submission = {
      id: crypto.randomUUID(),
      formType: selectedForm.id,
      formName: selectedForm.name,
      studentId: currentUser.id,
      studentName: currentUser.name,
      studentEmail: currentUser.email,
      department: dept || '',
      faculty: (currentUser as any)?.faculty || 'คณะสิ่งแวดล้อม',
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvalSteps,
      currentApprovalLevel: 1,
      formData,
      semester,
      academicYear: thaiYear,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    addSubmission(newSub);
    localStorage.removeItem(getDraftKey(currentUser.id));
    setIsSubmitting(false);
    toast.success('ยื่นคำร้องเรียบร้อยแล้ว!');
    navigate('/student/track');
  };


  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-green-800 text-xl mb-1">ยื่นคำร้อง</h2>
        <p className="text-gray-500 text-sm">กรอกและส่งคำร้องออนไลน์</p>
      </div>

      {/* Form Download Section */}
      <FormDownloadSection />

      {/* Draft Banner */}
      {hasDraft && draftInfo && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <Save size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">พบฉบับร่างที่บันทึกไว้</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {formTemplates.find(f => f.id === draftInfo.formId)?.name || 'คำร้อง'}
              {' — บันทึกเมื่อ '}{new Date(draftInfo.savedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={handleLoadDraft} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs transition-all">
              โหลดร่าง
            </button>
            <button onClick={handleDeleteDraft} className="px-3 py-1.5 text-amber-700 hover:bg-amber-100 rounded-lg text-xs transition-all flex items-center gap-1">
              <Trash2 size={12} /> ลบ
            </button>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 mb-6">
        <div className="flex items-center">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-all ${
                    i < currentStep
                      ? 'bg-green-600 text-white'
                      : i === currentStep
                      ? 'bg-green-600 text-white ring-4 ring-green-100'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {i < currentStep ? <Check size={14} /> : i + 1}
                </div>
                <p className={`text-xs mt-1 text-center hidden sm:block ${i === currentStep ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                  {step}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 sm:mb-0 ${i < currentStep ? 'bg-green-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border border-green-100 shadow-sm">

        {/* Step 0: Select form */}
        {currentStep === 0 && (
          <div className="p-5">
            <h3 className="text-green-800 mb-4">เลือกประเภทคำร้อง</h3>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาแบบฟอร์ม..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {['all', 'academic', 'financial', 'administrative'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                      filterCategory === cat ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat === 'all' ? 'ทั้งหมด' : categoryLabels[cat]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filteredForms.map(form => (
                <button
                  key={form.id}
                  onClick={() => {
                    setSelectedForm(form);
                    setFormData({});
                    setErrors({});
                  }}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selectedForm?.id === form.id
                      ? 'border-green-500 bg-green-50 shadow-sm'
                      : 'border-gray-100 hover:border-green-200 hover:bg-green-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg ${form.iconBg} flex items-center justify-center shrink-0`}>
                      <FileText size={18} className={form.colorClass} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm text-gray-800 font-medium leading-tight">{form.name}</p>
                        {selectedForm?.id === form.id && (
                          <Check size={14} className="text-green-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{form.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[form.category]}`}>
                          {categoryLabels[form.category]}
                        </span>
                        <span className="text-xs text-gray-400">~{form.estimatedDays} วัน</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Fill form */}
        {currentStep === 1 && selectedForm && (
          <div className="p-5">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
              <div className={`w-10 h-10 rounded-lg ${selectedForm.iconBg} flex items-center justify-center`}>
                <FileText size={18} className={selectedForm.colorClass} />
              </div>
              <div>
                <h3 className="text-green-800 text-base">{selectedForm.name}</h3>
                <p className="text-gray-500 text-xs">{selectedForm.nameEn}</p>
              </div>
            </div>

            {/* Auto-filled student info */}
            {student && (
              <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-100">
                <p className="text-xs text-green-700 font-medium mb-2">ข้อมูลนิสิต (กรอกอัตโนมัติ)</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <span>ชื่อ: {student.name}</span>
                  <span>รหัส: {student.studentId}</span>
                  <span>ภาควิชา: {student.department}</span>
                  <span>ระดับ: {student.level}</span>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {selectedForm.fields.map(field => (
                <div key={field.id}>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={formData[field.id] || ''}
                      onChange={e => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-100 focus:border-green-400 resize-none transition-all ${errors[field.id] ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={formData[field.id] || ''}
                      onChange={e => handleFieldChange(field.id, e.target.value)}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-100 focus:border-green-400 transition-all ${errors[field.id] ? 'border-red-300' : 'border-gray-200'}`}
                    >
                      <option value="">-- เลือก --</option>
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.id] || ''}
                      onChange={e => handleFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-100 focus:border-green-400 transition-all ${errors[field.id] ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  )}
                  {errors[field.id] && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> {errors[field.id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Attachments */}
        {currentStep === 2 && (
          <div className="p-5">
            <h3 className="text-green-800 mb-1">แนบเอกสารประกอบ</h3>
            <p className="text-gray-500 text-sm mb-4">แนบเอกสารหลักฐานประกอบคำร้อง (PDF, JPG, PNG, สูงสุด 20MB/ไฟล์)</p>

            {/* Required Docs hint */}
            {selectedRequiredDocs.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                  <Paperclip size={12} /> เอกสารที่ต้องแนบมาด้วย:
                </p>
                <ul className="space-y-1">
                  {selectedRequiredDocs.map((doc, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-amber-800">
                      <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-medium shrink-0">{i + 1}</span>
                      {doc}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Upload area */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelected}
              className="hidden"
            />
            <div
              onClick={() => !uploadingFile && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all mb-4 ${
                uploadingFile ? 'border-green-300 bg-green-50 cursor-wait' : 'border-green-200 cursor-pointer hover:border-green-400 hover:bg-green-50'
              }`}
            >
              {uploadingFile ? (
                <>
                  <div className="w-8 h-8 border-3 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-green-600">กำลังอัปโหลด...</p>
                </>
              ) : (
                <>
                  <Upload size={32} className="mx-auto text-green-400 mb-3" />
                  <p className="text-sm text-gray-600 mb-1">คลิกเพื่ออัปโหลดไฟล์</p>
                  <p className="text-xs text-gray-400">รองรับ PDF, JPG, PNG (สูงสุด 20MB/ไฟล์)</p>
                </>
              )}
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((file, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <Paperclip size={16} className="text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{file.size}</p>
                    </div>
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-600 shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-amber-600 py-4 font-medium flex items-center justify-center gap-1.5 bg-amber-50 rounded-lg border border-amber-100">
                <AlertCircle size={16} className="shrink-0" /> ยังไม่มีเอกสารแนบ (จำเป็นต้องแนบอย่างน้อย 1 ไฟล์)
              </p>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {currentStep === 3 && selectedForm && (
          <div className="p-5">
            <h3 className="text-green-800 mb-4">ตรวจสอบข้อมูลก่อนส่ง</h3>

            <div className="space-y-4">
              {/* Form info */}
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-xs text-green-600 font-medium mb-2">ประเภทคำร้อง</p>
                <p className="text-sm text-green-800 font-medium">{selectedForm.name}</p>
                <p className="text-xs text-gray-500 mt-1">เวลาดำเนินการโดยประมาณ: {selectedForm.estimatedDays} วันทำการ</p>
              </div>

              {/* Form data */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-600 font-medium mb-3">ข้อมูลที่กรอก</p>
                <div className="space-y-2">
                  {selectedForm.fields.map(field => (
                    <div key={field.id} className="flex gap-3">
                      <span className="text-xs text-gray-500 w-40 shrink-0">{field.label}:</span>
                      <span className="text-xs text-gray-800">{formData[field.id] || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Approval path */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-600 font-medium mb-3">เส้นทางการอนุมัติ</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {displayApprovalLevels.map((lvl, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200">
                        <div className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs">{lvl.level}</div>
                        <span className="text-xs text-gray-700">{lvl.role}</span>
                      </div>
                      {i < displayApprovalLevels.length - 1 && (
                        <ChevronRight size={14} className="text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Advisor picker — filter ตาม dept ที่นิสิตเลือกตอน login */}
              {displayApprovalLevels.some(l => l.role === 'อาจารย์ที่ปรึกษา') && (() => {
                const studentDept = (currentUser as any)?.department || '';
                // ใช้ partial match เผื่อชื่อภาคใน DB กับ LoginPage ไม่ตรงทั้งหมด
                const deptAdvisors = advisorList.filter(a => {
                  if (!a.department || !studentDept) return false;
                  const d1 = a.department.trim();
                  const d2 = studentDept.trim();
                  return d1 === d2 || d1.includes(d2) || d2.includes(d1);
                });
                const displayList = deptAdvisors.length > 0 ? deptAdvisors : advisorList;
                const isFallback = deptAdvisors.length === 0 && advisorList.length > 0;
                return (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs text-blue-700 font-semibold mb-1 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shrink-0">1</span>
                      เลือกอาจารย์ที่ปรึกษาของคุณ <span className="text-red-500">*</span>
                    </p>
                    <p className="text-xs text-blue-500 mb-2">
                      {studentDept ? (
                        <>แสดงอาจารย์จาก <strong>{studentDept}</strong>{isFallback ? ' (ไม่พบอาจารย์ในภาคนี้ — แสดงอาจารย์ทั้งคณะ)' : ` (${displayList.length} คน)`}</>
                      ) : 'คำร้องจะถูกส่งให้อาจารย์ที่ปรึกษาพิจารณาเป็นลำดับแรก'}
                    </p>
                    {isLoadingAdvisors ? (
                      <p className="text-xs text-blue-400 animate-pulse">⏳ กำลังโหลดรายชื่ออาจารย์...</p>
                    ) : displayList.length > 0 ? (
                      <select
                        value={selectedAdvisorId}
                        onChange={e => setSelectedAdvisorId(e.target.value)}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
                      >
                        <option value="">— เลือกอาจารย์ที่ปรึกษา —</option>
                        {displayList.map(a => {
                          const roles: string[] = [];
                          if (a.isDean) roles.push('คณบดี');
                          if (a.isDepartmentHead) roles.push('หัวหน้าภาควิชา');
                          if (a.isAdvisor) roles.push('อาจารย์ที่ปรึกษา');
                          const roleText = roles.length > 0 ? ` (${roles.join('/')})` : '';
                          return (
                            <option key={a.id} value={a.id}>
                              {a.name}{roleText}{a.department ? ` — ${a.department}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <p className="text-xs text-red-600 font-medium">⚠ ไม่พบข้อมูลอาจารย์ในระบบ</p>
                        <p className="text-xs text-red-400 mt-0.5">กรุณาติดต่อสำนักงานคณะเพื่อให้เจ้าหน้าที่กำหนดอาจารย์ที่ปรึกษา</p>
                      </div>
                    )}
                    {!selectedAdvisorId && displayList.length > 0 && !isLoadingAdvisors && (
                      <p className="text-xs text-orange-500 mt-1">⚠ กรุณาเลือกอาจารย์ที่ปรึกษาก่อนยื่นคำร้อง</p>
                    )}
                  </div>
                );
              })()}

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-600 font-medium mb-2">เอกสารแนบ ({attachments.length} ไฟล์)</p>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-white px-2 py-1 rounded border border-gray-200">
                        <Paperclip size={10} className="text-green-600" /> {file.name}
                        <span className="text-gray-400">({file.size})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={16} /> ย้อนกลับ
          </button>

          <div className="flex items-center gap-2">
            {/* ปุ่มบันทึกร่าง — แสดงเมื่อเลือกฟอร์มแล้ว (ขั้นตอน 1 ขึ้นไป) */}
            {currentStep >= 1 && (
              <button
                onClick={handleSaveDraft}
                className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg text-sm transition-all"
              >
                <Save size={15} /> บันทึกร่าง
              </button>
            )}

            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-all"
              >
                ถัดไป <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm transition-all"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check size={16} /> ยืนยันส่งคำร้อง
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
