const WORKFLOW_FIELDS = ['level', 'roleName', 'status', 'approverId', 'approverName', 'timestamp'];
const ANNOTATION_FIELDS = [
  'signatureData', 'signatureX', 'signatureY', 'signatureSize', 'extraSignaturePositions',
  'textBlock', 'textBlockX', 'textBlockY', 'textBlockSize', 'extraTextBlocks',
  'dateBlock', 'dateX', 'dateY', 'dateSize',
  'checkmarkBlock', 'checkmarkX', 'checkmarkY', 'checkmarkSize', 'page',
];

function saveError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function prepareSteps(original, edited) {
  if (!Array.isArray(original) || !Array.isArray(edited) || original.length !== edited.length) {
    throw saveError('invalid-workflow', 'ขั้นตอนอนุมัติเปลี่ยนแปลง กรุณาเปิดคำร้องใหม่ก่อนปรับตำแหน่ง');
  }
  return original.map((step, index) => {
    const update = edited[index];
    if (!update || WORKFLOW_FIELDS.some(field => step[field] !== update[field])) {
      throw saveError('invalid-workflow', 'ผู้อนุมัติหรือสถานะคำร้องเปลี่ยนแปลง กรุณาเปิดคำร้องใหม่ก่อนปรับตำแหน่ง');
    }
    const next = clone(step);
    for (const field of ANNOTATION_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(update, field)) next[field] = clone(update[field]);
    }
    return next;
  });
}

/**
 * Prepare the file first, then atomically persist the annotation/file pointer
 * with compare-and-set against the editor's opening updatedAt value. This has
 * no UI/state effects. After an upload followed by a conflict, the unreferenced
 * uploaded file is deliberately left alone; unrelated files are never deleted.
 */
export async function saveSignaturePlacement({
  client, storage, submission, updatedSteps, generatePdf, adminName,
  now = () => new Date().toISOString(),
}) {
  if (!submission?.id) throw saveError('invalid', 'ไม่พบคำร้องที่ต้องการปรับตำแหน่ง');
  const attachment = submission.attachments?.[0];
  const sourceUrl = submission.originalAttachmentUrl || attachment?.url;
  if (!attachment || typeof attachment.name !== 'string' || !attachment.name.trim()
    || typeof sourceUrl !== 'string' || !sourceUrl.trim()) {
    throw saveError('missing-attachment', 'ไม่พบไฟล์เอกสารต้นฉบับ กรุณาตรวจสอบไฟล์แนบก่อนปรับตำแหน่ง');
  }
  if (client && (typeof submission.updatedAt !== 'string' || !submission.updatedAt.trim())) {
    throw saveError('missing-version', 'ไม่พบเวอร์ชันล่าสุดของคำร้อง กรุณาโหลดคำร้องใหม่ก่อนบันทึก');
  }
  const openingTime = client ? Date.parse(submission.updatedAt) : null;
  if (client && !Number.isFinite(openingTime)) {
    throw saveError('invalid-version', 'เวอร์ชันเวลาของคำร้องไม่ถูกต้อง กรุณาโหลดคำร้องใหม่ก่อนบันทึก');
  }
  if (client && !storage?.from) throw saveError('upload', 'ไม่พบการเชื่อมต่อที่เก็บไฟล์เอกสาร');
  const requestedTimestamp = typeof now === 'function' ? now() : now;
  const requestedTime = typeof requestedTimestamp === 'string' ? Date.parse(requestedTimestamp) : NaN;
  if (!Number.isFinite(requestedTime)) throw saveError('invalid-time', 'เวลาบันทึกตำแหน่งไม่ถูกต้อง กรุณาตรวจสอบวันที่และเวลาของอุปกรณ์');
  // Advance the CAS token even when the device clock ties or trails the version
  // opened by this editor. Preserve the original exact version in the filter.
  const nextDate = new Date(client ? Math.max(requestedTime, openingTime + 1) : requestedTime);
  if (!Number.isFinite(nextDate.getTime())) throw saveError('invalid-time', 'ไม่สามารถกำหนดเวอร์ชันเวลาถัดไปของคำร้องได้');
  const timestamp = nextDate.toISOString();

  const approvalSteps = prepareSteps(submission.approvalSteps, updatedSteps);
  const changes = {
    approvalSteps,
    signatureAdjustedAt: timestamp,
    signatureAdjustedBy: adminName?.trim() || 'Admin',
    originalAttachmentUrl: sourceUrl,
    updatedAt: timestamp,
  };
  const candidate = { ...clone(submission), ...changes };
  let pdfBlob;
  try {
    pdfBlob = await generatePdf(candidate, sourceUrl, attachment.name);
    if (!pdfBlob || typeof pdfBlob.arrayBuffer !== 'function' || !pdfBlob.size) throw new Error('Empty PDF result');
  } catch (cause) {
    throw saveError('generation', 'สร้างเอกสารพร้อมตำแหน่งใหม่ไม่สำเร็จ กรุณาตรวจสอบเอกสารต้นฉบับแล้วลองอีกครั้ง', cause);
  }

  let newUrl;
  let storagePath;
  if (client) {
    try {
      storagePath = `submissions/${submission.id}/adjusted_${crypto.randomUUID()}.pdf`;
      const bucket = storage.from('attachments');
      const { error } = await bucket.upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false });
      if (error) throw error;
      const { data, error: urlError } = bucket.getPublicUrl(storagePath);
      if (urlError || !data?.publicUrl) throw urlError || new Error('Missing document URL');
      newUrl = data.publicUrl;
    } catch (cause) {
      throw saveError('upload', 'อัปโหลดเอกสารที่ปรับตำแหน่งไม่สำเร็จ ยังไม่ได้เปลี่ยนข้อมูลคำร้อง', cause);
    }
  } else {
    try { newUrl = URL.createObjectURL(pdfBlob); }
    catch (cause) { throw saveError('generation', 'ไม่สามารถเปิดเอกสารจำลองที่ปรับตำแหน่งได้', cause); }
  }

  changes.attachments = [
    { ...clone(attachment), url: newUrl, name: attachment.name.replace(/\.[^.]+$/, '') + '.pdf', type: 'pdf' },
    ...clone(submission.attachments.slice(1)),
  ];
  if (client) {
    let result;
    try {
      result = await client.from('submissions').update({
        approval_steps: changes.approvalSteps,
        attachments: changes.attachments,
        signature_adjusted_at: changes.signatureAdjustedAt,
        signature_adjusted_by: changes.signatureAdjustedBy,
        original_attachment_url: changes.originalAttachmentUrl,
        updated_at: changes.updatedAt,
      }).eq('id', submission.id).eq('updated_at', submission.updatedAt).select('id,updated_at').single();
    } catch (cause) {
      throw saveError('database', 'บันทึกตำแหน่งไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง', cause);
    }
    if (result?.error && result.error.code !== 'PGRST116') {
      throw saveError('database', 'บันทึกตำแหน่งไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และลองอีกครั้ง', result.error);
    }
    if (!result || result.error || !result.data || result.data.id !== submission.id) {
      throw saveError('conflict', 'คำร้องมีการเปลี่ยนแปลงหรือไม่มีสิทธิ์บันทึก กรุณาโหลดคำร้องใหม่ก่อนปรับตำแหน่ง');
    }
    changes.updatedAt = result.data.updated_at || timestamp;
  }
  return { changes, ...(storagePath ? { storagePath } : {}) };
}
