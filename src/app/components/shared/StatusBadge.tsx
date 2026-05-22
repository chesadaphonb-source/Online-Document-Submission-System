import { ElementType } from 'react';
import { SubmissionStatus } from '../../data/mockData';
import { CheckCircle, Clock, XCircle, FileText, Search, Loader, AlertCircle, CheckSquare } from 'lucide-react';

interface StatusBadgeProps {
  status: SubmissionStatus;
  size?: 'sm' | 'md';
}

const config: Record<SubmissionStatus, { label: string; bg: string; text: string; icon: ElementType }> = {
  draft:            { label: 'ร่าง',                    bg: 'bg-gray-100',   text: 'text-gray-600',  icon: FileText },
  submitted:        { label: 'รอรับเรื่อง',             bg: 'bg-blue-100',   text: 'text-blue-700',  icon: Clock },
  admin_reviewing:  { label: 'Admin ตรวจสอบ',          bg: 'bg-purple-100', text: 'text-purple-700', icon: Loader },
  'in-review':      { label: 'อยู่ระหว่างพิจารณา',     bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Search },
  teacher_rejected: { label: 'รอ Admin ตรวจสอบ',       bg: 'bg-orange-100', text: 'text-orange-700', icon: AlertCircle },
  pending_close:    { label: 'รอ Admin ปิดงาน',        bg: 'bg-teal-100',   text: 'text-teal-700',  icon: CheckSquare },
  approved:         { label: 'อนุมัติแล้ว',             bg: 'bg-green-100',  text: 'text-green-700', icon: CheckCircle },
  rejected:         { label: 'ไม่อนุมัติ',              bg: 'bg-red-100',    text: 'text-red-700',   icon: XCircle },
};


export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const cfg = config[status];
  const Icon = cfg.icon;
  const padding = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1';
  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 ${padding} rounded-full ${textSize} font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon size={iconSize} />
      {cfg.label}
    </span>
  );
}