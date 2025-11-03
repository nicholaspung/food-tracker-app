import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Crop, X } from 'lucide-react';

interface Region {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface ImageRegionSelectorProps {
  imageSrc: string;
  onRegionSelect: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
  onSkip: () => void;
}

export default function ImageRegionSelector({
  imageSrc,
  onRegionSelect,
  onCancel,
  onSkip
}: ImageRegionSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      if (containerRef.current && canvasRef.current) {
        // Calculate scale to fit container
        const containerWidth = containerRef.current.offsetWidth;
        const scale = Math.min(containerWidth / img.width, 1);
        setCanvasScale(scale);
      }
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Draw canvas
  useEffect(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to scaled image size
    canvas.width = image.width * canvasScale;
    canvas.height = image.height * canvasScale;

    // Draw image scaled
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw selection rectangle if exists
    if (region) {
      const scaledRegion = {
        startX: region.startX * canvasScale,
        startY: region.startY * canvasScale,
        endX: region.endX * canvasScale,
        endY: region.endY * canvasScale,
      };

      const x = Math.min(scaledRegion.startX, scaledRegion.endX);
      const y = Math.min(scaledRegion.startY, scaledRegion.endY);
      const width = Math.abs(scaledRegion.endX - scaledRegion.startX);
      const height = Math.abs(scaledRegion.endY - scaledRegion.startY);

      // Draw semi-transparent overlay outside selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, y); // Top
      ctx.fillRect(0, y, x, height); // Left
      ctx.fillRect(x + width, y, canvas.width - (x + width), height); // Right
      ctx.fillRect(0, y + height, canvas.width, canvas.height - (y + height)); // Bottom

      // Draw selection border
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw corner handles
      const handleSize = 10;
      ctx.fillStyle = '#3B82F6';
      // Top-left
      ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
      // Top-right
      ctx.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);
      // Bottom-left
      ctx.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
      // Bottom-right
      ctx.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
    }
  }, [image, region, canvasScale]);

  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // Convert to original image coordinates
    const x = ((clientX - rect.left) / canvasScale);
    const y = ((clientY - rect.top) / canvasScale);
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);

    setIsDrawing(true);
    setRegion({ startX: x, startY: y, endX: x, endY: y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !region) return;

    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);

    setRegion({ ...region, endX: x, endY: y });
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleConfirm = async () => {
    if (!canvasRef.current || !region || !image) return;

    // Calculate crop region in original image coordinates
    const width = Math.abs(region.endX - region.startX);
    const height = Math.abs(region.endY - region.startY);
    const x = Math.min(region.startX, region.endX);
    const y = Math.min(region.startY, region.endY);

    // Validate minimum size
    if (width < 10 || height < 10) {
      alert('Selection is too small. Please draw a larger region.');
      return;
    }

    // Create a new canvas for the cropped region
    const cropCanvas = document.createElement('canvas');
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;

    cropCanvas.width = width;
    cropCanvas.height = height;

    // Draw the cropped portion from original image
    ctx.drawImage(
      image,
      x, y, width, height,
      0, 0, width, height
    );

    // Convert to blob
    cropCanvas.toBlob((blob) => {
      if (blob) {
        onRegionSelect(blob);
      }
    }, 'image/jpeg', 0.95);
  };

  const handleClearSelection = () => {
    setRegion(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crop className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">Step 2: Select Region</h3>
        </div>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-blue-900 px-4 py-2">
        <p className="text-xs text-blue-100 text-center">
          Draw a box around the restaurant name for better accuracy
        </p>
      </div>

      {/* Full Screen Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center bg-black overflow-hidden"
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="touch-none cursor-crosshair"
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      </div>

      {/* Selection Info Banner */}
      {region && (
        <div className="bg-green-900 px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-100">
              ✓ Region: {Math.round(Math.abs(region.endX - region.startX))} × {Math.round(Math.abs(region.endY - region.startY))} px
            </p>
            <button
              onClick={handleClearSelection}
              className="text-green-300 hover:text-white text-sm font-medium"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-4 bg-gray-800 space-y-2">
        <Button
          onClick={handleConfirm}
          disabled={!region}
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
            data-testid="process-full-image-button"
          >
            Use Full Image
          </Button>
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
            data-testid="cancel-selection-button"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
