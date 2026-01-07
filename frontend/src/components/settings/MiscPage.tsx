import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, DollarSign, List, Lightbulb, ChevronRight } from 'lucide-react';
import BillsListView from '@/components/bills/BillsListView';
import { pb } from '@/lib/pocketbase';

type ActiveFeature = 'bill-splitter' | null;

export default function MiscPage() {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>(null);
  const [expandedTips, setExpandedTips] = useState(false);

  const currentUser = pb.authStore.record;
  const isAdmin = currentUser?.isAdmin === true;

  // Beta features only visible to admins (still in testing)
  const betaFeatures: Array<{
    id: ActiveFeature;
    title: string;
    description: string;
    status: string;
    component: React.ComponentType<any>;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'bill-splitter',
      title: 'Bill Splitter',
      description: 'Split bills with friends and track payments easily',
      status: 'Beta',
      component: BillsListView,
      icon: DollarSign,
    },
  ];

  const tips = [
    {
      title: 'Quick Track for Fast Logging',
      description: 'Use Quick Track when you just want to save a dish without creating a full visit entry.',
    },
    {
      title: 'Photo Processing Magic',
      description: 'Take photos of your food and use the Process Photos feature to automatically create entries with location data.',
    },
    {
      title: 'Share with Friends',
      description: 'Connect with friends to see their food recommendations and share your favorites.',
    },
    {
      title: 'Rate Everything',
      description: 'Use the 5-star rating system to remember which dishes were amazing and which to skip.',
    },
    {
      title: 'Add Notes',
      description: 'Add personal notes to remember specific details about dishes or restaurants.',
    },
  ];

  // Handle beta feature views
  if (activeFeature) {
    const feature = betaFeatures.find(f => f.id === activeFeature);
    if (feature) {
      const FeatureComponent = feature.component;
      return (
        <div className="flex flex-col h-full bg-gray-50">
          {/* Feature Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveFeature(null)}
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{feature.title}</h1>
                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">
                  {feature.status}
                </Badge>
              </div>
              <p className="text-sm text-gray-500 mt-1">{feature.description}</p>
            </div>
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
    <div className="flex flex-col h-full bg-gray-50" data-testid="misc-page">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">More</h1>
        <p className="text-sm text-gray-500 mt-1">
          Additional features and helpful tips
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {/* Restaurant Lists Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <List className="w-5 h-5 text-blue-600" />
              <CardTitle>Restaurant Lists</CardTitle>
            </div>
            <CardDescription>Create and organize lists of your favorite restaurants</CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={() => navigate({ to: '/lists' })}
              className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              data-testid="feature-restaurant-lists"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <List className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">View My Lists</p>
                  <p className="text-sm text-gray-500">Browse and manage your saved lists</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          </CardContent>
        </Card>

        {/* Beta Features Section - Admin Only */}
        {isAdmin && betaFeatures.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Try New Features</CardTitle>
                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">
                  Beta
                </Badge>
              </div>
              <CardDescription>Experimental features we're testing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {betaFeatures.map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  data-testid={`feature-${feature.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <feature.icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{feature.title}</p>
                      <p className="text-sm text-gray-500">{feature.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tips & Tricks Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              <CardTitle>Tips & Tricks</CardTitle>
            </div>
            <CardDescription>Get the most out of Yummy Recs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(expandedTips ? tips : tips.slice(0, 3)).map((tip, index) => (
              <div
                key={index}
                className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg"
              >
                <p className="font-medium text-gray-900 text-sm">{tip.title}</p>
                <p className="text-sm text-gray-600 mt-1">{tip.description}</p>
              </div>
            ))}
            {tips.length > 3 && (
              <Button
                variant="ghost"
                className="w-full text-blue-600"
                onClick={() => setExpandedTips(!expandedTips)}
              >
                {expandedTips ? 'Show Less' : `Show ${tips.length - 3} More Tips`}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
