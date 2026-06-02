import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { PenTool, RotateCcw, Check, X } from 'lucide-react';

interface SignaturePadProps {
  onSave: (signatureData: string) => void;
  onCancel: () => void;
  initialSignature?: string;
}

export function SignaturePad({ onSave, onCancel, initialSignature }: SignaturePadProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [useExisting, setUseExisting] = useState(!!initialSignature);

  useEffect(() => {
    // Resize canvas on mount to fit container
    const resizeCanvas = () => {
      if (sigCanvas.current) {
        const canvas = sigCanvas.current.getCanvas();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d')?.scale(ratio, ratio);
        sigCanvas.current.clear(); // Clear after resize to prevent distortion
      }
    };
    
    // Only attach resize listener if we are not using the existing signature
    if (!useExisting) {
      window.addEventListener('resize', resizeCanvas);
      // Small timeout to let CSS layout finish
      setTimeout(resizeCanvas, 10);
    }
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [useExisting]);

  const clear = () => {
    sigCanvas.current?.clear();
    setHasSignature(false);
  };

  const handleEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setHasSignature(true);
    }
  };

  const handleSave = () => {
    if (useExisting && initialSignature) {
      onSave(initialSignature);
      return;
    }
    
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      // Get base64 PNG data URL
      const dataURL = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
      onSave(dataURL);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2 text-gray-800 font-medium">
            <PenTool size={18} className="text-blue-600" />
            ลงลายมือชื่อดิจิทัล
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          {initialSignature && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setUseExisting(true)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors border ${
                  useExisting 
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                ใช้ลายเซ็นเดิม
              </button>
              <button
                onClick={() => setUseExisting(false)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors border ${
                  !useExisting 
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                วาดใหม่
              </button>
            </div>
          )}

          {useExisting && initialSignature ? (
            <div className="border border-gray-200 rounded-xl bg-gray-50 h-48 flex items-center justify-center p-4">
              <img 
                src={initialSignature} 
                alt="Your Signature" 
                className="max-h-full max-w-full object-contain mix-blend-multiply filter drop-shadow-sm"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border border-gray-200 rounded-xl bg-gray-50 relative group">
                <SignatureCanvas
                  ref={sigCanvas}
                  onEnd={handleEnd}
                  canvasProps={{
                    className: "w-full h-48 cursor-crosshair touch-none",
                  }}
                  penColor="#1a3fa0" // Blue pen color (ปากกาน้ำเงิน)
                  backgroundColor="rgba(249, 250, 251, 1)" // Match gray-50
                />
                
                {/* Guidelines */}
                <div className="absolute inset-x-4 bottom-8 border-b border-gray-300 border-dashed pointer-events-none opacity-50"></div>
                <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none select-none">
                  เซ็นชื่อในกรอบด้านบน
                </div>
              </div>
              
              <div className="flex justify-end">
                <button 
                  onClick={clear}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1"
                >
                  <RotateCcw size={14} /> ล้างลายเซ็น
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm"
          >
            ยกเลิก
          </button>
          <button 
            onClick={handleSave}
            disabled={!useExisting && !hasSignature}
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Check size={16} /> ยืนยันลายเซ็น
          </button>
        </div>

      </div>
    </div>
  );
}
