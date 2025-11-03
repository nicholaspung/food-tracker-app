import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CameraOCR from '@/components/CameraOCR';
import { Camera, X } from 'lucide-react';

interface BetaPageProps {
  onNavigateBack?: () => void;
}

export default function BetaPage({ onNavigateBack: _onNavigateBack }: BetaPageProps) {
  const [activeBetaFeature, setActiveBetaFeature] = useState<string | null>(null);

  const betaFeatures = [
    {
      id: 'camera-ocr',
      title: 'Camera OCR',
      description: 'Use your camera to scan and extract text from restaurant signs and menus',
      status: 'beta',
      component: CameraOCR,
    },
  ];

  if (activeBetaFeature) {
    const feature = betaFeatures.find(f => f.id === activeBetaFeature);
    if (feature) {
      const FeatureComponent = feature.component;
      return (
        <div className="flex flex-col h-full bg-gray-50">
          {/* Feature Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">{feature.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{feature.description}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveBetaFeature(null)}
              className="ml-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Feature Content */}
          <div className="flex-1 overflow-y-auto">
            <FeatureComponent />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50" data-testid="beta-page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Beta Features</h1>
          <Badge variant="default" className="bg-purple-600">
            Admin Only
          </Badge>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Experimental features for testing and feedback
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {betaFeatures.map((feature) => (
          <div
            key={feature.id}
            className="bg-white rounded-lg border border-gray-200 p-4 space-y-4"
            data-testid={`beta-feature-${feature.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {feature.title}
                  </h2>
                  <Badge
                    variant="outline"
                    className="text-xs border-purple-500 text-purple-700"
                  >
                    {feature.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {feature.description}
                </p>
              </div>
            </div>

            <Button
              onClick={() => setActiveBetaFeature(feature.id)}
              className="w-full"
              data-testid={`try-${feature.id}-button`}
            >
              Try {feature.title}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
