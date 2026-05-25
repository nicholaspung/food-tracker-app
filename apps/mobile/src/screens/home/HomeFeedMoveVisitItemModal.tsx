import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  LoadingState,
  OptionList,
  OptionListRow,
} from '../../components/shared';
import { usePaginatedQueryState } from '../../hooks/useListQueryState';
import {
  listVisitsPage,
  type VisitRecord,
  visitsQueryKeys,
} from '../../features';
import { formatStoredCalendarDateLabel } from '../../lib/dateFormatting';
import { createThemedStyles } from '../../theme';
import { Button, Card, Input, Modal, Text } from '../../ui';
import type { HomeFeedActionController } from './useHomeFeedActionController';

interface HomeFeedMoveVisitItemModalProps {
  controller: HomeFeedActionController;
  fallbackVisits: VisitRecord[];
}

const MOVE_VISIT_PAGE_SIZE = 20;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.sm,
  },
  listScroll: {
    maxHeight: 320,
  },
  loadMoreButton: {
    width: '100%',
  },
  refreshWarningCard: {
    gap: theme.spacing.xxs,
  },
  selectedRow: {
    backgroundColor: theme.colors.status.infoBg,
  },
  selectedText: {
    color: theme.colors.text.brand,
  },
}));

function getVisitSortValue(visit: VisitRecord): string {
  return visit.visitedAt || visit.createdAt;
}

function matchesVisitSearch(visit: VisitRecord, searchQuery: string): boolean {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  if (
    visit.restaurantName.toLowerCase().includes(normalizedSearch) ||
    visit.restaurantLocation?.toLowerCase().includes(normalizedSearch) ||
    visit.restaurantCuisineType?.toLowerCase().includes(normalizedSearch)
  ) {
    return true;
  }

  return visit.items.some(
    (item) =>
      item.name.toLowerCase().includes(normalizedSearch) ||
      item.notes?.toLowerCase().includes(normalizedSearch) ||
      item.description?.toLowerCase().includes(normalizedSearch),
  );
}

function formatVisitOptionSubtitle(visit: VisitRecord): string {
  const dateLabel = formatStoredCalendarDateLabel(visit.visitedAt, {
    locale: 'en-US',
    fallback: 'Unknown date',
  });
  const itemCount = visit.items.length;

  return `${dateLabel} • ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
}

export function HomeFeedMoveVisitItemModal({
  controller,
  fallbackVisits,
}: HomeFeedMoveVisitItemModalProps) {
  const styles = useStyles();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDestinationVisitId, setSelectedDestinationVisitId] = useState<
    string | null
  >(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const visible = controller.pendingMoveItem !== null;

  const visitsQuery = useInfiniteQuery({
    queryKey: visitsQueryKeys.paginated('mine', deferredSearchQuery),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      listVisitsPage({
        page: pageParam,
        pageSize: MOVE_VISIT_PAGE_SIZE,
        scope: 'mine',
        search: deferredSearchQuery || undefined,
        signal,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    enabled: visible,
  });

  const visitsState = usePaginatedQueryState({
    data: visitsQuery.data,
    isError: visitsQuery.isError,
    isFetching: visitsQuery.isFetching,
    isLoading: visitsQuery.isLoading,
    isSuccess: visitsQuery.isSuccess,
  });

  const combinedVisits = useMemo(() => {
    const sourceVisitId = controller.pendingMoveItem?.sourceVisitId;
    const visitsById = new Map<string, VisitRecord>();

    for (const visit of fallbackVisits) {
      if (visit.id === sourceVisitId || !matchesVisitSearch(visit, deferredSearchQuery)) {
        continue;
      }

      visitsById.set(visit.id, visit);
    }

    for (const visit of visitsState.items) {
      if (visit.id === sourceVisitId) {
        continue;
      }

      visitsById.set(visit.id, visit);
    }

    return Array.from(visitsById.values()).sort((left, right) =>
      getVisitSortValue(right).localeCompare(getVisitSortValue(left)),
    );
  }, [
    controller.pendingMoveItem?.sourceVisitId,
    deferredSearchQuery,
    fallbackVisits,
    visitsState.items,
  ]);

  const hasBlockingError = visible && visitsState.hasBlockingError && combinedVisits.length === 0;
  const hasRefreshError = visible && visitsState.hasRefreshError && combinedVisits.length > 0;

  const selectedDestinationVisit =
    combinedVisits.find((visit) => visit.id === selectedDestinationVisitId) ?? null;

  useEffect(() => {
    setSearchQuery('');
    setSelectedDestinationVisitId(null);
  }, [controller.pendingMoveItem?.item.id, controller.pendingMoveItem?.sourceVisitId]);

  useEffect(() => {
    if (
      selectedDestinationVisitId &&
      !combinedVisits.some((visit) => visit.id === selectedDestinationVisitId)
    ) {
      setSelectedDestinationVisitId(null);
    }
  }, [combinedVisits, selectedDestinationVisitId]);

  return (
    <Modal
      description={
        'Choose the visit that should own this item. Notes and photos stay attached.'
      }
      onRequestClose={controller.closeMoveVisitItemModal}
      primaryAction={{
        accessibilityLabel: 'Move item',
        disabled: selectedDestinationVisit === null,
        label: 'Move Item',
        loading: controller.isMovingVisitItem,
        onPress: () => {
          if (!selectedDestinationVisit) {
            return;
          }

          void controller.confirmMoveVisitItem(selectedDestinationVisit);
        },
        testID: 'home-move-visit-item-confirm-button',
      }}
      secondaryAction={{
        accessibilityLabel: 'Cancel',
        label: 'Cancel',
        onPress: controller.closeMoveVisitItemModal,
        testID: 'home-move-visit-item-cancel-button',
      }}
      testID="home-move-visit-item-modal"
      title={
        controller.pendingMoveItem?.item.name.trim()
          ? `Move "${controller.pendingMoveItem.item.name.trim()}"`
          : 'Move Item'
      }
      visible={visible}
    >
      <View style={styles.body}>
        {controller.moveErrorMessage ? (
          <Card tone="danger">
            <Text tone="danger">{controller.moveErrorMessage}</Text>
          </Card>
        ) : null}

        {hasRefreshError ? (
          <Card style={styles.refreshWarningCard} tone="muted">
            <Text tone="warning">
              Could not refresh visit results. Showing saved options.
            </Text>
          </Card>
        ) : null}

        <Input
          autoCapitalize="none"
          autoCorrect={false}
          label="Search Your Visits"
          onChangeText={setSearchQuery}
          placeholder="Restaurant or item name"
          testID="home-move-visit-item-search"
          value={searchQuery}
        />

        {hasBlockingError ? (
          <ErrorState
            description="We could not load your visits to move this item."
            onRetry={() => {
              void visitsQuery.refetch();
            }}
            title="Visit picker unavailable"
          />
        ) : visitsQuery.isLoading && combinedVisits.length === 0 ? (
          <LoadingState label="Loading your visits..." />
        ) : combinedVisits.length === 0 ? (
          <EmptyState
            description="Try a different search or create another visit first."
            title="No other visits found"
          />
        ) : (
          <>
            <ScrollView style={styles.listScroll}>
              <OptionList>
                {combinedVisits.map((visit, index) => {
                  const isSelected = visit.id === selectedDestinationVisitId;

                  return (
                    <OptionListRow
                      accessibilityLabel={`Move item to ${visit.restaurantName}`}
                      chevron={false}
                      isLast={index === combinedVisits.length - 1}
                      key={visit.id}
                      onPress={() => {
                        setSelectedDestinationVisitId(visit.id);
                      }}
                      rightAccessory={
                        isSelected ? (
                          <Text style={styles.selectedText} variant="bodySm">
                            Selected
                          </Text>
                        ) : undefined
                      }
                      style={isSelected ? styles.selectedRow : undefined}
                      subtitle={formatVisitOptionSubtitle(visit)}
                      testID={`home-move-visit-item-option-${visit.id}`}
                      title={visit.restaurantName}
                    />
                  );
                })}
              </OptionList>
            </ScrollView>

            {visitsQuery.hasNextPage ? (
              <Button
                label={
                  visitsQuery.isFetchingNextPage ? 'Loading more...' : 'Load More Visits'
                }
                loading={visitsQuery.isFetchingNextPage}
                onPress={() => {
                  void visitsQuery.fetchNextPage();
                }}
                style={styles.loadMoreButton}
                testID="home-move-visit-item-load-more"
                variant="secondary"
              />
            ) : null}
          </>
        )}
      </View>
    </Modal>
  );
}
