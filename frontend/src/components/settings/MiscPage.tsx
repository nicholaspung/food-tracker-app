import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, List, Lightbulb, ChevronRight, Calculator, Users } from 'lucide-react';
import { pb } from '@/lib/pocketbase';

export default function MiscPage() {
  const navigate = useNavigate();
  const [expandedTips, setExpandedTips] = useState(false);
  const currentUser = pb.authStore.record;

  const tips = [
    {
      title: 'Quick Track for Fast Logging',
      description: 'Use Quick Track when you just want to save a dish without creating a full visit entry. Tap the location pin to capture your GPS coordinates on the spot.',
    },
    {
      title: 'Photo Processing Magic',
      description: 'Take photos of your food and use the Process Photos feature to automatically create entries. You can combine multiple photos of the same dish into one entry.',
    },
    {
      title: 'Save Notes for Later',
      description: 'Use Notes to jot down food ideas, places, or recipes. When you\'re ready, tap "Use Note" to convert it into a visit or quick track entry.',
    },
    {
      title: 'Share with Friends',
      description: 'Connect with friends to see their food recommendations in your home feed. Save restaurants from their lists to your own with one tap.',
    },
    {
      title: 'Organize with Lists',
      description: 'Create restaurant lists to organize your favorites. Share them with friends or keep them private. Your "Saved" list is a quick way to bookmark places.',
    },
    {
      title: 'Split Bills Easily',
      description: 'Use the Bill Splitter to divide bills evenly or by item. Assign specific items to each person and set custom tip amounts.',
    },
    {
      title: '"I Went There" Shortcut',
      description: 'See a bookmarked restaurant from a friend? Tap "I went there" to quickly create a visit and rate the dishes yourself.',
    },
    {
      title: 'Rate Everything',
      description: 'Use the 5-star rating system to remember which dishes were amazing and which to skip.',
    },
  ];

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

        {/* Group Tastings Section - Admin Only Beta Feature */}
        {currentUser?.isAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                <CardTitle className="flex items-center gap-2">
                  Group Tastings
                  <span className="text-xs font-semibold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">BETA</span>
                </CardTitle>
              </div>
              <CardDescription>Organize group food tasting sessions and rate together</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => navigate({ to: '/tasting-sessions' })}
                className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                data-testid="feature-group-tastings"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">View Sessions</p>
                    <p className="text-sm text-gray-500">Create or join a tasting session</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </button>
            </CardContent>
          </Card>
        )}

        {/* Bills & Tips Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <CardTitle>Bills & Tips</CardTitle>
            </div>
            <CardDescription>Split bills and calculate tips quickly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => navigate({ to: '/bills' })}
              className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              data-testid="feature-bill-splitter"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">Split a Bill</p>
                  <p className="text-sm text-gray-500">Create and manage bill splits</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
            <button
              onClick={() => navigate({ to: '/tip-calculator' })}
              className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              data-testid="feature-tip-calculator"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Calculator className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">Tip Calculator</p>
                  <p className="text-sm text-gray-500">Figure out how much to tip</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          </CardContent>
        </Card>

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
