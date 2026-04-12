import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import {
  createFeedback,
  feedbackQueryKeys,
  type FeedbackCountSummary,
  type FeedbackListQueryData,
  prependFeedbackListItem,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Card, Input } from '../ui';

type CreateFeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateFeedback'>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  formCard: {
    borderColor: theme.colors.border.info,
    gap: theme.spacing.sm,
  },
  messageInput: {
    maxHeight: 220,
    minHeight: 140,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
}));

export function CreateFeedbackScreen({ navigation }: CreateFeedbackScreenProps) {
  const styles = useStyles();
  const writeFeature = useOfflineAwareFeatureWrite();
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return subject.trim().length > 0 && message.trim().length > 0 && !isSubmitting;
  }, [isSubmitting, message, subject]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Feedback');
  };

  const handleSubmit = async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedSubject || !trimmedMessage) {
      trackObservabilityEvent('FEEDBACK_SUBMIT_VALIDATION_FAILED', {
        source: 'CreateFeedbackScreen',
        reason: 'missing_subject_or_message',
        subjectLength: trimmedSubject.length,
        messageLength: trimmedMessage.length,
      });
      setErrorMessage('Subject and message are required.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('FEEDBACK_SUBMIT_STARTED', {
      source: 'CreateFeedbackScreen',
      subjectLength: trimmedSubject.length,
      messageLength: trimmedMessage.length,
      isOnline,
    });
    setIsSubmitting(true);

    try {
      const feedbackInput = {
        title: trimmedSubject,
        description: trimmedMessage,
      };

      const createResult = await writeFeature({
        operationName: 'feedback.create',
        offline: {
          strategy: 'outbox',
          payload: feedbackInput,
        },
        execute: () => createFeedback(feedbackInput),
      });

      if (createResult.status === 'queued') {
        await queryClient.invalidateQueries({ queryKey: feedbackQueryKeys.root });
        trackObservabilityEvent('FEEDBACK_SUBMIT_SUCCEEDED', {
          source: 'CreateFeedbackScreen',
          queued: true,
        });
        showQueuedOfflineAlert('Feedback');
        navigation.replace('Feedback');
        return;
      }

      const createdFeedback = createResult.result;

      queryClient.setQueryData<FeedbackListQueryData>(feedbackQueryKeys.list, (currentFeedback) =>
        prependFeedbackListItem(currentFeedback, createdFeedback),
      );
      queryClient.setQueryData(feedbackQueryKeys.detail(createdFeedback.id), createdFeedback);
      queryClient.setQueryData<FeedbackCountSummary | undefined>(feedbackQueryKeys.summary, (currentSummary) =>
        currentSummary
          ? {
              allCount: currentSummary.allCount + 1,
              activeCount: createdFeedback.status === 'closed' ? currentSummary.activeCount : currentSummary.activeCount + 1,
            }
          : currentSummary,
      );
      trackObservabilityEvent('FEEDBACK_SUBMIT_SUCCEEDED', {
        source: 'CreateFeedbackScreen',
        queued: false,
        feedbackId: createdFeedback.id,
      });
      navigation.replace('Feedback');
    } catch (error) {
      const nextErrorMessage = error instanceof Error ? error.message : 'Could not submit feedback.';
      setErrorMessage(nextErrorMessage);
      trackObservabilityEvent('FEEDBACK_SUBMIT_FAILED', {
        source: 'CreateFeedbackScreen',
        error: nextErrorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleBack}
      primaryAction={{
        disabled: !canSubmit,
        label: 'Submit Feedback',
        loading: isSubmitting,
        onPress: () => {
          void handleSubmit();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        onPress: handleBack,
      }}
      subtitle="Describe the issue, idea, or support request you want to send."
      testID="create-feedback-screen"
      title="New Feedback"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not submit feedback" />

        <Card style={styles.formCard}>
          <Input
            autoCapitalize="sentences"
            label="Subject"
            onChangeText={setSubject}
            placeholder="Bug, idea, request"
            returnKeyType="next"
            testID="create-feedback-subject-input"
            value={subject}
          />
          <Input
            inputStyle={styles.messageInput}
            label="Message"
            multiline
            onChangeText={setMessage}
            placeholder="Tell us what happened"
            testID="create-feedback-message-input"
            value={message}
          />
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
