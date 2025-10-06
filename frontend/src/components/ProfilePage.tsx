import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";

interface ProfilePageProps {
  onNavigateBack?: () => void;
  onDeleteSuccess?: () => void;
}

export default function ProfilePage({ onNavigateBack, onDeleteSuccess }: ProfilePageProps) {
  const user = pb.authStore.model;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      setError("No user found");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Delete the user account via PocketBase API
      await pb.collection('users').delete(user.id);

      // Clear auth store
      pb.authStore.clear();

      console.log("Account deleted successfully");

      // Call success callback
      onDeleteSuccess?.();
    } catch (err: any) {
      console.error("Delete account error:", err);
      setError(err.message || "Failed to delete account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="profile-page">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="profile-title">
            Profile
          </CardTitle>
          <CardDescription className="text-center" data-testid="profile-description">
            Your account information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md" data-testid="profile-error">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="p-4 bg-muted rounded-md" data-testid="user-info">
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Email</p>
                  <p className="text-sm font-medium" data-testid="user-email">
                    {user?.email || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">User ID</p>
                  <p className="text-sm font-mono text-xs" data-testid="user-id">
                    {user?.id || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Email Verified</p>
                  <p className="text-sm" data-testid="user-verified">
                    {user?.verified ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Account Created</p>
                  <p className="text-sm" data-testid="user-created">
                    {user?.created ? new Date(user.created).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {!showConfirm ? (
            <>
              <Button
                onClick={onNavigateBack}
                variant="outline"
                className="w-full"
                data-testid="back-button"
              >
                Back to Home
              </Button>

              <div className="pt-4 border-t">
                <Button
                  onClick={() => setShowConfirm(true)}
                  variant="destructive"
                  className="w-full"
                  data-testid="delete-account-button"
                  disabled={loading}
                >
                  Delete Account
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-900">
                  Are you sure you want to delete your account?
                </p>
                <p className="text-xs text-red-700 mt-1">
                  This action cannot be undone. All your data will be permanently deleted.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => setShowConfirm(false)}
                  variant="outline"
                  className="flex-1"
                  data-testid="cancel-delete-button"
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  variant="destructive"
                  className="flex-1"
                  data-testid="confirm-delete-button"
                  disabled={loading}
                >
                  {loading ? "Deleting..." : "Yes, Delete"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
