import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ใช้ Environment Variables ถ้ามี ถ้าไม่มีใช้ค่าตายตัว (anon key ปลอดภัย เป็น public)
const SUPABASE_URL = ((import.meta as any).env?.VITE_SUPABASE_URL as string)
  || 'https://idjxzhzyadykcvuavszf.supabase.co';

const SUPABASE_ANON_KEY = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkanh6aHp5YWR5a2N2dWF2c3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMTQ5OTUsImV4cCI6MjA5MjU5MDk5NX0.PhhwZuo5Ood0kA01FG_Yf6nkJQC-lqV863VAEE-r4MQ';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!isSupabaseConfigured) {
  console.warn('[KU-Paper] Supabase not configured. Using mock data.');
}
