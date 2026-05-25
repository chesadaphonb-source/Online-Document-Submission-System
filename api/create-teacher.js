import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://idjxzhzyadykcvuavszf.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('[create-teacher] SUPABASE_SERVICE_ROLE_KEY is not configured');
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { email, password, name, department, position, isAdvisor, isDepartmentHead, isDean } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูล อีเมล, รหัสผ่าน และชื่อ-นามสกุล ให้ครบถ้วน' });
  }

  try {
    // 1. สร้างผู้ใช้ใน Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: { name: name.trim() }
    });

    if (authError) {
      console.error('[create-teacher] Auth creation error:', authError.message);
      return res.status(400).json({ error: `Auth Error: ${authError.message}` });
    }

    const userId = authData.user.id;

    // 2. บันทึกข้อมูลลงตาราง public.users
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'teacher',
        department: department || '',
        faculty: 'คณะสิ่งแวดล้อม'
      });

    if (userError) {
      console.error('[create-teacher] Users table insert error:', userError.message);
      // Rollback Auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: `Users Profile Error: ${userError.message}` });
    }

    // 3. บันทึกข้อมูลลงตาราง public.teachers
    const { error: teacherError } = await supabaseAdmin
      .from('teachers')
      .insert({
        user_id: userId,
        position: position || 'อาจารย์',
        is_advisor: !!isAdvisor,
        is_department_head: !!isDepartmentHead,
        is_dean: !!isDean
      });

    if (teacherError) {
      console.error('[create-teacher] Teachers table insert error:', teacherError.message);
      // Rollback both
      await supabaseAdmin.from('users').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: `Teachers Profile Error: ${teacherError.message}` });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'teacher',
        department: department || '',
        faculty: 'คณะสิ่งแวดล้อม',
        position: position || 'อาจารย์',
        is_advisor: !!isAdvisor,
        is_department_head: !!isDepartmentHead,
        is_dean: !!isDean
      }
    });
  } catch (err) {
    console.error('[create-teacher] Internal error:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', detail: String(err) });
  }
}
