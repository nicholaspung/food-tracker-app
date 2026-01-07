import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, DollarSign } from 'lucide-react';
import BillsListView from '@/components/bills/BillsListView';

interface BetaPageProps {
  onNavigateBack?: () => void;
}

export default function BetaPage({ onNavigateBack: _onNavigateBack }: BetaPageProps) {
  const [activeBetaFeature, setActiveBetaFeature] = useState<string | null>(null);

  const betaFeatures: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    component: React.ComponentType<any>;
    icon?: React.ComponentType<any>;
  }> = [
    {
      id: 'bill-splitter',
      title: 'Bill Splitter',
      description: 'Split bills with friends and track payments easily',
      status: 'MVP Testing',
      component: BillsListView,
      icon: DollarSign,
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
        {betaFeatures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="bg-gray-100 rounded-full p-6 mb-4">
              <Badge className="bg-purple-600 text-white text-lg px-4 py-2">
                No Beta Features
              </Badge>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No features available
            </h2>
            <p className="text-sm text-gray-600 max-w-md">
              There are currently no beta features available for testing. Check back later for new experimental features!
            </p>
          </div>
        ) : (
          betaFeatures.map((feature) => (
            <div
              key={feature.id}
              className="bg-white rounded-lg border border-gray-200 p-4 space-y-4"
              data-testid={`beta-feature-${feature.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {feature.icon && <feature.icon className="w-5 h-5 text-purple-600" />}
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
          ))
        )}
      </div>
    </div>
  );
}
