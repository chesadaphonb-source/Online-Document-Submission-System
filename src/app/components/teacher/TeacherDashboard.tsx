import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { StatusBadge } from '../shared/StatusBadge';
import { mockTeachers, getSubmissionsForTeacher, formatDateTime } from '../../data/mockData';
import {
  CheckSquare, Clock, CheckCircle, XCircle, ArrowRight,
  FileText, TrendingUp, AlertCircle, BarChart2
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

export function TeacherDashboard() {
  const { currentUser } = useAuth();
  const { submissions } = useSubmissions();
  const navigate = useNavigate();

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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'รอการพิจารณา', value: pendingForMe.length, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100', urgent: pendingForMe.length > 0 },
          { label: 'อนุมัติแล้ว', value: allApproved.length, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
          { label: 'ไม่อนุมัติ', value: allRejected.length, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className={`bg-white rounded-xl p-4 border ${stat.border} shadow-sm relative`}>
              {stat.urgent && (
                <div className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
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
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition-all"
          >
            ไปที่คำร้องที่รอพิจารณา <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Pending submissions */}
      <div className="bg-white rounded-xl border border-green-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <h3 className="text-green-800 text-base">คำร้องที่รอการพิจารณา</h3>
          <button
            onClick={() => navigate('/teacher/approvals')}
            className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
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
            pendingForMe.slice(0, 3).map(sub => (
              <div
                key={sub.id}
                onClick={() => navigate('/teacher/approvals')}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 cursor-pointer transition-colors border border-transparent hover:border-green-100"
              >
                <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{sub.formName}</p>
                  <p className="text-xs text-gray-500">จาก: {sub.studentName} • {formatDateTime(sub.submittedAt)}</p>
                </div>
                <StatusBadge status={sub.status} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Teacher Statistics Section ── */}
      <div className="bg-white rounded-xl border border-green-100 shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
          <BarChart2 size={18} className="text-green-600" />
          <h3 className="text-green-800 text-base">สถิติการพิจารณา</h3>
        </div>
        <div className="p-5">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'อนุมัติทั้งหมด', value: allApproved.length, color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'ปฏิเสธทั้งหมด', value: allRejected.length, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'อัตราอนุมัติ', value: `${approvalRate}%`, color: total > 0 ? (approvalRate >= 70 ? 'text-green-700' : 'text-yellow-700') : 'text-gray-400', bg: 'bg-gray-50' },
            ].map((s, i) => (
              <div key={i} className={`${s.bg} rounded-xl p-3 text-center`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Monthly chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">รายเดือน (6 เดือนล่าสุด)</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> อนุมัติ</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-300 inline-block" /> ปฏิเสธ</span>
              </div>
            </div>
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
          <h3 className="text-green-800 text-base">ประวัติการอนุมัติล่าสุด</h3>
        </div>
        <div className="p-4 space-y-3">
          {allApproved.slice(0, 4).map(sub => {
            const myStep = sub.approvalSteps.find(s => s.approverId === currentUser?.id);
            return (
              <div key={sub.id} className="flex items-center gap-3 p-3 rounded-lg">
                <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <CheckCircle size={16} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{sub.formName}</p>
                  <p className="text-xs text-gray-500">
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
  );
}

