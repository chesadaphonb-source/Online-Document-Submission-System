import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { formatDateTime } from '../../data/mockData';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  FileText, Clock, CheckCircle, XCircle, ArrowRight, Plus,
  Download, BookOpen, ChevronDown, ChevronUp, AlertCircle,
  Send, Search, ClipboardCheck, Loader2
} from 'lucide-react';

interface LibraryForm {
  id: string;
  name: string;
  description: string;
  category: string;
  file_url: string;
  file_name: string;
  required_docs?: string[];
  campus?: string;
}


// ดาวน์โหลดไฟล์พร้อมกำหนดชื่อภาษาไทย
async function handleDownload(url: string, thaiName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('โหลดไฟล์ไม่สำเร็จ');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${thaiName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (e) {
    // Fallback: เปิดใน tab ใหม่ถ้า fetch ล้มเหลว
    window.open(url, '_blank');
  }
}

// (duplicate removed)

const CATEGORY_COLORS: Record<string, string> = {
  registration: 'bg-blue-100 text-blue-700',
  exam: 'bg-purple-100 text-purple-700',
  finance: 'bg-yellow-100 text-yellow-700',
  leave: 'bg-red-100 text-red-700',
  general: 'bg-gray-100 text-gray-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  registration: 'ลงทะเบียน',
  exam: 'การสอบ',
  finance: 'การเงิน',
  leave: 'การลา',
  general: 'ทั่วไป',
};

const PROCESS_STEPS = [
  {
    step: 1,
    title: 'ดาวน์โหลดแบบฟอร์ม',
    desc: 'เลือกแบบฟอร์มที่ต้องการ ดาวน์โหลด พิมพ์ และกรอกข้อมูลให้ครบถ้วน',
    icon: Download,
    color: 'bg-blue-500',
    wait: null,
  },
  {
    step: 2,
    title: 'ยื่นคำร้องออนไลน์',
    desc: 'แนบไฟล์แบบฟอร์มที่กรอกแล้ว พร้อมเอกสารประกอบอื่นๆ ผ่านระบบ',
    icon: Send,
    color: 'bg-green-500',
    wait: null,
  },
  {
    step: 3,
    title: 'รออาจารย์ที่ปรึกษาอนุมัติ',
    desc: 'อาจารย์ที่ปรึกษาจะตรวจสอบและลงนาม',
    icon: BookOpen,
    color: 'bg-orange-400',
    wait: '1-3 วันทำการ',
  },
  {
    step: 4,
    title: 'รอหัวหน้าภาค / คณบดี',
    desc: 'คำร้องที่ผ่านอาจารย์จะส่งต่อให้หัวหน้าภาคหรือคณบดีพิจารณา',
    icon: ClipboardCheck,
    color: 'bg-purple-500',
    wait: '3-7 วันทำการ',
  },
];

const FORM_INSTRUCTIONS: Record<string, string[]> = {
  'KU1-Registration-Form.pdf': ['กรอกรายวิชาที่ต้องการลงทะเบียน', 'ลายเซ็นอาจารย์ที่ปรึกษา', 'ยื่นที่สำนักงานคณะ'],
  'KU3-Add-Drop-Form.pdf': ['กรอกรายวิชาที่ต้องการเพิ่มหรือถอน', 'ระบุเหตุผล', 'รอการอนุมัติจากอาจารย์และคณะ'],
  'course_registration.pdf': ['กรอกรายวิชา', 'แนบหลักฐานประกอบ', 'ส่งภายในระยะเวลาที่กำหนด'],
  'exam_deferment.pdf': ['กรอกชื่อวิชาและวันที่สอบ', 'ระบุเหตุผลการเลื่อนสอบ', 'แนบใบรับรองแพทย์ (ถ้ามี)', 'ยื่นก่อนวันสอบอย่างน้อย 3 วัน'],
  'faculty_general_request.pdf': ['กรอกชื่อ รหัสนิสิต', 'ระบุเรื่องที่ต้องการร้องขอ', 'แนบหลักฐานที่เกี่ยวข้อง'],
  'leave_of_absence.pdf': ['กรอกระยะเวลาที่ต้องการลาพัก', 'ระบุเหตุผล', 'แนบเอกสารประกอบ', 'รอการอนุมัติ 7-14 วันทำการ'],
  'resignation.pdf': ['กรอกข้อมูลส่วนตัวให้ครบถ้วน', 'ระบุวันที่ต้องการลาออก', 'นัดพบอาจารย์ที่ปรึกษาก่อนยื่น'],
  'tuition_fee_deferment.pdf': ['กรอกจำนวนเงินและงวดที่ต้องการผ่อน', 'แนบหลักฐานทางการเงิน', 'รอการพิจารณาจากฝ่ายการเงิน'],
};

export function StudentDashboard() {
  const { currentUser } = useAuth();
  const { submissions } = useSubmissions();
  const navigate = useNavigate();
  const [forms, setForms] = useState<LibraryForm[]>([]);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);
  const [searchForm, setSearchForm] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedCampus, setSelectedCampus] = useState((currentUser as any)?.campus || 'bangkhen');

  const download = async (form: LibraryForm) => {
    setDownloading(form.id);
    await handleDownload(form.file_url, form.name);
    setDownloading(null);
  };

  const mySubmissions = submissions.filter(s => s.studentId === currentUser?.id);
  const stats = {
    total: mySubmissions.length,
    inReview: mySubmissions.filter(s => s.status === 'in-review' || s.status === 'submitted').length,
    approved: mySubmissions.filter(s => s.status === 'approved').length,
    rejected: mySubmissions.filter(s => s.status === 'rejected').length,
  };
  const recent = mySubmissions.slice(0, 3);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.from('forms_library')
      .select('id,name,description,category,file_url,file_name,required_docs,campus')
      .eq('is_active', true)
      .order('category')
      .then(({ data }) => { if (data) setForms(data); });
  }, [currentUser]);

  const filteredForms = forms.filter(f =>
    ((f.campus || 'bangkhen') === selectedCampus) && (
      f.name.toLowerCase().includes(searchForm.toLowerCase()) ||
      (CATEGORY_LABELS[f.category] || '').includes(searchForm)
    )
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1a5c2e] to-green-600 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10">
          <div className="w-48 h-48 rounded-full border-[20px] border-white -translate-y-1/2 translate-x-1/4" />
        </div>
        <div className="relative">
          <p className="text-green-200 text-sm mb-0.5">ยินดีต้อนรับ</p>
          <h1 className="text-white text-xl font-semibold">{currentUser?.name}</h1>
          <p className="text-green-200 text-xs mt-0.5">รหัสนิสิต: {currentUser?.id?.replace('student_', '') || currentUser?.email?.replace('@ku.th', '')}</p>
          {(currentUser as any)?.department && (
            <p className="text-green-100 text-xs mt-0.5 flex items-center gap-1">
              <span className="opacity-70">🏫</span> {(currentUser as any).department}
            </p>
          )}
          <div className="flex gap-3 mt-4">
            <button onClick={() => navigate('/student/submit')}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-all">
              <Plus size={15} /> ยื่นคำร้อง
            </button>
            <button onClick={() => navigate('/student/track')}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-all">
              <Search size={15} /> ติดตามสถานะ
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'ทั้งหมด', value: stats.total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'รอพิจารณา', value: stats.inReview, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'อนุมัติ', value: stats.approved, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'ไม่อนุมัติ', value: stats.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`${s.bg} rounded-xl p-3 text-center`}>
              <Icon size={18} className={`${s.color} mx-auto mb-1`} />
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Process Guide */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-green-50">
          <h2 className="text-green-800 font-semibold text-base">📋 ขั้นตอนการยื่นคำร้อง</h2>
          <p className="text-green-600 text-xs mt-0.5">ทำตามขั้นตอนต่อไปนี้เพื่อยื่นเอกสารให้ถูกต้อง</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PROCESS_STEPS.map((ps, i) => {
              const Icon = ps.icon;
              return (
                <div key={i} className="relative">
                  {i < PROCESS_STEPS.length - 1 && (
                    <div className="hidden lg:block absolute top-5 left-full w-4 h-0.5 bg-gray-200 z-0" />
                  )}
                  <div className="flex flex-col gap-2">
                    <div className={`w-10 h-10 rounded-xl ${ps.color} flex items-center justify-center shrink-0`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{ps.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{ps.desc}</p>
                      {ps.wait && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                          <Clock size={10} /> {ps.wait}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-700 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>ระยะเวลารวมโดยประมาณ <strong>7-14 วันทำการ</strong> ขึ้นอยู่กับประเภทคำร้องและความครบถ้วนของเอกสาร
              กรุณาตรวจสอบสถานะผ่านเมนู "ติดตามสถานะ" เป็นระยะ</span>
            </p>
          </div>
        </div>
      </div>

      {/* Forms Download */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-blue-50 flex items-center justify-between">
          <div>
            <h2 className="text-blue-800 font-semibold text-base">📥 ดาวน์โหลดแบบฟอร์ม</h2>
            <p className="text-blue-600 text-xs mt-0.5">ดาวน์โหลด กรอก พิมพ์ แล้วแนบมาพร้อมการยื่นคำร้อง</p>
          </div>
          <button onClick={() => navigate('/student/submit')}
            className="flex items-center gap-1.5 text-xs text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-all">
            ยื่นคำร้อง <ArrowRight size={12} />
          </button>
        </div>

        <div className="p-4">
          {/* Campus Selector segmented tabs */}
          <div className="flex bg-gray-50 border border-gray-200/80 p-1 rounded-xl w-full sm:w-fit mb-3">
            <button onClick={() => setSelectedCampus('bangkhen')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCampus === 'bangkhen' ? 'bg-[#1a5c2e] text-white shadow-sm' : 'text-gray-500 hover:text-green-700'
              }`}>
              วิทยาเขตบางเขน
            </button>
            <button onClick={() => setSelectedCampus('kamphaengsaen')}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCampus === 'kamphaengsaen' ? 'bg-purple-700 text-white shadow-sm' : 'text-gray-500 hover:text-purple-700'
              }`}>
              วิทยาเขตกำแพงแสน
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาแบบฟอร์ม..."
              value={searchForm}
              onChange={e => setSearchForm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {forms.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Download size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">กำลังโหลดแบบฟอร์ม...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredForms.map(form => (
                <div key={form.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{form.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[form.category] || 'bg-gray-100 text-gray-600'}`}>
                          {CATEGORY_LABELS[form.category] || form.category}
                        </span>
                        {form.description && (
                          <span className="text-xs text-gray-400 truncate">{form.description}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedForm(expandedForm === form.id ? null : form.id)}
                        className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1 border border-gray-200"
                      >
                        <BookOpen size={11} /> วิธีใช้
                        {expandedForm === form.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                      <button
                        onClick={() => download(form)}
                        disabled={downloading === form.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-all font-medium"
                      >
                        {downloading === form.id
                          ? <><Loader2 size={12} className="animate-spin" /> กำลังโหลด</>
                          : <><Download size={12} /> โหลด</>
                        }
                      </button>
                    </div>
                  </div>

                  {expandedForm === form.id && (
                    <div className="px-4 pb-3 pt-2 bg-gray-50 border-t border-gray-100">
                      {/* Required Docs */}
                      {form.required_docs && form.required_docs.length > 0 ? (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">📎 เอกสารที่ต้องแนบมาด้วย:</p>
                          <ul className="space-y-1">
                            {form.required_docs.map((doc, i) => (
                              <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs shrink-0 font-medium">{i + 1}</span>
                                {doc}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-gray-600 mb-2">📌 วิธีการใช้งาน:</p>
                          <ol className="list-decimal list-inside space-y-1.5">
                            {(FORM_INSTRUCTIONS[form.file_name] || [
                              'ดาวน์โหลดและกรอกข้อมูลให้ครบถ้วน',
                              'แนบมาพร้อมกับการยื่นคำร้องออนไลน์',
                            ]).map((step, i) => (
                              <li key={i} className="text-xs text-gray-600">{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      <button
                        onClick={() => navigate('/student/submit')}
                        className="flex items-center gap-1.5 text-xs text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 transition-all"
                      >
                        <Send size={11} /> กรอกแล้ว → ยื่นคำร้องออนไลน์
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent submissions */}
      {recent.length > 0 && (
        <div className="bg-white rounded-xl border border-green-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h3 className="text-green-800 text-base font-semibold">คำร้องล่าสุด</h3>
            <button onClick={() => navigate('/student/track')}
              className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
              ดูทั้งหมด <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {recent.map(sub => (
              <div key={sub.id} onClick={() => navigate('/student/track')}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 cursor-pointer transition-colors border border-transparent hover:border-green-100">
                <div className="w-2 h-2 rounded-full bg-green-400 shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{sub.formName}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(sub.submittedAt)}</p>
                </div>
                <StatusBadge status={sub.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
