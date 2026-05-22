import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  FileText, Plus, Upload, Download, Edit2, Trash2,
  Search, Eye, EyeOff, CheckCircle, X, Save, RefreshCw,
  ClipboardList, PlusCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface FormItem {
  id: string;
  name: string;
  description: string;
  category: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number;
  is_active: boolean;
  download_count: number;
  created_at: string;
  required_docs: string[];
  workflow_steps: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  registration: 'ลงทะเบียน',
  exam: 'การสอบ',
  finance: 'การเงิน',
  leave: 'การลา',
  general: 'ทั่วไป',
  academic: 'วิชาการ',
};

const CATEGORY_COLORS: Record<string, string> = {
  registration: 'bg-blue-100 text-blue-700',
  exam: 'bg-purple-100 text-purple-700',
  finance: 'bg-yellow-100 text-yellow-700',
  leave: 'bg-orange-100 text-orange-700',
  general: 'bg-gray-100 text-gray-700',
  academic: 'bg-green-100 text-green-700',
};

// ── Upload Modal ─────────────────────────────────────────────
function UploadFormModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<string[]>(['advisor', 'department_head', 'dean']);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 20 * 1024 * 1024) { toast.error('ไฟล์ต้องไม่เกิน 20MB'); return; }
      setFile(f);
      if (!name) setName(f.name.replace(/\.pdf$/i, ''));
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('กรุณาระบุชื่อแบบฟอร์ม'); return; }
    if (!file) { toast.error('กรุณาเลือกไฟล์ PDF'); return; }

    setUploading(true);
    try {
      let fileUrl = '';
      if (isSupabaseConfigured && supabase) {
        const filePath = `${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('forms')
          .upload(filePath, file, { contentType: 'application/pdf', upsert: false });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('forms').getPublicUrl(filePath);
        fileUrl = urlData.publicUrl;
        const { error: dbError } = await supabase.from('forms_library').insert({
          name: name.trim(),
          description: description.trim(),
          category,
          file_name: file.name,
          file_url: fileUrl,
          file_size_bytes: file.size,
          is_active: true,
          workflow_steps: workflowSteps,
        });
        if (dbError) throw dbError;
      } else {
        fileUrl = URL.createObjectURL(file);
      }
      toast.success(`เพิ่มแบบฟอร์ม "${name}" เรียบร้อย`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่ทราบสาเหตุ'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-green-800 font-semibold">เพิ่มแบบฟอร์มใหม่</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">ชื่อแบบฟอร์ม <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="เช่น คำร้องขอลงทะเบียนเรียน"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">หมวดหมู่</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">คำอธิบาย</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="อธิบายแบบฟอร์มนี้โดยย่อ"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">เส้นทางการอนุมัติ (Workflow)</label>
            <div className="flex flex-wrap gap-2 mb-1 text-xs">
              {['advisor', 'department_head', 'dean'].map(step => (
                <button
                  key={step}
                  onClick={() => {
                    setWorkflowSteps(prev => 
                      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
                    );
                  }}
                  className={`px-3 py-1.5 rounded-full border transition-colors ${
                    workflowSteps.includes(step) ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}
                >
                  {step === 'advisor' ? 'อาจารย์ที่ปรึกษา' : step === 'department_head' ? 'หัวหน้าภาควิชา' : 'คณบดี'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">เลือกผู้ที่ต้องเซ็นอนุมัติในแบบฟอร์มนี้ (เรียงตามลำดับ)</p>
          </div>
          {/* File Upload */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">ไฟล์ PDF <span className="text-red-500">*</span></label>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-green-50'
              }`}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle size={28} className="text-green-600" />
                  <p className="text-sm text-green-700 font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB — คลิกเพื่อเปลี่ยนไฟล์</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={28} className="text-gray-400" />
                  <p className="text-sm text-gray-600">คลิกเพื่อเลือกไฟล์ PDF</p>
                  <p className="text-xs text-gray-400">รองรับ .pdf สูงสุด 20MB</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">ยกเลิก</button>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm flex items-center gap-2"
          >
            {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังอัปโหลด...</> : <><Upload size={14} />อัปโหลดแบบฟอร์ม</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ───────────────────────────────────────────────
function EditFormModal({ form, onClose, onSuccess }: { form: FormItem; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description || '');
  const [category, setCategory] = useState(form.category);
  const [requiredDocs, setRequiredDocs] = useState<string[]>(form.required_docs || []);
  const [workflowSteps, setWorkflowSteps] = useState<string[]>(form.workflow_steps || ['advisor', 'department_head', 'dean']);
  const [newDoc, setNewDoc] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('กรุณาระบุชื่อแบบฟอร์ม'); return; }
    setSaving(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('forms_library')
          .update({
            name: name.trim(),
            description: description.trim(),
            category,
            required_docs: requiredDocs,
            workflow_steps: workflowSteps,
            updated_at: new Date().toISOString(),
          })
          .eq('id', form.id);
        if (error) throw error;
      }
      toast.success('บันทึกการแก้ไขเรียบร้อย');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addDoc = () => {
    const trimmed = newDoc.trim();
    if (!trimmed) return;
    if (requiredDocs.includes(trimmed)) { toast.error('มีรายการนี้แล้ว'); return; }
    setRequiredDocs(prev => [...prev, trimmed]);
    setNewDoc('');
  };

  const removeDoc = (idx: number) => setRequiredDocs(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-green-800 font-semibold">แก้ไขแบบฟอร์ม</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">ชื่อแบบฟอร์ม</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">หมวดหมู่</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">คำอธิบาย</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 resize-none" />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium">เส้นทางการอนุมัติ (Workflow)</label>
            <div className="flex flex-wrap gap-2 mb-1 text-xs">
              {['advisor', 'department_head', 'dean'].map(step => (
                <button
                  key={step}
                  onClick={() => {
                    setWorkflowSteps(prev => 
                      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
                    );
                  }}
                  className={`px-3 py-1.5 rounded-full border transition-colors ${
                    workflowSteps.includes(step) ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}
                >
                  {step === 'advisor' ? 'อาจารย์ที่ปรึกษา' : step === 'department_head' ? 'หัวหน้าภาควิชา' : 'คณบดี'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">เลือกผู้ที่ต้องเซ็นอนุมัติในแบบฟอร์มนี้</p>
          </div>

          {/* Required Docs Editor */}
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-medium flex items-center gap-1.5">
              <ClipboardList size={14} className="text-green-600" />
              เอกสารที่นิสิตต้องแนบ
            </label>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
              {requiredDocs.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">ยังไม่มีรายการเอกสาร</p>
              )}
              {requiredDocs.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center shrink-0 font-medium">{idx + 1}</span>
                  <span className="flex-1 text-sm text-gray-700">{doc}</span>
                  <button onClick={() => removeDoc(idx)} className="text-red-400 hover:text-red-600 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <input
                  value={newDoc}
                  onChange={e => setNewDoc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDoc()}
                  placeholder="เช่น ใบรับรองแพทย์, สำเนาบัตรนิสิต"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400"
                />
                <button onClick={addDoc} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs transition-all">
                  <PlusCircle size={13} /> เพิ่ม
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">กด Enter หรือปุ่ม "เพิ่ม" เพื่อเพิ่มรายการ</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">ไฟล์ปัจจุบัน: <span className="text-gray-700 font-medium">{form.file_name}</span></p>
            <p className="text-xs text-gray-400 mt-0.5">หากต้องการเปลี่ยนไฟล์ ให้ลบแบบฟอร์มนี้และเพิ่มใหม่</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form Card ─────────────────────────────────────────────────
function FormCard({ form, onEdit, onDelete, onToggle }: {
  form: FormItem;
  onEdit: (f: FormItem) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const sizekb = form.file_size_bytes ? (form.file_size_bytes / 1024).toFixed(0) + ' KB' : '';

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${form.is_active ? 'border-green-100' : 'border-gray-200 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0">{form.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[form.category] || 'bg-gray-100 text-gray-600'}`}>
                {CATEGORY_LABELS[form.category] || form.category}
              </span>
            </div>
            {form.description && <p className="text-xs text-gray-500 mt-1">{form.description}</p>}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span>{form.file_name}</span>
              {sizekb && <span>{sizekb}</span>}
              <span>ดาวน์โหลด {form.download_count} ครั้ง</span>
            </div>
            
            {/* Workflow Steps Display */}
            {form.workflow_steps && form.workflow_steps.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="font-medium">เส้นทาง:</span>
                {form.workflow_steps.map((s, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <span className="text-gray-300">→</span>}
                    <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">
                      {s === 'advisor' ? 'ที่ปรึกษา' : s === 'department_head' ? 'หัวหน้าภาค' : s === 'dean' ? 'คณบดี' : s}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Required Docs */}
            {form.required_docs && form.required_docs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-gray-400 flex items-center gap-1 mr-1">
                  <ClipboardList size={10} /> เอกสารที่ต้องแนบ:
                </span>
                {form.required_docs.map((doc, i) => (
                  <span key={i} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">{doc}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2 flex-wrap">
        <a
          href={form.file_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={async () => {
            if (isSupabaseConfigured && supabase) {
              await supabase.from('forms_library').update({ download_count: form.download_count + 1 }).eq('id', form.id);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-all"
        >
          <Download size={12} /> ดาวน์โหลด PDF
        </a>
        <button
          onClick={() => onEdit(form)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-700 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-all"
        >
          <Edit2 size={12} /> แก้ไข
        </button>
        <button
          onClick={() => onToggle(form.id, !form.is_active)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
            form.is_active ? 'text-orange-700 bg-orange-50 hover:bg-orange-100 border-orange-200' : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-200'
          }`}
        >
          {form.is_active ? <><EyeOff size={12} /> ซ่อน</> : <><Eye size={12} /> แสดง</>}
        </button>
        <button
          onClick={() => onDelete(form.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all ml-auto"
        >
          <Trash2 size={12} /> ลบ
        </button>
      </div>
    </div>
  );
}

// ── Main FormManager ──────────────────────────────────────────
export function FormManager() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [editForm, setEditForm] = useState<FormItem | null>(null);

  const loadForms = async () => {
    setLoading(true);
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('forms_library')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        toast.error('โหลดข้อมูลไม่สำเร็จ: ' + error.message);
      } else {
        setForms(data || []);
      }
    } else {
      setForms([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadForms(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบแบบฟอร์มนี้ใช่หรือไม่?')) return;
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('forms_library').delete().eq('id', id);
      if (error) { toast.error('ลบไม่สำเร็จ'); return; }
    }
    toast.success('ลบแบบฟอร์มเรียบร้อย');
    setForms(prev => prev.filter(f => f.id !== id));
  };

  const handleToggle = async (id: string, active: boolean) => {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('forms_library').update({ is_active: active }).eq('id', id);
    }
    setForms(prev => prev.map(f => f.id === id ? { ...f, is_active: active } : f));
    toast.success(active ? 'เปิดแสดงแบบฟอร์มแล้ว' : 'ซ่อนแบบฟอร์มแล้ว');
  };

  const filtered = forms.filter(f => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || f.category === filterCategory;
    return matchSearch && matchCat;
  });

  const categories = ['all', ...Array.from(new Set(forms.map(f => f.category)))];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-green-800 text-xl font-semibold mb-1">จัดการแบบฟอร์ม</h2>
          <p className="text-gray-500 text-sm">อัปโหลด แก้ไข และจัดการแบบฟอร์มสำหรับนิสิตดาวน์โหลด</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadForms} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all" title="รีโหลด">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm transition-all shadow-sm"
          >
            <Plus size={16} /> เพิ่มแบบฟอร์มใหม่
          </button>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-700">
          ⚠️ ยังไม่ได้เชื่อมต่อ Supabase — ฟีเจอร์บางส่วนอาจไม่ทำงาน
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาแบบฟอร์ม..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-green-400 bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={`px-3 py-2 rounded-lg text-xs transition-all ${
                filterCategory === cat ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
              }`}>
              {cat === 'all' ? 'ทั้งหมด' : (CATEGORY_LABELS[cat] || cat)}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} แบบฟอร์ม</p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <RefreshCw size={32} className="animate-spin mx-auto mb-3" />
          <p>กำลังโหลด...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">ยังไม่มีแบบฟอร์ม</p>
          <p className="text-sm mt-1">กดปุ่ม "เพิ่มแบบฟอร์มใหม่" เพื่อเริ่มอัปโหลด</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(form => (
            <FormCard key={form.id} form={form}
              onEdit={setEditForm}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {showUpload && <UploadFormModal onClose={() => setShowUpload(false)} onSuccess={loadForms} />}
      {editForm && <EditFormModal form={editForm} onClose={() => setEditForm(null)} onSuccess={loadForms} />}
    </div>
  );
}
