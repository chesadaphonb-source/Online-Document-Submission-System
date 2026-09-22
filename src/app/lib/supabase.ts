import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ใช้ Environment Variables ถ้ามี ถ้าไม่มีใช้ค่าตายตัว (anon key ปลอดภัย เป็น public)
const SUPABASE_URL = ((import.meta as any).env?.VITE_SUPABASE_URL as string)
  || 'https://qurxmazwgfozpfglnxnc.supabase.co';

const SUPABASE_ANON_KEY = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cnhtYXp3Z2ZvenBmZ2xueG5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NTU5OTMsImV4cCI6MjA5NzMzMTk5M30.vsrX-I-LVLe47I0Bc0v1zH_vKFduWPJ3JN_t-TzCS0w';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Unified Supabase client for DB & Storage
export const supabaseStorage: SupabaseClient | null = supabase;

if (!isSupabaseConfigured) {
  console.warn('[KU-Paper] Supabase not configured. Using mock data.');
}
