import { useState } from 'react';
import { X, FileText, ExternalLink, Download, Paperclip, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { Attachment, Submission } from '../../data/mockData';
import { generateSignedAttachmentPDF } from '../../lib/generateApprovalPDF';

interface PdfViewerModalProps {
  attachments: Attachment[];
  submissionName: string;
  studentName: string;
  submission?: Submission;
  onClose: () => void;
}

export function PdfViewerModal({ attachments, submissionName, studentName, submission, onClose }: PdfViewerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const current = attachments[selectedIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${fullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[90vh]'}`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <Paperclip size={17} className="text-green-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{submissionName}</p>
            <p className="text-xs text-gray-500">เอกสารแนบ — {studentName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setFullscreen(!fullscreen)} title={fullscreen ? 'ย่อหน้าต่าง' : 'เต็มหน้าจอ'} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              <Maximize2 size={16} />
            </button>
            <a href={current.url} target="_blank" rel="noopener noreferrer" title="เปิดในแท็บใหม่" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              <ExternalLink size={16} />
            </a>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          {attachments.length > 1 && (
            <div className="w-52 shrink-0 border-r border-gray-100 flex flex-col bg-gray-50">
              <p className="text-xs text-gray-500 font-medium px-4 py-3 border-b border-gray-100">
                ไฟล์ทั้งหมด ({attachments.length})
              </p>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {attachments.map((file, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedIndex(i); setLoading(true); }}
                    className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-all ${i === selectedIndex ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white hover:shadow-sm'}`}
                  >
                    <FileText size={14} className={`shrink-0 mt-0.5 ${i === selectedIndex ? 'text-white' : 'text-green-600'}`} />
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">{file.name}</p>
                      <p className={`text-xs mt-0.5 ${i === selectedIndex ? 'text-green-100' : 'text-gray-400'}`}>{file.size}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PDF area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-200">
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                {attachments.length > 1 && (
                  <>
                    <button onClick={() => { setSelectedIndex(i => Math.max(0, i - 1)); setLoading(true); }} disabled={selectedIndex === 0} className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-gray-500">{selectedIndex + 1} / {attachments.length}</span>
                    <button onClick={() => { setSelectedIndex(i => Math.min(attachments.length - 1, i + 1)); setLoading(true); }} disabled={selectedIndex === attachments.length - 1} className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30">
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
                <span className="text-xs font-medium text-gray-700 ml-1">{current.name}</span>
                <span className="text-xs text-gray-400">• {current.size}</span>
              </div>
              <div className="flex gap-2">
                <a href={current.url} download={current.name} className="flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
                  <Download size={13} /> ดาวน์โหลดต้นฉบับ
                </a>
                {submission && current.type === 'pdf' && (
                  <button
                    onClick={() => generateSignedAttachmentPDF(submission, current.url, current.name)}
                    className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Download size={13} /> ดาวน์โหลดพร้อมลายเซ็น
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 relative">
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10 gap-3">
                  <div className="w-8 h-8 border-green-200 border-t-green-600 rounded-full animate-spin" style={{ borderWidth: 3, borderStyle: 'solid' }} />
                  <p className="text-sm text-gray-500">กำลังโหลดเอกสาร...</p>
                </div>
              )}
              <iframe
                key={current.url}
                src={`${current.url}#toolbar=1`}
                className="w-full h-full border-0"
                onLoad={() => setLoading(false)}
                title={current.name}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
