import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMenuOCR } from '@/hooks/useMenuOCR';
import { getLastMenuUploadDate } from '@/services/ocrService';
import { getRemainingAttempts, getFailedAttemptsToday } from '@/services/ocrRateLimitService';
import { logger } from "@/lib/logger";
import { MenuItem, User } from '@/lib/pocketbase';
import { pb } from '@/lib/pocketbase';

interface MenuScanStepProps {
  restaurantId: string;
  restaurantName: string;
  onItemsExtracted: (items: MenuItem[]) => void;
  onSkip: () => void;
}

export default function MenuScanStep({
  restaurantId,
  restaurantName,
  onItemsExtracted,
  onSkip,
}: MenuScanStepProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lastUploadDate, setLastUploadDate] = useState<Date | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);
  const [showDebugData, setShowDebugData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { status, progress, menuItems, error, debugData, processMenuImage, reset } = useMenuOCR();

  // Fetch last upload date when component mounts
  useEffect(() => {
    const fetchLastUpload = async () => {
      const date = await getLastMenuUploadDate(restaurantId);
      setLastUploadDate(date);
    };
    fetchLastUpload();
  }, [restaurantId]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image is too large. Please select an image under 10MB');
      return;
    }

    let processedFile = file;

    // Check if file is HEIF/HEIC and convert via backend
    const isHEIF = file.type === 'image/heif' || file.type === 'image/heic' ||
                   file.name.toLowerCase().endsWith('.heif') ||
                   file.name.toLowerCase().endsWith('.heic');

    if (isHEIF) {
      try {
        logger.log('Converting HEIC image to JPEG via backend...');
        setIsConvertingHeic(true);

        // Create FormData and upload to backend for conversion
        const formData = new FormData();
        formData.append('image', file);

        // Use fetch directly to get the blob response
        const baseUrl = pb.baseUrl;
        const token = pb.authStore.token;

        const response = await fetch(`${baseUrl}/api/convert-heic`, {
          method: 'POST',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Conversion failed: ${response.statusText}`);
        }

        // Get the JPEG blob from response
        const jpegBlob = await response.blob();

        // Create a new File from the JPEG blob
        processedFile = new File(
          [jpegBlob],
          file.name.replace(/\.(heif|heic)$/i, '.jpg'),
          { type: 'image/jpeg' }
        );

        logger.log('HEIC conversion successful via backend');
        setIsConvertingHeic(false);
      } catch (error) {
        setIsConvertingHeic(false);
        logger.error('Failed to convert HEIC image:', error);
        alert(
          'Failed to convert HEIC image. The image may be corrupted or an unsupported format.\n\n' +
          'Try:\n' +
          '1. Taking a new photo\n' +
          '2. Converting to JPEG first\n' +
          '3. Changing iPhone settings to capture as JPEG (Settings > Camera > Formats > Most Compatible)'
        );
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    }

    // Validate file type (after potential conversion)
    if (!processedFile.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, etc.)');
      return;
    }

    setSelectedImage(processedFile);
    setShowConsent(true);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(processedFile);
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    try {
      const items = await processMenuImage(selectedImage, restaurantId);
      // Notify parent of scanned items
      onItemsExtracted(items);
    } catch (err) {
      logger.error('OCR failed:', err);
    }
  };

  const handleRetake = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setShowConsent(false);
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'preprocessing':
        return 'Enhancing image for OCR...';
      case 'compressing':
        return 'Optimizing image...';
      case 'uploading':
        return 'Uploading menu photo...';
      case 'processing':
        return 'Reading menu text...';
      case 'complete':
        return `Found ${menuItems.length} menu items!`;
      case 'error':
        return 'Failed to scan menu';
      default:
        return '';
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Last upload info */}
        {lastUploadDate && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Last menu photo uploaded {formatRelativeTime(lastUploadDate)}
            </AlertDescription>
          </Alert>
        )}

        {/* Rate limit info (hidden for subscribers and admins) */}
        {(() => {
          const user = pb.authStore.record as User | null;
          const hasUnlimited = user?.isAdmin === true || user?.isSubscriber === true;

          // Don't show rate limit info for subscribers/admins
          if (hasUnlimited) {
            return null;
          }

          const failedAttempts = getFailedAttemptsToday();
          const remaining = getRemainingAttempts();

          if (failedAttempts > 0) {
            return (
              <Alert variant={remaining === 0 ? 'destructive' : 'default'}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {remaining === 0 ? (
                    <span>
                      You have used all 5 attempts for today. Please try again tomorrow with menu images.
                    </span>
                  ) : (
                    <span>
                      Failed menu uploads today: {failedAttempts}. You have {remaining} {remaining === 1 ? 'attempt' : 'attempts'} remaining.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            );
          }
          return null;
        })()}

        {/* File input (hidden, triggered by buttons) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="menu-image-input"
        />

        {/* HEIC conversion loading */}
        {isConvertingHeic && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Converting iPhone photo to JPEG...
            </AlertDescription>
          </Alert>
        )}

        {/* Image preview and consent */}
        {imagePreview && !isConvertingHeic && (
          <div className="space-y-4">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-100">
              <img
                src={imagePreview}
                alt="Menu preview"
                className="w-full h-full object-contain"
              />
            </div>

            {showConsent && status === 'idle' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Note:</strong> This image will be stored and menu items will be
                  available to all users. This helps build a collaborative menu database.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Processing status */}
        {status !== 'idle' && status !== 'error' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{getStatusMessage()}</span>
              <span className="text-gray-500">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Success state */}
        {status === 'complete' && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <div className="font-medium">{getStatusMessage()}</div>
              <div className="mt-2 text-xs">
                Click "Use These Items" to add them to the search results.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error state */}
        {status === 'error' && error && (
          <Alert className="border-red-500 bg-red-50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Admin Debug View */}
        {(() => {
          const user = pb.authStore.record as User | null;
          const isAdmin = user?.isAdmin === true;

          // Only show for admins when debug data is available
          if (!isAdmin || !debugData) {
            return null;
          }

          return (
            <Card className="border-2 border-purple-500 bg-purple-50">
              <CardContent className="pt-4 space-y-2">
                <button
                  onClick={() => setShowDebugData(!showDebugData)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-purple-900"
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Admin Debug View (Gemini Response)
                  </span>
                  {showDebugData ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showDebugData && (
                  <div className="space-y-3 text-xs">
                    {/* Raw Response */}
                    <div>
                      <div className="font-semibold text-purple-900 mb-1">Raw Response:</div>
                      <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words">
                        {debugData.rawResponse}
                      </pre>
                    </div>

                    {/* Model Info */}
                    <div>
                      <div className="font-semibold text-purple-900 mb-1">Model:</div>
                      <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                        {debugData.model}
                      </div>
                    </div>

                    {/* Candidates Count */}
                    <div>
                      <div className="font-semibold text-purple-900 mb-1">Candidates Count:</div>
                      <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                        {debugData.candidatesCount}
                      </div>
                    </div>

                    {/* Finish Reason */}
                    {debugData.finishReason !== undefined && (
                      <div>
                        <div className="font-semibold text-purple-900 mb-1">Finish Reason:</div>
                        <div className="bg-white p-2 rounded border border-purple-300 text-purple-900">
                          {JSON.stringify(debugData.finishReason)}
                        </div>
                      </div>
                    )}

                    {/* Parts */}
                    {debugData.parts && debugData.parts.length > 0 && (
                      <div>
                        <div className="font-semibold text-purple-900 mb-1">Parts ({debugData.parts.length}):</div>
                        <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-40">
                          {JSON.stringify(debugData.parts, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Safety Ratings */}
                    {debugData.safetyRatings && (
                      <div>
                        <div className="font-semibold text-purple-900 mb-1">Safety Ratings:</div>
                        <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-40">
                          {JSON.stringify(debugData.safetyRatings, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Full JSON */}
                    <div>
                      <div className="font-semibold text-purple-900 mb-1">Full Debug JSON:</div>
                      <pre className="bg-white p-2 rounded border border-purple-300 overflow-x-auto text-purple-900 whitespace-pre-wrap break-words max-h-60">
                        {JSON.stringify(debugData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {!selectedImage && status === 'idle' && (
            <>
              <Button
                type="button"
                variant="default"
                size="lg"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                data-testid="scan-menu-button"
              >
                <Camera className="w-5 h-5 mr-2" />
                Take Photo / Upload Image
              </Button>
              <p className="text-xs text-gray-500 text-center -mt-2">
                On mobile: Opens camera or photo library
              </p>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={onSkip}
                data-testid="skip-scan-button"
              >
                Skip Scan
              </Button>
            </>
          )}

          {selectedImage && status === 'idle' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleRetake}
              >
                Retake
              </Button>
              <Button
                type="button"
                variant="default"
                className="flex-1"
                onClick={handleScan}
                data-testid="process-menu-button"
              >
                <Upload className="w-4 h-4 mr-2" />
                Scan Menu
              </Button>
            </div>
          )}

          {status === 'complete' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleRetake}
              >
                Scan Another
              </Button>
              <Button
                type="button"
                variant="default"
                className="flex-1"
                onClick={() => onItemsExtracted(menuItems)}
                data-testid="use-items-button"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Use These Items ({menuItems.length})
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleRetake}
              >
                Try Again
              </Button>
              <Button
                type="button"
                variant="default"
                className="flex-1"
                onClick={onSkip}
              >
                Add Manually
              </Button>
            </div>
          )}

          {(status === 'compressing' || status === 'uploading' || status === 'processing') && (
            <Button type="button" disabled className="w-full" size="lg">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {getStatusMessage()}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}
