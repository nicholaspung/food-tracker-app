import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pb } from "@/lib/pocketbase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface InviteCode {
  id: string;
  code: string;
}

interface ProfilePageProps {
  onNavigateBack?: () => void;
  onDeleteSuccess?: () => void;
  onLogout?: () => void;
  onNavigateToWhatsNew?: () => void;
  onNavigateToSettings?: () => void;
}

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

const LAST_VIEWED_VERSION_KEY = 'lastViewedChangelogVersion';
const DISMISSED_PROFILE_VERSION_KEY = 'dismissedProfileChangelogVersion';

export default function ProfilePage({ onNavigateBack, onDeleteSuccess, onLogout, onNavigateToWhatsNew, onNavigateToSettings }: ProfilePageProps) {
  const user = pb.authStore.model;
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [dismissedProfileVersion, setDismissedProfileVersion] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.name || '');
  const [showMandatoryNameDialog, setShowMandatoryNameDialog] = useState(false);
  const [mandatoryName, setMandatoryName] = useState('');

  // Check if user is the initial user from the user record
  const isInitialUser = user?.isInitialUser === true;

  // Check if user needs to set a name
  useEffect(() => {
    if (!user?.name) {
      setShowMandatoryNameDialog(true);
    }
  }, [user?.name]);

  // Update name mutation (for inline editing)
  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('Not authenticated');

      return await pb.collection('users').update(userId, {
        name: newName,
      });
    },
    onSuccess: () => {
      setIsEditingName(false);
      setError('');
      // Refresh queries that might use the user name
      queryClient.invalidateQueries({ queryKey: ['friendships'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update name');
    },
  });

  const handleSaveName = () => {
    if (!editedName.trim()) {
      setError('Name cannot be empty');
      return;
    }
    updateNameMutation.mutate(editedName.trim());
  };

  const handleCancelEditName = () => {
    setEditedName(user?.name || '');
    setIsEditingName(false);
    setError('');
  };

  // Update name mutation (for mandatory dialog)
  const updateMandatoryNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('Not authenticated');

      return await pb.collection('users').update(userId, {
        name: newName,
      });
    },
    onSuccess: () => {
      setShowMandatoryNameDialog(false);
      setMandatoryName('');
      setError('');
      // Refresh queries that might use the user name
      queryClient.invalidateQueries({ queryKey: ['friendships'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update name');
    },
  });

  const handleSaveMandatoryName = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!mandatoryName.trim()) {
      setError('Please enter your name');
      return;
    }

    updateMandatoryNameMutation.mutate(mandatoryName.trim());
  };

  // Load dismissed profile version from localStorage on mount
  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_PROFILE_VERSION_KEY);
    setDismissedProfileVersion(dismissed);
  }, []);

  // Fetch changelog to check for new releases
  const { data: changelog } = useQuery<ChangelogEntry[]>({
    queryKey: ['changelog'],
    queryFn: async () => {
      const response = await fetch('/changelog.json');
      if (!response.ok) {
        throw new Error('Failed to fetch changelog');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const latestVersion = changelog?.[0]?.version;
  const hasNewReleaseInProfile = latestVersion && latestVersion !== dismissedProfileVersion;

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

  const handleLogout = () => {
    pb.authStore.clear();
    console.log("User logged out");
    onLogout?.();
  };

  const handleDismissProfileUpdate = () => {
    if (latestVersion) {
      localStorage.setItem(DISMISSED_PROFILE_VERSION_KEY, latestVersion);
      setDismissedProfileVersion(latestVersion);
    }
  };

  const handleViewWhatsNew = () => {
    if (latestVersion) {
      localStorage.setItem(DISMISSED_PROFILE_VERSION_KEY, latestVersion);
      localStorage.setItem(LAST_VIEWED_VERSION_KEY, latestVersion);
      setDismissedProfileVersion(latestVersion);
    }
    onNavigateToWhatsNew?.();
  };

  return (
    <>
      {/* Mandatory Name Dialog */}
      <AlertDialog open={showMandatoryNameDialog} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Your Name</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Please set your name before continuing. This will be shown to your friends when you share visits.</p>

                {error && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSaveMandatoryName} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mandatory-name">Your Name</Label>
                    <Input
                      id="mandatory-name"
                      type="text"
                      placeholder="Enter your name"
                      value={mandatoryName}
                      onChange={(e) => setMandatoryName(e.target.value)}
                      disabled={updateMandatoryNameMutation.isPending}
                      autoFocus
                      data-testid="mandatory-name-input"
                    />
                  </div>
                </form>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="submit"
              onClick={handleSaveMandatoryName}
              disabled={updateMandatoryNameMutation.isPending}
              className="w-full"
              data-testid="mandatory-name-submit"
            >
              {updateMandatoryNameMutation.isPending ? 'Saving...' : 'Save Name'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col h-full bg-gray-50" data-testid="profile-page">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Your account information</p>
        </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* What's New Banner - shown at top if there's a new release */}
        {hasNewReleaseInProfile && (
          <div className="border-2 border-blue-500 bg-blue-50 rounded-lg p-4" data-testid="profile-new-release-banner">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="default" className="bg-blue-600">
                    New Update
                  </Badge>
                  <span className="text-xs font-semibold text-blue-900">
                    v{latestVersion}
                  </span>
                </div>
                <p className="text-blue-800 text-sm">
                  {changelog?.[0]?.title}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismissProfileUpdate}
                className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                data-testid="dismiss-profile-update-button"
                aria-label="Dismiss update notification"
              >
                ✕
              </Button>
            </div>
            <Button
              onClick={handleViewWhatsNew}
              className="w-full bg-blue-600 hover:bg-blue-700"
              data-testid="view-profile-whats-new-button"
            >
              View What's New
            </Button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md" data-testid="profile-error">
            {error}
          </div>
        )}

        {/* User Information Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Account Details</h2>

          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-md" data-testid="user-info">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-500">Name</p>
                    {!isEditingName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingName(true)}
                        className="h-6 w-6 p-0"
                        data-testid="edit-name-button"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="Enter your name"
                        disabled={updateNameMutation.isPending}
                        className="text-sm"
                        data-testid="name-input"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveName}
                        disabled={updateNameMutation.isPending}
                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                        data-testid="save-name-button"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEditName}
                        disabled={updateNameMutation.isPending}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        data-testid="cancel-name-button"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-gray-900" data-testid="user-name">
                      {user?.name || <span className="text-gray-400 italic">Not set</span>}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900" data-testid="user-email">
                    {user?.email || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">User ID</p>
                  <p className="text-sm font-mono text-xs text-gray-700" data-testid="user-id">
                    {user?.id || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Email Verified</p>
                  <p className="text-sm text-gray-900" data-testid="user-verified">
                    {user?.verified ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">Account Created</p>
                  <p className="text-sm text-gray-900" data-testid="user-created">
                    {user?.created ? new Date(user.created).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Invite Codes Section */}
          <div className="space-y-3 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Your Invite Codes</h3>
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
              <p className="text-sm text-gray-500">Loading codes...</p>
            ) : inviteCodes.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-3">No invite codes available</p>
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
                    className="flex items-center justify-between p-3 rounded-md border bg-white border-gray-200"
                    data-testid={`invite-code-${inviteCode.code}`}
                  >
                    <div className="flex-1">
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {inviteCode.code}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
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
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <Button
                onClick={handleViewWhatsNew}
                variant="outline"
                className="w-full"
                data-testid="whats-new-button"
              >
                What's New
              </Button>

              <Button
                onClick={onNavigateToSettings}
                variant="outline"
                className="w-full"
                data-testid="settings-button"
              >
                Settings
              </Button>

              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
                data-testid="logout-button"
              >
                Log Out
              </Button>

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
          ) : (
            <div className="space-y-4 pt-4 border-t border-gray-200">
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
        </div>
      </div>
      </div>
    </>
  );
}
