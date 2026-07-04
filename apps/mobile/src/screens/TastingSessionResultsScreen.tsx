import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  FoodItemRatingRecordCard,
  type FoodItemRatingRecordRow,
  PhotoViewerModal,
  type RecordPhotoEntry,
} from '../components/shared';
import { listVisitItemPhotos, type TastingItemRatingRecord, type TastingSessionRecord } from '../features';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { formatStoredCalendarDateLabel } from '../lib/dateFormatting';
import { buildPhotoFileUrl, buildPhotoThumbnailUrl } from '../lib/photoUrls';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Text } from '../ui';
import { TastingSessionLifecycleShell } from './tastingSessions/TastingSessionLifecycleShell';
import { useTastingSessionLifecycleReadState } from './tastingSessions/useTastingSessionLifecycleReadState';

type TastingSessionResultsScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionResults'>;

const useStyles = createThemedStyles((theme) => ({
  restaurantCard: {
    gap: theme.spacing.md,
  },
  restaurantHeader: {
    gap: theme.spacing.xxs,
  },
  section: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  createBillButton: {
    width: '100%',
  },
}));

function uniquePhotoEntries(entries: RecordPhotoEntry[]): RecordPhotoEntry[] {
  const byId = new Map<string, RecordPhotoEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}

function getApprovedRestaurantCount(session: TastingSessionRecord): number {
  return session.restaurants.filter((restaurant) => restaurant.status === 'approved').length;
}

function getApprovedItemCount(session: TastingSessionRecord): number {
  return session.restaurants
    .filter((restaurant) => restaurant.status === 'approved')
    .reduce((count, restaurant) => count + (restaurant.items ?? []).filter((item) => item.status === 'approved').length, 0);
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatCompletedSessionSubtitle(session: TastingSessionRecord): string {
  const sessionDate = formatStoredCalendarDateLabel(session.updatedAt || session.createdAt, {
    fallback: 'Unknown date',
    locale: 'en-US',
  });

  const summary = [
    formatCount(getApprovedRestaurantCount(session), 'restaurant', 'restaurants'),
    formatCount(getApprovedItemCount(session), 'item', 'items'),
    formatCount(session.participants.length, 'taster', 'tasters'),
  ].join(', ');

  return `${sessionDate} - ${summary}`;
}

export function TastingSessionResultsScreen({ navigation, route }: TastingSessionResultsScreenProps) {
  const styles = useStyles();
  const { user } = useAuth();
  const { sessionId } = route.params;
  const lifecycle = useTastingSessionLifecycleReadState({
    currentUserId: user?.id,
    screen: 'results',
    sessionId,
  });
  const sessionQuery = lifecycle.query;
  const session = sessionQuery.data;
  const canCreateBillFromSession = Boolean(
    session &&
      session.status === 'completed' &&
      user?.id &&
      session.leaderUserId === user.id,
  );
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerOwnerLabels, setPhotoViewerOwnerLabels] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);

  const generatedFoodItemIds = useMemo(() => {
    if (!session || session.status !== 'completed') {
      return [];
    }

    return Array.from(
      new Set(
        session.restaurants
          .flatMap((restaurant) => restaurant.items ?? [])
          .flatMap((item) => item.ratings)
          .map((rating) => rating.generatedFoodItemId?.trim())
          .filter((foodItemId): foodItemId is string => Boolean(foodItemId)),
      ),
    );
  }, [session]);
  const resultPhotosQueryKey = useMemo(
    () => tastingSessionsQueryKeys.resultPhotos(sessionId, generatedFoodItemIds),
    [generatedFoodItemIds, sessionId],
  );
  const resultPhotoFoodItemIds = resultPhotosQueryKey[4];

  const photosQuery = useQuery({
    enabled: resultPhotoFoodItemIds.length > 0,
    queryFn: ({ signal }) => listVisitItemPhotos([...resultPhotoFoodItemIds], { signal }),
    queryKey: resultPhotosQueryKey,
  });

  const photosByFoodItemId = useMemo(() => photosQuery.data ?? {}, [photosQuery.data]);

  const participantById = useMemo(
    () => new Map(session?.participants.map((participant) => [participant.id, participant]) ?? []),
    [session?.participants],
  );

  const buildPhotoEntries = useCallback(
    (rating: TastingItemRatingRecord): RecordPhotoEntry[] => {
      const foodItemId = rating.generatedFoodItemId?.trim();
      if (!foodItemId) {
        return [];
      }

      const participantName = participantById.get(rating.participantId)?.name ?? 'Participant';
      return (photosByFoodItemId[foodItemId] ?? []).map((photo) => ({
        id: photo.id,
        ownerLabel: participantName,
        previewUrl: buildPhotoThumbnailUrl(photo),
        url: buildPhotoFileUrl(photo),
      }));
    },
    [participantById, photosByFoodItemId],
  );

  const openPhotoViewer = useCallback((entries: RecordPhotoEntry[], initialIndex = 0) => {
    if (entries.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(initialIndex, entries.length - 1));
    setPhotoViewerPreviewUrls(entries.map((entry) => entry.previewUrl));
    setPhotoViewerUrls(entries.map((entry) => entry.url));
    setPhotoViewerOwnerLabels(entries.map((entry) => entry.ownerLabel ?? 'Participant'));
    setPhotoViewerInitialIndex(boundedIndex);
    setPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);

  return (
    <TastingSessionLifecycleShell
      isError={sessionQuery.isError}
      loadingTitle="Loading results"
      onBackPress={() => navigation.navigate('TastingSessions')}
      session={session}
      title="Results"
    >
      {(availableSession) => (
        <FeatureDetailScreenScaffold
          headerScrollMode="fixed"
          onBackPress={() => navigation.navigate('TastingSessions')}
          subtitle={
            availableSession.status === 'completed'
              ? formatCompletedSessionSubtitle(availableSession)
              : 'Results appear after the leader completes the tasting.'
          }
          title={availableSession.name}
        >
          {availableSession.status !== 'completed' ? (
            <EmptyState description="The leader has not completed this tasting yet." title="Results locked" />
          ) : null}

          {availableSession.status === 'completed'
            ? availableSession.restaurants
            .filter((restaurant) => restaurant.status === 'approved')
            .map((restaurant) => {
              const approvedItems = (restaurant.items ?? []).filter((item) => item.status === 'approved');
              return (
                <Card key={restaurant.id} style={styles.restaurantCard}>
                  <View style={styles.restaurantHeader}>
                    <Text variant="label">{restaurant.restaurantName}</Text>
                    <Text tone="secondary" variant="bodySm">
                      {approvedItems.length} item{approvedItems.length === 1 ? '' : 's'}
                    </Text>
                  </View>

                  <View style={styles.section}>
                    <Text tone="secondary" variant="label">
                      Tasting Records
                    </Text>
                    {approvedItems.map((item, itemIndex) => {
                      const rows: FoodItemRatingRecordRow[] = item.ratings.map((rating) => {
                        const isCurrentUserRating = rating.userId === user?.id;
                        const participantName = isCurrentUserRating
                          ? 'You'
                          : participantById.get(rating.participantId)?.name ?? 'Participant';
                        return {
                          id: rating.id,
                          label: participantName,
                          note: rating.note || null,
                          rating: rating.rating,
                          type: isCurrentUserRating ? 'user' : 'source',
                        };
                      });
                      const itemPhotoEntries = uniquePhotoEntries(item.ratings.flatMap((rating) => buildPhotoEntries(rating)));
                      return (
                        <FoodItemRatingRecordCard
                          itemName={item.name}
                          key={item.id}
                          onOpenPhotos={openPhotoViewer}
                          photoAccessibilityLabel={`View photos for ${item.name}`}
                          photoEntries={itemPhotoEntries}
                          photoTestID={`tasting-result-photo-button-${itemIndex}`}
                          rows={rows}
                        />
                      );
                    })}
                  </View>
                </Card>
              );
            })
        : null}

          {canCreateBillFromSession ? (
            <Button
              label="Create Bill from Session"
              onPress={() => {
                navigation.navigate('CreateBill', { sourceTastingSessionId: availableSession.id });
              }}
              style={styles.createBillButton}
            />
          ) : null}

          <PhotoViewerModal
            initialIndex={photoViewerInitialIndex}
            onRequestClose={closePhotoViewer}
            ownerLabels={photoViewerOwnerLabels}
            previewUrls={photoViewerPreviewUrls}
            urls={photoViewerUrls}
            visible={photoViewerVisible}
          />
        </FeatureDetailScreenScaffold>
      )}
    </TastingSessionLifecycleShell>
  );
}
