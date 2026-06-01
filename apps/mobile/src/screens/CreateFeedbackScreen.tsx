import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { useFeedbackWrites } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Card, Input } from '../ui';

type CreateFeedbackScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateFeedback'>;
type CreateFeedbackExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';

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
  const feedbackWrites = useFeedbackWrites();
  const { isOnline } = useConnectivity();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasTrackedFlowOpenRef = useRef(false);
  const hasTrackedFlowExitRef = useRef(false);
  const hasCompletedFlowRef = useRef(false);
  const exitMethodRef = useRef<CreateFeedbackExitMethod | null>(null);

  const canSubmit = useMemo(() => {
    return subject.trim().length > 0 && message.trim().length > 0 && !isSubmitting;
  }, [isSubmitting, message, subject]);
  const hasUnsavedChanges = subject.trim().length > 0 || message.trim().length > 0;
  const buildFlowAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'CreateFeedbackScreen',
      hasTitle: subject.trim().length > 0,
      hasBody: message.trim().length > 0,
      hasUnsavedChanges,
      ...overrides,
    }),
    [hasUnsavedChanges, message, subject],
  );

  useEffect(() => {
    if (hasTrackedFlowOpenRef.current) {
      return;
    }

    hasTrackedFlowOpenRef.current = true;
    trackObservabilityEvent('CREATE_FEEDBACK_OPENED', buildFlowAnalyticsPayload());
  }, [buildFlowAnalyticsPayload]);

  useEffect(
    () => () => {
      if (
        hasCompletedFlowRef.current ||
        hasTrackedFlowExitRef.current ||
        !hasTrackedFlowOpenRef.current
      ) {
        return;
      }

      hasTrackedFlowExitRef.current = true;
      trackObservabilityEvent(
        'CREATE_FEEDBACK_EXITED',
        buildFlowAnalyticsPayload({
          exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
        }),
      );
    },
    [buildFlowAnalyticsPayload],
  );

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

      const createResult = await feedbackWrites.createFeedback({
        ...feedbackInput,
        queuedAlert: {
          analyticsSource: 'CreateFeedbackScreen',
          subject: 'Feedback',
        },
      });

      if (createResult.status === 'queued') {
        trackObservabilityEvent('FEEDBACK_SUBMIT_SUCCEEDED', {
          source: 'CreateFeedbackScreen',
          queued: true,
        });
        hasCompletedFlowRef.current = true;
        navigation.replace('Feedback');
        return;
      }

      trackObservabilityEvent('FEEDBACK_SUBMIT_SUCCEEDED', {
        source: 'CreateFeedbackScreen',
        queued: false,
      });
      hasCompletedFlowRef.current = true;
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
      onBackPress={() => {
        exitMethodRef.current = 'header_back';
        handleBack();
      }}
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
        onPress: () => {
          exitMethodRef.current = 'secondary_cancel';
          handleBack();
        },
      }}
      subtitle="Describe the issue, idea, or support request you want to send."
      testID="create-feedback-screen"
      title="New Feedback"
    >
      <View style={styles.body}>
        <PageErrorToast
          analyticsProps={buildFlowAnalyticsPayload()}
          analyticsSource="CreateFeedbackScreen"
          errorMessage={errorMessage}
          title="Could not submit feedback"
        />

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
