import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { pb, User } from "@/lib/pocketbase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Users, Check, Globe } from "lucide-react";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface SettingsPageProps {
  onNavigateBack?: () => void;
}

export default function SettingsPage({ onNavigateBack }: SettingsPageProps) {
  const user = pb.authStore.model as unknown as User;
  const queryClient = useQueryClient();
  const [selectedVisibility, setSelectedVisibility] = useState<'friends' | 'private'>(
    user?.defaultVisitVisibility || 'friends'
  );
  const [selectedRestaurantVisibility, setSelectedRestaurantVisibility] = useState<'private' | 'friends' | 'public'>(
    user?.defaultRestaurantVisibility || 'private'
  );
  const { error, handleError, clearError, showSuccess } = useErrorHandler({
    source: 'SettingsPage',
    defaultSeverity: 'error',
  });
  const [successMessage, setSuccessMessage] = useState("");

  const updateVisibilityMutation = useMutation({
    mutationFn: async (data: {
      visitVisibility: 'friends' | 'private';
      restaurantVisibility: 'private' | 'friends' | 'public';
    }) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('Not authenticated');

      return await pb.collection('users').update(userId, {
        defaultVisitVisibility: data.visitVisibility,
        defaultRestaurantVisibility: data.restaurantVisibility,
      });
    },
    onSuccess: () => {
      clearError();
      setSuccessMessage('Settings saved successfully');
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
      // Refresh auth store to get updated user data
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: Error) => {
      handleError(error, { customMessage: ERROR_MESSAGES.GENERIC.UPDATE_FAILED("settings") });
      setSuccessMessage('');
    },
  });

  const handleSave = () => {
    updateVisibilityMutation.mutate({
      visitVisibility: selectedVisibility,
      restaurantVisibility: selectedRestaurantVisibility,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <Button variant="ghost" size="sm" onClick={onNavigateBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
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
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedVisibility === 'friends'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedVisibility === 'friends' && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-600" />
                      <Label className="font-semibold text-base">Friends</Label>
                    </div>
                    <p className="text-sm text-gray-600">
                      Your friends can see your visits and the food items you rated
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedVisibility('private')}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  selectedVisibility === 'private'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedVisibility === 'private'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedVisibility === 'private' && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-gray-600" />
                      <Label className="font-semibold text-base">Private</Label>
                    </div>
                    <p className="text-sm text-gray-600">
                      Only you can see your visits. Keep your food tracking completely private
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default Restaurant Visibility</CardTitle>
            <CardDescription>
              Choose who can see restaurants you add by default. You can always change this for individual restaurants later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <button
                onClick={() => setSelectedRestaurantVisibility('private')}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  selectedRestaurantVisibility === 'private'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedRestaurantVisibility === 'private'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedRestaurantVisibility === 'private' && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-gray-600" />
                      <Label className="font-semibold text-base">Private</Label>
                    </div>
                    <p className="text-sm text-gray-600">
                      Only you can see restaurants you add
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedRestaurantVisibility('friends')}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  selectedRestaurantVisibility === 'friends'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedRestaurantVisibility === 'friends'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedRestaurantVisibility === 'friends' && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-600" />
                      <Label className="font-semibold text-base">Friends</Label>
                    </div>
                    <p className="text-sm text-gray-600">
                      Your friends can see restaurants you add
                    </p>
                  </div>
                </div>
              </button>

              {user?.isAdmin && (
                <button
                  onClick={() => setSelectedRestaurantVisibility('public')}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    selectedRestaurantVisibility === 'public'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedRestaurantVisibility === 'public'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedRestaurantVisibility === 'public' && (
                        <div className="w-2.5 h-2.5 bg-white rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-4 h-4 text-green-600" />
                        <Label className="font-semibold text-base">Public</Label>
                        <Badge variant="secondary" className="text-xs">Admin Only</Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        Everyone in the community can see restaurants you add
                      </p>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <ErrorDisplay error={error} onClear={clearError} />

        {successMessage && (
          <div className="p-3 bg-green-50 text-green-600 rounded-lg text-sm flex items-center gap-2">
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
      </div>
    </div>
  );
}
