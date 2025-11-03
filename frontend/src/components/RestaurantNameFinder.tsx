import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Copy, RotateCcw, Loader2, Check, Store, AlertTriangle, X } from 'lucide-react';
import { pb } from '@/lib/pocketbase';
import ImageRegionSelector from '@/components/ImageRegionSelector';

interface RestaurantNameResponse {
  found: boolean;
  restaurantName?: string;
  confidence?: 'high' | 'medium' | 'low';
  language?: string;
  allText?: string;
  error?: string;
  reason?: string;
}

type Step = 'capture' | 'preview' | 'select-region' | 'processing' | 'result';

export default function RestaurantNameFinder() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<Step>('capture');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<RestaurantNameResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);

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
    setResult(null);

    // Create preview URL for display
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Move to preview step
    setCurrentStep('preview');
  };

  const findRestaurantName = async (imageFile: File) => {
    setCurrentStep('processing');
    setIsProcessing(true);
    setError('');
    setResult(null);

    try {
      // Create FormData and upload to backend
      const formData = new FormData();
      formData.append('image', imageFile);

      // Use PocketBase SDK to send authenticated request
      const baseUrl = pb.baseUrl;
      const token = pb.authStore.token;

      const response = await fetch(`${baseUrl}/api/find-restaurant-name`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `${token}` : '',
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || 'Failed to analyze image');
      }

      const data: RestaurantNameResponse = await response.json();

      if (data.error) {
        if (data.error === 'NOT_RESTAURANT') {
          setError(`This doesn't appear to be a restaurant image. ${data.reason || ''}`);
        } else {
          setError(`Error: ${data.reason || 'Unknown error'}`);
        }
        setResult(null);
        setCurrentStep('result');
      } else {
        setResult(data);
        setCurrentStep('result');
      }
    } catch (err: any) {
      console.error('Restaurant name finder error:', err);
      setError(`Failed to analyze image: ${err.message || 'Unknown error'}. Please try another image.`);
      setResult(null);
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

    // Find restaurant name in the cropped image
    await findRestaurantName(croppedFile);
  };

  const handleSkipRegionSelection = async () => {
    // Process the full image without cropping
    if (selectedImage) {
      await findRestaurantName(selectedImage);
    }
  };

  const handleCancelRegionSelection = () => {
    setCurrentStep('preview');
  };

  const handleProceedToRegionSelection = () => {
    setCurrentStep('select-region');
  };

  const handleRetake = () => {
    setCurrentStep('capture');
    setSelectedImage(null);
    setImagePreview(null);
    setResult(null);
    setError('');
    setCopied(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancelPreview = () => {
    setCurrentStep('capture');
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyText = async (text: string) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      setError('Failed to copy text to clipboard');
    }
  };

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case 'high':
        return <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">High confidence</span>;
      case 'medium':
        return <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">Medium confidence</span>;
      case 'low':
        return <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded-full">Low confidence</span>;
      default:
        return null;
    }
  };

  // Step 2: Preview Image (Full Screen)
  if (currentStep === 'preview' && imagePreview) {
    return (
      <div className="flex flex-col h-full bg-gray-900">
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
          <h3 className="text-white font-semibold">Step 1: Review Photo</h3>
          <button
            onClick={handleCancelPreview}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Full Screen Image Preview */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          <img
            src={imagePreview}
            alt="Preview"
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Instructions */}
        <div className="bg-blue-900 px-4 py-3">
          <p className="text-sm text-blue-100 text-center">
            Review your photo. Next, you'll select the restaurant name region.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-gray-800 space-y-2">
          <Button
            onClick={handleProceedToRegionSelection}
            className="w-full"
            size="lg"
            data-testid="proceed-to-region-selection"
          >
            Next: Select Restaurant Name
          </Button>
          <Button
            onClick={handleCancelPreview}
            variant="outline"
            className="w-full"
          >
            Retake Photo
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Region Selection (Full Screen)
  if (currentStep === 'select-region' && imagePreview) {
    return (
      <ImageRegionSelector
        imageSrc={imagePreview}
        onRegionSelect={handleRegionSelect}
        onSkip={handleSkipRegionSelection}
        onCancel={handleCancelRegionSelection}
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
        data-testid="restaurant-finder-input"
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
          <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              <p className="text-sm text-gray-600">Analyzing image with AI...</p>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              Looking for restaurant names and text
            </p>
          </div>
        )}

        {/* Result: Restaurant Name Found */}
        {result && result.found && result.restaurantName && !isProcessing && (
          <div className="space-y-3">
            <div className="bg-green-50 rounded-lg border border-green-200 p-4">
              <div className="flex items-start gap-3 mb-3">
                <Store className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-green-900 mb-1">
                    Restaurant Found!
                  </h3>
                  <p className="text-xs text-green-700">
                    AI detected a restaurant name in the image
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-md p-3 border border-green-300">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xl font-bold text-gray-900">
                    {result.restaurantName}
                  </span>
                  {getConfidenceBadge(result.confidence)}
                </div>
                {result.language && (
                  <p className="text-xs text-gray-500 mb-3">
                    Language: {result.language}
                  </p>
                )}
                <Button
                  onClick={() => copyText(result.restaurantName!)}
                  variant="default"
                  size="sm"
                  className="w-full"
                  data-testid="copy-restaurant-name-button"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy Restaurant Name
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
              <p className="text-xs text-blue-800">
                💡 Tip: You can now use this name to search for the restaurant in the main app
              </p>
            </div>
          </div>
        )}

        {/* Result: No Restaurant Name, but Text Found */}
        {result && !result.found && result.allText && !isProcessing && (
          <div className="space-y-3">
            <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                    No Clear Restaurant Name
                  </h3>
                  <p className="text-xs text-yellow-700">
                    AI couldn't identify a specific restaurant name, but found this text:
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-md p-3 border border-yellow-300 mb-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {result.allText}
                </p>
              </div>

              <Button
                onClick={() => copyText(result.allText!)}
                variant="default"
                size="sm"
                className="w-full"
                data-testid="copy-all-text-button"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy All Text
                  </>
                )}
              </Button>
            </div>

            <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
              <p className="text-xs text-blue-800">
                💡 Try taking another photo from a different angle or closer to the restaurant sign
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        {currentStep === 'capture' && (
          <>
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">How to use:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Take a photo of a restaurant sign, storefront, or menu</li>
                <li>AI will identify the restaurant name automatically</li>
                <li>Select a specific region for better accuracy</li>
                <li>Copy the name to search for it in the app</li>
                <li>Works with multiple languages (Korean, Japanese, Chinese, etc.)</li>
              </ul>
            </div>

            <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
              <h3 className="text-sm font-semibold text-purple-900 mb-2">🤖 AI-Powered Feature</h3>
              <p className="text-sm text-purple-800 mb-2">
                This feature uses Google Gemini Flash AI to intelligently find restaurant names
                in images. It understands context and can distinguish restaurant names from other text.
              </p>
              <p className="text-xs text-purple-700">
                Note: Images are processed by Google AI for analysis and not stored permanently.
              </p>
            </div>

            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">🔒 Security</h3>
              <p className="text-xs text-amber-800">
                This feature includes prompt injection protection. Only restaurant-related text
                will be extracted - the AI ignores any commands or instructions in the image.
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
