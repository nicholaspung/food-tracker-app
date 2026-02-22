import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BackHeaderScreenScaffold } from '../components/shared';
import { formatDisplayDate } from '../lib/dateFormatting';
import {
  getSeenWhatsNewVersion,
  hasUnseenWhatsNew,
  markLatestWhatsNewAsSeen,
  WHATS_NEW_SEEN_QUERY_KEY,
} from '../lib/whatsNewState';
import { LATEST_WHATS_NEW_VERSION, WHATS_NEW_ENTRIES, type WhatsNewEntry } from '../lib/whatsNewData';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';
import { Card, Text } from '../ui';

type WhatsNewScreenProps = NativeStackScreenProps<RootStackParamList, 'WhatsNew'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface SectionDefinition {
  key: 'features' | 'improvements' | 'fixes';
  label: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
}

export function WhatsNewScreen({ navigation }: WhatsNewScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const seenVersionQuery = useQuery({
    queryKey: WHATS_NEW_SEEN_QUERY_KEY,
    queryFn: getSeenWhatsNewVersion,
    staleTime: Infinity,
  });
  const [isFirstViewOfLatest, setIsFirstViewOfLatest] = useState(false);
  const [hasCapturedFirstViewState, setHasCapturedFirstViewState] = useState(false);
  const [hasTrackedViewEvent, setHasTrackedViewEvent] = useState(false);

  useEffect(() => {
    if (hasCapturedFirstViewState || seenVersionQuery.isLoading) {
      return;
    }

    const wasUnseenOnOpen = hasUnseenWhatsNew(seenVersionQuery.data);
    setIsFirstViewOfLatest(wasUnseenOnOpen);
    setHasCapturedFirstViewState(true);

    if (!wasUnseenOnOpen) {
      return;
    }

    let isCancelled = false;

    const markSeen = async () => {
      try {
        await markLatestWhatsNewAsSeen();
        if (isCancelled) {
          return;
        }

        queryClient.setQueryData(WHATS_NEW_SEEN_QUERY_KEY, LATEST_WHATS_NEW_VERSION);
      } catch {
        // Ignore local persistence failures and keep the page readable.
      }
    };

    void markSeen();

    return () => {
      isCancelled = true;
    };
  }, [hasCapturedFirstViewState, queryClient, seenVersionQuery.data, seenVersionQuery.isLoading]);

  useEffect(() => {
    if (!hasCapturedFirstViewState || hasTrackedViewEvent) {
      return;
    }

    trackObservabilityEvent('WHATS_NEW_VIEWED', {
      source: 'WhatsNewScreen',
      isFirstViewOfLatest,
      latestVersion: LATEST_WHATS_NEW_VERSION,
      seenVersionBeforeOpen: seenVersionQuery.data ?? 'none',
      releaseCount: WHATS_NEW_ENTRIES.length,
    });
    setHasTrackedViewEvent(true);
  }, [hasCapturedFirstViewState, hasTrackedViewEvent, isFirstViewOfLatest, seenVersionQuery.data]);

  const sectionDefinitions: SectionDefinition[] = [
    {
      key: 'features',
      label: 'New Features',
      icon: 'sparkles-outline',
      iconColor: theme.colors.text.info,
      iconBackground: theme.colors.status.infoBg,
    },
    {
      key: 'improvements',
      label: 'Improvements',
      icon: 'rocket-outline',
      iconColor: theme.colors.text.brand,
      iconBackground: theme.colors.background.muted,
    },
    {
      key: 'fixes',
      label: 'Fixes',
      icon: 'bug-outline',
      iconColor: theme.colors.text.warning,
      iconBackground: theme.colors.status.warningBg,
    },
  ];

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
    },
    releaseCard: {
      gap: theme.spacing.sm,
    },
    releaseHeaderRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'space-between',
    },
    releaseTitleWrap: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    releaseTitle: {
      color: theme.colors.text.primary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    releaseSummary: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    versionBadge: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 3,
    },
    releaseBadgesRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    firstViewBadge: {
      backgroundColor: theme.colors.text.danger,
      borderRadius: theme.radii.pill,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 3,
    },
    firstViewBadgeText: {
      color: theme.colors.text.inverse,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
      textTransform: 'uppercase',
    },
    versionBadgeText: {
      color: theme.colors.text.info,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
      textTransform: 'uppercase',
    },
    releaseMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    sectionBlock: {
      gap: theme.spacing.xs,
    },
    sectionHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    sectionIconWrap: {
      alignItems: 'center',
      borderRadius: theme.radii.md,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    bulletList: {
      gap: theme.spacing.xxs,
      paddingLeft: theme.spacing.xxs,
    },
    bulletRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    bullet: {
      color: theme.colors.text.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 1,
    },
    bulletText: {
      color: theme.colors.text.secondary,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
  });

  const renderSection = (entry: WhatsNewEntry, section: SectionDefinition) => {
    const items = entry[section.key];
    if (!items.length) {
      return null;
    }

    return (
      <View key={section.key} style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIconWrap, { backgroundColor: section.iconBackground }]}>
            <Ionicons color={section.iconColor} name={section.icon} size={16} />
          </View>
          <Text style={styles.sectionTitle}>{section.label}</Text>
        </View>
        <View style={styles.bulletList}>
          {items.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={() => {
        navigation.navigate('Profile');
      }}
      subtitle="Latest product updates and improvements."
      title="What's New"
    >
      {WHATS_NEW_ENTRIES.map((entry, index) => (
        <Card key={entry.version} style={styles.releaseCard} tone="muted">
          <View style={styles.releaseHeaderRow}>
            <View style={styles.releaseTitleWrap}>
              <Text style={styles.releaseTitle}>{entry.title}</Text>
              <Text style={styles.releaseSummary}>{entry.summary}</Text>
            </View>
            <View style={styles.releaseBadgesRow}>
              {index === 0 && isFirstViewOfLatest ? (
                <View style={styles.firstViewBadge}>
                  <Text style={styles.firstViewBadgeText}>First view</Text>
                </View>
              ) : null}
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeText}>{`v${entry.version}`}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.releaseMeta}>
            {formatDisplayDate(entry.date, {
              fallback: entry.date,
              options: {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              },
            })}
          </Text>
          {sectionDefinitions.map((section) => renderSection(entry, section))}
        </Card>
      ))}
    </BackHeaderScreenScaffold>
  );
}
