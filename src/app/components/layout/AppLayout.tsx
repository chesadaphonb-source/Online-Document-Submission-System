import { Outlet, NavLink, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSubmissions } from '../../context/SubmissionsContext';
import { useEffect, useState, ElementType, useRef } from 'react';
import {
  LayoutDashboard, FileText, ClipboardList, CheckSquare, Users,
  LogOut, Menu, X, Bell, UserCircle, FileSearch, ChevronRight,
  Inbox, Clock, CheckCircle, XCircle, AlertTriangle, Info,
} from 'lucide-react';
import type { Notification, NotificationType } from '../../context/NotificationContext';

interface NavItem {
  path: string;
  label: string;
  icon: ElementType;
  badge?: number;
}

const studentNav: NavItem[] = [
  { path: '/student/dashboard', label: 'หน้าหลัก', icon: LayoutDashboard },
  { path: '/student/submit', label: 'ยื่นคำร้อง', icon: FileText },
  { path: '/student/track', label: 'ติดตามสถานะ', icon: ClipboardList },
];

const teacherNav: NavItem[] = [
  { path: '/teacher/dashboard', label: 'หน้าหลัก', icon: LayoutDashboard },
  { path: '/teacher/approvals', label: 'คำร้องที่รอพิจารณา', icon: CheckSquare },
];

const adminNav: NavItem[] = [
  { path: '/admin/dashboard', label: 'หน้าหลัก', icon: LayoutDashboard },
  { path: '/admin/inbox', label: 'รับ-ส่งเรื่อง', icon: Inbox },
  { path: '/admin/flow', label: 'ภาพรวมเอกสาร', icon: FileSearch },
  { path: '/admin/forms', label: 'จัดการแบบฟอร์ม', icon: FileText },
  { path: '/admin/users', label: 'จัดการผู้ใช้', icon: Users },
];

function getNavItems(role: string) {
  if (role === 'student') return studentNav;
  if (role === 'teacher') return teacherNav;
  return adminNav;
}

function getRoleLabel(role: string) {
  if (role === 'student') return { th: 'นิสิต', color: 'text-blue-300' };
  if (role === 'teacher') return { th: 'อาจารย์', color: 'text-orange-300' };
  return { th: 'ผู้ดูแลระบบ', color: 'text-purple-300' };
}

function notifIcon(type: NotificationType) {
  if (type === 'completed') return <CheckCircle size={14} className="text-green-500 shrink-0" />;
  if (type === 'admin_rejected' || type === 'teacher_rejected') return <XCircle size={14} className="text-red-500 shrink-0" />;
  if (type === 'deadline_urgent' || type === 'deadline_expired') return <AlertTriangle size={14} className="text-red-500 shrink-0" />;
  if (type === 'deadline_warning') return <Clock size={14} className="text-yellow-500 shrink-0" />;
  return <Info size={14} className="text-blue-500 shrink-0" />;
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  return `${days} วันที่แล้ว`;
}

function NotificationDropdown({ userId, userRole, onClose }: { userId: string; userRole: string; onClose: () => void }) {
  const { getForUser, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const notifs = getForUser(userId, userRole).slice(0, 8);

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">การแจ้งเตือน</p>
        <button
          onClick={() => markAllAsRead(userId)}
          className="text-xs text-green-600 hover:text-green-800 transition-colors"
        >
          อ่านทั้งหมด
        </button>
      </div>

      {notifs.length === 0 ? (
        <div className="py-10 text-center">
          <Bell size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {notifs.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!n.isRead ? 'bg-blue-50/40' : ''}`}
            >
              <div className="mt-0.5">{notifIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs leading-tight ${!n.isRead ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(n.createdAt)}</p>
              </div>
              {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin Notification Dropdown (ดึงจาก submissions จริง — ไม่หายหลัง refresh) ──
function AdminNotificationDropdown({ onClose }: { onClose: () => void }) {
  const { submissions } = useSubmissions();
  const navigate = useNavigate();
  const pendingSubs = submissions.filter(s => s.status === 'submitted' || s.status === 'admin_reviewing');
  const rejectedSubs = submissions.filter(s => s.status === 'teacher_rejected');
  const closeSubs = submissions.filter(s => s.status === 'pending_close');
  const allItems = [
    ...pendingSubs.map(s => ({ sub: s, label: 'รอรับเรื่อง', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600' })),
    ...rejectedSubs.map(s => ({ sub: s, label: 'อาจารย์ปฏิเสธ', dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-600' })),
    ...closeSubs.map(s => ({ sub: s, label: 'รอปิดงาน', dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-600' })),
  ].slice(0, 10);
  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">การแจ้งเตือน</p>
        <button onClick={() => { navigate('/admin/inbox'); onClose(); }} className="text-xs text-green-600 hover:text-green-800 transition-colors">ดูทั้งหมด</button>
      </div>
      {allItems.length === 0 ? (
        <div className="py-10 text-center">
          <Bell size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">ไม่มีคำร้องที่รอดำเนินการ</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {allItems.map(({ sub, label, dot, badge }) => (
            <button key={sub.id} onClick={() => { navigate('/admin/inbox'); onClose(); }}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 bg-blue-50/20">
              <div className={`w-2 h-2 rounded-full ${dot} shrink-0 mt-1.5`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 leading-tight">{sub.formName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub.studentName || 'ไม่ระบุชื่อ'}{sub.department ? ` • ${sub.department}` : ''}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${badge}`}>{label}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ role }: { role: 'student' | 'teacher' | 'admin' }) {
  const { currentUser, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const roleInfo = getRoleLabel(role);

  useEffect(() => {
    if (isLoading) return;
    if (!currentUser) { navigate('/login', { replace: true }); return; }
    if (currentUser.role !== role) navigate(`/${currentUser.role}/dashboard`, { replace: true });
  }, [currentUser, role, navigate, isLoading]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const navItems = getNavItems(role);
  const { submissions } = useSubmissions();
  const myUnread = currentUser
    ? (role === 'admin'
        ? submissions.filter(s => s.status === 'submitted' || s.status === 'teacher_rejected' || s.status === 'pending_close').length
        : unreadCount(currentUser.id, currentUser.role))
    : 0;

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-green-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-[#1a5c2e] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#1a5c2e] text-sm font-medium">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <div className="flex h-screen bg-green-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#1a5c2e] flex flex-col transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-green-700/50">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
            <span className="text-[#1a5c2e] font-bold text-base">KU</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base leading-tight">KU-Paper</p>
            <p className={`text-xs ${roleInfo.color}`}>{roleInfo.th}</p>
          </div>
          <button className="lg:hidden text-green-200 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${isActive ? 'bg-white text-[#1a5c2e] shadow-sm' : 'text-green-100 hover:bg-white/10'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} className={isActive ? 'text-green-700' : ''} />
                  <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
                  {isActive && <ChevronRight size={14} className="ml-auto text-green-600" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-green-700/50">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-9 h-9 rounded-full bg-green-500/30 border border-green-400/30 flex items-center justify-center shrink-0">
              <UserCircle size={20} className="text-green-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{currentUser.name}</p>
              <p className="text-green-400 text-xs truncate">{currentUser.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-green-200 hover:bg-white/10 text-sm transition-all"
          >
            <LogOut size={18} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-green-100 px-4 py-3 flex items-center gap-4 shrink-0 shadow-sm">
          <button className="lg:hidden text-green-700 p-1" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-green-800 text-sm font-medium hidden sm:block">ระบบส่งเอกสารออนไลน์ มหาวิทยาลัยเกษตรศาสตร์</p>
            <p className="text-green-600 text-xs hidden sm:block">KU-Paper Online Document System</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bell with dropdown */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifOpen(prev => !prev)}
                className="relative p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                id="notification-bell"
              >
                <Bell size={20} />
                {myUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {myUnread > 99 ? '99+' : myUnread}
                  </span>
                )}
              </button>
              {notifOpen && (
                role === 'admin'
                  ? <AdminNotificationDropdown onClose={() => setNotifOpen(false)} />
                  : <NotificationDropdown userId={currentUser.id} userRole={currentUser.role} onClose={() => setNotifOpen(false)} />
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <UserCircle size={18} className="text-green-700" />
              </div>
              <div className="text-left">
                <p className="text-xs font-medium text-gray-800 truncate max-w-32">{currentUser.name}</p>
                <p className="text-xs text-gray-400">{roleInfo.th}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}