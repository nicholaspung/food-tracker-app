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
      fontSize: compact ? 15 : 18,
      fontWeight: '700',
      lineHeight: compact ? 20 : 24,
    },
    ownerText: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    description: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    footerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    footerLabelMuted: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    footerLabelSuccess: {
      color: theme.colors.text.success,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    timestamp: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
      marginLeft: 'auto',
    },
    unreadLabel: {
      color: theme.colors.text.brand,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
  });

  return (
    <Card style={[styles.card, style]} tone={tone}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <StatusPill
          label={FEEDBACK_STATUS_LABELS[status]}
          tone={resolveFeedbackStatusTone(status)}
          uppercase
          variant="soft"
        />
      </View>

      {ownerLabel ? <Text style={styles.ownerText}>{ownerLabel}</Text> : null}
      <Text style={styles.description}>{description}</Text>

      {footerLabel || timestampLabel ? (
        <View style={styles.footerRow}>
          {footerLabel ? (
            <Text style={footerLabelTone === 'success' ? styles.footerLabelSuccess : styles.footerLabelMuted}>
              {footerLabel}
            </Text>
          ) : null}
          {timestampLabel ? <Text style={styles.timestamp}>{timestampLabel}</Text> : null}
        </View>
      ) : null}

      {unreadCount > 0 ? <Text style={styles.unreadLabel}>{unreadCount} unread</Text> : null}
    </Card>
  );
}
