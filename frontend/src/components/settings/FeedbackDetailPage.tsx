import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from "@/lib/logger";
import { pb, Feedback, FeedbackMessage } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { COLLECTIONS } from '@/constants/collections';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useErrorHandler } from '@/hooks/ui/useErrorHandler';
import { ErrorDisplay } from '@/components/shared/ErrorDisplay';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import { FEEDBACK_STATUS_COLORS as STATUS_COLORS, FEEDBACK_STATUS_LABELS as STATUS_LABELS } from '@/constants/feedback';

interface FeedbackDetailPageProps {
  feedbackId: string;
  onNavigateBack: () => void;
}

export default function FeedbackDetailPage({
  feedbackId,
  onNavigateBack,
}: FeedbackDetailPageProps) {
  const [message, setMessage] = useState('');
  const { error, handleError, clearError, showValidation } = useErrorHandler({ source: 'FeedbackDetailPage', defaultSeverity: 'error' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const currentUser = pb.authStore.record;
  const isAdmin = currentUser?.isAdmin === true;

  // Fetch feedback details
  const { data: feedback } = useQuery<Feedback>({
    queryKey: ['feedback', feedbackId],
    queryFn: async () => {
      return await pb.collection(COLLECTIONS.FEEDBACK).getOne<Feedback>(feedbackId, {
        expand: 'user',
      });
    },
  });

  // Fetch messages for this feedback
  const { data: messages = [] } = useQuery<FeedbackMessage[]>({
    queryKey: ['feedback_messages', feedbackId],
    queryFn: async () => {
      return await pb.collection('feedback_messages').getFullList<FeedbackMessage>({
        filter: `feedback = '${feedbackId}'`,
        sort: 'created',
        expand: 'user',
      });
    },
    refetchInterval: 3000, // Poll every 3 seconds for new messages
  });

  // Mark messages as read when viewing
  useEffect(() => {
    if (!feedback) return;

    const markAsRead = async () => {
      const unreadField = isAdmin ? 'admin_unread_count' : 'user_unread_count';
      const currentCount = isAdmin
        ? feedback.admin_unread_count
        : feedback.user_unread_count;

      if (currentCount && currentCount > 0) {
        try {
          await pb.collection(COLLECTIONS.FEEDBACK).update(feedbackId, {
            [unreadField]: 0,
          });
          queryClient.invalidateQueries({ queryKey: ['feedback'] });
          queryClient.invalidateQueries({ queryKey: ['feedbackUnreadCount'] });
        } catch (err) {
          // Silently fail - user can still read and reply to feedback
          // This might happen if permissions haven't been updated yet
          logger.error('Failed to mark feedback as read:', err);
        }
      }
    };

    markAsRead();
  }, [feedback, feedbackId, isAdmin, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      if (!currentUser) throw new Error('Not authenticated');

      // Create the message
      await pb.collection('feedback_messages').create({
        feedback: feedbackId,
        user: currentUser.id,
        message: messageText,
        is_admin_message: isAdmin,
      });

      // Update feedback last_message_at and unread count
      const updateData: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
      };

      // Increment unread count for the other party
      if (isAdmin) {
        const currentCount = feedback?.user_unread_count || 0;
        updateData.user_unread_count = currentCount + 1;
      } else {
        const currentCount = feedback?.admin_unread_count || 0;
        updateData.admin_unread_count = currentCount + 1;
      }

      await pb.collection(COLLECTIONS.FEEDBACK).update(feedbackId, updateData);
    },
    onSuccess: () => {
      setMessage('');
      clearError();
      queryClient.invalidateQueries({ queryKey: ['feedback_messages', feedbackId] });
      queryClient.invalidateQueries({ queryKey: ['feedback', feedbackId] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['feedbackUnreadCount'] });
    },
    onError: (err: Error) => {
      handleError(err, { customMessage: 'Failed to send message' });
    },
  });

  // Update status mutation (admin only)
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: Feedback['status']) => {
      return await pb.collection(COLLECTIONS.FEEDBACK).update(feedbackId, {
        status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback', feedbackId] });
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      queryClient.invalidateQueries({ queryKey: ['feedbackUnreadCount'] });
    },
  });

  const handleSendMessage = () => {
    if (!message.trim()) {
      showValidation(ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD('Message'));
      return;
    }

    sendMessageMutation.mutate(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!feedback) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">{feedback.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className={`${STATUS_COLORS[feedback.status]} text-white text-xs`}
              >
                {STATUS_LABELS[feedback.status]}
              </Badge>
              {isAdmin && (
                <Select
                  value={feedback.status}
                  onValueChange={(value: string) =>
                    updateStatusMutation.mutate(value as Feedback['status'])
                  }
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger className="w-32 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* Initial feedback description */}
        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">{feedback.description}</p>
          <p className="text-xs text-gray-400 mt-2">
            {formatDistanceToNow(new Date(feedback.created), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const isMyMessage = msg.user === currentUser?.id;
            const isAdminMsg = msg.is_admin_message;

            return (
              <div
                key={msg.id}
                className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    isMyMessage
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-900'
                  }`}
                >
                  {isAdminMsg && !isMyMessage && (
                    <p className="text-xs font-semibold mb-1 opacity-75">Admin</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isMyMessage ? 'text-blue-100' : 'text-gray-400'
                    }`}
                  >
                    {formatDistanceToNow(new Date(msg.created), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <ErrorDisplay error={error} onClear={clearError} className="mb-2" />
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            rows={2}
            maxLength={10000}
            className="flex-1 resize-none"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={sendMessageMutation.isPending || !message.trim()}
            size="icon"
            className="h-auto"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  );
}
