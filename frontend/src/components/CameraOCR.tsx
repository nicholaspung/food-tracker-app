import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Copy, RotateCcw, Loader2 } from 'lucide-react';
import { createWorker } from 'tesseract.js';

export default function CameraOCR() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        setError('');
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          setStream(mediaStream);
          // Wait for video to be ready
          videoRef.current.onloadedmetadata = () => {
            setIsCameraReady(true);
          };
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError('Failed to access camera. Please check permissions.');
      }
    };

    initCamera();

    // Cleanup: stop camera when component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Cleanup stream when stream changes
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) return;

    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Use toBlob instead of toDataURL for better security/performance
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.95);
      });

      if (!blob) {
        setError('Failed to capture image');
        return;
      }

      // Convert blob to data URL for display and OCR
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageDataUrl = reader.result as string;
        setCapturedImage(imageDataUrl);
        // Run OCR on the captured image
        runOCR(imageDataUrl);
      };
      reader.onerror = () => {
        setError('Failed to process captured image');
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture frame. Please try again.');
    }
  };

  const runOCR = async (imageDataUrl: string) => {
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

      // Recognize text from image
      const { data } = await worker.recognize(imageDataUrl);

      // Get extracted text and clean it up
      const text = data.text.trim();

      if (text) {
        setExtractedText(text);
      } else {
        setExtractedText('No text detected. Try capturing again with better lighting or a clearer view.');
      }

      // Terminate worker to free up resources
      await worker.terminate();
    } catch (err: any) {
      console.error('OCR error:', err);

      // Show detailed error message
      const errorMsg = err?.message || err?.toString() || 'Unknown error';

      if (errorMsg.includes('insecure')) {
        setError(`Security Error: Canvas operation blocked. This may be a browser restriction. Try a different browser or device.`);
      } else if (errorMsg.includes('CORS') || errorMsg.includes('cross-origin')) {
        setError(`Network Error: Unable to load OCR resources. Please check your connection and try again.`);
      } else if (errorMsg.includes('taint') || errorMsg.includes('cross-origin')) {
        setError(`Browser Security: Your browser blocked this operation. Try using Chrome or Safari.`);
      } else {
        setError(`OCR Error: ${errorMsg}`);
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

  const resetCamera = () => {
    setCapturedImage(null);
    setExtractedText('');
    setError('');
    setCopySuccess(false);
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
      {/* Camera View or Captured Image */}
      <div className="relative bg-black">
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto"
              style={{ maxHeight: '50vh' }}
            />
            <canvas ref={canvasRef} className="hidden" />

            {!isCameraReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="text-white text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p>Initializing camera...</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <img
            src={capturedImage}
            alt="Captured frame"
            className="w-full h-auto"
            style={{ maxHeight: '50vh' }}
          />
        )}
      </div>

      {/* Controls and Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Message */}
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        {!capturedImage ? (
          <Button
            onClick={captureFrame}
            disabled={!isCameraReady || isProcessing}
            className="w-full"
            size="lg"
            data-testid="capture-button"
          >
            <Camera className="w-5 h-5 mr-2" />
            Capture & Extract Text
          </Button>
        ) : (
          <Button
            onClick={resetCamera}
            variant="outline"
            className="w-full"
            size="lg"
            data-testid="reset-button"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Take Another Photo
          </Button>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">Extracting text...</p>
            </div>
          </div>
        )}

        {/* Extracted Text */}
        {extractedText && !isProcessing && (
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
        {!capturedImage && !error && isCameraReady && (
          <>
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Tips for best results:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Point camera at text with good lighting</li>
                <li>Keep text centered and in focus</li>
                <li>Avoid glare and shadows</li>
                <li>Hold steady when capturing</li>
              </ul>
            </div>

            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">📱 Beta Feature</h3>
              <p className="text-sm text-amber-800">
                This feature is experimental and may not work on all devices or browsers.
                For best results, use Chrome or Safari on mobile.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
