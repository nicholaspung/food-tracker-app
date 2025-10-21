import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMenuOCR } from '@/hooks/useMenuOCR';
import { getLastMenuUploadDate } from '@/services/ocrService';
import { MenuItem } from '@/lib/pocketbase';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { status, progress, menuItems, error, processMenuImage, reset } = useMenuOCR();

  // Fetch last upload date when component mounts
  useEffect(() => {
    const fetchLastUpload = async () => {
      const date = await getLastMenuUploadDate(restaurantId);
      setLastUploadDate(date);
    };
    fetchLastUpload();
  }, [restaurantId]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image is too large. Please select an image under 10MB');
      return;
    }

    setSelectedImage(file);
    setShowConsent(true);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    try {
      const items = await processMenuImage(selectedImage, restaurantId);
      // Auto-advance after successful scan
      setTimeout(() => {
        onItemsExtracted(items);
      }, 1500);
    } catch (err) {
      console.error('OCR failed:', err);
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

  const handleUseExtractedItems = () => {
    onItemsExtracted(menuItems);
  };

  const getStatusMessage = () => {
    switch (status) {
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
      <CardHeader>
        <CardTitle>Scan Menu (Optional)</CardTitle>
        <CardDescription>
          Take a photo or upload an image of the menu to auto-extract items for {restaurantName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last upload info */}
        {lastUploadDate && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Last menu photo uploaded {formatRelativeTime(lastUploadDate)}
            </AlertDescription>
          </Alert>
        )}

        {/* File input (hidden, triggered by buttons) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="menu-image-input"
        />

        {/* Image preview and consent */}
        {imagePreview && (
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
              <div className="mt-2 space-y-1">
                {menuItems.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="text-xs">
                    • {item.name}
                    {item.description && ` - ${item.description.substring(0, 50)}${item.description.length > 50 ? '...' : ''}`}
                  </div>
                ))}
                {menuItems.length > 5 && (
                  <div className="text-xs italic">
                    +{menuItems.length - 5} more items...
                  </div>
                )}
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
                Skip - Add Items Manually
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
                onClick={handleUseExtractedItems}
                data-testid="use-scanned-items-button"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Use These Items
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
