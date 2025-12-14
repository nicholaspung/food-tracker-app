import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Lock, Users, Globe, MapPin, WifiOff, CheckCircle } from "lucide-react";
import { useOfflineRestaurantCreation } from "@/hooks/offline/useOfflineRestaurantCreation";
import { visitDraftService } from "@/services/visitDraftService";
import { useGeolocation } from "@/hooks/ui/useGeolocation";
import { useSync } from "@/contexts/SyncContext";
import { pb } from "@/lib/pocketbase";
import { useKeyboardVisible } from "@/hooks/ui/useKeyboardVisible";
import { useScrollIntoView } from "@/hooks/ui/useScrollIntoView";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface CreateRestaurantPageProps {
  onRestaurantCreated: () => void;
  onBack: () => void;
}

export default function CreateRestaurantPage({
  onRestaurantCreated,
  onBack,
}: CreateRestaurantPageProps) {
  const user = pb.authStore.record;
  const { isOnline } = useSync();
  const { position } = useGeolocation(true); // Auto-fetch location
  const isKeyboardVisible = useKeyboardVisible();

  // Refs for auto-scrolling inputs into view on mobile
  const nameInputRef = useScrollIntoView<HTMLInputElement>();
  const locationInputRef = useScrollIntoView<HTMLInputElement>();
  const cuisineInputRef = useScrollIntoView<HTMLInputElement>();
  const menuItemInputRef = useScrollIntoView<HTMLInputElement>();

  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantLocation, setRestaurantLocation] = useState("");
  const [restaurantCuisine, setRestaurantCuisine] = useState("");
  const [visibility, setVisibility] = useState<"private" | "friends" | "public">("friends");
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [currentMenuItem, setCurrentMenuItem] = useState("");
  const { error, handleError, clearError, showValidation } = useErrorHandler({
    source: 'CreateRestaurantPage',
    defaultSeverity: 'error',
  });
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);
  const [offlineMenuItemCount, setOfflineMenuItemCount] = useState(0);

  const createRestaurantMutation = useOfflineRestaurantCreation();

  // Initialize visibility from user's default preference
  useEffect(() => {
    if (user?.defaultRestaurantVisibility) {
      setVisibility(user.defaultRestaurantVisibility);
    }
  }, [user?.defaultRestaurantVisibility]);

  const handleAddMenuItem = () => {
    const trimmed = currentMenuItem.trim();
    if (trimmed && !menuItems.includes(trimmed)) {
      setMenuItems([...menuItems, trimmed]);
      setCurrentMenuItem("");
    }
  };

  const handleRemoveMenuItem = (item: string) => {
    setMenuItems(menuItems.filter((i) => i !== item));
  };

  const handleSubmit = async () => {
    console.log('[CreateRestaurant] handleSubmit called');
    clearError();

    if (!restaurantName.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD("Restaurant name"));
      return;
    }

    if (!restaurantLocation.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD("Location"));
      return;
    }

    try {
      console.log('[CreateRestaurant] Starting mutation with data:', {
        name: restaurantName.trim(),
        address: restaurantLocation.trim(),
        cuisineType: restaurantCuisine.trim() || undefined,
        visibility,
        menuItems,
      });
      console.log('[CreateRestaurant] Mutation state before mutateAsync:', {
        isPending: createRestaurantMutation.isPending,
        isError: createRestaurantMutation.isError,
        isSuccess: createRestaurantMutation.isSuccess,
      });
      console.log('[CreateRestaurant] About to call mutateAsync...');

      const result = await createRestaurantMutation.mutateAsync({
        name: restaurantName.trim(),
        address: restaurantLocation.trim(),
        cuisineType: restaurantCuisine.trim() || undefined,
        visibility: visibility,
        latitude: position?.latitude,
        longitude: position?.longitude,
        menuItems: menuItems.length > 0 ? menuItems : undefined,
      }).catch((mutationError) => {
        console.error('[CreateRestaurant] Mutation error from mutateAsync:', mutationError);
        throw mutationError;
      });

      console.log('[CreateRestaurant] Mutation completed successfully, result:', result);

      // Save to draft service
      visitDraftService.saveRestaurant(result.restaurant);

      // Show success message based on online/offline
      if (result.isQueued) {
        // Offline - show dialog instead of proceeding immediately
        setOfflineMenuItemCount(menuItems.length);
        setShowOfflineDialog(true);
      } else {
        // Online - proceed immediately
        console.log('[CreateRestaurant] Proceeding to next step');
        onRestaurantCreated();
      }
    } catch (err: any) {
      console.error('[CreateRestaurant] Error creating restaurant:', err);
      handleError(err, { customMessage: ERROR_MESSAGES.RESTAURANT.CREATE_FAILED });
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Add Restaurant</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create a new restaurant for your visit
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Offline Warning */}
          {!isOnline && (
            <Card className="border-orange-500 bg-orange-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-orange-800 text-sm">
                  <WifiOff className="w-4 h-4" />
                  <span>
                    You're offline. Restaurant will be created locally and synced when you reconnect.
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Message */}
          <ErrorDisplay error={error} onClear={clearError} />

          {/* Restaurant Details */}
          <Card>
            <CardHeader>
              <CardTitle>Restaurant Details</CardTitle>
              <CardDescription>
                Enter the basic information about the restaurant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Restaurant Name *</Label>
                <Input
                  ref={nameInputRef}
                  id="name"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="e.g., Joe's Pizza"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">
                  Location *
                  {position && (
                    <span className="ml-2 text-xs text-green-600">
                      <MapPin className="w-3 h-3 inline mr-1" />
                      GPS coordinates will be saved
                    </span>
                  )}
                </Label>
                <Input
                  ref={locationInputRef}
                  id="location"
                  value={restaurantLocation}
                  onChange={(e) => setRestaurantLocation(e.target.value)}
                  placeholder="e.g., 123 Main St, New York, NY"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuisine">Cuisine Type (optional)</Label>
                <Input
                  ref={cuisineInputRef}
                  id="cuisine"
                  value={restaurantCuisine}
                  onChange={(e) => setRestaurantCuisine(e.target.value)}
                  placeholder="e.g., Italian, Japanese, Mexican"
                />
              </div>
            </CardContent>
          </Card>

          {/* Initial Menu Items (Optional) */}
          <Card>
            <CardHeader>
              <CardTitle>Initial Menu Items (Optional)</CardTitle>
              <CardDescription>
                Add some menu items now to speed up your visit entry
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="menu-item">Add menu items</Label>
                <div className="flex gap-2">
                  <Input
                    ref={menuItemInputRef}
                    id="menu-item"
                    value={currentMenuItem}
                    onChange={(e) => setCurrentMenuItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddMenuItem();
                      }
                    }}
                    placeholder="e.g., Margherita Pizza"
                  />
                  <Button
                    type="button"
                    onClick={handleAddMenuItem}
                    disabled={!currentMenuItem.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {menuItems.length > 0 && (
                <div className="space-y-2">
                  <Label>Menu Items ({menuItems.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {menuItems.map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMenuItem(item)}
                          className="ml-1 rounded-full p-0.5 hover:bg-gray-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Visibility */}
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
              <CardDescription>
                Choose who can see this restaurant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`w-full p-3 rounded-lg border-2 transition-all ${
                  visibility === "private"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      visibility === "private"
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {visibility === "private" && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-gray-600" />
                      <span className="font-semibold text-sm">Private</span>
                    </div>
                    <p className="text-xs text-gray-600">Only visible to you</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility("friends")}
                className={`w-full p-3 rounded-lg border-2 transition-all ${
                  visibility === "friends"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      visibility === "friends"
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {visibility === "friends" && (
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-sm">Friends</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Visible to your friends
                    </p>
                  </div>
                </div>
              </button>

              {user?.isAdmin && (
                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  className={`w-full p-3 rounded-lg border-2 transition-all ${
                    visibility === "public"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        visibility === "public"
                          ? "border-blue-500 bg-blue-500"
                          : "border-gray-300"
                      }`}
                    >
                      {visibility === "public" && (
                        <div className="w-2.5 h-2.5 bg-white rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-4 h-4 text-green-600" />
                        <span className="font-semibold text-sm">Public</span>
                        <Badge variant="secondary" className="text-xs">
                          Admin Only
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600">
                        Visible to everyone in the community
                      </p>
                    </div>
                  </div>
                </button>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Bottom Action Buttons */}
      {!isKeyboardVisible && (
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              Previous
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={handleSubmit}
              disabled={createRestaurantMutation.isPending}
            >
              {createRestaurantMutation.isPending
                ? "Creating..."
                : "Create & Continue"}
            </Button>
          </div>
        </div>
      )}

      {/* Offline Success Dialog */}
      <Dialog open={showOfflineDialog} onOpenChange={setShowOfflineDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <DialogTitle className="text-xl">Restaurant Created Offline!</DialogTitle>
            </div>
            <DialogDescription asChild>
              <div className="space-y-3 text-base mt-2">
                <div>
                  <strong>"{restaurantName}"</strong> has been created locally and will sync automatically when you're back online.
                </div>
                {offlineMenuItemCount > 0 && (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg">
                    <WifiOff className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {offlineMenuItemCount} menu item{offlineMenuItemCount !== 1 ? 's' : ''} will be added when you reconnect.
                    </span>
                  </div>
                )}
                <div className="text-sm text-gray-600">
                  You can continue adding your visit details. Everything will sync in the background once you're online.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowOfflineDialog(false);
                onRestaurantCreated();
              }}
              className="w-full"
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
