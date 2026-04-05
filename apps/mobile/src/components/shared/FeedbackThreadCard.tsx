import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import { FEEDBACK_STATUS_LABELS, resolveFeedbackStatusTone, type FeedbackStatus } from './FeedbackStatus';
import { StatusPill } from './StatusPill';

type FeedbackThreadCardTone = 'default' | 'muted' | 'info' | 'warning' | 'danger' | 'success';
type FooterLabelTone = 'muted' | 'success';

interface FeedbackThreadCardProps {
  title: string;
  description: string;
  status: FeedbackStatus;
  compact?: boolean;
  ownerLabel?: string;
  timestampLabel?: string;
  footerLabel?: string;
  footerLabelTone?: FooterLabelTone;
  unreadCount?: number;
  tone?: FeedbackThreadCardTone;
  style?: StyleProp<ViewStyle>;
}

export function FeedbackThreadCard({
  title,
  description,
  status,
  compact = false,
  ownerLabel,
  timestampLabel,
  footerLabel,
  footerLabelTone = 'muted',
  unreadCount = 0,
  tone = 'muted',
  style,
}: FeedbackThreadCardProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    card: {
      gap: theme.spacing.xxs,
    },
    headerRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    title: {
      color: theme.colors.text.primary,
      flex: 1,
    },
    ownerText: {
      color: theme.colors.text.muted,
    },
    description: {
      color: theme.colors.text.secondary,
    },
    footerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    footerLabelMuted: {
      color: theme.colors.text.muted,
    },
    footerLabelSuccess: {
      color: theme.colors.text.success,
    },
    timestamp: {
      color: theme.colors.text.muted,
      marginLeft: 'auto',
    },
    unreadLabel: {
      color: theme.colors.text.brand,
    },
  });

  return (
    <Card style={[styles.card, style]} tone={tone}>
      <View style={styles.headerRow}>
        <Text style={styles.title} variant={compact ? 'titleXs' : 'sectionTitle'}>
          {title}
        </Text>
        <StatusPill
          label={FEEDBACK_STATUS_LABELS[status]}
          tone={resolveFeedbackStatusTone(status)}
          uppercase
          variant="soft"
        />
      </View>

      {ownerLabel ? <Text style={styles.ownerText} variant="bodySmTight">{ownerLabel}</Text> : null}
      <Text style={styles.description} variant="bodyMd">{description}</Text>

      {footerLabel || timestampLabel ? (
        <View style={styles.footerRow}>
          {footerLabel ? (
            <Text
              style={footerLabelTone === 'success' ? styles.footerLabelSuccess : styles.footerLabelMuted}
              variant="bodySmTightSemiBold"
            >
              {footerLabel}
            </Text>
          ) : null}
          {timestampLabel ? <Text style={styles.timestamp} variant="bodySmTight">{timestampLabel}</Text> : null}
        </View>
      ) : null}

      {unreadCount > 0 ? (
        <Text style={styles.unreadLabel} variant="bodySmTightSemiBold">
          {unreadCount} unread
        </Text>
      ) : null}
    </Card>
  );
}
