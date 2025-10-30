import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Camera } from 'lucide-react';
import { logger } from '@/lib/logger';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');
  const [isScanning, setIsScanning] = useState(true);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    const startScanning = async () => {
      try {
        if (!videoRef.current) return;

        // Get video input devices
        const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (videoInputDevices.length === 0) {
          setError('No camera found on this device');
          return;
        }

        // Use the first camera (or back camera on mobile if available)
        const selectedDevice = videoInputDevices.find(
          (device: MediaDeviceInfo) => device.label.toLowerCase().includes('back')
        ) || videoInputDevices[0];

        // Start decoding from video
        await reader.decodeFromVideoDevice(
          selectedDevice.deviceId,
          videoRef.current,
          (result) => {
            if (result) {
              const text = result.getText();
              if (text) {
                onScan(text);
                setIsScanning(false);
              }
            }
            // Ignore errors during scanning (they're frequent as it tries to decode)
          }
        );
      } catch (err) {
        logger.error('Scanner error:', err);
        setError('Failed to access camera. Please check permissions.');
      }
    };

    startScanning();

    // Cleanup
    return () => {
      // BrowserMultiFormatReader cleanup is handled automatically
      // No manual reset needed
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Scan QR Code</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-white hover:bg-gray-800"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center">
        {error ? (
          <Card className="m-4">
            <CardContent className="pt-6">
              <p className="text-red-600 text-center">{error}</p>
              <Button onClick={onClose} className="w-full mt-4">
                Close
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Corner brackets for scanning area */}
                <div className="w-64 h-64 relative">
                  {/* Top-left corner */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500"></div>
                  {/* Top-right corner */}
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500"></div>
                  {/* Bottom-left corner */}
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500"></div>
                  {/* Bottom-right corner */}
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500"></div>

                  {/* Scanning line animation */}
                  {isScanning && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse"></div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-gray-900 text-white p-4 text-center">
        <p className="text-sm">Point your camera at a friend's QR code</p>
      </div>
    </div>
  );
}
