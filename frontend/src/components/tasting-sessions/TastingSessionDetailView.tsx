import { ArrowLeft, Users, Lock, Unlock, Play, CheckCircle2, Trash2, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useTastingSession,
  useLockTastingSession,
  useAdvanceToRating,
  useCompleteTastingSession,
  useDeleteTastingSession,
} from '@/hooks/api/useTastingSessions';
import { pb } from '@/lib/pocketbase';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import TastingSessionLobbySection from './TastingSessionLobbySection';
import AddTastingItemForm from './AddTastingItemForm';
import TastingItemsList from './TastingItemsList';
import RateSessionItemsView from './RateSessionItemsView';
import TastingSessionResultsView from './TastingSessionResultsView';

interface TastingSessionDetailViewProps {
  sessionId: string;
  onNavigateBack: () => void;
}

export default function TastingSessionDetailView({
  sessionId,
  onNavigateBack,
}: TastingSessionDetailViewProps) {
  const { data: session, isLoading, error: loadError } = useTastingSession(sessionId);
  const lockSession = useLockTastingSession();
  const advanceToRating = useAdvanceToRating();
  const completeSession = useCompleteTastingSession();
  const deleteSession = useDeleteTastingSession();
  const { error, handleError, clearError } = useErrorHandler({ source: 'TastingSessionDetail' });

  const currentUserId = pb.authStore.record?.id || '';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
        <p className="text-gray-600">Loading session...</p>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-red-50 rounded-full p-6 mb-4">
          <Users className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading session</h2>
        <p className="text-sm text-gray-600 text-center mb-4">
          {loadError instanceof Error ? loadError.message : 'Session not found'}
        </p>
        <Button onClick={onNavigateBack} variant="outline">Go Back</Button>
      </div>
    );
  }

  const isLeader = session.leader === currentUserId;
  const restaurantName = session.expand?.restaurant?.name || 'Unknown Restaurant';
  const participantCount = session.participants?.length || 0;

  const handleLockToggle = async () => {
    clearError();
    try {
      await lockSession.mutateAsync({ sessionId, locked: !session.locked });
    } catch (err) {
      handleError(err);
    }
  };

  const handleAdvanceToRating = async () => {
    clearError();
    if (session.items.length === 0) {
      handleError(new Error('Add at least one item before starting rating'));
      return;
    }
    try {
      await advanceToRating.mutateAsync(sessionId);
    } catch (err) {
      handleError(err);
    }
  };

  const handleComplete = async () => {
    clearError();
    try {
      await completeSession.mutateAsync(sessionId);
    } catch (err) {
      handleError(err);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
    try {
      await deleteSession.mutateAsync(sessionId);
      onNavigateBack();
    } catch (err) {
      handleError(err);
    }
  };

  const getStatusBadge = () => {
    switch (session.status) {
      case 'adding_items':
        return session.locked
          ? <Badge className="bg-yellow-100 text-yellow-800"><Lock className="w-3 h-3 mr-1" />Locked</Badge>
          : <Badge className="bg-blue-100 text-blue-800">Adding Items</Badge>;
      case 'rating':
        return <Badge className="bg-purple-100 text-purple-800">Rating</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onNavigateBack} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-900 truncate flex items-center gap-2">
                {session.name}
                <span className="text-xs font-semibold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">BETA</span>
              </h1>
              <p className="text-sm text-gray-500 truncate">{restaurantName}</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 ml-12">
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1">
            <ChefHat className="w-4 h-4" />
            <span>{session.items?.length || 0} item{(session.items?.length || 0) !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
          {error.message}
        </div>
      )}

      {/* Content - varies by status */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {/* Adding Items Phase */}
        {session.status === 'adding_items' && (
          <>
            {/* Lobby section with invite code (only if not locked) */}
            {!session.locked && (
              <TastingSessionLobbySection
                sessionId={sessionId}
                participants={session.participants}
                invites={session.invites}
                isLeader={isLeader}
              />
            )}

            {/* Participant list when locked */}
            {session.locked && session.participants && (
              <div className="bg-white rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Participants ({participantCount})</h3>
                <div className="space-y-2">
                  {session.participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <span className="text-purple-600 font-medium text-xs">
                          {(p.expand?.user?.name || p.expand?.user?.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="text-gray-700">
                        {p.expand?.user?.name || p.expand?.user?.email || 'Unknown'}
                      </span>
                      {p.user === session.leader && (
                        <Badge variant="outline" className="text-xs">Leader</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add items form */}
            <AddTastingItemForm sessionId={sessionId} />

            {/* Items list */}
            <TastingItemsList
              items={session.items}
              currentUserId={currentUserId}
              isLeader={isLeader}
              sessionId={sessionId}
              canDelete={session.status === 'adding_items'}
            />

            {/* Leader controls */}
            {isLeader && (
              <div className="space-y-2">
                <Button
                  onClick={handleLockToggle}
                  variant="outline"
                  className="w-full"
                  disabled={lockSession.isPending}
                >
                  {session.locked ? (
                    <><Unlock className="w-4 h-4 mr-2" />Unlock Session</>
                  ) : (
                    <><Lock className="w-4 h-4 mr-2" />Lock Session</>
                  )}
                </Button>
                <Button
                  onClick={handleAdvanceToRating}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  disabled={advanceToRating.isPending || session.items.length === 0}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Rating ({session.items.length} items)
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="ghost"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={deleteSession.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Session
                </Button>
              </div>
            )}
          </>
        )}

        {/* Rating Phase */}
        {session.status === 'rating' && (
          <>
            <RateSessionItemsView
              sessionId={sessionId}
              items={session.items}
              ratings={session.ratings}
              currentUserId={currentUserId}
            />

            {/* Leader complete button */}
            {isLeader && (
              <Button
                onClick={handleComplete}
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={completeSession.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete Session
              </Button>
            )}
          </>
        )}

        {/* Completed Phase */}
        {session.status === 'completed' && (
          <TastingSessionResultsView
            session={session}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}
