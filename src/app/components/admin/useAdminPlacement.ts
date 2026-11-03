import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type SetStateAction } from 'react';
import type { ApprovalStep } from '../../data/mockData';
import {
  mmToPercent, clampPlacement, pointerToPagePercent, getSelectedPlacement,
  updateSelectedPlacement, nudgeSelectedPlacement, createPlacementHistory, placementHistoryReducer,
} from '../../lib/adminPlacement.js';

export interface DraggableItem {
  level: number;
  type: 'signature' | 'checkmark' | 'date' | 'text' | 'extraSignature' | 'extraText';
  extraIndex?: number;
}

export function useAdminPlacement(initialSteps: ApprovalStep[], blocked: boolean, pageNum: number) {
  const [history, setHistory] = useState(() => createPlacementHistory(initialSteps));
  const historyRef = useRef(history);
  historyRef.current = history;
  const editsLocked = useRef(blocked);
  editsLocked.current = blocked;
  const [selectedItem, setSelectedItem] = useState<DraggableItem | null>(null);
  const [zoom, setZoom] = useState(100);
  const [pageBaseWidth, setPageBaseWidth] = useState(560);
  const [showGuides, setShowGuides] = useState(false);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number; element: HTMLElement; item: DraggableItem;
    offset: { x: number; y: number };
  } | null>(null);

  const applyHistory = useCallback((action: any) => {
    const next = placementHistoryReducer(historyRef.current, action);
    historyRef.current = next;
    setHistory(next);
  }, []);
  const setSteps = useCallback((change: SetStateAction<ApprovalStep[]>) => {
    if (editsLocked.current) return;
    const next = typeof change === 'function' ? change(historyRef.current.present) : change;
    applyHistory({ type: 'change', steps: next });
  }, [applyHistory]);

  useEffect(() => {
    const area = scrollAreaRef.current;
    if (!area) return;
    const measure = () => setPageBaseWidth(Math.min(560, Math.max(160, area.clientWidth - 32)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const itemKey = (item: DraggableItem) => `${item.level}:${item.type}:${item.extraIndex ?? 0}`;
  const selectedKey = selectedItem ? itemKey(selectedItem) : '';
  const getBounds = (item: DraggableItem) => {
    const page = pageContainerRef.current;
    const element = page?.querySelector<HTMLElement>(`[data-placement-key="${itemKey(item)}"]`);
    if (!page || !element) return null;
    const pageRect = page.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    if (pageRect.width <= 0 || pageRect.height <= 0 || itemRect.width <= 0 || itemRect.height <= 0) return null;
    return { widthPercent: itemRect.width / pageRect.width * 100, heightPercent: itemRect.height / pageRect.height * 100 };
  };

  const finishDrag = (event?: { pointerId: number }) => {
    const active = drag.current;
    if (!active) return;
    if (event && event.pointerId !== active.pointerId) return;
    drag.current = null;
    applyHistory({ type: 'finish' });
    if (active.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>, level: number, type: DraggableItem['type'], extraIndex?: number) => {
    if (editsLocked.current || (event.button !== undefined && event.button !== 0)) return;
    if (drag.current && drag.current.pointerId !== event.pointerId) return;
    const item = { level, type, extraIndex };
    if (!getSelectedPlacement(historyRef.current.present, item)) return;
    finishDrag();
    setSelectedItem(item);
    event.preventDefault();
    event.stopPropagation();
    dialogRef.current?.focus({ preventScroll: true });
    const rect = event.currentTarget.getBoundingClientRect();
    applyHistory({ type: 'begin' });
    drag.current = {
      pointerId: event.pointerId, element: event.currentTarget, item,
      offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || editsLocked.current) return;
    const rect = pageContainerRef.current?.getBoundingClientRect();
    const bounds = getBounds(active.item);
    if (!rect || !bounds) return;
    const position = pointerToPagePercent({ clientX: event.clientX, clientY: event.clientY }, rect, active.offset, bounds);
    if (!position) return;
    event.preventDefault();
    setSteps(previous => updateSelectedPlacement(previous, active.item, position));
  };

  const nudge = (direction: 'left' | 'right' | 'up' | 'down', coarse = false) => {
    if (editsLocked.current || !selectedItem) return;
    const bounds = getBounds(selectedItem);
    if (!bounds) return;
    finishDrag();
    setSteps(previous => nudgeSelectedPlacement(previous, selectedItem, direction, bounds, { coarse }));
  };

  const setCoordinate = (axis: 'x' | 'y', value: number) => {
    if (editsLocked.current || !selectedItem) return;
    const position = getSelectedPlacement(historyRef.current.present, selectedItem);
    const bounds = getBounds(selectedItem);
    if (!position || !bounds) return;
    finishDrag();
    const next = clampPlacement({ ...position, [axis]: mmToPercent(value, axis) }, bounds);
    setSteps(previous => updateSelectedPlacement(previous, selectedItem, next));
  };

  const undo = () => { if (!editsLocked.current) { finishDrag(); applyHistory({ type: 'undo' }); } };
  const redo = () => { if (!editsLocked.current) { finishDrag(); applyHistory({ type: 'redo' }); } };
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]') || editsLocked.current) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.shiftKey ? redo() : undo(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault(); redo(); return;
    }
    const directions: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    };
    if (directions[event.key] && selectedItem) {
      event.preventDefault(); nudge(directions[event.key], event.shiftKey);
    }
  };

  const steps: ApprovalStep[] = history.present;
  useEffect(() => {
    if (!selectedItem) return;
    const step = steps.find(step => step.level === selectedItem.level);
    if (!step || (step.page || 1) !== pageNum || !getSelectedPlacement(steps, selectedItem)) setSelectedItem(null);
  }, [steps, pageNum, selectedItem]);

  const choices: Array<{ key: string; label: string; item: DraggableItem }> = [];
  for (const step of steps) {
    if ((step.page || 1) !== pageNum) continue;
    const add = (type: DraggableItem['type'], label: string, extraIndex?: number) => {
      const item = { level: step.level, type, extraIndex };
      if (getSelectedPlacement(steps, item)) choices.push({ key: itemKey(item), label: `ระดับ ${step.level} · ${label}`, item });
    };
    if (step.signatureData) add('signature', 'ลายเซ็น');
    if (step.signatureData) step.extraSignaturePositions?.forEach((_, index) => add('extraSignature', `ลายเซ็นเสริม ${index + 1}`, index));
    if (step.textBlock) add('text', 'ข้อความ');
    step.extraTextBlocks?.forEach((_, index) => add('extraText', `ข้อความเสริม ${index + 1}`, index));
    if (step.dateBlock) add('date', 'วันที่');
    if (step.checkmarkBlock) add('checkmark', 'เครื่องหมาย');
  }

  return {
    steps, setSteps, historyRef, selectedItem, setSelectedItem, selectedKey,
    selectedPosition: selectedItem ? getSelectedPlacement(steps, selectedItem) : null,
    choices, itemKey, pageContainerRef, dialogRef, scrollAreaRef,
    onPointerDown, onPointerMove, finishDrag, onDialogKeyDown, nudge, setCoordinate,
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    zoom, setZoom, pageBaseWidth, pageWidth: pageBaseWidth * zoom / 100, showGuides, setShowGuides,
  };
}
