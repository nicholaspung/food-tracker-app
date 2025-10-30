import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';
import HomePage from '@/components/HomePage';
import OnboardingDialog from '@/components/OnboardingDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users } from 'lucide-react';

export const Route = createFileRoute('/home')({
  beforeLoad: () => {
    // If user is not authenticated, redirect to login
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: Home,
});

const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';

function Home() {
  const navigate = useNavigate();
  const [friendSuggestion, setFriendSuggestion] = useState<{
    inviterId: string;
    inviterEmail: string;
    inviterName?: string;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const queryClient = useQueryClient();

  // Check if user needs onboarding (no name set and hasn't completed onboarding before)
  useEffect(() => {
    const hasCompletedOnboarding = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
    const userName = pb.authStore.record?.name;

    if (!hasCompletedOnboarding && !userName) {
      // Small delay to let the page settle before showing onboarding
      setTimeout(() => setShowOnboarding(true), 500);
    }
  }, []);

  // Check for pending friend suggestion on mount
  useEffect(() => {
    logger.log('[Home] Checking for pending friend suggestion...');
    logger.log('[Home] Current user email:', pb.authStore.record?.email);

    const suggestionData = localStorage.getItem('pendingFriendSuggestion');
    logger.log('[Home] localStorage data:', suggestionData);

    if (suggestionData) {
      try {
        const parsed = JSON.parse(suggestionData);
        logger.log('[Home] Parsed suggestion data:', parsed);

        // Check if this suggestion is for the current logged-in user
        if (parsed.newUserEmail === pb.authStore.record?.email) {
          logger.log('[Home] Email match! Setting friend suggestion...');
          setFriendSuggestion({
            inviterId: parsed.inviterId,
            inviterEmail: parsed.inviterEmail,
            inviterName: parsed.inviterName,
          });
        } else {
          logger.log('[Home] Email mismatch:', {
            stored: parsed.newUserEmail,
            current: pb.authStore.record?.email,
          });
        }
      } catch (err) {
        logger.error('[Home] Failed to parse friend suggestion:', err);
      }
    } else {
      logger.log('[Home] No pending friend suggestion in localStorage');
    }
  }, []);

  // Mutation to create accepted friendship
  const createFriendshipMutation = useMutation({
    mutationFn: async (inviterId: string) => {
      const currentUserId = pb.authStore.record?.id;
      if (!currentUserId) throw new Error('Not authenticated');

      // Create an accepted friendship (bidirectional by creating from inviter to new user)
      return await pb.collection('friendships').create({
        user: inviterId,
        friend: currentUserId,
        status: 'accepted',
      });
    },
    onSuccess: () => {
      // Refresh friends list and visits
      queryClient.invalidateQueries({ queryKey: ['friendships'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['pendingFriendRequestsCount'] });
      // Clear the suggestion from localStorage
      localStorage.removeItem('pendingFriendSuggestion');
      setFriendSuggestion(null);
    },
  });

  const handleAcceptFriend = () => {
    if (friendSuggestion) {
      createFriendshipMutation.mutate(friendSuggestion.inviterId);
    }
  };

  const handleDeclineFriend = () => {
    localStorage.removeItem('pendingFriendSuggestion');
    setFriendSuggestion(null);
  };

  const inviterName = friendSuggestion?.inviterName || friendSuggestion?.inviterEmail?.split('@')[0] || 'Friend';

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    setShowOnboarding(false);
  };

  return (
    <>
      <HomePage
        onEditVisit={(visitId: string) => navigate({ to: `/edit-visit/${visitId}` })}
        onAddVisit={() => navigate({ to: '/add-visit' })}
      />

      {/* Onboarding Dialog */}
      <OnboardingDialog
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
      />

      {/* Friend Suggestion Dialog */}
      <AlertDialog open={!!friendSuggestion} onOpenChange={(open) => !open && handleDeclineFriend()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Add {inviterName} as a friend?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-semibold">{inviterName}</span> invited you to join! Would you like to automatically add them as a friend?
                </p>
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-900">
                  <p className="font-medium mb-1">If you accept:</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700">
                    <li>You'll see each other's food visits</li>
                    <li>You can discover new restaurants together</li>
                    <li>You can always remove them later</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-500">
                  If you decline, you can still add them manually later using their friend code.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeclineFriend} disabled={createFriendshipMutation.isPending}>
              Not Now
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAcceptFriend}
              disabled={createFriendshipMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
            >
              {createFriendshipMutation.isPending ? 'Adding...' : 'Add Friend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
