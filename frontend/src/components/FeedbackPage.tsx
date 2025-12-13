import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Outlet, useMatches } from '@tanstack/react-router';
import { pb, Feedback } from '@/lib/pocketbase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageSquare, Plus, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { ERROR_MESSAGES } from '@/lib/errorMessages';

const STATUS_COLORS = {
  open: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  resolved: 'bg-green-500',
  closed: 'bg-gray-500',
} as const;

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
} as const;

export default function FeedbackPage() {
  const [showNewFeedbackDialog, setShowNewFeedbackDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { error, handleError, clearError, showValidation } = useErrorHandler({ source: 'FeedbackPage', defaultSeverity: 'error' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const matches = useMatches();

  const currentUser = pb.authStore.record;
  const isAdmin = currentUser?.isAdmin === true;

  // Check if we're rendering a child route (feedback detail page)
  const isOnDetailPage = matches.some(match => match.routeId === '/feedback/$feedbackId');

  // Fetch all feedback (always call this hook, even if we don't use it)
  const { data: feedbackList = [], isLoading } = useQuery<Feedback[]>({
    queryKey: ['feedback'],
    queryFn: async () => {
      return await pb.collection('feedback').getFullList<Feedback>({
        sort: '-last_message_at,-created',
        expand: 'user',
      });
    },
    enabled: !isOnDetailPage, // Don't fetch if we're on detail page
  });

  // Create new feedback mutation
  const createFeedbackMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      if (!currentUser) throw new Error('Not authenticated');

      return await pb.collection('feedback').create({
        user: currentUser.id,
        title: data.title,
        description: data.description,
        status: 'open',
        admin_unread_count: 1, // New feedback means admin hasn't read it
        user_unread_count: 0,
        last_message_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      setShowNewFeedbackDialog(false);
      setTitle('');
      setDescription('');
      clearError();
    },
    onError: (err: Error) => {
      handleError(err, { customMessage: ERROR_MESSAGES.GENERIC.CREATE_FAILED('feedback') });
    },
  });

  // If we're on the detail page, just render the child route
  if (isOnDetailPage) {
    return <Outlet />;
  }

  const handleCreateFeedback = () => {
    if (!title.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD('Title'));
      return;
    }
    if (!description.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD('Description'));
      return;
    }

    createFeedbackMutation.mutate({ title, description });
  };

  const handleFeedbackClick = (feedbackId: string) => {
    navigate({ to: `/feedback/${feedbackId}` });
  };

  const getUnreadCount = (feedback: Feedback) => {
    if (isAdmin) {
      return feedback.admin_unread_count || 0;
    }
    return feedback.user_unread_count || 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 mx-auto text-gray-400 animate-pulse" />
          <p className="mt-2 text-gray-600">Loading feedback...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-blue-600" />
                Feedback
                {isAdmin && <Badge variant="secondary">Admin</Badge>}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {isAdmin
                  ? 'Manage user feedback and suggestions'
                  : 'Share your thoughts and get help'}
              </p>
            </div>
            {!isAdmin && (
              <Button
                onClick={() => setShowNewFeedbackDialog(true)}
                size="sm"
                className="flex-shrink-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                New
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Feedback List */}
      <div className="px-4 py-4 space-y-3">
        {feedbackList.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-400" />
              <p className="mt-2 text-gray-600">
                {isAdmin ? 'No feedback yet' : 'You haven\'t submitted any feedback yet'}
              </p>
              {!isAdmin && (
                <Button
                  onClick={() => setShowNewFeedbackDialog(true)}
                  className="mt-4"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Feedback
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          feedbackList.map((feedback) => {
            const unreadCount = getUnreadCount(feedback);

            return (
              <Card
                key={feedback.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleFeedbackClick(feedback.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {feedback.title}
                        </h3>
                        <Badge
                          variant="secondary"
                          className={`${STATUS_COLORS[feedback.status]} text-white text-xs`}
                        >
                          {STATUS_LABELS[feedback.status]}
                        </Badge>
                        {unreadCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {feedback.description}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {feedback.last_message_at
                          ? formatDistanceToNow(new Date(feedback.last_message_at), {
                              addSuffix: true,
                            })
                          : formatDistanceToNow(new Date(feedback.created), {
                              addSuffix: true,
                            })}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* New Feedback Dialog */}
      <Dialog open={showNewFeedbackDialog} onOpenChange={setShowNewFeedbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Feedback</DialogTitle>
            <DialogDescription>
              Share your thoughts, report issues, or suggest improvements
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of your feedback"
                maxLength={100}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                placeholder="Provide details about your feedback..."
                rows={5}
                maxLength={5000}
              />
            </div>

            <ErrorDisplay error={error} onClear={clearError} />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFeedbackDialog(false);
                setTitle('');
                setDescription('');
                clearError();
              }}
              disabled={createFeedbackMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFeedback}
              disabled={createFeedbackMutation.isPending}
            >
              {createFeedbackMutation.isPending ? 'Creating...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
