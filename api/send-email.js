// api/send-email.js — Gmail SMTP via Nodemailer (Vercel Serverless)
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.error('[send-email] Gmail credentials not configured');
    return res.status(500).json({ error: 'Gmail credentials not configured' });
  }

  const { to, subject, type, message, submissionName, senderName, actionUrl,
          studentName, studentEmail, department, studentId } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: 'Missing required fields: to, subject' });
  }

  const toArray = Array.isArray(to) ? to : [to];
  const validEmails = toArray.filter(e => e && typeof e === 'string' && e.includes('@'));

  if (validEmails.length === 0) {
    return res.status(400).json({ error: 'No valid email addresses' });
  }

  // สร้าง transporter ด้วย Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass.replace(/\s/g, ''), // ลบ space ออกจาก App Password
    },
  });

  const emailHtml = buildTemplate({ subject, message, submissionName, senderName, type, actionUrl,
                                    studentName, studentEmail, department, studentId });

  try {
    const info = await transporter.sendMail({
      from: `"KU-Paper Notifications 🌿" <${gmailUser}>`,
      to: validEmails.join(', '),
      subject: `[KU-Paper] ${subject}`,
      html: emailHtml,
    });

    console.log('[send-email] Sent:', info.messageId, '→', validEmails);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[send-email] Error:', err);
    return res.status(500).json({ error: 'Failed to send email', detail: String(err) });
  }
}

function buildTemplate({ subject, message, submissionName, senderName, type, actionUrl,
                          studentName, studentEmail, department, studentId }) {
  const emojiMap = {
    new_submission: '📄',
    forwarded_to_teacher: '📨',
    teacher_approved: '✅',
    teacher_rejected: '❌',
    admin_rejected: '🚫',
    completed: '🎉',
    status_update: '🔔',
    returned_to_teacher: '↩️',
  };
  const emoji = emojiMap[type] || '🔔';
  const appUrl = actionUrl
    ? `https://ku-envipaper.vercel.app${actionUrl}`
    : 'https://ku-envipaper.vercel.app';

  // สร้าง info rows ถ้ามีข้อมูลนิสิต
  const hasStudentInfo = studentName || studentEmail || department || studentId;
  const infoRows = [
    studentName   && `<tr><td style="color:#6b7280;font-size:13px;padding:6px 0;width:130px;">ชื่อ-นามสกุล</td><td style="color:#111827;font-size:13px;font-weight:600;padding:6px 0;">${studentName}</td></tr>`,
    studentEmail  && `<tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">อีเมล</td><td style="color:#111827;font-size:13px;font-weight:600;padding:6px 0;">${studentEmail}</td></tr>`,
    department    && `<tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">ภาควิชา</td><td style="color:#111827;font-size:13px;font-weight:600;padding:6px 0;">${department}</td></tr>`,
    studentId     && `<tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">รหัสประจำตัว</td><td style="color:#111827;font-size:13px;font-weight:600;padding:6px 0;">${studentId}</td></tr>`,
    submissionName && `<tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">เรื่อง</td><td style="color:#111827;font-size:13px;font-weight:600;padding:6px 0;">${submissionName}</td></tr>`,
  ].filter(Boolean).join('');

  return `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#166534,#15803d);padding:32px 40px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">${emoji}</div>
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">KU-Paper</h1>
            <p style="color:#bbf7d0;font-size:13px;margin:6px 0 0;">ระบบยื่นเอกสารออนไลน์ มหาวิทยาลัยเกษตรศาสตร์</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="color:#111827;font-size:20px;font-weight:700;margin:0 0 20px;">${subject}</h2>

            ${hasStudentInfo ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
              <p style="color:#166534;font-size:11px;font-weight:700;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.8px;">📋 รายละเอียดคำร้อง</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${infoRows}
              </table>
            </div>` : submissionName ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
              <p style="color:#166534;font-size:12px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.5px;">📋 คำร้อง</p>
              <p style="color:#15803d;font-size:16px;font-weight:700;margin:0;">${submissionName}</p>
            </div>` : ''}

            <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 20px;">${(message || '').replace(/\n/g, '<br>')}</p>

            ${senderName ? `<p style="color:#6b7280;font-size:13px;margin:0 0 24px;">👤 ดำเนินการโดย: <strong style="color:#374151;">${senderName}</strong></p>` : ''}

            <div style="text-align:center;margin-top:32px;">
              <a href="${appUrl}"
                 style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">
                ดูรายละเอียดในระบบ →
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบ KU-Paper</p>
            <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">คณะสิ่งแวดล้อม มหาวิทยาลัยเกษตรศาสตร์</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
