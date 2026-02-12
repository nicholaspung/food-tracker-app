import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Plus, LogIn, Users, Clock, ChefHat, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTastingSessions } from '@/hooks/api/useTastingSessions';
import { pb } from '@/lib/pocketbase';
import type { TastingSession } from '@/lib/pocketbase';
import CreateTastingSessionDialog from './CreateTastingSessionDialog';
import JoinTastingSessionDialog from './JoinTastingSessionDialog';

type FilterType = 'active' | 'completed';

interface TastingSessionsListViewProps {
  onNavigateBack?: () => void;
}

export default function TastingSessionsListView({ onNavigateBack }: TastingSessionsListViewProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('active');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const currentUserId = pb.authStore.record?.id || '';

  const { data: sessions, isLoading, error } = useTastingSessions();

  const filteredSessions = (sessions || []).filter(session => {
    if (filter === 'active') return session.status !== 'completed';
    return session.status === 'completed';
  });

  const getStatusBadge = (session: TastingSession) => {
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

  const renderSessionCard = (session: TastingSession) => {
    const isLeader = session.leader === currentUserId;
    const restaurantName = session.expand?.restaurant?.name || 'Unknown Restaurant';
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(session.created).getTime()) / (1000 * 60 * 60 * 24)
    );
    const timeAgo = daysSinceCreated === 0 ? 'Today' : daysSinceCreated === 1 ? '1d ago' : `${daysSinceCreated}d ago`;

    return (
      <Card
        key={session.id}
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => navigate({ to: '/tasting-session/$sessionId', params: { sessionId: session.id } })}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ChefHat className="w-5 h-5 text-purple-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900 truncate">{session.name}</h3>
            </div>
            <p className="text-sm text-gray-600 truncate mb-2">{restaurantName}</p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {isLeader && (
                <span className="text-purple-600 font-medium">Leader</span>
              )}
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{timeAgo}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(session)}
          </div>
        </div>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
        <p className="text-gray-600">Loading sessions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-red-50 rounded-full p-6 mb-4">
          <Users className="w-12 h-12 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading sessions</h2>
        <p className="text-sm text-gray-600 text-center">
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </p>
      </div>
    );
  }

  return (
    <>
      <CreateTastingSessionDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={(sessionId) => {
          setShowCreateDialog(false);
          navigate({ to: '/tasting-session/$sessionId', params: { sessionId } });
        }}
      />
      <JoinTastingSessionDialog
        open={showJoinDialog}
        onClose={() => setShowJoinDialog(false)}
        onSuccess={(sessionId) => {
          setShowJoinDialog(false);
          navigate({ to: '/tasting-session/$sessionId', params: { sessionId } });
        }}
      />

      <div className="flex flex-col h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {onNavigateBack && (
                <Button variant="ghost" size="sm" onClick={onNavigateBack} className="p-2">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                Group Tastings
                <span className="text-sm font-semibold px-2 py-1 bg-purple-100 text-purple-700 rounded-full">BETA</span>
              </h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowJoinDialog(true)} size="sm" variant="outline">
                <LogIn className="w-4 h-4 mr-1" />
                Join
              </Button>
              <Button onClick={() => setShowCreateDialog(true)} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Create
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            {[
              { value: 'active' as FilterType, label: 'Active' },
              { value: 'completed' as FilterType, label: 'Completed' },
            ].map(({ value, label }) => (
              <Button
                key={value}
                variant={filter === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="bg-purple-50 rounded-full p-6 mb-4">
                <Users className="w-12 h-12 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {filter === 'active' ? 'No active sessions' : 'No completed sessions'}
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                {filter === 'active'
                  ? 'Create a session to start tasting with friends'
                  : 'Completed sessions will appear here'}
              </p>
              {filter === 'active' && (
                <div className="flex gap-2">
                  <Button onClick={() => setShowJoinDialog(true)} variant="outline">
                    <LogIn className="w-4 h-4 mr-1" />
                    Join Session
                  </Button>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Create Session
                  </Button>
                </div>
              )}
            </div>
          ) : (
            filteredSessions.map(session => renderSessionCard(session))
          )}
        </div>
      </div>
    </>
  );
}
