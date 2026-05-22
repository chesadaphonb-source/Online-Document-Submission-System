import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  Users, UserPlus, Search, GraduationCap, BookOpen,
  Mail, ChevronDown, ChevronUp, Edit2, Check, X,
  Shield, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

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
}

interface SubmittedStudent {
  student_name: string;
  student_id: string;      // Supabase id เช่น student_6510450001
  student_number: string;  // รหัสนิสิต เช่น 6510450001
  department: string;
  created_at: string;
  count: number;
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
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editDept, setEditDept] = useState(user.department || '');
  const [editPos, setEditPos] = useState(user.position || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isSupabaseConfigured && supabase) {
        // Update name and department in the users table
        const { error: userError } = await supabase.from('users').update({
          name: editName, department: editDept
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
      onUpdate(user.id, { name: editName, department: editDept, position: editPos });
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
            <div className="flex flex-wrap gap-1 mt-2">
              {user.is_advisor && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">อาจารย์ที่ปรึกษา</span>}
              {user.is_department_head && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">หัวหน้าภาค</span>}
              {user.is_dean && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">คณบดี</span>}
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

            {/* Edit info */}
            {!editing ? (
              <button onClick={() => { setEditName(user.name); setEditDept(user.department || ''); setEditPos(user.position || ''); setEditing(true); }}
                className="flex items-center gap-1.5 text-xs text-green-700 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                <Edit2 size={11} /> แก้ไขข้อมูล
              </button>
            ) : (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                <input value={editDept} onChange={e => setEditDept(e.target.value)}
                  placeholder="ภาควิชา"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                <select value={editPos} onChange={e => setEditPos(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400">
                  <option value="">-- ตำแหน่ง --</option>
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
function StudentRow({ student }: { student: SubmittedStudent }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
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
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-400">ยื่นคำร้อง</p>
        <p className="text-sm font-semibold text-green-700">{student.count} ครั้ง</p>
      </div>
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
          created_at,
          teachers (
            position,
            is_advisor,
            is_department_head,
            is_dean
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
            created_at: u.created_at,
            position: t?.position || '',
            is_advisor: t?.is_advisor || false,
            is_department_head: t?.is_department_head || false,
            is_dean: t?.is_dean || false,
          };
        });
        setUsers(mappedUsers);
      }

      // Load students from submissions
      const { data: subs } = await supabase
        .from('submissions')
        .select('student_name, student_id, department, submitted_at')
        .order('submitted_at', { ascending: false });

      if (subs) {
        const map = new Map<string, SubmittedStudent>();
        subs.forEach((s: any) => {
          const key = s.student_id || '';
          // รหัสนิสิต: ตัด prefix "student_" ออก
          const studentNum = key.startsWith('student_') ? key.replace('student_', '') : key;
          if (map.has(key)) { map.get(key)!.count++; }
          else map.set(key, {
            student_name: s.student_name || 'ไม่ระบุ',
            student_id: key,
            student_number: studentNum,
            department: s.department || 'ไม่ระบุภาควิชา',
            created_at: s.submitted_at,
            count: 1,
          });
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

  const teachers = users.filter(u => u.role === 'teacher' && (
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.department || '').toLowerCase().includes(search.toLowerCase())
  ));

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
          <button onClick={loadUsers} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="รีโหลด">
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
          <div className="space-y-1">
            {admins.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-xs">
                <span className="text-purple-800 font-medium">{a.name}</span>
                <span className="text-purple-500">{a.email}</span>
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

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder={`ค้นหา${tab === 'teacher' ? 'อาจารย์' : 'นิสิต'}...`}
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 bg-white" />
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
              : filteredStudents.map(s => <StudentRow key={s.student_id} student={s} />)
            }
          </div>
        </>
      )}
    </div>
  );
}
