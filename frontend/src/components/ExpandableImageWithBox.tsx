import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Crop, X, ZoomIn } from 'lucide-react';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = 'move' | 'tl' | 'tr' | 'bl' | 'br' | null;

interface ExpandableImageWithBoxProps {
  imageSrc: string;
  onConfirm: (croppedImageBlob: Blob) => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function ExpandableImageWithBox({
  imageSrc,
  onConfirm,
  onSkip,
  onBack,
}: ExpandableImageWithBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [box, setBox] = useState<BoundingBox>({ x: 20, y: 20, width: 60, height: 40 });
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleExpand = () => {
    setIsExpanded(true);
  };

  const handleClose = () => {
    setIsExpanded(false);
  };

  const getRelativeCoordinates = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  const getDragMode = (x: number, y: number): DragMode => {
    const handleSize = 5; // 5% of container

    // Check corners first
    if (Math.abs(x - box.x) < handleSize && Math.abs(y - box.y) < handleSize) return 'tl';
    if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - box.y) < handleSize) return 'tr';
    if (Math.abs(x - box.x) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) return 'bl';
    if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) return 'br';

    // Check if inside box
    if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) return 'move';

    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const { x, y } = getRelativeCoordinates(e.clientX, e.clientY);
    const mode = getDragMode(x, y);
    if (mode) {
      setDragMode(mode);
      setDragStart({ x, y });
      e.preventDefault();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode || !dragStart) return;

    const { x, y } = getRelativeCoordinates(e.clientX, e.clientY);
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;

    let newBox = { ...box };

    if (dragMode === 'move') {
      newBox.x = Math.max(0, Math.min(100 - newBox.width, box.x + dx));
      newBox.y = Math.max(0, Math.min(100 - newBox.height, box.y + dy));
    } else if (dragMode === 'tl') {
      const newX = Math.max(0, Math.min(box.x + box.width - 10, box.x + dx));
      const newY = Math.max(0, Math.min(box.y + box.height - 10, box.y + dy));
      newBox.width = box.width + (box.x - newX);
      newBox.height = box.height + (box.y - newY);
      newBox.x = newX;
      newBox.y = newY;
    } else if (dragMode === 'tr') {
      const newWidth = Math.max(10, Math.min(100 - box.x, box.width + dx));
      const newY = Math.max(0, Math.min(box.y + box.height - 10, box.y + dy));
      newBox.width = newWidth;
      newBox.height = box.height + (box.y - newY);
      newBox.y = newY;
    } else if (dragMode === 'bl') {
      const newX = Math.max(0, Math.min(box.x + box.width - 10, box.x + dx));
      const newHeight = Math.max(10, Math.min(100 - box.y, box.height + dy));
      newBox.width = box.width + (box.x - newX);
      newBox.height = newHeight;
      newBox.x = newX;
    } else if (dragMode === 'br') {
      newBox.width = Math.max(10, Math.min(100 - box.x, box.width + dx));
      newBox.height = Math.max(10, Math.min(100 - box.y, box.height + dy));
    }

    setBox(newBox);
    setDragStart({ x, y });
    e.preventDefault();
  };

  const handlePointerUp = () => {
    setDragMode(null);
    setDragStart(null);
  };

  const handleConfirm = async () => {
    if (!imageRef.current) return;

    // Load the original image to get actual dimensions
    const img = new Image();
    img.src = imageSrc;
    await new Promise((resolve) => { img.onload = resolve; });

    // Calculate actual pixel coordinates
    const actualX = (box.x / 100) * img.width;
    const actualY = (box.y / 100) * img.height;
    const actualWidth = (box.width / 100) * img.width;
    const actualHeight = (box.height / 100) * img.height;

    // Create canvas and crop
    const canvas = document.createElement('canvas');
    canvas.width = actualWidth;
    canvas.height = actualHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, actualX, actualY, actualWidth, actualHeight, 0, 0, actualWidth, actualHeight);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crop className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">Step 2: Select Region</h3>
        </div>
        <button onClick={onBack} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-blue-900 px-4 py-2">
        <p className="text-xs text-blue-100 text-center">
          {isExpanded ? 'Drag corners or box to adjust selection' : 'Tap image to expand and adjust selection'}
        </p>
      </div>

      {/* Image Container */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden p-4">
        {!isExpanded ? (
          // Thumbnail view with expand button
          <div className="relative">
            <img
              src={imageSrc}
              alt="Preview"
              className="max-w-full max-h-[60vh] object-contain cursor-pointer hover:opacity-90 transition-opacity"
              onClick={handleExpand}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                <ZoomIn className="w-5 h-5" />
                <span className="font-medium">Tap to Expand & Adjust</span>
              </div>
            </div>
          </div>
        ) : (
          // Expanded view with bounding box
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Full size"
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
            />

            {/* Bounding Box Overlay */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
              }}
            >
              {/* Darkened areas outside box */}
              <div className="absolute inset-0 pointer-events-auto" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />

              {/* Border */}
              <div className="absolute inset-0 border-3 border-blue-500 pointer-events-auto cursor-move" />

              {/* Corner Handles */}
              <div className="absolute -top-3 -left-3 w-6 h-6 bg-blue-500 border-2 border-white rounded-sm pointer-events-auto cursor-nwse-resize" />
              <div className="absolute -top-3 -right-3 w-6 h-6 bg-blue-500 border-2 border-white rounded-sm pointer-events-auto cursor-nesw-resize" />
              <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-blue-500 border-2 border-white rounded-sm pointer-events-auto cursor-nesw-resize" />
              <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-blue-500 border-2 border-white rounded-sm pointer-events-auto cursor-nwse-resize" />
            </div>
          </div>
        )}
      </div>

      {/* Size Info */}
      {isExpanded && (
        <div className="bg-green-900 px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-100">
              ✓ Selection: {Math.round(box.width)}% × {Math.round(box.height)}%
            </p>
            <button
              onClick={handleClose}
              className="text-green-300 hover:text-white text-sm font-medium"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-4 bg-gray-800 space-y-2">
        <Button
          onClick={handleConfirm}
          className="w-full"
          size="lg"
          data-testid="extract-text-button"
        >
          <Crop className="w-5 h-5 mr-2" />
          Continue with Selection
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={onSkip}
            variant="outline"
            className="flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
          >
            Use Full Image
          </Button>
          <Button
            onClick={onBack}
            variant="outline"
            className="flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
