function emptySelection() { return { primary: null, supporting: [] }; }

function isAttachment(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.name === 'string' && !!value.name.trim()
    && typeof value.url === 'string' && !!value.url.trim()
    && (value.type === 'pdf' || value.type === 'image')
    && (value.size === undefined || typeof value.size === 'string');
}

function copySelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !Object.prototype.hasOwnProperty.call(value, 'primary')
    || !Object.prototype.hasOwnProperty.call(value, 'supporting')
    || (value.version !== undefined && value.version !== 1)
    || (value.primary !== null && !isAttachment(value.primary))
    || !Array.isArray(value.supporting) || !value.supporting.every(isAttachment)) return emptySelection();
  return { primary: value.primary, supporting: value.supporting.slice() };
}

/** Legacy arrays use their existing first file, never a filtered/reordered file. */
export function createAttachmentSelection(attachments = []) {
  if (!Array.isArray(attachments)) return emptySelection();
  return copySelection({ primary: attachments[0] || null, supporting: attachments.slice(1) });
}

/** Explicit selection takes precedence, including a deliberately absent primary. */
export function restoreAttachmentSelection(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return emptySelection();
  if (Object.prototype.hasOwnProperty.call(draft, 'attachmentSelection')) return copySelection(draft.attachmentSelection);
  return createAttachmentSelection(draft.attachments);
}

/** Drafts may retain supporting files while the student replaces the primary. */
export function getDraftAttachments(selection) {
  const current = copySelection(selection);
  return current.primary ? [current.primary, ...current.supporting] : current.supporting.slice();
}

/** Only submission requires a PDF primary. Upload validation remains in the UI. */
export function getSubmissionAttachments(selection) {
  const current = copySelection(selection);
  if (!current.primary) throw new Error('กรุณาแนบไฟล์คำร้องหลักที่จะลงนามก่อนยื่นคำร้อง');
  if (current.primary.type !== 'pdf') throw new Error('ไฟล์คำร้องหลักที่จะลงนามต้องเป็นไฟล์ PDF');
  return [current.primary, ...current.supporting];
}

export function setPrimaryAttachment(selection, attachment) {
  if (attachment !== null && !isAttachment(attachment)) throw new TypeError('ข้อมูลไฟล์คำร้องหลักไม่ถูกต้อง');
  return { ...copySelection(selection), primary: attachment };
}

export function addSupportingAttachments(selection, attachments) {
  if (!Array.isArray(attachments) || !attachments.every(isAttachment)) throw new TypeError('ข้อมูลเอกสารประกอบไม่ถูกต้อง');
  const current = copySelection(selection);
  return { primary: current.primary, supporting: [...current.supporting, ...attachments] };
}

export function removeSupportingAttachment(selection, index) {
  const current = copySelection(selection);
  if (!Number.isInteger(index) || index < 0 || index >= current.supporting.length) return current;
  return { primary: current.primary, supporting: current.supporting.filter((_, itemIndex) => itemIndex !== index) };
}

/** Choosing another primary is explicit; keep the old primary rather than lose it. */
export function promoteSupportingAttachment(selection, index) {
  const current = copySelection(selection);
  if (!Number.isInteger(index) || index < 0 || index >= current.supporting.length) return current;
  const chosen = current.supporting[index];
  return {
    primary: chosen,
    supporting: current.primary
      ? current.supporting.map((item, itemIndex) => itemIndex === index ? current.primary : item)
      : current.supporting.filter((_, itemIndex) => itemIndex !== index),
  };
}
