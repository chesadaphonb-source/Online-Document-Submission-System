import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { SUPER_ADMIN_EMAILS } from './SystemContext';

// ============================================================
// TYPES
// ============================================================
export type NotificationType =
  | 'new_submission'        // นิสิตยื่น → Admin
  | 'forwarded_to_teacher'  // Admin forward → อาจารย์
  | 'teacher_approved'      // อาจารย์อนุมัติ → อาจารย์ถัดไป / Admin
  | 'teacher_rejected'      // อาจารย์ reject → Admin
  | 'admin_rejected'        // Admin reject final → นิสิต
  | 'returned_to_teacher'   // Admin ส่งกลับ → อาจารย์
  | 'approver_changed'      // Admin เปลี่ยนผู้อนุมัติ → อาจารย์ใหม่
  | 'completed'             // Admin ปิดงาน → นิสิต
  | 'status_update'         // ทุก step → นิสิต
  | 'deadline_set'          // Admin ตั้ง deadline → ทุกคน
  | 'deadline_warning'      // เหลือ 3 วัน
  | 'deadline_urgent'       // เหลือ 1 วัน
  | 'deadline_expired'      // เกิน deadline
  | 'admin_edited';         // Admin แก้ไขฟอร์ม → นิสิต

export interface Notification {
  id: string;
  recipientId: string;
  senderId?: string;
  senderName?: string;
  submissionId: string;
  submissionName: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
  // ข้อมูลนิสิตสำหรับแนบในอีเมล
  studentName?: string;
  studentEmail?: string;
  department?: string;
  studentId?: string;
  studentLevel?: string;    // ระดับการศึกษา: ปริญญาตรี / ปริญญาโท / ปริญญาเอก
  studentYear?: number;     // ชั้นปี
}

// ============================================================
// NOTIFICATION FACTORY HELPERS
// ============================================================
export function makeNotification(
  partial: Omit<Notification, 'id' | 'createdAt' | 'isRead'>
): Notification {
  return {
    ...partial,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    isRead: false,
  };
}

// Helper to convert DB row to Notification
function rowToNotification(row: any): Notification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    senderId: row.sender_id || undefined,
    senderName: row.sender_name || undefined,
    submissionId: row.submission_id,
    submissionName: row.submission_name,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    isRead: row.is_read || false,
    createdAt: row.created_at,
    actionUrl: row.action_url || undefined,
  };
}

// ============================================================
// CONTEXT
// ============================================================
interface NotificationContextType {
  notifications: Notification[];
  unreadCount: (userId: string, userRole?: string) => number;
  getForUser: (userId: string, userRole?: string) => Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void;
  addNotifications: (ns: Omit<Notification, 'id' | 'createdAt' | 'isRead'>[]) => void;
  markAsRead: (notifId: string) => void;
  markAllAsRead: (userId: string, userRole?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { currentUser } = useAuth();

  // Load from Supabase on mount or user change
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !currentUser) return;

    // เก็บ reference ไว้ใน local variable เพื่อให้ TypeScript รู้ว่าไม่ใช่ null
    const db = supabase;

    const fetchNotifications = async () => {
      let query = db.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
      
      if (currentUser.role === 'admin') {
        query = query.or(`recipient_id.eq.${currentUser.id},recipient_id.eq.role:admin`);
      } else {
        query = query.eq('recipient_id', currentUser.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        setNotifications(data.map(rowToNotification));
      }
    };

    fetchNotifications();

    // Subscribe to new notifications
    const channel = db.channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        const row = payload.new as any;
        if (row.recipient_id === currentUser.id || (currentUser.role === 'admin' && row.recipient_id === 'role:admin')) {
          setNotifications(prev => [rowToNotification(row), ...prev]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, payload => {
        const row = payload.new as any;
        setNotifications(prev => prev.map(n => n.id === row.id ? rowToNotification(row) : n));
      })
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [currentUser]);

  // Helper: ค้นหา email ของผู้รับจาก Supabase
  const lookupEmails = async (recipientId: string, department?: string): Promise<string[]> => {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      if (recipientId === 'role:admin') {
        const { data, error } = await supabase.from('users').select('email, department').eq('role', 'admin');
        if (error) { console.warn('[lookupEmails] admin query error:', error.message); return []; }
        if (!data) return [];
        const filtered = data
          .filter((u: any) => {
            const isSuper = u.email ? SUPER_ADMIN_EMAILS.includes(u.email) : false;
            if (isSuper) return true;
            if (!department) return true;
            return u.department?.trim().toLowerCase() === department.trim().toLowerCase();
          })
          .map((r: any) => r.email)
          .filter(Boolean);
        console.log('[lookupEmails] role:admin →', filtered);
        return filtered;
      } else if (recipientId === 'role:teacher') {
        const { data, error } = await supabase.from('users').select('email').eq('role', 'teacher');
        if (error) { console.warn('[lookupEmails] teacher query error:', error.message); return []; }
        const emails = (data || []).map((r: any) => r.email).filter(Boolean);
        console.log('[lookupEmails] role:teacher →', emails);
        return emails;
      } else {
        // Lookup individual user email
        const { data, error } = await supabase.from('users').select('email, role').eq('id', recipientId).maybeSingle();
        if (error) { console.warn('[lookupEmails] user query error:', error.message); }
        if (data?.email) {
          console.log('[lookupEmails] user', recipientId, '→', data.email);
          return [data.email];
        }
        console.warn('[lookupEmails] no email found for recipientId:', recipientId);
        return [];
      }
    } catch (err) {
      console.error('[lookupEmails] exception:', err);
      return [];
    }
  };

  const addNotification = useCallback(async (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => {
    const newNotif = makeNotification(n);
    setNotifications(prev => [newNotif, ...prev]);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('notifications').insert({
        recipient_id: n.recipientId,
        sender_id: n.senderId,
        sender_name: n.senderName,
        submission_id: n.submissionId,
        submission_name: n.submissionName,
        type: n.type,
        title: n.title,
        message: n.message,
        is_read: false,
        action_url: n.actionUrl,
      });
    }

    // ตรวจสอบว่าเป็นสภาพแวดล้อม stg หรือไม่ (ถ้าใช่ จะไม่มีการส่งแจ้งเตือนภายนอกรบกวนผู้อื่น)
    const isStg = typeof window !== 'undefined' && window.location.hostname !== 'ku-envipaper.vercel.app';
    if (isStg) {
      console.log('📢 [stg Bypass] ข้ามการยิงส่งอีเมลและส่ง Google Chat ในระบบทดสอบ:', n.title);
      return;
    }

    // ส่งแจ้งเตือน Google Chat
    try {
      await fetch('/api/notify-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: n.type, title: n.title, message: n.message, submissionName: n.submissionName, senderName: n.senderName }),
      });
    } catch { /* ไม่หยุดระบบหลัก */ }

    // ส่ง Email แจ้งเตือน
    try {
      // lookupEmails จาก Supabase ก่อน, ถ้าไม่เจอ ใช้ studentEmail ใน notification โดยตรง (fallback สำหรับนิสิต guest)
      let emails = await lookupEmails(n.recipientId, n.department);
      if (emails.length === 0 && n.studentEmail) {
        emails = [n.studentEmail];
      }
      console.log('[addNotification] Sending email to:', emails, 'for type:', n.type);
      if (emails.length > 0) {
        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emails,
            subject: n.title,
            type: n.type,
            message: n.message,
            submissionName: n.submissionName,
            senderName: n.senderName,
            actionUrl: n.actionUrl,
            studentName: n.studentName,
            studentEmail: n.studentEmail,
            department: n.department,
            studentId: n.studentId,
          }),
        });
        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          console.error('[addNotification] send-email failed:', emailRes.status, errBody);
        }
      }
    } catch (err) {
      console.error('[addNotification] email exception:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNotifications = useCallback(async (ns: Omit<Notification, 'id' | 'createdAt' | 'isRead'>[]) => {
    const newNotifs = ns.map(makeNotification);
    setNotifications(prev => [...newNotifs, ...prev]);

    if (isSupabaseConfigured && supabase) {
      const rows = ns.map(n => ({
        recipient_id: n.recipientId,
        sender_id: n.senderId,
        sender_name: n.senderName,
        submission_id: n.submissionId,
        submission_name: n.submissionName,
        type: n.type,
        title: n.title,
        message: n.message,
        is_read: false,
        action_url: n.actionUrl,
      }));
      await supabase.from('notifications').insert(rows);
    }

    // ตรวจสอบว่าเป็นสภาพแวดล้อม stg หรือไม่ (ถ้าใช่ จะไม่มีการส่งแจ้งเตือนภายนอกรบกวนผู้อื่น)
    const isStg = typeof window !== 'undefined' && window.location.hostname !== 'ku-envipaper.vercel.app';
    if (isStg) {
      console.log('📢 [stg Bypass] ข้ามการยิงส่งอีเมลและส่ง Google Chat ในระบบทดสอบ:', ns.length, 'รายการ');
      return;
    }

    // ส่งแจ้งเตือน Google Chat สำหรับรายการแรก
    if (ns.length > 0) {
      const first = ns[0];
      try {
        await fetch('/api/notify-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: first.type,
            title: ns.length > 1 ? `${first.title} (+${ns.length - 1} รายการ)` : first.title,
            message: first.message,
            submissionName: first.submissionName,
            senderName: first.senderName,
          }),
        });
      } catch { /* ไม่หยุดระบบหลัก */ }

      // ส่ง Email แจ้งเตือนทุกคนในรายการ
      try {
        await Promise.all(ns.map(async (n) => {
          let emails = await lookupEmails(n.recipientId, n.department);
          if (emails.length === 0 && n.studentEmail) {
            emails = [n.studentEmail];
          }
          if (emails.length > 0) {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: emails,
                subject: n.title,
                type: n.type,
                message: n.message,
                submissionName: n.submissionName,
                senderName: n.senderName,
                actionUrl: n.actionUrl,
                studentName: n.studentName,
                studentEmail: n.studentEmail,
                department: n.department,
                studentId: n.studentId,
              }),
            });
          }
        }));
      } catch { /* ไม่หยุดระบบหลัก */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAsRead = useCallback(async (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
    if (isSupabaseConfigured && supabase) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    }
  }, []);

  const markAllAsRead = useCallback(async (userId: string, userRole?: string) => {
    setNotifications(prev =>
      prev.map(n => {
        const matches = n.recipientId === userId || (userRole === 'admin' && n.recipientId === 'role:admin');
        return matches ? { ...n, isRead: true } : n;
      })
    );
    if (isSupabaseConfigured && supabase) {
      let query = supabase.from('notifications').update({ is_read: true });
      if (userRole === 'admin') {
        query = query.or(`recipient_id.eq.${userId},recipient_id.eq.role:admin`);
      } else {
        query = query.eq('recipient_id', userId);
      }
      await query;
    }
  }, []);

  const getForUser = useCallback((userId: string, userRole?: string) =>
    notifications
      .filter(n => n.recipientId === userId || (userRole === 'admin' && n.recipientId === 'role:admin'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications]
  );

  const unreadCount = useCallback((userId: string, userRole?: string) =>
    notifications.filter(n =>
      (n.recipientId === userId || (userRole === 'admin' && n.recipientId === 'role:admin')) && !n.isRead
    ).length,
    [notifications]
  );

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, getForUser,
      addNotification, addNotifications, markAsRead, markAllAsRead,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationProvider');
  return ctx;
}
