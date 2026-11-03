import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';

function CoordinateInput({ axis, value, maximum, disabled, onCommit }: {
  axis: 'X' | 'Y'; value: number | null; maximum: number; disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : value.toFixed(1));
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = false;
    setDraft(value === null ? '' : value.toFixed(1));
  }, [value]);
  const commit = () => {
    if (!dirty.current || disabled) return;
    dirty.current = false;
    const parsed = Number(draft);
    // The parent may clamp to the unchanged boundary, so an effect on value
    // alone cannot clear an out-of-range or over-precise draft.
    setDraft(value === null ? '' : value.toFixed(1));
    if (draft.trim() && Number.isFinite(parsed)) onCommit(Math.round(parsed * 10) / 10);
  };
  return (
    <label className="flex items-center gap-1 text-xs text-gray-600">
      {axis}
      <input
        aria-label={`${axis} position (mm)`} type="number" step="0.1" min={0} max={maximum}
        value={draft} disabled={disabled}
        onChange={event => { dirty.current = true; setDraft(event.target.value); }}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          if (event.key === 'Escape') {
            dirty.current = false;
            setDraft(value === null ? '' : value.toFixed(1));
          }
        }}
        className="w-20 rounded border border-gray-200 bg-white px-2 py-1 disabled:opacity-50"
      />
      มม.
    </label>
  );
}

interface Props {
  choices: Array<{ key: string; label: string }>;
  selectedKey: string;
  onSelect: (key: string) => void;
  xMm: number | null;
  yMm: number | null;
  onCoordinate: (axis: 'x' | 'y', value: number) => void;
  onNudge: (direction: 'left' | 'right' | 'up' | 'down', coarse: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onZoom: (value: number) => void;
  showGuides: boolean;
  onShowGuides: (value: boolean) => void;
  disabled: boolean;
}

export function AdminPlacementToolbar(props: Props) {
  const selected = !!props.selectedKey;
  const buttonClass = 'rounded border border-gray-200 bg-white px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40';
  return (
    <fieldset disabled={props.disabled} className="border-b border-gray-100 bg-gray-50 px-4 py-3 space-y-2 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          องค์ประกอบ
          <select aria-label="Placement item" value={props.selectedKey} onChange={event => props.onSelect(event.target.value)}
            className="max-w-60 rounded border border-gray-200 bg-white px-2 py-1">
            <option value="">เลือกจากเอกสารหรือรายการ</option>
            {props.choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select>
        </label>
        <CoordinateInput axis="X" value={props.xMm} maximum={210} disabled={props.disabled || !selected}
          onCommit={value => props.onCoordinate('x', value)} />
        <CoordinateInput axis="Y" value={props.yMm} maximum={297} disabled={props.disabled || !selected}
          onCommit={value => props.onCoordinate('y', value)} />
        <div className="flex gap-1">
          {([
            ['left', ArrowLeft], ['right', ArrowRight], ['up', ArrowUp], ['down', ArrowDown],
          ] as const).map(([direction, Icon]) => (
            <button type="button" key={direction} aria-label={`Move ${direction}`} className={buttonClass}
              disabled={props.disabled || !selected} onClick={event => props.onNudge(direction, event.shiftKey)}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <button type="button" aria-label="Undo" title="เลิกทำ (Ctrl+Z)" className={buttonClass}
          disabled={props.disabled || !props.canUndo} onClick={props.onUndo}><Undo2 size={14} /></button>
        <button type="button" aria-label="Redo" title="ทำซ้ำ (Ctrl+Shift+Z)" className={buttonClass}
          disabled={props.disabled || !props.canRedo} onClick={props.onRedo}><Redo2 size={14} /></button>
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" aria-label="Zoom out" className={buttonClass} disabled={props.disabled || props.zoom <= 50}
            onClick={() => props.onZoom(Math.max(50, props.zoom - 25))}><ZoomOut size={14} /></button>
          <select aria-label="Zoom" value={props.zoom} onChange={event => props.onZoom(Number(event.target.value))}
            className="rounded border border-gray-200 bg-white px-1 py-1 text-xs">
            {[50, 75, 100, 125, 150, 175, 200].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
          <button type="button" aria-label="Zoom in" className={buttonClass} disabled={props.disabled || props.zoom >= 200}
            onClick={() => props.onZoom(Math.min(200, props.zoom + 25))}><ZoomIn size={14} /></button>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" aria-label="Show guides" checked={props.showGuides}
            onChange={event => props.onShowGuides(event.target.checked)} /> เส้นช่วยวาง
        </label>
      </div>
      <p className="text-[11px] text-gray-500">วัดจากมุมซ้ายบนเอกสาร • ลูกศรขยับ 0.1 มม. • Shift + ลูกศรขยับ 1 มม. • เส้นตารางทุก 5 มม.</p>
    </fieldset>
  );
}
