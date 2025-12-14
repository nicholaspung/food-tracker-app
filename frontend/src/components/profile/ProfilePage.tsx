import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLLECTIONS } from '@/constants/collections';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";
import { logger } from "@/lib/logger";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, WifiOff } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getPendingReviewCount } from '@/services/menuReviewService';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';

interface InviteCode {
  id: string;
  code: string;
  locked?: boolean;
  lockedUntil?: string;
}

interface ProfilePageProps {
  onNavigateBack?: () => void;
  onDeleteSuccess?: () => void;
  onLogout?: () => void;
  onNavigateToWhatsNew?: () => void;
  onNavigateToPhotos?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToBeta?: () => void;
  onNavigateToAdminReviews?: () => void;
}

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
}

const LAST_VIEWED_VERSION_KEY = 'lastViewedChangelogVersion';
const DISMISSED_PROFILE_VERSION_KEY = 'dismissedProfileChangelogVersion';

export default function ProfilePage({ onNavigateBack: _onNavigateBack, onDeleteSuccess, onLogout, onNavigateToWhatsNew, onNavigateToPhotos, onNavigateToSettings, onNavigateToBeta, onNavigateToAdminReviews }: ProfilePageProps) {
  const user = pb.authStore.model;
  const queryClient = useQueryClient();
  const { isOnline } = useSync();
  const [loading, setLoading] = useState(false);
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

  // Admin: Subscriber management
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberSuccess, setSubscriberSuccess] = useState('');

  const { error, handleError, clearError, showValidation, checkOffline } = useErrorHandler({
    source: 'ProfilePage',
  });

  const { error: subscriberError, handleError: handleSubscriberError, clearError: clearSubscriberError } = useErrorHandler({
    source: 'ProfilePage-Subscriber',
  });

  // Check if user is the initial user from the user record
  const isInitialUser = user?.isInitialUser === true;
  const isAdmin = user?.isAdmin === true;

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

      return await pb.collection(COLLECTIONS.USERS).update(userId, {
        name: newName,
      });
    },
    onSuccess: () => {
      setIsEditingName(false);
      clearError();
      // Refresh queries that might use the user name
      queryClient.invalidateQueries({ queryKey: ['friendships'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
    },
    onError: (error: unknown) => {
      handleError(error, { customMessage: 'Failed to update name' });
    },
  });

  const handleSaveName = () => {
    if (!editedName.trim()) {
      showValidation('Name cannot be empty');
      return;
    }
    updateNameMutation.mutate(editedName.trim());
  };

  const handleCancelEditName = () => {
    setEditedName(user?.name || '');
    setIsEditingName(false);
    clearError();
  };

  // Update name mutation (for mandatory dialog)
  const updateMandatoryNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('Not authenticated');

      return await pb.collection(COLLECTIONS.USERS).update(userId, {
        name: newName,
      });
    },
    onSuccess: () => {
      setShowMandatoryNameDialog(false);
      setMandatoryName('');
      clearError();
      // Refresh queries that might use the user name
      queryClient.invalidateQueries({ queryKey: ['friendships'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
    },
    onError: (error: unknown) => {
      handleError(error, { customMessage: 'Failed to update name' });
    },
  });

  const handleSaveMandatoryName = (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!mandatoryName.trim()) {
      showValidation('Please enter your name');
      return;
    }

    updateMandatoryNameMutation.mutate(mandatoryName.trim());
  };

  // Admin: Elevate user to subscriber
  const elevateToSubscriberMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!isOnline) {
        throw new Error("Subscriber elevation requires internet connection. Please connect and try again.");
      }

      // Use backend API endpoint for subscriber elevation
      const response = await pb.send('/api/users/elevate-subscriber', {
        method: 'POST',
        body: { email },
      });

      return response;
    },
    onSuccess: () => {
      setSubscriberSuccess('User successfully elevated to subscriber!');
      clearSubscriberError();
      setSubscriberEmail('');
      // Clear success message after 5 seconds
      setTimeout(() => setSubscriberSuccess(''), 5000);
    },
    onError: (error: unknown) => {
      // Extract error message from backend response
      let errorMessage = 'Failed to elevate user to subscriber';
      if (error && typeof error === 'object') {
        if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message);
        } else if ('message' in error) {
          errorMessage = String(error.message);
        }
      }
      handleSubscriberError(errorMessage);
      setSubscriberSuccess('');
    },
  });

  const handleElevateToSubscriber = (e: React.FormEvent) => {
    e.preventDefault();
    clearSubscriberError();
    setSubscriberSuccess('');

    if (!subscriberEmail.trim()) {
      handleSubscriberError('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(subscriberEmail.trim())) {
      handleSubscriberError('Please enter a valid email address');
      return;
    }

    elevateToSubscriberMutation.mutate(subscriberEmail.trim());
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

  // Fetch pending review count (admin only)
  const { data: pendingReviewCount } = useQuery({
    queryKey: ['pendingReviewCount'],
    queryFn: getPendingReviewCount,
    enabled: isAdmin, // Only fetch if user is admin
    staleTime: 1000 * 60, // Cache for 1 minute
  });

  // Fetch user's unused invite codes
  const fetchInviteCodes = async () => {
    if (!user?.id) return;

    if (!isOnline) {
      logger.log("Cannot fetch invite codes while offline");
      setLoadingCodes(false);
      return;
    }

    try {
      setLoadingCodes(true);
      // Use PocketBase SDK's send method for proper authentication
      const data = await pb.send('/api/invite-codes', {
        method: 'GET',
      });

      logger.log("Fetched invite codes:", data);
      logger.log("Codes with lock status:", data.codes);
      setInviteCodes(data.codes || []);
    } catch (err) {
      logger.error("Error fetching invite codes:", err);
    } finally {
      setLoadingCodes(false);
    }
  };

  // Generate more invite codes (initial user only)
  const generateMoreCodes = async () => {
    if (checkOffline("Cannot generate invite codes while offline. Please connect and try again.")) {
      return;
    }

    setGeneratingCodes(true);
    clearError();

    try {
      // Use PocketBase SDK's send method for proper authentication
      const data = await pb.send('/api/invite-codes/generate', {
        method: 'POST',
      });

      logger.log(`Generated ${data.generated} new invite codes`);

      // Refresh the codes list
      await fetchInviteCodes();
    } catch (error: unknown) {
      logger.error("Error generating invite codes:", error);

      // Check if it's a forbidden error (not initial user)
      if (error && typeof error === 'object' && 'status' in error && error.status === 403) {
        handleError(error, { customMessage: 'Only the initial user can generate unlimited invite codes' });
      } else {
        handleError(error, { customMessage: "Failed to generate invite codes" });
      }
    } finally {
      setGeneratingCodes(false);
    }
  };

  useEffect(() => {
    fetchInviteCodes();
  }, [user?.id]);

  const copyToClipboard = async (codeId: string, code: string) => {
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

      // Lock the code for 7 days (or extend if already locked)
      if (isOnline) {
        try {
          await pb.send('/api/invite-codes/lock', {
            method: 'POST',
            body: { codeId },
          });
          // Refresh the invite codes list to update the lock status
          fetchInviteCodes();
        } catch (lockErr) {
          logger.error("Failed to lock invite code:", lockErr);
          // Don't show error to user - the copy was successful
        }
      } else {
        logger.log("Cannot lock invite code while offline - copy succeeded but lock skipped");
      }
    } catch (err) {
      logger.error("Failed to copy invitation:", err);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      handleError("No user found");
      return;
    }

    setLoading(true);
    clearError();

    try {
      // Delete the user account via PocketBase API
      await pb.collection(COLLECTIONS.USERS).delete(user.id);

      // Clear auth store
      pb.authStore.clear();

      logger.log("Account deleted successfully");

      // Call success callback
      onDeleteSuccess?.();
    } catch (error: unknown) {
      logger.error("Delete account error:", error);
      handleError(error, { customMessage: "Failed to delete account. Please try again." });
      setLoading(false);
    }
  };

  const handleLogout = () => {
    pb.authStore.clear();
    logger.log("User logged out");
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

                <ErrorDisplay error={error} onClear={clearError} />

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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img
                src="/logo-speech-bubble-plate.svg"
                alt="Track Your Foods Logo"
                className="w-10 h-10"
              />
              <span className="text-lg font-semibold text-gray-700">Track Your Foods</span>
            </div>
          </div>
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
        <ErrorDisplay error={error} onClear={clearError} testId="profile-error" />

        {/* Account Information Section */}
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>Your personal information</CardDescription>
          </CardHeader>
          <CardContent>
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
                <div>
                  <p className="text-xs font-medium text-gray-500">Account Status</p>
                  <div className="flex gap-2 mt-1">
                    {isAdmin && (
                      <Badge className="bg-orange-600 text-white" data-testid="admin-badge">
                        Admin
                      </Badge>
                    )}
                    {user?.isSubscriber && (
                      <Badge className="bg-purple-600 text-white" data-testid="subscriber-badge">
                        Subscriber
                      </Badge>
                    )}
                    {!isAdmin && !user?.isSubscriber && (
                      <span className="text-sm text-gray-600">Free Account</span>
                    )}
                  </div>
                  {(isAdmin || user?.isSubscriber) && (
                    <p className="text-xs text-gray-500 mt-1">
                      ✨ Unlimited photo parsing
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invite Codes Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Your Invite Codes</CardTitle>
                <CardDescription>Share these codes with friends</CardDescription>
              </div>
              {isInitialUser && (
                <Button
                  onClick={generateMoreCodes}
                  variant="outline"
                  size="sm"
                  disabled={!isOnline || generatingCodes || loadingCodes}
                  className="text-xs"
                  data-testid="generate-codes-button"
                >
                  {!isOnline ? (
                    <><WifiOff className="w-3 h-3 mr-1" />Offline</>
                  ) : generatingCodes ? (
                    'Generating...'
                  ) : (
                    'Generate 5 More'
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!isOnline && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 text-orange-800 text-sm">
                  <WifiOff className="w-4 h-4" />
                  <span>You're offline. Invite code operations require internet connection.</span>
                </div>
              </div>
            )}
            {loadingCodes ? (
              <p className="text-sm text-gray-500">Loading codes...</p>
            ) : inviteCodes.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-3">
                  {!isOnline ? 'Cannot load invite codes while offline' : 'No invite codes available'}
                </p>
                {isInitialUser && (
                  <Button
                    onClick={generateMoreCodes}
                    variant="default"
                    size="sm"
                    disabled={!isOnline || generatingCodes}
                    data-testid="generate-first-codes-button"
                  >
                    {!isOnline ? (
                      <><WifiOff className="w-3 h-3 mr-1" />Generate (Offline)</>
                    ) : generatingCodes ? (
                      'Generating...'
                    ) : (
                      'Generate Codes'
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {inviteCodes.map((inviteCode) => {
                  logger.log(`Rendering code ${inviteCode.code}: locked=${inviteCode.locked}, lockedUntil=${inviteCode.lockedUntil}`);
                  return (
                  <div
                    key={inviteCode.id}
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      inviteCode.locked
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-white border-gray-200'
                    }`}
                    data-testid={`invite-code-${inviteCode.code}`}
                  >
                    <div className="flex-1">
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {inviteCode.code}
                      </p>
                      <p className={`text-xs mt-1 ${
                        inviteCode.locked
                          ? 'text-yellow-700'
                          : 'text-gray-500'
                      }`}>
                        {inviteCode.locked
                          ? 'Already copied - can copy again'
                          : 'Available'}
                      </p>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(inviteCode.id, inviteCode.code)}
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-xs"
                      data-testid={`copy-code-${inviteCode.code}`}
                    >
                      {copiedCode === inviteCode.code ? '✓ Copied!' : 'Copy Invite'}
                    </Button>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* App Features Section */}
        <Card>
          <CardHeader>
            <CardTitle>App Features</CardTitle>
            <CardDescription>Explore what's available</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleViewWhatsNew}
              variant="outline"
              className="w-full"
              data-testid="whats-new-button"
            >
              What's New
            </Button>

            <Button
              onClick={onNavigateToPhotos}
              variant="outline"
              className="w-full"
              data-testid="photos-button"
            >
              My Photos
            </Button>

            <Button
              onClick={onNavigateToSettings}
              variant="outline"
              className="w-full"
              data-testid="settings-button"
            >
              Settings
            </Button>
          </CardContent>
        </Card>

        {/* Admin Features Section */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Admin Features</CardTitle>
                <Badge className="bg-orange-600 text-white">Admin</Badge>
              </div>
              <CardDescription>Administrative tools and controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={onNavigateToAdminReviews}
                variant="outline"
                className="w-full border-orange-500 text-orange-700 hover:bg-orange-50"
                data-testid="admin-reviews-button"
              >
                <div className="flex items-center justify-center gap-2 w-full">
                  <span>Menu Reviews</span>
                  {pendingReviewCount !== undefined && pendingReviewCount > 0 && (
                    <Badge className="bg-orange-600 text-white">
                      {pendingReviewCount}
                    </Badge>
                  )}
                </div>
              </Button>

              <Button
                onClick={onNavigateToBeta}
                variant="outline"
                className="w-full border-purple-500 text-purple-700 hover:bg-purple-50"
                data-testid="beta-button"
              >
                Beta Features
              </Button>

              {/* Admin: Subscriber Management */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3 mt-4">
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">Subscriber Management</h3>
                  <p className="text-xs text-amber-700 mt-1">Elevate users to subscriber status for unlimited photo parsing</p>
                </div>

                {!isOnline && (
                  <div className="p-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <WifiOff className="w-4 h-4" />
                      <span>You're offline. Admin operations require internet connection.</span>
                    </div>
                  </div>
                )}

                {subscriberSuccess && (
                  <div className="p-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md" data-testid="subscriber-success">
                    {subscriberSuccess}
                  </div>
                )}

                <ErrorDisplay error={subscriberError} onClear={clearSubscriberError} testId="subscriber-error" />

                <form onSubmit={handleElevateToSubscriber} className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="subscriber-email" className="text-xs text-amber-900">
                      User Email
                    </Label>
                    <Input
                      id="subscriber-email"
                      type="email"
                      placeholder="user@example.com"
                      value={subscriberEmail}
                      onChange={(e) => setSubscriberEmail(e.target.value)}
                      disabled={!isOnline || elevateToSubscriberMutation.isPending}
                      className="text-sm"
                      data-testid="subscriber-email-input"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!isOnline || elevateToSubscriberMutation.isPending}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                    data-testid="elevate-subscriber-button"
                  >
                    {!isOnline ? (
                      <><WifiOff className="w-4 h-4 mr-2" />Elevate (Offline)</>
                    ) : elevateToSubscriberMutation.isPending ? (
                      'Elevating...'
                    ) : (
                      'Elevate to Subscriber'
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account Actions Section */}
        <Card>
          <CardHeader>
            <CardTitle>Account Actions</CardTitle>
            <CardDescription>Manage your session</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full"
              data-testid="logout-button"
            >
              Log Out
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription>Irreversible and destructive actions</CardDescription>
          </CardHeader>
          <CardContent>
            {!showConfirm ? (
              <div className="space-y-3">
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm font-medium text-red-900">Delete Account</p>
                  <p className="text-xs text-red-700 mt-1">
                    Permanently remove your account and all associated data. This cannot be undone.
                  </p>
                </div>
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
              <div className="space-y-4">
                <div className="p-4 bg-red-50 border-2 border-red-300 rounded-md">
                  <p className="text-sm font-semibold text-red-900">
                    Are you absolutely sure?
                  </p>
                  <p className="text-xs text-red-700 mt-2">
                    This action cannot be undone. This will permanently delete your account and remove all your data from our servers, including:
                  </p>
                  <ul className="text-xs text-red-700 mt-2 ml-4 list-disc space-y-1">
                    <li>All your restaurant visits and ratings</li>
                    <li>Your uploaded menu photos</li>
                    <li>Your friends and connections</li>
                    <li>All other personal data</li>
                  </ul>
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
                    {loading ? "Deleting..." : "Yes, Delete Forever"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}
