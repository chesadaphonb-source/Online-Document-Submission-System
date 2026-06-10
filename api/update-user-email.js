import { createClient } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAILS = ['chesadaphon.b@ku.th', 'rampai.s@ku.th', 'rampai.se@ku.th'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://idjxzhzyadykcvuavszf.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error('[update-user-email] SUPABASE_SERVICE_ROLE_KEY is not configured');
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { userId, newEmail, adminEmail } = req.body;

  if (!userId || !newEmail || !adminEmail) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูล userId, newEmail และ adminEmail ให้ครบถ้วน' });
  }

  // Check super admin permission
  if (!SUPER_ADMIN_EMAILS.includes(adminEmail.trim().toLowerCase())) {
    return res.status(403).json({ error: 'สิทธิ์การใช้งานจำกัดเฉพาะ Super Admin เท่านั้น' });
  }

  try {
    // 1. ค้นหาผู้ใช้เพื่อตรวจสอบว่ามีอยู่จริง
    const { data: userData, error: findError } = await supabaseAdmin
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (findError || !userData) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้ที่ระบุในฐานข้อมูล' });
    }

    const oldEmail = userData.email;
    const userName = userData.name;

    // 2. อัปเดตอีเมลในระบบล็อกอิน (auth.users)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail.trim().toLowerCase(),
      email_confirm: true
    });

    if (authError) {
      console.error('[update-user-email] Auth update error:', authError.message);
      return res.status(400).json({ error: `ไม่สามารถอัปเดตอีเมลระบบล็อกอินได้: ${authError.message}` });
    }

    // 3. อัปเดตอีเมลในตาราง public.users
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({ email: newEmail.trim().toLowerCase() })
      .eq('id', userId);

    if (userError) {
      console.error('[update-user-email] Users table update error:', userError.message);
      // พยายาม rollback
      await supabaseAdmin.auth.admin.updateUserById(userId, { email: oldEmail });
      return res.status(400).json({ error: `ไม่สามารถอัปเดตอีเมลในฐานข้อมูลหลักได้: ${userError.message}` });
    }

    console.log(`[update-user-email] Successfully updated email for ${userName} (${userId}) from ${oldEmail} to ${newEmail}`);

    return res.status(200).json({
      success: true,
      message: `เปลี่ยนอีเมลของ ${userName} เป็น ${newEmail} เรียบร้อยแล้ว`
    });
  } catch (err) {
    console.error('[update-user-email] Internal error:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', detail: String(err) });
  }
}
