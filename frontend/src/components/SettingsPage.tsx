import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { pb, User } from "@/lib/pocketbase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Users, Check } from "lucide-react";

interface SettingsPageProps {
  onNavigateBack?: () => void;
}

export default function SettingsPage({ onNavigateBack }: SettingsPageProps) {
  const user = pb.authStore.model as unknown as User;
  const queryClient = useQueryClient();
  const [selectedVisibility, setSelectedVisibility] = useState<'friends' | 'private'>(
    user?.defaultVisitVisibility || 'friends'
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const updateVisibilityMutation = useMutation({
    mutationFn: async (visibility: 'friends' | 'private') => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('Not authenticated');

      return await pb.collection('users').update(userId, {
        defaultVisitVisibility: visibility,
      });
    },
    onSuccess: () => {
      setError('');
      setSuccessMessage('Settings saved successfully');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
      // Refresh auth store to get updated user data
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: Error) => {
      setError(error.message);
      setSuccessMessage('');
    },
  });

  const handleSave = () => {
    updateVisibilityMutation.mutate(selectedVisibility);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Default Visit Visibility</CardTitle>
            <CardDescription>
              Choose who can see your visits by default. You can always change this for individual visits later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <button
                onClick={() => setSelectedVisibility('friends')}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  selectedVisibility === 'friends'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedVisibility === 'friends'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {selectedVisibility === 'friends' && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <Label className="font-semibold text-base">Friends</Label>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Your friends can see your visits and the food items you rated
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedVisibility('private')}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  selectedVisibility === 'private'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedVisibility === 'private'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {selectedVisibility === 'private' && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <Label className="font-semibold text-base">Private</Label>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Only you can see your visits. Keep your food tracking completely private
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm flex items-center gap-2">
                <Check className="w-4 h-4" />
                {successMessage}
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={updateVisibilityMutation.isPending}
              className="w-full"
            >
              {updateVisibilityMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
