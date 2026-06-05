import { useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { useSubmissions } from '../../context/SubmissionsContext';
import { useSystem, SUPER_ADMIN_EMAILS } from '../../context/SystemContext';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../shared/StatusBadge';
import { formTemplates, formatDateTime } from '../../data/mockData';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  Users, FileText, CheckCircle, TrendingUp, ArrowRight,
  FileSearch, AlertCircle, Activity, BarChart3, Download, Trash2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { downloadCSV } from '../../lib/exportUtils';
import { toast } from 'sonner';

const COLORS = ['#16a34a', '#eab308', '#3b82f6', '#ef4444', '#8b5cf6'];

export function AdminDashboard() {
  const { submissions } = useSubmissions();
  const { isMaintenanceMode, toggleMaintenanceMode } = useSystem();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [dbStats, setDbStats] = useState({ totalStudents: 0, totalTeachers: 0, totalForms: 0 });

  useEffect(() => {
    async function loadStats() {
      if (!isSupabaseConfigured || !supabase) return;
      const [{ count: studentCount }, { count: teacherCount }, { count: formCount }] = await Promise.all([
        supabase.from('submissions').select('student_id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('forms_library').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);
      setDbStats({
        totalStudents: studentCount ?? 0,
        totalTeachers: teacherCount ?? 0,
        totalForms: formCount ?? 0,
      });
    }
    loadStats();
  }, []);

  const stats = {
    totalStudents: dbStats.totalStudents,
    totalTeachers: dbStats.totalTeachers,
    totalForms: dbStats.totalForms,
    totalSubmissions: submissions.length,
    pending: submissions.filter(s => s.status === 'in-review' || s.status === 'submitted').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  };

  // Form type distribution
  const formDist = formTemplates.map(f => ({
    name: f.name.length > 18 ? f.name.substring(0, 15) + '...' : f.name,
    fullName: f.name,
    count: submissions.filter(s => s.formType === f.id).length,
  })).filter(f => f.count > 0);

  // Status distribution for pie
  const pieData = [
    { name: 'อนุมัติ', value: stats.approved },
    { name: 'กำลังพิจารณา', value: stats.pending },
    { name: 'ไม่อนุมัติ', value: stats.rejected },
  ].filter(d => d.value > 0);

  const recentAll = submissions.slice(0, 6);

  const handleExportCSV = () => {
    try {
      const exportData = submissions.map(s => ({
        'รหัสคำร้อง': s.id,
        'ประเภท': s.formName,
        'ชื่อนิสิต': s.studentName,
        'รหัสนิสิต': s.studentId,
        'คณะ': s.faculty,
        'ภาควิชา': s.department,
        'วันที่ยื่น': formatDateTime(s.submittedAt),
        'สถานะ': s.status,
        'แก้ไขล่าสุด': formatDateTime(s.updatedAt)
      }));
      downloadCSV(exportData, `ku_paper_submissions_${new Date().toISOString().split('T')[0]}`);
      toast.success('ดาวน์โหลดไฟล์ CSV สำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการดาวน์โหลด');
    }
  };

  const handlePurgeOldData = async () => {
    if (confirm('คำเตือน: คุณแน่ใจหรือไม่ที่จะลบข้อมูลคำร้องที่เก่ากว่า 5 ปี? ข้อมูลและไฟล์ PDF จะถูกลบออกจากระบบอย่างถาวร (เฉพาะ Super Admin เท่านั้น)')) {
      toast.info('ระบบกำลังดำเนินการลบข้อมูล (ฟีเจอร์นี้ต้องเชื่อมต่อ SQL script สำหรับจัดการ Storage)');
      // For real production, we'd call a Supabase edge function or SQL RPC here
      // For now, it's a UI placeholder that shows intent
      setTimeout(() => toast.success('ดำเนินการจำลองการลบข้อมูลเสร็จสิ้น'), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a5c2e] to-green-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10">
          <div className="w-48 h-48 rounded-full border-[20px] border-white -translate-y-1/2 translate-x-1/4" />
        </div>
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-green-200 text-sm mb-1">แผงควบคุมผู้ดูแลระบบ</p>
            <h1 className="text-white text-xl mb-1">KU-Paper Dashboard</h1>
            <p className="text-green-200 text-sm">ภาพรวมระบบส่งเอกสารออนไลน์</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-4 py-2 rounded-xl transition-all"
            >
              <Download size={16} />
              <span className="text-sm font-medium">Export CSV</span>
            </button>
            
            {/* Super Admin Maintenance Toggle */}
            {currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && (
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-xl flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">Maintenance Mode</p>
                  <p className="text-xs text-green-100">สำหรับ Super Admin เท่านั้น</p>
                </div>
                <button
                  onClick={() => toggleMaintenanceMode(!isMaintenanceMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isMaintenanceMode ? 'bg-orange-500' : 'bg-white/30'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isMaintenanceMode ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'นิสิตทั้งหมด', value: stats.totalStudents, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'อาจารย์ทั้งหมด', value: stats.totalTeachers, icon: Users, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
          { label: 'แบบฟอร์มทั้งหมด', value: stats.totalForms, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
          { label: 'คำร้องทั้งหมด', value: stats.totalSubmissions, icon: FileSearch, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className={`bg-white rounded-xl p-4 border ${stat.border} shadow-sm`}>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <Icon size={20} className={stat.color} />
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Status stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'กำลังพิจารณา', value: stats.pending, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', urgent: stats.pending > 0 },
          { label: 'อนุมัติแล้ว', value: stats.approved, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
          { label: 'ไม่อนุมัติ', value: stats.rejected, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border ${s.border} ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className={`text-xs ${s.color} mt-0.5`}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart - form types */}
        {formDist.length > 0 && (
          <div className="bg-white rounded-xl border border-green-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-green-800 text-base flex items-center gap-2">
                <BarChart3 size={18} className="text-green-600" /> คำร้องตามประเภท
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={formDist} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(val, name) => [val, 'จำนวนคำร้อง']}
                  labelFormatter={(label) => formDist.find(f => f.name === label)?.fullName || label}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pie chart - status */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-xl border border-green-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-green-800 text-base flex items-center gap-2">
                <Activity size={18} className="text-green-600" /> สัดส่วนสถานะ
              </h3>
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => [val, 'คำร้อง']} contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i] }} />
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium text-gray-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending alert */}
      {stats.pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-800 font-medium text-sm">มีคำร้องรอการดำเนินการ {stats.pending} รายการ</p>
            <p className="text-yellow-700 text-xs mt-0.5">ตรวจสอบภาพรวมการไหลของเอกสาร</p>
          </div>
          <button
            onClick={() => navigate('/admin/flow')}
            className="text-xs text-yellow-700 font-medium flex items-center gap-1 whitespace-nowrap"
          >
            ดูรายละเอียด <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'ภาพรวมเอกสาร', icon: FileSearch, path: '/admin/flow', color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'จัดการแบบฟอร์ม', icon: FileText, path: '/admin/forms', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'จัดการผู้ใช้', icon: Users, path: '/admin/users', color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'สถิติรวม', icon: TrendingUp, path: '/admin/flow', color: 'text-green-600', bg: 'bg-green-50' },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={i}
              onClick={() => navigate(item.path)}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-green-200 transition-all text-left group"
            >
              <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mb-2`}>
                <Icon size={18} className={item.color} />
              </div>
              <p className="text-xs text-gray-700 font-medium">{item.label}</p>
            </button>
          );
        })}
      </div>

      {/* Recent submissions */}
      <div className="bg-white rounded-xl border border-green-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <h3 className="text-green-800 text-base">คำร้องล่าสุดในระบบ</h3>
          <button
            onClick={() => navigate('/admin/flow')}
            className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
          >
            ดูทั้งหมด <ArrowRight size={12} />
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {recentAll.map(sub => (
            <div key={sub.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <FileText size={15} className="text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{sub.formName}</p>
                <p className="text-xs text-gray-500">{sub.studentName} • {formatDateTime(sub.submittedAt)}</p>
              </div>
              <StatusBadge status={sub.status} />
            </div>
          ))}
        </div>
      </div>
      {/* Data Retention Tool (Super Admin Only) */}
      {currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email) && (
        <div className="bg-red-50 rounded-xl border border-red-100 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-red-800 font-semibold flex items-center gap-2">
                <Trash2 size={16} /> การจัดการข้อมูลเก่า (Data Retention)
              </h3>
              <p className="text-sm text-red-600 mt-1">
                ลบข้อมูลคำร้องและไฟล์แนบที่มีอายุเกิน 5 ปี เพื่อประหยัดพื้นที่จัดเก็บฐานข้อมูล (ลบถาวร ไม่สามารถกู้คืนได้)
              </p>
            </div>
            <button
              onClick={handlePurgeOldData}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 shadow-sm"
            >
              ลบข้อมูลเก่า (&gt; 5 ปี)
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
