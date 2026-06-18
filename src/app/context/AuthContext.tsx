import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Student, Teacher, Admin, mockUsers, loginCredentials } from '../data/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';


interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string; user?: User }>;
  loginAsStudent: (name: string, studentId: string, department?: string, studentEmail?: string, campus?: string, level?: string, year?: number) => { success: boolean; user: User };
  logout: () => Promise<void>;
  isLoading: boolean;
  mode: 'supabase' | 'mock';
  updateCurrentUserProfile: (updatedData: Partial<Student & Teacher & Admin>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Mock Profile Builder จาก Supabase User ─────────────────────
function buildUserFromSupabase(supabaseUser: any, profile: any): User {
  return {
    id: supabaseUser.id,
    name: profile?.name || supabaseUser.email?.split('@')[0] || 'ผู้ใช้',
    email: supabaseUser.email || '',
    role: profile?.role || 'student',
    department: profile?.department || '',
    faculty: profile?.faculty || '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mode = isSupabaseConfigured ? 'supabase' : 'mock';

  // ── Init: ตรวจสอบ Session เมื่อโหลด ─────────────────────────
  useEffect(() => {
    // อ่าน session จาก localStorage (ทั้ง Supabase mode และ Mock mode)
    const storedProfile = localStorage.getItem('ku_paper_user_profile');
    const storedUserId = localStorage.getItem('ku_paper_user_id');

    if (storedProfile) {
      try {
        const user = JSON.parse(storedProfile);
        setCurrentUser(user);

        // ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์ในพื้นหลังเพื่อซิงค์ข้อมูล (เช่น สังกัด)
        if (mode === 'supabase' && supabase && storedUserId) {
          supabase
            .from('users')
            .select('*')
            .eq('id', storedUserId)
            .single()
            .then(async ({ data: profile }) => {
              if (profile) {
                const updatedUser: any = {
                  id: profile.id,
                  name: profile.name || user.name,
                  email: profile.email,
                  role: profile.role || 'teacher',
                  department: profile.department || '',
                  faculty: profile.faculty || '',
                  campus: profile.campus || 'bangkhen',
                };
                if (updatedUser.role === 'teacher') {
                  const { data: teacherProfile } = await supabase!.from('teachers')
                    .select('*')
                    .eq('user_id', profile.id)
                    .single();
                  if (teacherProfile) {
                    updatedUser.position = teacherProfile.position;
                    updatedUser.isAdvisor = teacherProfile.is_advisor;
                    updatedUser.isDepartmentHead = teacherProfile.is_department_head;
                    updatedUser.isDean = teacherProfile.is_dean;
                    updatedUser.signatureData = teacherProfile.signature_data;
                  }
                }
                setCurrentUser(updatedUser);
                localStorage.setItem('ku_paper_user_profile', JSON.stringify(updatedUser));
              }
            });
        }
      } catch { localStorage.removeItem('ku_paper_user_profile'); }
    } else if (storedUserId && mode !== 'supabase') {
      const user = mockUsers.find(u => u.id === storedUserId);
      if (user) setCurrentUser(user);
    }

    // Student guest session
    const guestRaw = localStorage.getItem('ku_paper_guest_student');
    if (guestRaw && !storedProfile) {
      try {
        const guest = JSON.parse(guestRaw);
        setCurrentUser(guest);
      } catch { localStorage.removeItem('ku_paper_guest_student'); }
    }

    setIsLoading(false);
  }, [mode]);



  // ── Login ──────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string; user?: User }> => {
    if (mode === 'supabase' && supabase) {
      // ── ใช้ Supabase Auth signInWithPassword ──
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !authData.user) {
        return { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
      }

      // ดึง profile จาก public.users
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        return { success: false, message: 'ไม่พบข้อมูลผู้ใช้ในระบบ' };
      }

      const user: any = {
        id: profile.id,
        name: profile.name || email.split('@')[0],
        email: profile.email,
        role: profile.role || 'teacher',
        department: profile.department || '',
        faculty: profile.faculty || '',
        campus: profile.campus || 'bangkhen',
      };

      if (user.role === 'teacher') {
        const { data: teacherProfile } = await supabase
          .from('teachers')
          .select('*')
          .eq('user_id', profile.id)
          .single();
        if (teacherProfile) {
          user.position = teacherProfile.position;
          user.isAdvisor = teacherProfile.is_advisor;
          user.isDepartmentHead = teacherProfile.is_department_head;
          user.isDean = teacherProfile.is_dean;
          user.signatureData = teacherProfile.signature_data;
        }
      }

      setCurrentUser(user);
      localStorage.setItem('ku_paper_user_id', user.id);
      localStorage.setItem('ku_paper_user_profile', JSON.stringify(user));
      return { success: true, user };

    } else {
      // ── Mock Login ──
      const cred = loginCredentials.find(c => c.email === email && c.password === password);
      if (!cred) return { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
      const user = mockUsers.find(u => u.id === cred.userId);
      if (!user) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };
      setCurrentUser(user);
      localStorage.setItem('ku_paper_user_id', user.id);
      return { success: true, user };
    }
  };

  // ── Student Guest Login (ไม่ต้อง password) ────────────────
  const loginAsStudent = (name: string, studentId: string, department?: string, studentEmail?: string, campus?: string, level?: string, year?: number): { success: boolean; user: User } => {
    const guestUser: User = {
      id: `student_${studentId}`,
      name: name.trim(),
      email: studentEmail?.trim() || `${studentId}@ku.th`,
      role: 'student',
      department: department || '',
      faculty: 'คณะสิ่งแวดล้อม',
      studentId: studentId,
      level: level || 'ปริญญาตรี',
      year: year || 1,
      phone: '',
      academicYear: String(new Date().getFullYear() + 543),
      advisorId: '',
      campus: campus || 'bangkhen',
    };
    setCurrentUser(guestUser);
    localStorage.setItem('ku_paper_user_id', guestUser.id);
    localStorage.setItem('ku_paper_guest_student', JSON.stringify(guestUser));
    return { success: true, user: guestUser };
  };


  const logout = async () => {
    localStorage.removeItem('ku_paper_user_id');
    localStorage.removeItem('ku_paper_user_profile');
    localStorage.removeItem('ku_paper_guest_student');
    setCurrentUser(null);
  };

  const updateCurrentUserProfile = (updatedData: Partial<Student & Teacher & Admin>) => {
    setCurrentUser(prev => {
      if (!prev) return null;
      const newProfile = { ...prev, ...updatedData } as User;
      localStorage.setItem('ku_paper_user_profile', JSON.stringify(newProfile));
      return newProfile;
    });
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, loginAsStudent, logout, isLoading, mode, updateCurrentUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}