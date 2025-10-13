import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";

interface InviteCode {
  id: string;
  code: string;
}

interface ProfilePageProps {
  onNavigateBack?: () => void;
  onDeleteSuccess?: () => void;
}

export default function ProfilePage({ onNavigateBack, onDeleteSuccess }: ProfilePageProps) {
  const user = pb.authStore.model;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [generatingCodes, setGeneratingCodes] = useState(false);

  // Check if user is the initial user from the user record
  const isInitialUser = user?.isInitialUser === true;

  // Fetch user's unused invite codes
  const fetchInviteCodes = async () => {
    if (!user?.id) return;

    try {
      setLoadingCodes(true);
      // Use PocketBase SDK's send method for proper authentication
      const data = await pb.send('/api/invite-codes', {
        method: 'GET',
      });

      console.log("Fetched invite codes:", data);
      setInviteCodes(data.codes || []);
    } catch (err) {
      console.error("Error fetching invite codes:", err);
    } finally {
      setLoadingCodes(false);
    }
  };

  // Generate more invite codes (initial user only)
  const generateMoreCodes = async () => {
    setGeneratingCodes(true);
    setError("");

    try {
      // Use PocketBase SDK's send method for proper authentication
      const data = await pb.send('/api/invite-codes/generate', {
        method: 'POST',
      });

      console.log(`Generated ${data.generated} new invite codes`);

      // Refresh the codes list
      await fetchInviteCodes();
    } catch (err: any) {
      console.error("Error generating invite codes:", err);

      // Check if it's a forbidden error (not initial user)
      if (err.status === 403) {
        setError('Only the initial user can generate unlimited invite codes');
      } else {
        setError(err.message || "Failed to generate invite codes");
      }
    } finally {
      setGeneratingCodes(false);
    }
  };

  useEffect(() => {
    fetchInviteCodes();
  }, [user?.id]);

  const copyToClipboard = async (code: string) => {
    try {
      // Create signup URL with pre-populated invite code
      const signupUrl = `${window.location.origin}/signup?code=${code}`;

      // Create invitation message
      const message = `Hey! You're invited to join our app! 🎉

Use this link to sign up:
${signupUrl}

Your invite code: ${code}

Looking forward to seeing you there!`;

      await navigator.clipboard.writeText(message);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error("Failed to copy invitation:", err);
    }
  };

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

          {/* Invite Codes Section */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Your Invite Codes</h3>
              {isInitialUser && (
                <Button
                  onClick={generateMoreCodes}
                  variant="outline"
                  size="sm"
                  disabled={generatingCodes || loadingCodes}
                  className="text-xs"
                  data-testid="generate-codes-button"
                >
                  {generatingCodes ? 'Generating...' : 'Generate 5 More'}
                </Button>
              )}
            </div>
            {loadingCodes ? (
              <p className="text-sm text-muted-foreground">Loading codes...</p>
            ) : inviteCodes.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No invite codes available</p>
                {isInitialUser && (
                  <Button
                    onClick={generateMoreCodes}
                    variant="default"
                    size="sm"
                    disabled={generatingCodes}
                    data-testid="generate-first-codes-button"
                  >
                    {generatingCodes ? 'Generating...' : 'Generate Codes'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {inviteCodes.map((inviteCode) => (
                  <div
                    key={inviteCode.id}
                    className="flex items-center justify-between p-3 rounded-md border bg-background border-border"
                    data-testid={`invite-code-${inviteCode.code}`}
                  >
                    <div className="flex-1">
                      <p className="font-mono text-sm font-medium">
                        {inviteCode.code}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Available
                      </p>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(inviteCode.code)}
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-xs"
                      data-testid={`copy-code-${inviteCode.code}`}
                    >
                      {copiedCode === inviteCode.code ? '✓ Copied!' : 'Copy Invite'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
