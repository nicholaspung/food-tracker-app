import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Copy, RotateCcw, Loader2 } from 'lucide-react';
import { createWorker } from 'tesseract.js';

export default function CameraOCR() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 10MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    setSelectedImage(file);
    setError('');
    setExtractedText('');

    // Create preview URL for display only
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Run OCR directly on the File object (not data URL)
    runOCR(file);
  };

  const runOCR = async (imageFile: File) => {
    setIsProcessing(true);
    setError('');
    setExtractedText('');

    let worker = null;

    try {
      // Create Tesseract worker with default CDN (better CORS handling)
      setExtractedText('Initializing OCR...');
      worker = await createWorker('eng', 1, {
        logger: (m) => {
          console.log('[Tesseract]', m);
          if (m.status === 'recognizing text') {
            setExtractedText(`Processing: ${Math.round(m.progress * 100)}%`);
          } else if (m.status === 'loading tesseract core') {
            setExtractedText('Loading OCR engine...');
          } else if (m.status === 'loading language traineddata') {
            setExtractedText('Loading language data...');
          }
        },
      });

      setExtractedText('Extracting text...');

      // Pass File object directly to Tesseract (avoids data URL security issues)
      const { data } = await worker.recognize(imageFile);

      // Get extracted text and clean it up
      const text = data.text.trim();

      if (text) {
        setExtractedText(text);
      } else {
        setExtractedText('No text detected. Try another image with clearer text.');
      }

      // Terminate worker to free up resources
      await worker.terminate();
    } catch (err: any) {
      console.error('OCR error:', err);

      // Show detailed error message
      const errorMsg = err?.message || err?.toString() || 'Unknown error';

      if (errorMsg.includes('CORS') || errorMsg.includes('cross-origin')) {
        setError(`Network Error: Unable to load OCR resources. Please check your connection and try again.`);
      } else {
        setError(`OCR Error: ${errorMsg}. Please try another image.`);
      }

      setExtractedText(''); // Clear any progress message

      // Clean up worker if it was created
      if (worker) {
        try {
          await worker.terminate();
        } catch (e) {
          console.error('Error terminating worker:', e);
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setExtractedText('');
    setError('');
    setCopySuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyText = async () => {
    if (!extractedText) return;

    try {
      await navigator.clipboard.writeText(extractedText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      setError('Failed to copy text to clipboard');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* File input (hidden, triggered by button) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="camera-ocr-input"
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Image Preview */}
        {imagePreview && (
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <img
              src={imagePreview}
              alt="Captured"
              className="w-full h-auto rounded"
              style={{ maxHeight: '40vh', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">{extractedText || 'Processing...'}</p>
            </div>
          </div>
        )}

        {/* Extracted Text */}
        {extractedText && !isProcessing && !error && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Extracted Text</h3>
              <Button
                onClick={copyText}
                variant="outline"
                size="sm"
                data-testid="copy-text-button"
              >
                <Copy className="w-4 h-4 mr-1" />
                {copySuccess ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-sm text-gray-800 whitespace-pre-wrap" data-testid="extracted-text">
                {extractedText}
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!selectedImage && (
          <>
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">How to use:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Tap the button below to take a photo or upload an image</li>
                <li>Point at text with good lighting</li>
                <li>Keep text centered and in focus</li>
                <li>Avoid glare and shadows</li>
              </ul>
            </div>

            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">📱 Beta Feature</h3>
              <p className="text-sm text-amber-800">
                This feature uses your device's camera or photo library.
                On mobile, you'll be able to take a photo directly or choose from your gallery.
              </p>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {!selectedImage ? (
            <>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
                size="lg"
                data-testid="take-photo-button"
              >
                <Camera className="w-5 h-5 mr-2" />
                Take Photo / Upload Image
              </Button>
              <p className="text-xs text-gray-500 text-center">
                On mobile: Opens camera or photo library
              </p>
            </>
          ) : (
            <Button
              onClick={handleRetake}
              variant="outline"
              className="w-full"
              size="lg"
              data-testid="retake-button"
              disabled={isProcessing}
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Take Another Photo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
