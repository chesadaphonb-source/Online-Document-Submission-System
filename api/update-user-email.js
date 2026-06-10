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

  const { userId, newEmail, newPassword, adminEmail } = req.body;

  if (!userId || !adminEmail) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูล userId และ adminEmail ให้ครบถ้วน' });
  }

  try {
    // Check requester role
    const { data: adminUser, error: adminErr } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('email', adminEmail.trim().toLowerCase())
      .single();

    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(adminEmail.trim().toLowerCase());
    const isAdmin = adminUser?.role === 'admin' || isSuperAdmin;

    if (!isAdmin) {
      return res.status(403).json({ error: 'สิทธิ์การใช้งานจำกัดเฉพาะผู้ดูแลระบบ (Admin) เท่านั้น' });
    }

    if (newEmail && !isSuperAdmin) {
      return res.status(403).json({ error: 'สิทธิ์การเปลี่ยนอีเมลจำกัดเฉพาะ Super Admin เท่านั้น' });
    }

    // 1. ค้นหาผู้ใช้เพื่อตรวจสอบว่ามีอยู่จริง
    const { data: userData, error: findError } = await supabaseAdmin
      .from('users')
      .select('name, email, plain_password')
      .eq('id', userId)
      .single();

    if (findError || !userData) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้ที่ระบุในฐานข้อมูล' });
    }

    const updates = {};
    const dbUpdates = {};

    // 2. ตรวจสอบการเปลี่ยนอีเมล
    if (newEmail && newEmail.trim().toLowerCase() !== userData.email.toLowerCase()) {
      updates.email = newEmail.trim().toLowerCase();
      updates.email_confirm = true;
      dbUpdates.email = newEmail.trim().toLowerCase();
    }

    // 3. ตรวจสอบการเปลี่ยนรหัสผ่าน
    if (newPassword && newPassword !== userData.plain_password) {
      updates.password = newPassword;
      dbUpdates.plain_password = newPassword;
    }

    if (Object.keys(updates).length > 0) {
      // อัปเดตในระบบ Auth
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, updates);
      if (authError) {
        console.error('[update-user-email] Auth update error:', authError.message);
        return res.status(400).json({ error: `ไม่สามารถอัปเดตข้อมูลในระบบ Auth ได้: ${authError.message}` });
      }
    }

    if (Object.keys(dbUpdates).length > 0) {
      // อัปเดตในตาราง public.users
      const { error: userError } = await supabaseAdmin
        .from('users')
        .update(dbUpdates)
        .eq('id', userId);

      if (userError) {
        console.error('[update-user-email] Users table update error:', userError.message);
        // rollback Auth
        const rollback = {};
        if (dbUpdates.email) rollback.email = userData.email;
        if (dbUpdates.plain_password) rollback.password = userData.plain_password;
        await supabaseAdmin.auth.admin.updateUserById(userId, rollback);

        return res.status(400).json({ error: `ไม่สามารถอัปเดตข้อมูลในฐานข้อมูลหลักได้: ${userError.message}` });
      }
    }

    console.log(`[update-user-email] Successfully updated credentials for ${userData.name} (${userId})`);

    return res.status(200).json({
      success: true,
      message: 'อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว'
    });
  } catch (err) {
    console.error('[update-user-email] Internal error:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์', detail: String(err) });
  }
}
