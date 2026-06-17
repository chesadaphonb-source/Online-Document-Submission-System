import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { mockTeachers, getSubmissionsForTeacher, formatDateTime } from '../../data/mockData';
import { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { toast } from 'sonner';
import {
  CheckSquare, Clock, CheckCircle, XCircle, ArrowRight,
  FileText, TrendingUp, AlertCircle, BarChart2,
  PenTool, Upload, Trash2, RotateCcw, X
} from 'lucide-react';

// ── Monthly Bar Chart ─────────────────────────────────────────
function MonthlyChart({ data }: { data: { month: string; approved: number; rejected: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.approved + d.rejected), 1);
  return (
    <div className="flex items-end gap-2 h-28 pt-2">
      {data.map((d, i) => {
        const total = d.approved + d.rejected;
        const heightPct = (total / maxVal) * 100;
        const approvedPct = total > 0 ? (d.approved / total) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <p className="text-xs text-gray-400">{total > 0 ? total : ''}</p>
            <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${Math.max(heightPct * 0.85, total > 0 ? 8 : 2)}px` }}>
              <div className="bg-green-500" style={{ height: `${approvedPct}%` }} title={`อนุมัติ ${d.approved}`} />
              <div className="bg-red-300" style={{ height: `${100 - approvedPct}%` }} title={`ปฏิเสธ ${d.rejected}`} />
            </div>
            <p className="text-xs text-gray-400 text-center leading-tight">{d.month}</p>
          </div>
        );
      })}
    </div>
  );
}

export function makeBackgroundTransparent(base64DataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64DataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64DataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        // Calculate brightness (luminance)
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        if (brightness > 190) {
          // Smooth transparency transition
          const alphaFactor = Math.max(0, 1 - (brightness - 190) / (240 - 190));
          data[i + 3] = Math.round(a * alphaFactor);
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      resolve(base64DataUrl);
    };
  });
}

export function TeacherDashboard() {
  const { currentUser, updateCurrentUserProfile } = useAuth();
  const { submissions } = useSubmissions();
  const navigate = useNavigate();

  const [showDrawModal, setShowDrawModal] = useState(false);
  const sigCanvasRef = useRef<SignatureCanvas>(null);

  const teacher = currentUser as any;
  const pendingForMe = getSubmissionsForTeacher(currentUser?.id || '', submissions);
  const allApproved = submissions.filter(s =>
    s.approvalSteps.some(step => step.approverId === currentUser?.id && step.status === 'approved')
  );
  const allRejected = submissions.filter(s =>
    s.approvalSteps.some(step => step.approverId === currentUser?.id && step.status === 'rejected')
  );

  // ── Monthly stats (6 เดือนล่าสุด) ──
  const monthlyData = (() => {
    const months: { month: string; approved: number; rejected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('th-TH', { month: 'short' });
      const approved = submissions.filter(s => {
        const step = s.approvalSteps.find(st => st.approverId === currentUser?.id && st.status === 'approved');
        return step?.timestamp?.startsWith(key);
      }).length;
      const rejected = submissions.filter(s => {
        const step = s.approvalSteps.find(st => st.approverId === currentUser?.id && st.status === 'rejected');
        return step?.timestamp?.startsWith(key);
      }).length;
      months.push({ month: label, approved, rejected });
    }
    return months;
  })();

  const total = allApproved.length + allRejected.length;
  const approvalRate = total > 0 ? Math.round((allApproved.length / total) * 100) : 0;

  const roles = [];
  if (teacher?.isAdvisor) roles.push('อาจารย์ที่ปรึกษา');
  if (teacher?.isDepartmentHead) roles.push('หัวหน้าภาควิชา');
  if (teacher?.isDean) roles.push('คณบดี/ผู้แทน');

  const saveSignatureToDB = async (base64: string) => {
    const toastId = toast.loading('กำลังบันทึกลายเซ็นลงระบบ...');
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('teachers')
          .update({ signature_data: base64 })
          .eq('user_id', currentUser?.id);
        if (error) throw error;
      }
      updateCurrentUserProfile({ signatureData: base64 });
      toast.success('บันทึกลายเซ็นดิจิทัลประจำตัวเรียบร้อยแล้ว', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'บันทึกลายเซ็นไม่สำเร็จ', { id: toastId });
    }
  };

  const handleUploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const processed = await makeBackgroundTransparent(base64);
      await saveSignatureToDB(processed);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDrawnSignature = () => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      const base64 = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
      saveSignatureToDB(base64);
      setShowDrawModal(false);
    } else {
      toast.error('กรุณาวาดลายเซ็นก่อนบันทึก');
    }
  };

  const handleDeleteSignature = async () => {
    if (!confirm('ยืนยันที่จะลบลายเซ็นดิจิทัลประจำตัวของคุณออกจากระบบใช่หรือไม่?')) return;
    const toastId = toast.loading('กำลังลบลายเซ็น...');
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('teachers')
          .update({ signature_data: null })
          .eq('user_id', currentUser?.id);
        if (error) throw error;
      }
      updateCurrentUserProfile({ signatureData: undefined });
      toast.success('ลบลายเซ็นออกจากระบบเรียบร้อยแล้ว', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'ลบลายเซ็นไม่สำเร็จ', { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#1a5c2e] to-green-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10">
          <div className="w-48 h-48 rounded-full border-[20px] border-white -translate-y-1/2 translate-x-1/4" />
        </div>
        <div className="relative">
          <p className="text-green-200 text-sm mb-1">ยินดีต้อนรับ</p>
          <h1 className="text-white text-xl mb-1">{currentUser?.name}</h1>
          {teacher && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs">
                {teacher.position || 'อาจารย์'}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs">
                {teacher.department || teacher.faculty || 'ไม่ระบุภาควิชา'}
              </span>
              {roles.map(r => (
                <span key={r} className="inline-flex items-center gap-1.5 bg-green-400/30 px-3 py-1 rounded-full text-xs">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid Layout: Left vs Right columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'รอการพิจารณา', value: pendingForMe.length, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100', urgent: pendingForMe.length > 0 },
              { label: 'อนุมัติแล้ว', value: allApproved.length, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
              { label: 'ไม่อนุมัติ', value: allRejected.length, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className={`bg-white rounded-xl p-4 border ${stat.border} shadow-sm relative text-center`}>
                  {stat.urgent && (
                    <div className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                  <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3 mx-auto`}>
                    <Icon size={20} className={stat.color} />
                  </div>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                </div>
              );
            })}
          </div>

          {/* Urgent pending */}
          {pendingForMe.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={18} className="text-yellow-600" />
                <p className="text-yellow-800 font-medium text-sm">มีคำร้องรอการพิจารณา {pendingForMe.length} รายการ</p>
              </div>
              <p className="text-yellow-700 text-xs mb-3">กรุณาพิจารณาคำร้องที่รอดำเนินการโดยเร็ว</p>
              <button
                onClick={() => navigate('/teacher/approvals')}
                className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition-all cursor-pointer"
              >
                ไปที่คำร้องที่รอพิจารณา <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Pending submissions list */}
          <div className="bg-white rounded-xl border border-green-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h3 className="text-green-800 text-base">คำร้องที่รอการพิจารณา</h3>
              <button
                onClick={() => navigate('/teacher/approvals')}
                className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1 cursor-pointer"
              >
                ดูทั้งหมด <ArrowRight size={12} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {pendingForMe.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">ไม่มีคำร้องที่รอการพิจารณา</p>
                </div>
              ) : (
                pendingForMe.slice(0, 4).map(sub => (
                  <div
                    key={sub.id}
                    onClick={() => navigate('/teacher/approvals')}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 cursor-pointer transition-colors border border-transparent hover:border-green-100"
                  >
                    <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-yellow-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate font-medium">{sub.formName}</p>
                      <p className="text-xs text-gray-500">จาก: {sub.studentName} • {formatDateTime(sub.submittedAt)}</p>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1/3 width on desktop) */}
        <div className="lg:col-span-1 space-y-6">
          {/* ── Digital Signature Card ── */}
          <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 space-y-3.5">
            <div>
              <h3 className="text-green-800 text-base font-semibold flex items-center gap-1.5">
                <PenTool size={18} className="text-green-700" />
                ลายเซ็นดิจิทัลประจำตัว
              </h3>
              <p className="text-xs text-gray-500 mt-0.5 leading-normal">
                บันทึกลายเซ็นเพื่อใช้ในการลงนามบนเอกสารได้ทันทีโดยไม่ต้องวาดใหม่ทุกครั้ง
              </p>
            </div>

            {teacher?.signatureData ? (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-green-200 rounded-xl bg-green-50/20 p-4 max-w-[280px] mx-auto h-24 flex items-center justify-center relative group shadow-sm transition-all hover:border-green-300">
                  <img
                    src={teacher.signatureData}
                    alt="ลายเซ็นประจำตัว"
                    className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform group-hover:scale-102"
                  />
                  <div className="absolute inset-0 bg-black/45 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowDrawModal(true)}
                      className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg text-white font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <PenTool size={12} /> วาดใหม่
                    </button>
                    <label className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg text-white font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer">
                      <Upload size={12} /> อัปโหลดใหม่
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadSignature}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={handleDeleteSignature}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all font-semibold cursor-pointer"
                  >
                    <Trash2 size={13} /> ลบลายเซ็นประจำตัว
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 p-6 text-center shadow-inner">
                  <p className="text-xs text-gray-400 italic">ยังไม่มีลายเซ็นดิจิทัลบันทึกในระบบ</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDrawModal(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#1a5c2e] hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <PenTool size={13} /> วาดลายเซ็น
                  </button>
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer">
                    <Upload size={13} /> อัปโหลดรูปภาพ
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadSignature}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Teacher Statistics Card */}
          <div className="bg-white rounded-xl border border-green-100 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
              <BarChart2 size={18} className="text-green-600" />
              <h3 className="text-green-800 text-base">สถิติการพิจารณา</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'อนุมัติ', value: allApproved.length, color: 'text-green-700', bg: 'bg-green-50' },
                  { label: 'ปฏิเสธ', value: allRejected.length, color: 'text-red-650', bg: 'bg-red-50' },
                  { label: 'อัตรา', value: `${approvalRate}%`, color: total > 0 ? 'text-blue-700' : 'text-gray-400', bg: 'bg-gray-50' },
                ].map((s, i) => (
                  <div key={i} className={`${s.bg} rounded-xl p-2 text-center`}>
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <MonthlyChart data={monthlyData} />
                {total === 0 && (
                  <p className="text-center text-xs text-gray-400 mt-2">ยังไม่มีข้อมูลการพิจารณา</p>
                )}
              </div>
            </div>
          </div>

          {/* Recent history */}
          <div className="bg-white rounded-xl border border-green-100 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-green-800 text-base">ประวัติล่าสุด</h3>
            </div>
            <div className="p-4 space-y-3">
              {allApproved.slice(0, 3).map(sub => {
                const myStep = sub.approvalSteps.find(s => s.approverId === currentUser?.id);
                return (
                  <div key={sub.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-50 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                      <CheckCircle size={15} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 truncate font-semibold">{sub.formName}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {sub.studentName} • {myStep?.timestamp ? formatDateTime(myStep.timestamp) : '-'}
                      </p>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                );
              })}
              {allApproved.length === 0 && (
                <div className="text-center py-6 text-gray-400">
                  <p className="text-sm">ยังไม่มีประวัติการอนุมัติ</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Draw Signature Modal ── */}
      {showDrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-gray-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <PenTool size={15} className="text-green-700" />
                วาดลายเซ็นดิจิทัลประจำตัว
              </span>
              <button onClick={() => setShowDrawModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 relative">
                <SignatureCanvas
                  ref={sigCanvasRef}
                  canvasProps={{ className: 'w-full h-44 cursor-crosshair touch-none bg-white rounded-xl border border-gray-150' }}
                  penColor="#1a3fa0"
                  backgroundColor="rgba(0,0,0,0)"
                  minWidth={0.8}
                  maxWidth={2.0}
                  velocityFilterWeight={0.7}
                />
                <div className="absolute inset-x-4 bottom-10 border-b border-gray-300 border-dashed pointer-events-none opacity-40" />
                <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-gray-400 pointer-events-none select-none">
                  วาดลายเซ็นลงในกรอบด้านบน (ลายเซ็นจะถูกเซฟด้วยพื้นหลังโปร่งใสอัตโนมัติ)
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => sigCanvasRef.current?.clear()}
                  className="px-4 py-2 border border-gray-250 text-gray-500 rounded-xl hover:bg-gray-50 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer bg-white"
                >
                  <RotateCcw size={12} /> ล้างกระดาน
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDrawModal(false)}
                    className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-150 text-xs font-semibold transition-colors bg-white cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDrawnSignature}
                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    บันทึกภาพลายเซ็น
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

