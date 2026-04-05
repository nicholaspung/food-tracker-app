import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
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
import { Button, Card, Text } from '../ui';

type WhatsNewScreenProps = NativeStackScreenProps<RootStackParamList, 'WhatsNew'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface SectionDefinition {
  key: 'features' | 'improvements' | 'fixes';
  label: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
}

const WHATS_NEW_PAGE_SIZE = 5;

export function WhatsNewScreen({ navigation }: WhatsNewScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const seenVersionQuery = useQuery({
    queryKey: WHATS_NEW_SEEN_QUERY_KEY,
    queryFn: getSeenWhatsNewVersion,
    staleTime: Infinity,
  });
  const hasMarkedLatestAsSeenRef = useRef(false);
  const [isFirstViewOfLatest, setIsFirstViewOfLatest] = useState(false);
  const [hasCapturedFirstViewState, setHasCapturedFirstViewState] = useState(false);
  const [hasTrackedViewEvent, setHasTrackedViewEvent] = useState(false);
  const [visibleEntryCount, setVisibleEntryCount] = useState(WHATS_NEW_PAGE_SIZE);

  useEffect(() => {
    if (
      hasCapturedFirstViewState ||
      seenVersionQuery.isLoading ||
      typeof seenVersionQuery.data === 'undefined'
    ) {
      return;
    }

    const wasUnseenOnOpen = hasUnseenWhatsNew(seenVersionQuery.data);
    setIsFirstViewOfLatest(wasUnseenOnOpen);
    setHasCapturedFirstViewState(true);
  }, [hasCapturedFirstViewState, seenVersionQuery.data, seenVersionQuery.isLoading]);

  useEffect(() => {
    if (!hasCapturedFirstViewState || !isFirstViewOfLatest) {
      return;
    }

    const persistSeenState = async () => {
      if (hasMarkedLatestAsSeenRef.current) {
        return;
      }

      hasMarkedLatestAsSeenRef.current = true;
      try {
        await markLatestWhatsNewAsSeen();
        queryClient.setQueryData(WHATS_NEW_SEEN_QUERY_KEY, LATEST_WHATS_NEW_VERSION);
      } catch {
        hasMarkedLatestAsSeenRef.current = false;
      }
    };

    const unsubscribeBlur = navigation.addListener('blur', () => {
      void persistSeenState();
    });

    return () => {
      unsubscribeBlur();
      void persistSeenState();
    };
  }, [hasCapturedFirstViewState, isFirstViewOfLatest, navigation, queryClient]);

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
    },
    releaseSummary: {
      color: theme.colors.text.secondary,
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
      textTransform: 'uppercase',
    },
    versionBadgeText: {
      color: theme.colors.text.info,
      textTransform: 'uppercase',
    },
    releaseMeta: {
      color: theme.colors.text.muted,
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
      marginTop: 1,
    },
    bulletText: {
      color: theme.colors.text.secondary,
      flex: 1,
    },
    showMoreButton: {
      marginTop: theme.spacing.xs,
    },
  });

  const visibleEntries = WHATS_NEW_ENTRIES.slice(0, visibleEntryCount);
  const hasMoreEntries = visibleEntryCount < WHATS_NEW_ENTRIES.length;

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
          <Text style={styles.sectionTitle} variant="labelMdBold">{section.label}</Text>
        </View>
        <View style={styles.bulletList}>
          {items.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet} variant="bodyMd">-</Text>
              <Text style={styles.bulletText} variant="bodyMd">{item}</Text>
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
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('Profile');
      }}
      subtitle="Latest product updates and improvements."
      testID="whats-new-screen"
      title="What's New"
    >
      {visibleEntries.map((entry, index) => (
        <Card key={entry.version} style={styles.releaseCard}>
          <View style={styles.releaseHeaderRow}>
            <View style={styles.releaseTitleWrap}>
              <Text style={styles.releaseTitle} variant="sectionTitle">{entry.title}</Text>
              <Text style={styles.releaseSummary} variant="bodyMd">{entry.summary}</Text>
            </View>
            <View style={styles.releaseBadgesRow}>
              {index === 0 && isFirstViewOfLatest ? (
                <View style={styles.firstViewBadge}>
                  <Text style={styles.firstViewBadgeText} variant="captionStrong">First view</Text>
                </View>
              ) : null}
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeText} variant="captionStrong">{`v${entry.version}`}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.releaseMeta} variant="bodySmTightSemiBold">
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
      {hasMoreEntries ? (
        <Button
          label="Show more"
          onPress={() => {
            setVisibleEntryCount((currentCount) =>
              Math.min(currentCount + WHATS_NEW_PAGE_SIZE, WHATS_NEW_ENTRIES.length),
            );
          }}
          style={styles.showMoreButton}
          variant="secondary"
        />
      ) : null}
    </BackHeaderScreenScaffold>
  );
}
