import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface SystemContextType {
  isMaintenanceMode: boolean;
  toggleMaintenanceMode: (enabled: boolean) => Promise<void>;
  loading: boolean;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const SUPER_ADMIN_EMAILS = ['chesadaphon.b@ku.th', 'rampai.s@ku.th', 'rampai.se@ku.th'];

export function SystemProvider({ children }: { children: ReactNode }) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const { currentUser, isLoading: authLoading } = useAuth();

  useEffect(() => {
    fetchSystemSettings();
    
    // Subscribe to changes
    if (isSupabaseConfigured && supabase) {
      const channel = supabase
        .channel('system_settings_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'system_settings', filter: "key=eq.maintenance_mode" },
          (payload) => {
            if (payload.new && (payload.new as any).value) {
              setIsMaintenanceMode((payload.new as any).value.enabled);
            }
          }
        )
        .subscribe();
      return () => { supabase?.removeChannel(channel); };
    }
  }, []);

  const fetchSystemSettings = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .single();
        
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('Failed to fetch system settings', error);
      } else if (data && data.value) {
        setIsMaintenanceMode(data.value.enabled);
      }
    } catch (err) {
      console.error('System settings fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMaintenanceMode = async (enabled: boolean) => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!currentUser?.email || !SUPER_ADMIN_EMAILS.includes(currentUser.email)) {
      toast.error('คุณไม่มีสิทธิ์ใช้งานคำสั่งนี้');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'maintenance_mode', value: { enabled } });
        
      if (error) throw error;
      
      setIsMaintenanceMode(enabled);
      toast.success(enabled ? 'เปิดโหมดปรับปรุงระบบแล้ว' : 'ปิดโหมดปรับปรุงระบบแล้ว (เปิดใช้งานปกติ)');
    } catch (err) {
      console.error('Failed to toggle maintenance mode', err);
      toast.error('เกิดข้อผิดพลาดในการเปลี่ยนโหมด กรุณาตรวจสอบว่าได้สร้างตาราง system_settings หรือยัง');
    }
  };

  // If maintenance mode is ON and user is NOT super admin, show maintenance screen
  const isSuperAdmin = !!currentUser?.email && SUPER_ADMIN_EMAILS.includes(currentUser.email);
  const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
  
  if (!loading && !authLoading && isMaintenanceMode && !isSuperAdmin && !isLoginPage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
            <span className="text-4xl">🚧</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">ระบบกำลังปรับปรุง</h1>
            <p className="text-gray-600 leading-relaxed">
              คณะนี้กำลังปรับปรุงอยู่กรุณาทำใจให้สบาย เมื่อเสร็จแล้วเดี๋ยวใช้ได้เอง
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <span className="font-semibold block mb-1">ติดต่อผู้สร้างโดยตรงถ้าพบปัญหา:</span>
              Line: <strong className="text-blue-600">@0949906050</strong>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SystemContext.Provider value={{ isMaintenanceMode, toggleMaintenanceMode, loading }}>
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (context === undefined) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
}
