import React, { useRef, useState, useCallback } from 'react';
import { Move, Check, X, ZoomIn, ZoomOut } from 'lucide-react';

interface SignaturePlacementModalProps {
  signatureData: string;
  onConfirm: (signatureData: string, posX: number, posY: number) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function SignaturePlacementModal({
  signatureData,
  onConfirm,
  onBack,
  onCancel,
}: SignaturePlacementModalProps) {
  // Position as % of A4 page (0–100)
  const [pos, setPos] = useState({ x: 35, y: 70 }); // default: bottom-center area
  const [sigSize, setSigSize] = useState(14); // width as % of page width
  const pageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Convert mouse/touch event to position on the A4 page
  const getPagePos = useCallback((clientX: number, clientY: number) => {
    if (!pageRef.current) return null;
    const rect = pageRef.current.getBoundingClientRect();
    const relX = ((clientX - dragOffset.current.x - rect.left) / rect.width) * 100;
    const relY = ((clientY - dragOffset.current.y - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100 - sigSize, relX)),
      y: Math.max(0, Math.min(95, relY)),
    };
  }, [sigSize]);

  // Mouse events
  const onMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    const img = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - img.left, y: e.clientY - img.top };
    dragging.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const p = getPagePos(ev.clientX, ev.clientY);
      if (p) setPos(p);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Touch events
  const onTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    const touch = e.touches[0];
    const img = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: touch.clientX - img.left, y: touch.clientY - img.top };
    dragging.current = true;

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      if (!dragging.current) return;
      const t = ev.touches[0];
      const p = getPagePos(t.clientX, t.clientY);
      if (p) setPos(p);
    };
    const onEnd = () => {
      dragging.current = false;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const handleConfirm = () => {
    onConfirm(signatureData, pos.x, pos.y);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2 text-gray-800 font-medium">
            <Move size={18} className="text-green-600" />
            <span>วางตำแหน่งลายเซ็น</span>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Instruction */}
        <div className="px-5 pt-3 pb-1">
          <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
            <Move size={13} className="text-blue-500 shrink-0" />
            ลากลายเซ็นไปวางในตำแหน่งที่ต้องการบนเอกสาร จากนั้นกด "ยืนยัน"
          </p>
        </div>

        {/* Size control */}
        <div className="px-5 pt-2 pb-1 flex items-center gap-3">
          <span className="text-xs text-gray-500 w-16 shrink-0">ขนาดลายเซ็น</span>
          <button onClick={() => setSigSize(s => Math.max(8, s - 4))} className="p-1 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-all">
            <ZoomOut size={14} />
          </button>
          <input
            type="range" min={8} max={40} value={sigSize}
            onChange={e => setSigSize(Number(e.target.value))}
            className="flex-1 accent-green-600"
          />
          <button onClick={() => setSigSize(s => Math.min(40, s + 4))} className="p-1 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-all">
            <ZoomIn size={14} />
          </button>
        </div>

        {/* A4 Page Preview */}
        <div className="px-5 py-3 flex-1 overflow-auto flex items-start justify-center">
          {/* A4 ratio = 1:1.414 */}
          <div
            ref={pageRef}
            className="relative bg-white border border-gray-300 shadow-md select-none"
            style={{
              width: '100%',
              maxWidth: '420px',
              aspectRatio: '1 / 1.414',
              backgroundImage: `
                repeating-linear-gradient(
                  transparent, transparent 27px, #e5e7eb 27px, #e5e7eb 28px
                )
              `,
            }}
          >
            {/* Page decorations to look like a real doc */}
            <div className="absolute top-4 left-6 right-6 space-y-2 opacity-20 pointer-events-none">
              <div className="h-3 bg-gray-400 rounded w-2/3" />
              <div className="h-2 bg-gray-300 rounded w-full" />
              <div className="h-2 bg-gray-300 rounded w-5/6" />
              <div className="h-2 bg-gray-300 rounded w-full" />
              <div className="h-2 bg-gray-300 rounded w-4/5 mt-3" />
              <div className="h-2 bg-gray-300 rounded w-full" />
              <div className="h-2 bg-gray-300 rounded w-3/4" />
            </div>

            {/* Signature — draggable */}
            <img
              src={signatureData}
              alt="Signature"
              draggable={false}
              onMouseDown={onMouseDown}
              onTouchStart={onTouchStart}
              className="absolute cursor-grab active:cursor-grabbing select-none"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${sigSize}%`,
                filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))',
                userSelect: 'none',
                touchAction: 'none',
              }}
            />

            {/* Signature border hint */}
            <div
              className="absolute border-2 border-dashed border-green-400/60 rounded pointer-events-none"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${sigSize}%`,
                height: '8%',
                transform: 'translateY(-5%)',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            ← เซ็นใหม่
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Check size={16} /> ยืนยันตำแหน่ง
          </button>
        </div>
      </div>
    </div>
  );
}
