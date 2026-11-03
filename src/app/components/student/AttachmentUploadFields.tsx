import { useRef } from 'react';
import { FileText, Paperclip, Upload, X, ExternalLink } from 'lucide-react';
import type { Attachment } from '../../data/mockData';
import type { AttachmentSelection } from '../../lib/submissionAttachments';

export type AttachmentUploadRole = 'primary' | 'supporting';

interface Props {
  selection: AttachmentSelection;
  uploadingRole: AttachmentUploadRole | null;
  onFilesSelected: (files: File[], role: AttachmentUploadRole) => void;
  onRemovePrimary: () => void;
  onRemoveSupporting: (index: number) => void;
  onPromoteSupporting: (index: number) => void;
}

function PreviewLink({ file }: { file: Attachment }) {
  return <a href={file.url} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline shrink-0"
    aria-label={`เปิดตรวจสอบ ${file.name}`}><ExternalLink size={13} /> เปิดตรวจสอบ</a>;
}

export function AttachmentUploadFields({ selection, uploadingRole, onFilesSelected,
  onRemovePrimary, onRemoveSupporting, onPromoteSupporting }: Props) {
  const primaryInput = useRef<HTMLInputElement>(null);
  const supportingInput = useRef<HTMLInputElement>(null);
  const busy = uploadingRole !== null;
  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>, role: AttachmentUploadRole) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length && !busy) onFilesSelected(files, role);
  };
  return <div className="space-y-4">
    <section aria-labelledby="primary-attachment-heading" className="p-4 rounded-xl border-2 border-green-300 bg-green-50/60">
      <h4 id="primary-attachment-heading" className="font-semibold text-sm text-green-900 flex items-center gap-2">
        <FileText size={18} /> คำร้องหลักสำหรับลงนาม <span className="text-xs font-normal">จำเป็น · PDF 1 ไฟล์</span>
      </h4>
      <p className="text-xs text-green-800 mt-1 mb-3">แนบแบบคำร้องที่กรอกแล้ว ผู้อนุมัติจะลงนามบนเอกสารนี้</p>
      <input ref={primaryInput} type="file" accept=".pdf" disabled={busy} className="hidden"
        aria-label="เลือกคำร้องหลักสำหรับลงนาม" onChange={event => selectFiles(event, 'primary')} />
      {selection.primary ? <div className="p-3 bg-white rounded-lg border border-green-200 space-y-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><span className="text-xs font-semibold text-green-700">ใช้ลงนาม</span>
            <p className="text-sm text-gray-800 break-all">{selection.primary.name}</p>
            <p className="text-xs text-gray-500">{selection.primary.size}</p></div>
          <button type="button" disabled={busy} onClick={onRemovePrimary} aria-label="ลบคำร้องหลัก"
            className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-40"><X size={17} /></button>
        </div>
        <PreviewLink file={selection.primary} />
      </div> : <p role="status" className="text-xs text-amber-800 mb-3">ยังไม่ได้เลือกคำร้องหลัก กรุณาแนบก่อนส่งคำร้อง</p>}
      <button type="button" disabled={busy} onClick={() => primaryInput.current?.click()}
        className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-green-700 text-white hover:bg-green-800 disabled:opacity-50">
        <Upload size={15} /> {uploadingRole === 'primary' ? 'กำลังอัปโหลดคำร้องหลัก...' : selection.primary ? 'เปลี่ยนคำร้องหลัก' : 'เลือกคำร้องหลัก'}
      </button>
      <p className="text-xs text-green-700 mt-2">PDF ขนาดไม่เกิน 20 MB</p>
    </section>

    <section aria-labelledby="supporting-attachments-heading" className="p-4 rounded-xl border border-gray-200 bg-gray-50">
      <h4 id="supporting-attachments-heading" className="font-semibold text-sm text-gray-800 flex items-center gap-2">
        <Paperclip size={17} /> เอกสารประกอบ <span className="text-xs font-normal">แนบได้หลายไฟล์</span>
      </h4>
      <p className="text-xs text-gray-600 mt-1 mb-3">หลักฐานเพิ่มเติมสำหรับประกอบการพิจารณา เช่น ใบเสร็จหรือใบรับรองแพทย์ เอกสารกลุ่มนี้ไม่ใช่ไฟล์สำหรับลงนาม</p>
      <input ref={supportingInput} type="file" multiple accept=".pdf" disabled={busy} className="hidden"
        aria-label="เลือกเอกสารประกอบ" onChange={event => selectFiles(event, 'supporting')} />
      <div className="space-y-2">
        {selection.supporting.map((file, index) => <div key={`${file.url}-${index}`} className="p-3 bg-white rounded-lg border border-gray-200 space-y-2">
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1">
            <span className="text-xs text-gray-500">เอกสารประกอบ {index + 1}</span>
            <p className="text-sm text-gray-800 break-all">{file.name}</p><p className="text-xs text-gray-500">{file.size}</p>
          </div><button type="button" disabled={busy} onClick={() => onRemoveSupporting(index)} aria-label={`ลบเอกสารประกอบ ${file.name}`}
            className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-40"><X size={17} /></button></div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><PreviewLink file={file} />
            {file.type === 'pdf' && <button type="button" disabled={busy} onClick={() => onPromoteSupporting(index)}
              className="text-xs text-green-700 underline disabled:opacity-40" aria-label={`ใช้ ${file.name} เป็นคำร้องหลัก`}>ใช้เป็นคำร้องหลัก</button>}
          </div>
        </div>)}
      </div>
      <button type="button" disabled={busy} onClick={() => supportingInput.current?.click()}
        className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50">
        <Upload size={15} /> {uploadingRole === 'supporting' ? 'กำลังอัปโหลดเอกสารประกอบ...' : 'เพิ่มเอกสารประกอบ'}
      </button>
      <p className="text-xs text-gray-500 mt-2">PDF ขนาดไม่เกิน 20 MB ต่อไฟล์ · หากเปลี่ยนเอกสารประกอบเป็นคำร้องหลัก ไฟล์หลักเดิมจะย้ายมาอยู่ในกลุ่มเอกสารประกอบ</p>
    </section>
  </div>;
}

export function AttachmentReview({ selection }: { selection: AttachmentSelection }) {
  return <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
    <div><p className="text-xs font-semibold text-green-800 mb-2">เอกสารที่จะเสนอให้ลงนาม</p>
      {selection.primary ? <div className="p-3 bg-green-50 rounded-lg border border-green-200 space-y-1">
        <p className="text-sm font-medium text-green-900 break-all">{selection.primary.name}</p>
        <p className="text-xs text-green-700">คำร้องหลัก · ใช้ลงนาม · {selection.primary.size}</p>
        <PreviewLink file={selection.primary} />
      </div> : <p role="alert" className="text-xs text-red-700">ยังไม่มีคำร้องหลัก กรุณาย้อนกลับไปเลือกเอกสารสำหรับลงนาม</p>}
    </div>
    <div><p className="text-xs font-semibold text-gray-600 mb-2">เอกสารประกอบ ({selection.supporting.length} ไฟล์)</p>
      {selection.supporting.length ? <div className="space-y-2">{selection.supporting.map((file, index) =>
        <div key={`${file.url}-${index}`} className="p-2 rounded-lg bg-white border border-gray-200 space-y-1">
          <p className="text-xs text-gray-700 break-all">{file.name} <span className="text-gray-500">({file.size})</span></p>
          <PreviewLink file={file} />
        </div>)}</div> : <p className="text-xs text-gray-500">ไม่มีเอกสารประกอบ</p>}
    </div>
  </div>;
}
