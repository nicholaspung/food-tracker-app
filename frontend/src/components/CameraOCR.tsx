import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Copy, RotateCcw, Loader2, Check } from 'lucide-react';
import { pb } from '@/lib/pocketbase';
import ExpandableImageWithBox from '@/components/ExpandableImageWithBox';

interface TextBlock {
  text: string;
  confidence: number;
}

interface OCRResponse {
  textBlocks: TextBlock[];
  fullText: string;
}

type Step = 'capture' | 'preview' | 'select-region' | 'processing' | 'result';

export default function CameraOCR() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<Step>('capture');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
    setTextBlocks([]);

    // Create preview URL for display
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Move to preview step
    setCurrentStep('preview');
  };

  const runOCR = async (imageFile: File) => {
    setCurrentStep('processing');
    setIsProcessing(true);
    setError('');
    setTextBlocks([]);

    try {
      // Create FormData and upload to backend
      const formData = new FormData();
      formData.append('image', imageFile);

      // Use PocketBase SDK to send authenticated request
      const baseUrl = pb.baseUrl;
      const token = pb.authStore.token;

      const response = await fetch(`${baseUrl}/api/ocr`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `${token}` : '',
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || 'OCR failed');
      }

      const data: OCRResponse = await response.json();

      if (data.textBlocks && data.textBlocks.length > 0) {
        setTextBlocks(data.textBlocks);
        setCurrentStep('result');
      } else {
        setTextBlocks([]);
        setError('No text detected in the image. Try another image with clearer text.');
        setCurrentStep('result');
      }
    } catch (err: any) {
      console.error('OCR error:', err);
      setError(`Failed to extract text: ${err.message || 'Unknown error'}. Please try another image.`);
      setTextBlocks([]);
      setCurrentStep('result');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegionSelect = async (croppedImageBlob: Blob) => {
    // Convert blob to File
    const croppedFile = new File(
      [croppedImageBlob],
      'cropped.jpg',
      { type: 'image/jpeg' }
    );

    // Run OCR on the cropped image
    await runOCR(croppedFile);
  };

  const handleSkipRegionSelection = async () => {
    // Process the full image without cropping
    if (selectedImage) {
      await runOCR(selectedImage);
    }
  };

  const handleCancelRegionSelection = () => {
    setCurrentStep('preview');
  };

  const handleProceedToRegionSelection = () => {
    setCurrentStep('select-region');
  };

  const handleCancelPreview = () => {
    setCurrentStep('capture');
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetake = () => {
    setCurrentStep('capture');
    setSelectedImage(null);
    setImagePreview(null);
    setTextBlocks([]);
    setError('');
    setCopiedIndex(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyText = async (text: string, index: number) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      setError('Failed to copy text to clipboard');
    }
  };

  // Step 2 & 3: Combined Preview + Region Selection with Expandable Image
  if ((currentStep === 'preview' || currentStep === 'select-region') && imagePreview) {
    return (
      <ExpandableImageWithBox
        imageSrc={imagePreview}
        onConfirm={handleRegionSelect}
        onSkip={handleSkipRegionSelection}
        onBack={handleCancelPreview}
      />
    );
  }

  // Step 4: Processing & Results
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

      {/* Progress Indicator */}
      {currentStep !== 'capture' && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === 'preview' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
            }`}>1</div>
            <div className="w-12 h-0.5 bg-gray-300"></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === 'select-region' ? 'bg-blue-600 text-white' :
              currentStep === 'processing' || currentStep === 'result' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>2</div>
            <div className="w-12 h-0.5 bg-gray-300"></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              currentStep === 'processing' || currentStep === 'result' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>3</div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-600">
            <span>Photo</span>
            <span>Region</span>
            <span>Result</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Image Preview (small, in results) */}
        {imagePreview && currentStep === 'result' && (
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <img
              src={imagePreview}
              alt="Captured"
              className="w-full h-auto rounded"
              style={{ maxHeight: '30vh', objectFit: 'contain' }}
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
              <p className="text-sm text-gray-600">Extracting text with Google Cloud Vision...</p>
            </div>
          </div>
        )}

        {/* Extracted Text Blocks */}
        {textBlocks.length > 0 && !isProcessing && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Detected Text ({textBlocks.length} blocks)
            </h3>
            <div className="space-y-2">
              {textBlocks.map((block, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3"
                  data-testid={`text-block-${index}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 break-words">
                      {block.text}
                    </p>
                  </div>
                  <Button
                    onClick={() => copyText(block.text, index)}
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    data-testid={`copy-button-${index}`}
                  >
                    {copiedIndex === index ? (
                      <>
                        <Check className="w-4 h-4 mr-1 text-green-600" />
                        <span className="text-green-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {currentStep === 'capture' && (
          <>
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">How to use:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Tap the button below to take a photo or upload an image</li>
                <li>Point at text with good lighting</li>
                <li>Keep text centered and in focus</li>
                <li>Avoid glare and shadows</li>
                <li>Each piece of detected text will have its own copy button</li>
              </ul>
            </div>

            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">📱 Beta Feature</h3>
              <p className="text-sm text-amber-800 mb-2">
                This feature uses Google Cloud Vision API for high-accuracy text detection.
                On mobile, you can take a photo directly or choose from your gallery.
              </p>
              <p className="text-xs text-amber-700">
                Note: Images are processed by Google Cloud for OCR and not stored permanently.
              </p>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {currentStep === 'capture' ? (
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
          ) : currentStep === 'result' && (
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
