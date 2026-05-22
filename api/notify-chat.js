export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookUrl = process.env.GCHAT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[notify-chat] GCHAT_WEBHOOK_URL is not set');
    return res.status(500).json({ error: 'GCHAT_WEBHOOK_URL not configured' });
  }

  const { type, title, message, submissionName, senderName } = req.body;

  // Emoji ตาม type
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

  // สร้างข้อความแบบ simple text (ง่าย + รองรับทุก version)
  const lines = [
    `${emoji} *${title}*`,
    submissionName ? `📋 คำร้อง: ${submissionName}` : null,
    message ? `💬 ${message}` : null,
    senderName ? `👤 โดย: ${senderName}` : null,
    `\n🔗 https://ku-envipaper.vercel.app`,
  ].filter(Boolean);

  const chatPayload = { text: lines.join('\n') };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('[notify-chat] Google Chat error:', response.status, responseText);
      return res.status(500).json({ error: 'Google Chat error', status: response.status, detail: responseText });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notify-chat] Fetch failed:', err);
    return res.status(500).json({ error: 'Fetch failed', detail: String(err) });
  }
}
