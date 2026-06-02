import jsPDF from 'jspdf';
import type { Submission } from '../data/mockData';
import { THSarabun_Base64 } from './fonts/Sarabun';
import { toast } from 'sonner';

// ── Thai text (Latin fallback) ──────────────────────────────────
// jsPDF ไม่รองรับ Thai font โดยตรง → ใช้ transliteration / English label
const STATUS_LABEL: Record<string, string> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  submitted: 'SUBMITTED',
  'in-review': 'IN REVIEW',
  pending_close: 'PENDING CLOSE',
  admin_reviewing: 'ADMIN REVIEWING',
  teacher_rejected: 'TEACHER REJECTED',
};

function drawHr(doc: jsPDF, y: number, lm = 20, rm = 190) {
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(lm, y, rm, y);
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

/**
 * Generate a SHA-256 hash for the submission to ensure integrity.
 */
export async function generateCertificateHash(submission: Submission): Promise<string> {
  const dataString = JSON.stringify({
    id: submission.id,
    studentId: submission.studentId,
    formType: submission.formType,
    submittedAt: submission.submittedAt,
    approvalSteps: submission.approvalSteps.map(s => ({
      level: s.level,
      status: s.status,
      approverId: s.approverId,
      timestamp: s.timestamp
    }))
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a KU-Paper approval certificate PDF and trigger download, or return a Blob URL for preview.
 * @param submission  The completed Submission object
 * @param asBlobUrl   If true, returns a Blob URL string instead of triggering a download
 */
export async function generateApprovalPDF(submission: Submission, asBlobUrl: boolean = false): Promise<void | string> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });


  // Add Thai Font
  doc.addFileToVFS('THSarabun.ttf', THSarabun_Base64);
  doc.addFont('THSarabun.ttf', 'THSarabun', 'normal');
  doc.addFont('THSarabun.ttf', 'THSarabun', 'bold');
  doc.addFont('THSarabun.ttf', 'THSarabun', 'italic');

  const LM = 20; // left margin
  const RM = 190; // right margin
  const W = RM - LM;   // content width
  let y = 20;

  // ── HEADER ─────────────────────────────────────────────────────
  // Green top bar
  doc.setFillColor(26, 92, 46);
  doc.rect(0, 0, 210, 30, 'F');

  // KU-Paper logotype
  doc.setFontSize(22);
  doc.setFont('THSarabun', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('KU-Paper', LM, 14);

  doc.setFontSize(13);
  doc.setFont('THSarabun', 'normal');
  doc.setTextColor(180, 230, 180);
  doc.text('Kasetsart University | Online Document Submission System', LM, 20);

  // Title
  doc.setFontSize(15);
  doc.setFont('THSarabun', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('APPROVAL CERTIFICATE', RM, 14, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('THSarabun', 'normal');
  doc.text('Bai Rap Rueang / Bai Rap Rong', RM, 20, { align: 'right' });

  y = 38;

  // ── REFERENCE BOX ──────────────────────────────────────────────
  const refNum = submission.referenceNumber || `KU-${Date.now().toString().slice(-8)}`;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.5);
  doc.roundedRect(LM, y, W, 18, 3, 3, 'FD');

  doc.setFontSize(12);
  doc.setFont('THSarabun', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Reference Number / Elek Thi Ang Aing', LM + 5, y + 6);

  doc.setFontSize(18);
  doc.setFont('THSarabun', 'bold');
  doc.setTextColor(22, 101, 52);
  doc.text(refNum, LM + 5, y + 14);

  // Status badge
  const statusLabel = STATUS_LABEL[submission.status] || submission.status.toUpperCase();
  const badgeBg = submission.status === 'approved' ? [22, 163, 74] : [239, 68, 68];
  doc.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]);
  doc.roundedRect(RM - 36, y + 4, 36, 10, 2, 2, 'F');
  doc.setFontSize(12);
  doc.setFont('THSarabun', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, RM - 18, y + 10.5, { align: 'center' });

  y += 26;

  // ── SECTION HELPER ─────────────────────────────────────────────
  const sectionTitle = (title: string) => {
    doc.setFontSize(12);
    doc.setFont('THSarabun', 'bold');
    doc.setTextColor(26, 92, 46);
    doc.text(title, LM, y);
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.5);
    doc.line(LM, y + 1.5, LM + doc.getTextWidth(title) + 2, y + 1.5);
    y += 6;
  };

  const row = (label: string, value: string, col2start = 75) => {
    doc.setFontSize(12.5);
    doc.setFont('THSarabun', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, LM, y);
    doc.setTextColor(30, 30, 30);
    doc.setFont('THSarabun', 'bold');
    // wrap value if too long
    const lines = doc.splitTextToSize(value || '-', RM - col2start);
    doc.text(lines, col2start, y);
    y += Math.max(lines.length * 5, 6);
  };

  // ── STUDENT INFORMATION ─────────────────────────────────────────
  sectionTitle('1. STUDENT INFORMATION (Khomun Nisit)');

  const studentId = submission.studentId?.startsWith('student_')
    ? submission.studentId.replace('student_', '')
    : (submission.studentEmail?.replace('@ku.th', '') || submission.studentId || '-');
  row('Full Name / Chu-Sue :', submission.studentName || '-');
  row('Student ID / Raha Nisit :', studentId);
  row('Department / Phak Wicha :', submission.department || '-');
  row('Faculty / Khana :', submission.faculty || '-');

  y += 3;
  drawHr(doc, y);
  y += 7;

  // ── PETITION DETAILS ────────────────────────────────────────────
  sectionTitle('2. PETITION DETAILS (Raila Iad Khong Kham Rong)');

  row('Form Type / Praphet Kham Rong :', submission.formName);
  row('Semester / Piak Ria :', `${submission.semester || '-'} / ${submission.academicYear || '-'}`);
  row('Submitted At / Wela Yuen :', new Date(submission.submittedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }));

  if (submission.closedAt) {
    row('Closed At / Wela Pid Ngan :', new Date(submission.closedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }));
  }
  if (submission.adminNote) {
    doc.setFontSize(12);
    doc.setFont('THSarabun', 'italic');
    doc.setTextColor(80, 80, 80);
    y = wrapText(doc, `Note: ${submission.adminNote}`, LM, y, W, 5);
    y += 1;
  }

  y += 3;
  drawHr(doc, y);
  y += 7;

  // ── FORM DATA ───────────────────────────────────────────────────
  if (Object.keys(submission.formData).length > 0) {
    sectionTitle('3. FORM DATA (Khomun Thi Kok)');

    Object.entries(submission.formData).forEach(([key, value]) => {
      if (!value) return;
      // Convert camelCase/underscore key to readable label
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      row(`${label} :`, String(value));
    });

    y += 3;
    drawHr(doc, y);
    y += 7;
  }

  // ── APPROVAL CHAIN ──────────────────────────────────────────────
  sectionTitle(`${Object.keys(submission.formData).length > 0 ? '4' : '3'}. APPROVAL CHAIN (Sen Thang Kan Anumat)`);

  submission.approvalSteps.forEach((step, i) => {
    const stepStatusColor = step.status === 'approved'
      ? [22, 163, 74]
      : step.status === 'rejected'
        ? [239, 68, 68]
        : [156, 163, 175];

    // Circle
    doc.setFillColor(stepStatusColor[0], stepStatusColor[1], stepStatusColor[2]);
    doc.circle(LM + 4, y - 1.5, 3, 'F');
    doc.setFontSize(11);
    doc.setFont('THSarabun', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(String(step.level), LM + 4, y - 0.5, { align: 'center' });

    // Connector line
    if (i < submission.approvalSteps.length - 1) {
      doc.setDrawColor(stepStatusColor[0], stepStatusColor[1], stepStatusColor[2]);
      doc.setLineWidth(0.3);
      doc.line(LM + 4, y + 1.5, LM + 4, y + 6);
    }

    doc.setFontSize(12.5);
    doc.setFont('THSarabun', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`${step.roleName}`, LM + 10, y);

    if (step.approverName) {
      doc.setFont('THSarabun', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(step.approverName, LM + 10, y + 4.5);
    }
    
    // Draw Signature
    if (step.signatureData) {
      try {
        // A4 page: 210mm wide × 297mm tall. LM=20, usable width=170
        const PAGE_W = 210;
        const PAGE_H = 297;
        if (step.signatureX !== undefined && step.signatureY !== undefined) {
          // Custom position (drag-and-drop) — use % of page
          const sigW = 40; // mm width
          const sigH = 14; // mm height
          const sx = (step.signatureX / 100) * PAGE_W;
          const sy = (step.signatureY / 100) * PAGE_H;
          doc.addImage(step.signatureData, 'PNG', sx, sy, sigW, sigH);
        } else {
          // Default: inline with approval step row
          doc.addImage(step.signatureData, 'PNG', LM + 60, y - 4, 30, 10);
        }
      } catch (e) {
        console.warn('Failed to embed signature', e);
      }
    }

    // Draw extra signatures
    if (step.signatureData && step.extraSignaturePositions && step.extraSignaturePositions.length > 0) {
      step.extraSignaturePositions.forEach(pos => {
        try {
          const PAGE_W = 210;
          const PAGE_H = 297;
          const sigW = 40;
          const sigH = 14;
          const sx = (pos.x / 100) * PAGE_W;
          const sy = (pos.y / 100) * PAGE_H;
          doc.addImage(step.signatureData!, 'PNG', sx, sy, sigW, sigH);
        } catch (e) {
          console.warn('Failed to embed extra signature', e);
        }
      });
    }

    // Draw Text Block (transparent text annotation)
    if (step.textBlock && step.textBlockX !== undefined && step.textBlockY !== undefined) {
      try {
        const PAGE_W = 210;
        const PAGE_H = 297;
        const tx = (step.textBlockX / 100) * PAGE_W;
        const ty = (step.textBlockY / 100) * PAGE_H;
        
        doc.setFontSize((step.textBlockSize || 13) * 0.85);
        doc.setFont('THSarabun', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(step.textBlock, tx, ty + 2.5); // vertical offset correction
      } catch (e) {
        console.warn('Failed to embed text block', e);
      }
    }

    // Draw extra text blocks
    if (step.extraTextBlocks && step.extraTextBlocks.length > 0) {
      step.extraTextBlocks.forEach(tb => {
        try {
          const PAGE_W = 210;
          const PAGE_H = 297;
          const tx = (tb.x / 100) * PAGE_W;
          const ty = (tb.y / 100) * PAGE_H;
          doc.setFontSize((tb.size || 13) * 0.85);
          doc.setFont('THSarabun', 'bold');
          doc.setTextColor(30, 30, 30);
          doc.text(tb.val, tx, ty + 2.5);
        } catch (e) {
          console.warn('Failed to embed extra text block', e);
        }
      });
    }

    // Status badge inline
    const stepBadge = step.status === 'approved' ? 'APPROVED'
      : step.status === 'rejected' ? 'REJECTED' : 'PENDING';
    doc.setFillColor(stepStatusColor[0], stepStatusColor[1], stepStatusColor[2]);
    const bx = RM - 28;
    doc.roundedRect(bx, y - 3.5, 28, 6.5, 1.5, 1.5, 'F');
    doc.setFontSize(11);
    doc.setFont('THSarabun', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(stepBadge, bx + 14, y + 0.2, { align: 'center' });

    if (step.timestamp) {
      doc.setFontSize(11);
      doc.setFont('THSarabun', 'normal');
      doc.setTextColor(130, 130, 130);
      doc.text(new Date(step.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }), RM, y + 4.5, { align: 'right' });
    }

    y += step.approverName ? 12 : 8;
  });

  y += 3;
  drawHr(doc, y);
  y += 8;

  // ── ATTACHMENTS ─────────────────────────────────────────────────
  if (submission.attachments && submission.attachments.length > 0) {
    const secNum = Object.keys(submission.formData).length > 0 ? '5' : '4';
    sectionTitle(`${secNum}. ATTACHMENTS (Ekkasan Naeb)`);

    submission.attachments.forEach((att, i) => {
      doc.setFontSize(12);
      doc.setFont('THSarabun', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`${i + 1}. ${att.name}${att.size ? ` (${att.size})` : ''}`, LM + 4, y);
      y += 5.5;
    });

    y += 3;
    drawHr(doc, y);
    y += 8;
  }

  // ── FOOTER ──────────────────────────────────────────────────────
  const pageHeight = doc.internal.pageSize.height;

  // Bottom bar
  doc.setFillColor(26, 92, 46);
  doc.rect(0, pageHeight - 22, 210, 22, 'F');

  doc.setFontSize(11.5);
  doc.setFont('THSarabun', 'normal');
  doc.setTextColor(200, 235, 200);
  doc.text(
    'This document is generated automatically by KU-Paper Online Document Submission System.',
    LM, pageHeight - 14,
  );
  doc.text(
    'Kasetsart University | Khoa Ok Na An Umat Doi Rabob KU-Paper',
    LM, pageHeight - 9,
  );

  // QR-like reference box (visual only)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(RM - 30, pageHeight - 20, 30, 18, 2, 2, 'F');
  doc.setFontSize(10.5);
  doc.setFont('THSarabun', 'bold');
  doc.setTextColor(26, 92, 46);
  doc.text('REF:', RM - 27, pageHeight - 14);
  doc.setFontSize(10);
  const shortRef = refNum.slice(-12);
  doc.text(shortRef, RM - 27, pageHeight - 9.5);
  doc.text(new Date().toLocaleDateString('en-GB'), RM - 27, pageHeight - 5.5);

  // ── WATERMARK (for approved only) ──────────────────────────────
  if (submission.status === 'approved') {
    doc.setFontSize(56);
    doc.setFont('THSarabun', 'bold');
    doc.setTextColor(22, 163, 74);
    const gState = new (doc as any).GState({ opacity: 0.06 });
    doc.setGState(gState);
    doc.text('APPROVED', 105, 170, { align: 'center', angle: 45 });
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
  }

  // ── SAVE ────────────────────────────────────────────────────────
  if (asBlobUrl) {
    const blob = doc.output('blob');
    return URL.createObjectURL(blob);
  } else {
    const filename = `KU-Paper_${refNum || submission.id}_Certificate.pdf`;
    doc.save(filename);
  }
}

function getImageAspectRatio(base64Data: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(img.naturalWidth / img.naturalHeight);
    };
    img.onerror = () => {
      resolve(2.85); // fallback (40 / 14)
    };
    img.src = base64Data;
  });
}

/**
 * Helper to draw signatures, extra signatures, text blocks, date blocks, and checkmarks on a jsPDF page.
 */
async function drawSignaturesAndTexts(doc: jsPDF, submission: Submission) {
  for (const step of submission.approvalSteps) {
    // Signatures
    if (step.signatureData && step.signatureX !== undefined && step.signatureY !== undefined) {
      const percentWidth = step.signatureSize || 12;
      const sigW = (percentWidth / 100) * 210;
      const aspect = await getImageAspectRatio(step.signatureData);
      const sigH = sigW / aspect;
      const sx = (step.signatureX / 100) * 210;
      const sy = ((step.signatureY / 100) * 297) - 3.0; // Shift up by 3mm to align perfectly above dotted lines
      doc.addImage(step.signatureData, 'PNG', sx, sy, sigW, sigH);
    }

    // Extra signatures
    if (step.signatureData && step.extraSignaturePositions && step.extraSignaturePositions.length > 0) {
      const percentWidth = step.signatureSize || 12;
      const sigW = (percentWidth / 100) * 210;
      const aspect = await getImageAspectRatio(step.signatureData);
      const sigH = sigW / aspect;

      for (const pos of step.extraSignaturePositions) {
        const sx = (pos.x / 100) * 210;
        const sy = ((pos.y / 100) * 297) - 3.0; // Shift up by 3mm to align perfectly above dotted lines
        try {
          doc.addImage(step.signatureData, 'PNG', sx, sy, sigW, sigH);
        } catch (err) {
          console.warn('Failed to embed extra signature on attachment', err);
        }
      }
    }

    // Text blocks
    if (step.textBlock && step.textBlockX !== undefined && step.textBlockY !== undefined) {
      const tx = (step.textBlockX / 100) * 210;
      const ty = (step.textBlockY / 100) * 297;
      doc.setFontSize((step.textBlockSize || 13) * 0.85);
      doc.setFont('THSarabun', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(step.textBlock, tx, ty + 2.5); // align correction
    }

    // Extra text blocks
    if (step.extraTextBlocks && step.extraTextBlocks.length > 0) {
      step.extraTextBlocks.forEach(tb => {
        const tx = (tb.x / 100) * 210;
        const ty = (tb.y / 100) * 297;
        try {
          doc.setFontSize((tb.size || 13) * 0.85);
          doc.setFont('THSarabun', 'bold');
          doc.setTextColor(30, 30, 30);
          doc.text(tb.val, tx, ty + 2.5);
        } catch (err) {
          console.warn('Failed to embed extra text block on attachment', err);
        }
      });
    }

    // Date blocks
    if (step.dateBlock && step.dateX !== undefined && step.dateY !== undefined) {
      const dx = (step.dateX / 100) * 210;
      const dy = (step.dateY / 100) * 297;
      doc.setFontSize(step.dateSize || 11);
      doc.setFont('THSarabun', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(step.dateBlock, dx, dy + 2.5); // align correction
    }

    // Checkmarks
    if (step.checkmarkBlock && step.checkmarkX !== undefined && step.checkmarkY !== undefined) {
      const cx = (step.checkmarkX / 100) * 210;
      const cy = (step.checkmarkY / 100) * 297;
      doc.setFontSize(15);
      doc.setFont('THSarabun', 'bold');
      doc.setTextColor(22, 101, 52); // green checkmark
      doc.text(step.checkmarkBlock, cx, cy + 2.5); // align correction
    }
  }
}

/**
 * Generates the signed attachment and returns a blob URL for inline preview (does NOT download).
 */
export async function previewSignedAttachmentPDF(submission: Submission, attachmentUrl: string, fileName: string): Promise<string> {
  const fnLower = fileName.toLowerCase();
  const isImage = fnLower.endsWith('.jpg') || fnLower.endsWith('.jpeg') || fnLower.endsWith('.png');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.addFileToVFS('THSarabun.ttf', THSarabun_Base64);
  doc.addFont('THSarabun.ttf', 'THSarabun', 'normal');
  doc.addFont('THSarabun.ttf', 'THSarabun', 'bold');

  if (isImage) {
    let imgDataUrl = attachmentUrl;
    if (!attachmentUrl.startsWith('blob:') && !attachmentUrl.startsWith('data:')) {
      const res = await fetch(attachmentUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      imgDataUrl = URL.createObjectURL(blob);
    }
    const format = fnLower.endsWith('.png') ? 'PNG' : 'JPEG';
    doc.addImage(imgDataUrl, format, 0, 0, 210, 297);
    await drawSignaturesAndTexts(doc, submission);
    if (imgDataUrl.startsWith('blob:')) URL.revokeObjectURL(imgDataUrl);
  } else {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    let pdfData: ArrayBuffer;
    if (attachmentUrl.startsWith('blob:') || attachmentUrl.startsWith('data:')) {
      const res = await fetch(attachmentUrl);
      pdfData = await res.arrayBuffer();
    } else {
      const res = await fetch(attachmentUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pdfData = await res.arrayBuffer();
    }
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (i > 1) doc.addPage();
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as any).promise;
      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      await drawSignaturesAndTexts(doc, submission);
    }
  }

  const pdfBlob = doc.output('blob');
  return URL.createObjectURL(pdfBlob);
}

/**
 * Generates the student's actual attachment (PDF or Image) with all signatures and text blocks superimposed on it.
 */
export async function generateSignedAttachmentPDF(submission: Submission, attachmentUrl: string, fileName: string): Promise<void> {
  const toastId = toast.loading('กำลังประมวลผลและวาดลายเซ็นลงบนแบบฟอร์มคำร้อง...');
  try {
    const fnLower = fileName.toLowerCase();
    const isImage = fnLower.endsWith('.jpg') || fnLower.endsWith('.jpeg') || fnLower.endsWith('.png');

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    
    // Add THSarabun font
    doc.addFileToVFS('THSarabun.ttf', THSarabun_Base64);
    doc.addFont('THSarabun.ttf', 'THSarabun', 'normal');
    doc.addFont('THSarabun.ttf', 'THSarabun', 'bold');

    if (isImage) {
      // ── IMAGE FLOW ──
      // Fetch image bytes to avoid CORS
      let imgDataUrl = attachmentUrl;
      if (!attachmentUrl.startsWith('blob:') && !attachmentUrl.startsWith('data:')) {
        const res = await fetch(attachmentUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        imgDataUrl = URL.createObjectURL(blob);
      }

      // Add image as background A4: 210mm x 297mm
      const format = fnLower.endsWith('.png') ? 'PNG' : 'JPEG';
      doc.addImage(imgDataUrl, format, 0, 0, 210, 297);

      // Superimpose signatures & text blocks
      await drawSignaturesAndTexts(doc, submission);

      if (imgDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imgDataUrl);
      }
    } else {
      // ── PDF FLOW ──
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href;

      let pdfData: ArrayBuffer;
      if (attachmentUrl.startsWith('blob:') || attachmentUrl.startsWith('data:')) {
        const res = await fetch(attachmentUrl);
        pdfData = await res.arrayBuffer();
      } else {
        const res = await fetch(attachmentUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pdfData = await res.arrayBuffer();
      }

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
      const numPages = pdf.numPages;

      for (let i = 1; i <= numPages; i++) {
        if (i > 1) {
          doc.addPage();
        }

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.5 }); // High-quality rendering

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport } as any).promise;
        const pageImgData = canvas.toDataURL('image/jpeg', 0.95);

        // Add rendered page image as background (A4: 210mm x 297mm)
        doc.addImage(pageImgData, 'JPEG', 0, 0, 210, 297);

        // Superimpose signatures & text blocks
        await drawSignaturesAndTexts(doc, submission);
      }
    }

    const outputFileName = isImage 
      ? `Signed_${fileName.replace(/\.(jpg|jpeg|png)$/i, '')}.pdf`
      : `Signed_${fileName}`;

    doc.save(outputFileName);
    toast.success('ดาวน์โหลดแบบฟอร์มพร้อมลายเซ็นเรียบร้อยแล้ว', { id: toastId });
  } catch (err) {
    console.error('Failed to generate signed attachment PDF/Image', err);
    toast.error('ไม่สามารถลงลายเซ็นในแบบฟอร์มแนบได้', { id: toastId });
  }
}
