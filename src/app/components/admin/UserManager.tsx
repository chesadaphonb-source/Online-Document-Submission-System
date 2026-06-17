import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  Users, UserPlus, Search, GraduationCap, BookOpen,
  Mail, ChevronDown, ChevronUp, Edit2, Check, X,
  Shield, RefreshCw, Upload, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { SUPER_ADMIN_EMAILS } from '../../context/SystemContext';
import { makeBackgroundTransparent } from '../teacher/TeacherDashboard';

interface DBUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  faculty?: string;
  position?: string;
  plain_password?: string;
  is_advisor?: boolean;
  is_department_head?: boolean;
  is_dean?: boolean;
  created_at?: string;
  signature_data?: string;
}

interface SubmittedStudent {
  student_name: string;
  student_id: string;      // Supabase id เช่น student_6510450001
  student_number: string;  // รหัสนิสิต เช่น 6510450001
  department: string;
  created_at: string;
  count: number;
  submissionsList?: { id: string; formName: string; status: string; submittedAt: string }[];
}

// ── Role Badge ─────────────────────────────────────────────────
function RoleBadge({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all border ${
        active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'
      }`}
    >
      {active && <Check size={10} />}
      {label}
    </button>
  );
}

// ── Teacher Card ───────────────────────────────────────────────
function TeacherCard({ user, onUpdate }: {
  user: DBUser;
  onUpdate: (id: string, changes: Partial<DBUser>) => void;
}) {
  const { currentUser } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editEmail, setEditEmail] = useState(user.email);
  const [editDept, setEditDept] = useState(user.department || '');
  const [editPos, setEditPos] = useState(user.position || '');
  const [editPassword, setEditPassword] = useState(user.plain_password || '');
  const [saving, setSaving] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);

  useEffect(() => {
    setEditEmail(user.email);
  }, [user.email]);

  const promoteToAdmin = async () => {
    if (!confirm(`ต้องการแต่งตั้ง "${user.name}" เป็นเจ้าหน้าที่ระบบ (Admin) ใช่หรือไม่?`)) return;
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').update({ role: 'admin' }).eq('id', user.id);
        if (error) throw error;
      }
      onUpdate(user.id, { role: 'admin' });
      toast.success(`แต่งตั้ง "${user.name}" เป็น Admin สำเร็จ`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isSuperAdmin = !!currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email);
      const emailChanged = editEmail.trim().toLowerCase() !== user.email.toLowerCase();
      const passwordChanged = editPassword !== user.plain_password;

      if ((emailChanged && isSuperAdmin) || passwordChanged) {
        const payload: any = {
          userId: user.id,
          adminEmail: currentUser?.email
        };

        if (emailChanged && isSuperAdmin) {
          if (!editEmail.trim()) {
            throw new Error('กรุณากรอกอีเมล');
          }
          payload.newEmail = editEmail.trim().toLowerCase();
        }

        if (passwordChanged) {
          if (!editPassword) {
            throw new Error('กรุณากรอกรหัสผ่าน');
          }
          payload.newPassword = editPassword;
        }

        const response = await fetch('/api/update-user-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้');
        }
      }

      if (isSupabaseConfigured && supabase) {
        // Update name, department, and plain_password in the users table
        const { error: userError } = await supabase.from('users').update({
          name: editName, department: editDept, plain_password: editPassword
        }).eq('id', user.id);
        if (userError) throw userError;

        // Update position in the teachers table if role is teacher
        if (user.role === 'teacher') {
          const { error: teacherError } = await supabase.from('teachers').update({
            position: editPos
          }).eq('user_id', user.id);
          if (teacherError) throw teacherError;
        }
      }
      onUpdate(user.id, {
        name: editName,
        email: isSuperAdmin ? editEmail.trim().toLowerCase() : user.email,
        department: editDept,
        position: editPos,
        plain_password: editPassword
      });
      toast.success('บันทึกข้อมูลแล้ว');
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const toggleRole = async (field: 'is_advisor' | 'is_department_head' | 'is_dean') => {
    const newVal = !user[field];
    try {
      if (isSupabaseConfigured && supabase) {
        // Update fields in the teachers table
        const { error } = await supabase.from('teachers').update({ [field]: newVal }).eq('user_id', user.id);
        if (error) throw error;
      }
      onUpdate(user.id, { [field]: newVal });
      toast.success('อัปเดตบทบาทแล้ว');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match('image/png') && !file.type.match('image/jpeg')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ PNG หรือ JPG เท่านั้น');
      return;
    }

    setUploadingSig(true);
    const toastId = toast.loading('กำลังอัปโหลดลายเซ็น...');
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (!base64) {
          toast.error('ไม่สามารถอ่านไฟล์ได้', { id: toastId });
          return;
        }

        const processedBase64 = await makeBackgroundTransparent(base64);

        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase
            .from('teachers')
            .update({ signature_data: processedBase64 })
            .eq('user_id', user.id);
          if (error) throw error;
        }

        onUpdate(user.id, { signature_data: processedBase64 });
        toast.success('อัปโหลดลายเซ็นเรียบร้อยแล้ว', { id: toastId });
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดลายเซ็น', { id: toastId });
    } finally {
      setUploadingSig(false);
    }
  };

  const handleDeleteSignature = async () => {
    if (!confirm(`ต้องการลบลายเซ็นประจำตัวของ "${user.name}" ใช่หรือไม่?`)) return;
    setUploadingSig(true);
    const toastId = toast.loading('กำลังลบลายเซ็น...');
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('teachers')
          .update({ signature_data: null })
          .eq('user_id', user.id);
        if (error) throw error;
      }

      onUpdate(user.id, { signature_data: undefined });
      toast.success('ลบลายเซ็นเรียบร้อยแล้ว', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการลบลายเซ็น', { id: toastId });
    } finally {
      setUploadingSig(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <BookOpen size={18} className="text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{user.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user.position || 'อาจารย์'} • {user.department || '-'}</p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Mail size={10} />{user.email}
            </p>
            {user.plain_password ? (
              <p className="text-xs text-gray-500 mt-1 bg-gray-50 border border-gray-150 rounded px-2 py-0.5 w-fit font-mono flex items-center gap-1 select-all cursor-pointer animate-fade-in" title="คลิกเพื่อคลุมดำคัดลอกรหัสผ่าน">
                <span className="font-semibold text-[10px] text-gray-400 select-none">PASSWORD:</span>
                <span className="text-gray-700 font-bold">{user.plain_password}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1 bg-gray-50/50 border border-dashed border-gray-250 rounded px-2 py-0.5 w-fit font-mono flex items-center gap-1 select-none">
                <span className="font-semibold text-[10px] text-gray-300">PASSWORD:</span>
                <span className="text-gray-450 italic">ยังไม่ได้ลงทะเบียนรหัสผ่าน</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {user.is_advisor && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">อาจารย์ที่ปรึกษา</span>}
              {user.is_department_head && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">หัวหน้าภาค — {user.department || 'ไม่ระบุสาขา'}</span>}
              {user.is_dean && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">คณบดี (ทุกสาขา)</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-400 hover:bg-gray-50">
          <span className="flex items-center gap-1.5"><Edit2 size={11} /> {expanded ? 'ซ่อน' : 'จัดการ'}</span>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
            {/* Role toggles */}
            <div className="pt-2">
              <p className="text-xs text-gray-500 font-medium mb-2">บทบาทในระบบอนุมัติ</p>
              <div className="flex flex-wrap gap-2">
                <RoleBadge label="อาจารย์ที่ปรึกษา" active={!!user.is_advisor} onClick={() => toggleRole('is_advisor')} />
                <RoleBadge label="หัวหน้าภาค" active={!!user.is_department_head} onClick={() => toggleRole('is_department_head')} />
                <RoleBadge label="คณบดี" active={!!user.is_dean} onClick={() => toggleRole('is_dean')} />
              </div>
            </div>

            {/* Signature Management */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-medium mb-2">ลายเซ็นดิจิทัลประจำตัว</p>
              {user.signature_data ? (
                <div className="flex items-center gap-3">
                  <div className="border border-dashed border-green-200 rounded-lg bg-green-50/20 p-2 w-32 h-14 flex items-center justify-center relative shadow-sm">
                    <img
                      src={user.signature_data}
                      alt="ลายเซ็น"
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-255 text-gray-600 hover:bg-gray-50 rounded-lg text-[10px] font-semibold shadow-sm transition-all cursor-pointer">
                      <Upload size={11} /> อัปโหลดรูปลายเซ็นใหม่
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadSignature}
                        className="hidden"
                        disabled={uploadingSig}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleDeleteSignature}
                      disabled={uploadingSig}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-red-650 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all font-semibold cursor-pointer"
                    >
                      <Trash2 size={11} /> ลบลายเซ็นประจำตัว
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="border border-dashed border-gray-200 rounded-lg bg-gray-50 p-2 w-32 h-14 flex items-center justify-center text-center">
                    <span className="text-[10px] text-gray-400 italic">ไม่มีลายเซ็น</span>
                  </div>
                  <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1a5c2e] hover:bg-green-700 text-white rounded-lg text-[10px] font-semibold shadow-sm transition-all cursor-pointer">
                    <Upload size={11} /> อัปโหลดรูปลายเซ็น (PNG/JPG)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadSignature}
                      className="hidden"
                      disabled={uploadingSig}
                    />
                  </label>
                </div>
              )}
            </div>

            {currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && (
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-purple-700 font-semibold flex items-center gap-1"><Shield size={11} /> สิทธิ์ผู้ดูแลระบบ (Super Admin Only)</p>
                <button
                  onClick={promoteToAdmin}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer"
                >
                  แต่งตั้งเป็น Admin
                </button>
              </div>
            )}

            {/* Edit info */}
            {!editing ? (
              <button onClick={() => { setEditName(user.name); setEditDept(user.department || ''); setEditPos(user.position || ''); setEditPassword(user.plain_password || ''); setEditEmail(user.email); setEditing(true); }}
                className="flex items-center gap-1.5 text-xs text-green-700 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                <Edit2 size={11} /> แก้ไขข้อมูล
              </button>
            ) : (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 text-gray-800" />
                {!!currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-purple-700">อีเมล (Super Admin Only)</label>
                    <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                      placeholder="อีเมลผู้ใช้"
                      className="w-full px-2 py-1.5 text-xs border border-purple-200 focus:border-purple-400 bg-purple-50/30 rounded-lg focus:outline-none text-gray-800 font-medium" />
                  </div>
                )}
                <input value={editDept} onChange={e => setEditDept(e.target.value)}
                  placeholder="ภาควิชา"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 text-gray-800" />
                <input value={editPassword} onChange={e => setEditPassword(e.target.value)}
                  placeholder="รหัสผ่านเข้าใช้งาน (เพื่อความสะดวกของแอดมิน)"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 text-gray-800 font-mono" />
                <select value={editPos} onChange={e => setEditPos(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 text-gray-800 cursor-pointer">
                  <option value="">-- ตำแหน่ง --</option>
                  <option value="ไม่ได้ดำรงตำแหน่งทางวิชาการ">ไม่ได้ดำรงตำแหน่งทางวิชาการ</option>
                  <option>อาจารย์</option>
                  <option>ผู้ช่วยศาสตราจารย์</option>
                  <option>รองศาสตราจารย์</option>
                  <option>ศาสตราจารย์</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50">
                    <Check size={11} /> บันทึก
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="flex items-center gap-1 px-3 py-1 text-gray-500 hover:bg-gray-100 text-xs rounded-lg border border-gray-200">
                    <X size={11} /> ยกเลิก
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Student Row ────────────────────────────────────────────────
function StudentRow({
  student,
  onUpdateStudent,
  onDeleteStudent
}: {
  student: SubmittedStudent;
  onUpdateStudent: (id: string, changes: Partial<SubmittedStudent>) => void;
  onDeleteStudent: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(student.student_name);
  const [editNumber, setEditNumber] = useState(student.student_number);
  const [editDept, setEditDept] = useState(student.department);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSaveStudent = async () => {
    if (!editName.trim() || !editNumber.trim()) {
      toast.error('กรุณากรอกชื่อและรหัสนิสิตให้ครบถ้วน');
      return;
    }
    setSaving(true);
    try {
      const oldId = student.student_id;
      const newId = `student_${editNumber.trim()}`;
      const newName = editName.trim();
      const newDept = editDept;

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('submissions')
          .update({
            student_id: newId,
            student_name: newName,
            department: newDept
          })
          .eq('student_id', oldId);

        if (error) throw error;
      }

      onUpdateStudent(oldId, {
        student_id: newId,
        student_number: editNumber.trim(),
        student_name: newName,
        department: newDept
      });

      toast.success('แก้ไขข้อมูลนิสิตและเอกสารสำเร็จแล้ว');
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message || 'ไม่สามารถแก้ไขข้อมูลได้');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!confirm(`⚠️ ยืนยันการลบนิสิต "${student.student_name}" และลบคำร้องที่ยื่นมาทั้งหมด (${student.count} รายการ) ออกจาก Supabase ใช่หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้!`)) return;
    setDeleting(true);
    try {
      const oldId = student.student_id;

      if (isSupabaseConfigured && supabase) {
        const { error: subError } = await supabase
          .from('submissions')
          .delete()
          .eq('student_id', oldId);

        if (subError) throw subError;

        await supabase
          .from('notifications')
          .delete()
          .eq('recipient_id', oldId);
      }

      onDeleteStudent(oldId);
      toast.success(`ลบข้อมูลนิสิต "${student.student_name}" เรียบร้อยแล้ว`);
    } catch (err: any) {
      toast.error(err.message || 'ไม่สามารถลบข้อมูลนิสิตได้');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50/50" onClick={() => { if (!editing) setExpanded(!expanded); }}>
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <GraduationCap size={16} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">{student.student_name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            <span className="text-xs text-blue-600 font-mono">รหัส: {student.student_number || student.student_id}</span>
            {student.department && (
              <span className="text-xs text-gray-500">{student.department}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <p className="text-xs text-gray-400">ยื่นคำร้อง</p>
            <p className="text-sm font-semibold text-green-700">{student.count} ครั้ง</p>
          </div>
          {!editing && (expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />)}
        </div>
      </div>

      {editing && (
        <div className="p-4 space-y-3 bg-gray-50 border-t border-gray-100 animate-fade-in">
          <p className="text-xs font-semibold text-green-700">แก้ไขข้อมูลนิสิต (จะเปลี่ยนข้อมูลในเอกสารยื่นทั้งหมดของนิสิตรายนี้)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <label className="text-[10px] font-bold text-gray-500">ชื่อ-นามสกุล</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="ชื่อ-นามสกุล"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white text-gray-880"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] font-bold text-gray-500">รหัสนิสิต</label>
              <input
                type="text"
                value={editNumber}
                onChange={e => setEditNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="รหัสนิสิต 10 หลัก"
                maxLength={10}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white text-gray-880 font-mono"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] font-bold text-gray-500">ภาควิชา</label>
              <select
                value={editDept}
                onChange={e => setEditDept(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white text-gray-880 cursor-pointer"
              >
                <option value="">-- เลือกภาควิชา --</option>
                <option value="ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม">ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม</option>
                <option value="ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม">ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม</option>
                <option value="ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน">ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveStudent}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 cursor-pointer font-semibold"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-1 text-gray-500 hover:bg-gray-100 text-xs rounded-lg border border-gray-200 bg-white cursor-pointer font-semibold"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {expanded && !editing && student.submissionsList && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-50 bg-gray-50/20 space-y-2">
          <div className="flex justify-between items-center mb-1 flex-wrap gap-2 pt-1">
            <p className="text-xs font-semibold text-gray-500">ประวัติเอกสารที่ยื่น:</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditName(student.student_name);
                  setEditNumber(student.student_number);
                  setEditDept(student.department);
                  setEditing(true);
                }}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 rounded px-2 py-0.5 shadow-sm hover:bg-blue-50 transition-all cursor-pointer flex items-center gap-1"
              >
                <Edit2 size={10} /> แก้ไขข้อมูลนิสิต
              </button>
              <button
                onClick={handleDeleteStudent}
                disabled={deleting}
                className="text-[10px] font-semibold text-red-500 hover:text-red-700 bg-white border border-red-200 rounded px-2 py-0.5 shadow-sm hover:bg-red-50 transition-all cursor-pointer flex items-center gap-1"
              >
                <X size={10} /> ลบนิสิตและคำร้องทั้งหมด
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {student.submissionsList.map((sub: any) => (
              <div key={sub.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border border-gray-150 shadow-sm">
                <span className="font-medium text-gray-700">{sub.formName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-400 font-mono text-[10px]">
                    {new Date(sub.submittedAt).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    sub.status === 'approved' ? 'bg-green-100 text-green-700' :
                    sub.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {sub.status === 'approved' ? 'อนุมัติเสร็จสิ้น' : sub.status === 'rejected' ? 'ปฏิเสธ' : 'กำลังดำเนินการ'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export function UserManager() {
  const [tab, setTab] = useState<'teacher' | 'student'>('teacher');
  const [users, setUsers] = useState<DBUser[]>([]);
  const [students, setStudents] = useState<SubmittedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const { currentUser } = useAuth();
  const [pendingDepts, setPendingDepts] = useState<Record<string, string>>({});
  const [updatingDepts, setUpdatingDepts] = useState<Record<string, boolean>>({});

  const handleUpdateStudent = (oldId: string, changes: Partial<SubmittedStudent>) => {
    setStudents(prev => prev.map(s => s.student_id === oldId ? { ...s, ...changes } : s));
  };

  const handleDeleteStudentLocally = (id: string) => {
    setStudents(prev => prev.filter(s => s.student_id !== id));
  };

  const demoteToTeacher = async (userId: string, userName: string) => {
    if (!confirm(`ต้องการถอดถอนสิทธิ์ Admin ของ "${userName}" กลับไปเป็นอาจารย์ปกติใช่หรือไม่?`)) return;
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').update({ role: 'teacher' }).eq('id', userId);
        if (error) throw error;
      }
      handleUpdate(userId, { role: 'teacher' });
      toast.success(`ถอดถอนสิทธิ์ Admin ของ "${userName}" สำเร็จ`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEditEmail = async (userId: string, currentEmail: string, userName: string) => {
    const newEmail = prompt(`ระบุอีเมลใหม่สำหรับ "${userName}":`, currentEmail);
    if (newEmail === null) return;
    if (!newEmail.trim()) {
      toast.error('กรุณากรอกอีเมลที่ถูกต้อง');
      return;
    }
    if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) return;

    try {
      const response = await fetch('/api/update-user-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          newEmail: newEmail.trim().toLowerCase(),
          adminEmail: currentUser?.email
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการแก้ไขอีเมล');
      }

      handleUpdate(userId, { email: newEmail.trim().toLowerCase() });
      toast.success(`เปลี่ยนอีเมลเป็น ${newEmail} สำเร็จแล้ว`);
    } catch (err: any) {
      toast.error(err.message || 'ไม่สามารถเปลี่ยนอีเมลได้');
    }
  };

  // ── Add New Teacher States ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newPos, setNewPos] = useState('อาจารย์');
  const [newIsAdvisor, setNewIsAdvisor] = useState(true);
  const [newIsDeptHead, setNewIsDeptHead] = useState(false);
  const [newIsDean, setNewIsDean] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState<'teacher' | 'admin'>('teacher');

  useEffect(() => {
    if (newRole === 'admin') {
      setNewPos('ไม่ได้ดำรงตำแหน่งทางวิชาการ');
      setNewIsAdvisor(false);
      setNewIsDeptHead(false);
      setNewIsDean(false);
    } else {
      setNewPos('อาจารย์');
      setNewIsAdvisor(true);
      setNewIsDeptHead(false);
      setNewIsDean(false);
    }
  }, [newRole]);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim() || !newName.trim()) {
      toast.error('กรุณากรอกอีเมล รหัสผ่าน และชื่อ-นามสกุล ให้ครบถ้วน');
      return;
    }
    setAdding(true);
    try {
      if (isSupabaseConfigured) {
        const response = await fetch('/api/create-teacher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: newEmail.trim(),
            password: newPassword,
            name: newName.trim(),
            department: newDept,
            position: newPos,
            isAdvisor: newIsAdvisor,
            isDepartmentHead: newIsDeptHead,
            isDean: newIsDean,
            role: newRole
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'เกิดข้อผิดพลาดในการสร้างบัญชีผู้ใช้');
        }

        const newUser: DBUser = {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role || newRole,
          department: data.user.department,
          faculty: data.user.faculty,
          position: data.user.position,
          is_advisor: data.user.is_advisor,
          is_department_head: data.user.is_department_head,
          is_dean: data.user.is_dean,
          created_at: new Date().toISOString()
        };

        setUsers(prev => [newUser, ...prev]);
        toast.success(`เพิ่ม${newRole === 'admin' ? 'เจ้าหน้าที่ (Admin)' : 'อาจารย์'} ${newName} สำเร็จแล้ว!`);
      } else {
        // Mock mode
        const mockId = `${newRole}_${Date.now()}`;
        const newUser: DBUser = {
          id: mockId,
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          role: newRole,
          department: newDept,
          faculty: 'คณะสิ่งแวดล้อม',
          position: newPos,
          is_advisor: newIsAdvisor,
          is_department_head: newIsDeptHead,
          is_dean: newIsDean,
          created_at: new Date().toISOString()
        };
        setUsers(prev => [newUser, ...prev]);
        toast.success(`[Mock Mode] เพิ่ม${newRole === 'admin' ? 'เจ้าหน้าที่ (Admin)' : 'อาจารย์'} ${newName} สำเร็จแล้ว!`);
      }

      setShowAddModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewDept('');
      setNewPos('อาจารย์');
      setNewIsAdvisor(true);
      setNewIsDeptHead(false);
      setNewIsDean(false);
      setNewRole('teacher');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || `ไม่สามารถเพิ่ม${newRole === 'admin' ? 'เจ้าหน้าที่ (Admin)' : 'อาจารย์'}ได้`);
    } finally {
      setAdding(false);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          name,
          email,
          role,
          department,
          faculty,
          plain_password,
          created_at,
          teachers (
            position,
            is_advisor,
            is_department_head,
            is_dean,
            signature_data
          )
        `)
        .in('role', ['teacher', 'admin'])
        .order('role').order('name');
      if (error) {
        toast.error('โหลดข้อมูลไม่สำเร็จ: ' + error.message);
      } else {
        const mappedUsers: DBUser[] = (data || []).map((u: any) => {
          const t = Array.isArray(u.teachers) ? u.teachers[0] : u.teachers;
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            department: u.department,
            faculty: u.faculty,
            plain_password: u.plain_password,
            created_at: u.created_at,
            position: t?.position || '',
            is_advisor: t?.is_advisor || false,
            is_department_head: t?.is_department_head || false,
            is_dean: t?.is_dean || false,
            signature_data: t?.signature_data || '',
          };
        });
        setUsers(mappedUsers);
      }

      // Load students from submissions
      const { data: subs } = await supabase
        .from('submissions')
        .select('student_name, student_id, department, submitted_at, id, form_name, status')
        .order('submitted_at', { ascending: false });

      if (subs) {
        const map = new Map<string, SubmittedStudent>();
        subs.forEach((s: any) => {
          const key = s.student_id || '';
          // รหัสนิสิต: ตัด prefix "student_" ออก
          const studentNum = key.startsWith('student_') ? key.replace('student_', '') : key;
          const subItem = {
            id: s.id,
            formName: s.form_name,
            status: s.status,
            submittedAt: s.submitted_at
          };
          if (map.has(key)) {
            const existing = map.get(key)!;
            existing.count++;
            if (!existing.submissionsList) existing.submissionsList = [];
            existing.submissionsList.push(subItem);
          } else {
            map.set(key, {
              student_name: s.student_name || 'ไม่ระบุ',
              student_id: key,
              student_number: studentNum,
              department: s.department || 'ไม่ระบุภาควิชา',
              created_at: s.submitted_at,
              count: 1,
              submissionsList: [subItem]
            });
          }
        });
        setStudents(Array.from(map.values()));
      }
    }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleUpdate = (id: string, changes: Partial<DBUser>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...changes } : u));
  };

  const teachers = users.filter(u => {
    if (u.role !== 'teacher') return false;
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(search.toLowerCase());
    const matchDept = selectedDeptFilter === 'all' || u.is_dean || u.is_department_head || u.department === selectedDeptFilter;
    return matchSearch && matchDept;
  });

  const admins = users.filter(u => u.role === 'admin');

  const filteredStudents = students.filter(s =>
    s.student_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_number.includes(search) ||
    s.student_id.includes(search) ||
    (s.department || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-green-800 text-xl font-semibold mb-1">จัดการผู้ใช้</h2>
          <p className="text-gray-500 text-sm">จัดการบทบาทอาจารย์และดูข้อมูลนิสิตที่ยื่นคำร้อง</p>
        </div>
        <div className="flex gap-2">
          {tab === 'teacher' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all"
            >
              <UserPlus size={15} />
              <span>เพิ่มบุคลากรใหม่</span>
            </button>
          )}
          <button onClick={loadUsers} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 bg-white" title="รีโหลด">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Admin section */}
      {admins.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1.5">
            <Shield size={12} /> Admin ({admins.length} คน)
          </p>
          <div className="space-y-2">
            {admins.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-xs justify-between flex-wrap p-2.5 bg-white rounded-lg border border-purple-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-purple-800 font-semibold">{a.name}</span>
                  <span className="text-purple-500 font-mono">{a.email}</span>
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">
                    สังกัด: {a.department || 'ทุกภาควิชา / ส่วนกลาง'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-gray-500 font-medium">ระบุสังกัด:</label>
                      <select
                        value={pendingDepts[a.id] !== undefined ? pendingDepts[a.id] : (a.department || '')}
                        disabled={updatingDepts[a.id]}
                        onChange={(e) => {
                          const newDept = e.target.value;
                          setPendingDepts(prev => ({ ...prev, [a.id]: newDept }));
                        }}
                        className="px-2 py-1 border border-purple-200 rounded text-xs bg-white text-gray-750 cursor-pointer focus:outline-none focus:border-purple-400 font-medium disabled:opacity-50"
                      >
                        <option value="">ทุกภาควิชา / ส่วนกลาง</option>
                        <option value="ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม">ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม</option>
                        <option value="ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม">ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม</option>
                        <option value="ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน">ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน</option>
                        <option value="สำนักงานคณะ">สำนักงานคณะ (Admin)</option>
                      </select>
                      {pendingDepts[a.id] !== undefined && pendingDepts[a.id] !== (a.department || '') && (
                        <>
                          {updatingDepts[a.id] ? (
                            <span className="text-[10px] text-purple-600 font-semibold animate-pulse shrink-0">กำลังเปลี่ยน...</span>
                          ) : (
                            <button
                              onClick={async () => {
                                const newDept = pendingDepts[a.id];
                                setUpdatingDepts(prev => ({ ...prev, [a.id]: true }));
                                try {
                                  if (isSupabaseConfigured && supabase) {
                                    const { error } = await supabase.from('users').update({ department: newDept }).eq('id', a.id);
                                    if (error) throw error;
                                  }
                                  handleUpdate(a.id, { department: newDept });
                                  setPendingDepts(prev => {
                                    const next = { ...prev };
                                    delete next[a.id];
                                    return next;
                                  });
                                  toast.success(`อัปเดตสังกัดของ ${a.name} เป็น "${newDept || 'ทุกภาควิชา'}" สำเร็จ`);
                                } catch (err: any) {
                                  toast.error(err.message || 'ไม่สามารถอัปเดตสังกัดได้');
                                } finally {
                                  setUpdatingDepts(prev => ({ ...prev, [a.id]: false }));
                                }
                              }}
                              className="px-2 py-1 bg-purple-600 text-white rounded text-[10px] font-bold hover:bg-purple-700 transition-all shrink-0 cursor-pointer"
                            >
                              ยืนยัน
                            </button>
                          )}
                          {!updatingDepts[a.id] && (
                            <button
                              onClick={() => {
                                setPendingDepts(prev => {
                                  const next = { ...prev };
                                  delete next[a.id];
                                  return next;
                                });
                              }}
                              className="px-1.5 py-1 bg-gray-100 text-gray-500 rounded text-[10px] font-medium hover:bg-gray-200 transition-all shrink-0 cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && (
                    <button
                      onClick={() => handleEditEmail(a.id, a.email, a.name)}
                      className="text-[10px] font-bold text-purple-650 hover:text-purple-800 bg-white border border-purple-200 rounded px-2 py-1 shadow-sm transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Edit2 size={9} /> แก้ไขอีเมล
                    </button>
                  )}
                  {currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && !SUPER_ADMIN_EMAILS.includes(a.email) && (
                    <button
                      onClick={() => demoteToTeacher(a.id, a.name)}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-white border border-red-200 rounded px-2 py-1 shadow-sm transition-all cursor-pointer"
                    >
                      ถอดสิทธิ์ Admin
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'teacher', label: 'อาจารย์', count: teachers.length, icon: BookOpen },
          { key: 'student', label: 'นิสิตที่ยื่นคำร้อง', count: students.length, icon: GraduationCap },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => { setTab(t.key as any); setSearch(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                tab === t.key ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
              }`}>
              <Icon size={15} /> {t.label} ({t.count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder={`ค้นหา${tab === 'teacher' ? 'อาจารย์' : 'นิสิต'}...`}
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 bg-white" />
        </div>
        {tab === 'teacher' && (
          <div className="w-full sm:w-64">
            <select
              value={selectedDeptFilter}
              onChange={e => setSelectedDeptFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 bg-white cursor-pointer font-medium text-gray-700"
            >
              <option value="all">ทุกภาควิชา / สาขา</option>
              <option value="ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม">ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม</option>
              <option value="ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม">ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม</option>
              <option value="ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน">ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน</option>
              <option value="สำนักงานคณะ">สำนักงานคณะ (Admin)</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">
          <RefreshCw size={28} className="animate-spin mx-auto mb-2" />
          <p className="text-sm">กำลังโหลด...</p>
        </div>
      ) : tab === 'teacher' ? (
        <>
          <p className="text-xs text-gray-400">กดที่บทบาทเพื่อเปิด/ปิด — บันทึกอัตโนมัติใน Supabase</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {teachers.length === 0
              ? <p className="text-gray-400 text-sm col-span-2 text-center py-8">ไม่พบข้อมูลอาจารย์</p>
              : teachers.map(t => <TeacherCard key={t.id} user={t} onUpdate={handleUpdate} />)
            }
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400">นิสิตที่เคยยื่นคำร้องผ่านระบบ (Guest Login)</p>
          <div className="space-y-2">
            {filteredStudents.length === 0
              ? <p className="text-gray-400 text-sm text-center py-8">ยังไม่มีนิสิตยื่นคำร้อง</p>
              : filteredStudents.map(s => (
                  <StudentRow
                    key={s.student_id}
                    student={s}
                    onUpdateStudent={handleUpdateStudent}
                    onDeleteStudent={handleDeleteStudentLocally}
                  />
                ))
            }
          </div>
        </>
      )}

      {/* ── Modal: Add New Teacher ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2 text-green-800 font-bold text-base">
                <UserPlus size={18} />
                <span>เพิ่มบุคลากรใหม่</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={adding}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddTeacher} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Role selector */}
              <div className="space-y-1 bg-green-50/50 p-3 rounded-xl border border-green-100 flex items-center justify-between animate-fade-in">
                <span className="text-xs font-semibold text-gray-700">บทบาท/ประเภทบุคลากร:</span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                    <input
                      type="radio"
                      name="newRole"
                      value="teacher"
                      checked={newRole === 'teacher'}
                      onChange={() => setNewRole('teacher')}
                      className="w-3.5 h-3.5 text-green-600 focus:ring-green-500 accent-green-600 cursor-pointer"
                      disabled={adding}
                    />
                    อาจารย์
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                    <input
                      type="radio"
                      name="newRole"
                      value="admin"
                      checked={newRole === 'admin'}
                      onChange={() => setNewRole('admin')}
                      className="w-3.5 h-3.5 text-green-600 focus:ring-green-500 accent-green-600 cursor-pointer"
                      disabled={adding}
                    />
                    เจ้าหน้าที่ (Admin)
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-600">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="เช่น ดร.สมนึก พุกงาม"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 bg-white text-gray-850"
                  disabled={adding}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-600">อีเมล (บัญชี KU) <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="เช่น somnimirt.p@ku.th"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 bg-white text-gray-850"
                    disabled={adding}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-600">รหัสผ่านเริ่มต้น <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="รหัสผ่านเข้าสู่ระบบครั้งแรก"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 bg-white text-gray-850"
                    disabled={adding}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-600">ภาควิชา / สังกัด</label>
                  <select
                    value={newDept}
                    onChange={e => setNewDept(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 bg-white text-gray-850 cursor-pointer"
                    disabled={adding}
                  >
                    <option value="">-- เลือกภาควิชา / สังกัด --</option>
                    <option value="ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม">ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม</option>
                    <option value="ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม">ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม</option>
                    <option value="ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน">ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน</option>
                    <option value="สำนักงานคณะ">สำนักงานคณะ (Admin)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-600">ตำแหน่งวิชาการ</label>
                  <select
                    value={newPos}
                    onChange={e => setNewPos(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 bg-white text-gray-850 cursor-pointer"
                    disabled={adding}
                  >
                    <option value="ไม่ได้ดำรงตำแหน่งทางวิชาการ">ไม่ได้ดำรงตำแหน่งทางวิชาการ</option>
                    <option value="อาจารย์">อาจารย์</option>
                    <option value="ผู้ช่วยศาสตราจารย์">ผู้ช่วยศาสตราจารย์</option>
                    <option value="รองศาสตราจารย์">รองศาสตราจารย์</option>
                    <option value="ศาสตราจารย์">ศาสตราจารย์</option>
                  </select>
                </div>
              </div>

              {/* Roles checkboxes */}
              {newRole === 'teacher' && (
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-3.5 space-y-2 animate-fade-in">
                  <p className="text-xs font-bold text-gray-700">เปิดบทบาทสิทธิ์การอนุมัติเอกสาร:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newIsAdvisor}
                        onChange={e => setNewIsAdvisor(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-green-600 focus:ring-green-500 accent-green-600"
                        disabled={adding}
                      />
                      <span className="text-gray-700 font-medium">อาจารย์ที่ปรึกษา</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newIsDeptHead}
                        onChange={e => setNewIsDeptHead(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-green-600 focus:ring-green-500 accent-green-600"
                        disabled={adding}
                      />
                      <span className="text-gray-700 font-medium">หัวหน้าภาควิชา</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newIsDean}
                        onChange={e => setNewIsDean(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-green-600 focus:ring-green-500 accent-green-600"
                        disabled={adding}
                      />
                      <span className="text-gray-700 font-medium">คณบดี</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Footer buttons inside form */}
              <div className="pt-2 border-t border-gray-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                  disabled={adding}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                  disabled={adding}
                >
                  {adding ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>กำลังสร้างบัญชี...</span>
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      <span>บันทึกและสร้างบัญชี</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
