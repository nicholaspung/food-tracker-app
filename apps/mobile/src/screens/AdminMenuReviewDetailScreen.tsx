import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  FeatureDetailScreenScaffold,
  RoleBadge,
  Skeleton,
  StatusPill,
  VisibilityBadge,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import {
  deleteCollectionRecord,
  getCollectionRecord,
  listCollectionRecords,
  updateCollectionRecord,
} from '../features';
import { formatDisplayDate } from '../lib/dateFormatting';
import { getErrorMessage } from '../lib/errorUtils';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type AdminMenuReviewDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'AdminMenuReviewDetail'>;
type ReviewRequestStatus = 'reviewed' | 'dismissed';

interface MenuReviewRequestRecord {
  id: string;
  restaurant: string;
  requestedBy: string;
  reason?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  adminNotes?: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: {
      id: string;
      name?: string;
    };
    requestedBy?: {
      id: string;
      name?: string;
      email?: string;
    };
  };
}

interface MenuItemRecord {
  id: string;
  name: string;
  description?: string;
  visibility?: VisibilityOptionValue;
  isFromOCR?: boolean;
  created: string;
  updated: string;
}

interface EditingMenuItem {
  id: string;
  name: string;
  description: string;
  visibility: VisibilityOptionValue;
}

function normalizeMenuItemVisibility(value?: string): VisibilityOptionValue {
  if (value === 'private' || value === 'public') {
    return value;
  }

  return 'friends';
}

function truncateHeaderText(value: string, maxLength = 36): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function AdminMenuReviewDetailScreen({ navigation, route }: AdminMenuReviewDetailScreenProps) {
  const { requestId } = route.params;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const [editingItem, setEditingItem] = useState<EditingMenuItem | null>(null);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  const reviewRequestQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['feature', 'admin', 'menu-review-request', requestId],
    queryFn: async (): Promise<MenuReviewRequestRecord> => {
      return getCollectionRecord<MenuReviewRequestRecord>('menu_review_requests', requestId, {
        expand: 'restaurant,requestedBy',
      });
    },
  });

  const restaurantId = reviewRequestQuery.data?.restaurant;

  const menuItemsQuery = useQuery({
    enabled: isAdmin && Boolean(restaurantId),
    queryKey: ['feature', 'admin', 'menu-review-menu-items', restaurantId],
    queryFn: async (): Promise<MenuItemRecord[]> => {
      if (!restaurantId) {
        return [];
      }

      return listCollectionRecords<MenuItemRecord>('menu_items', {
        filter: `restaurant = "${restaurantId}"`,
        sort: 'name',
      });
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void reviewRequestQuery.refetch();
        void menuItemsQuery.refetch();
      }
    }, [isAdmin, menuItemsQuery, reviewRequestQuery]),
  );

  useEffect(() => {
    if (!reviewRequestQuery.data) {
      return;
    }

    setAdminNotes(reviewRequestQuery.data.adminNotes?.trim() ?? '');
  }, [reviewRequestQuery.data]);

  const updateMenuItemMutation = useMutation({
    mutationFn: async (payload: {
      itemId: string;
      name: string;
      description: string;
      visibility: VisibilityOptionValue;
    }): Promise<MenuItemRecord> => {
      return updateCollectionRecord<MenuItemRecord>('menu_items', payload.itemId, {
        name: payload.name.trim(),
        description: payload.description.trim(),
        visibility: payload.visibility,
      });
    },
    onSuccess: async () => {
      setActionErrorMessage(null);
      setEditingItem(null);
      if (restaurantId) {
        await queryClient.invalidateQueries({
          queryKey: ['feature', 'admin', 'menu-review-menu-items', restaurantId],
        });
      }
    },
    onError: (error: unknown) => {
      setActionErrorMessage(getErrorMessage(error, 'Could not update menu item.'));
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (itemId: string): Promise<void> => {
      await deleteCollectionRecord('menu_items', itemId);
    },
    onSuccess: async () => {
      setActionErrorMessage(null);
      setPendingDeleteItemId(null);
      if (restaurantId) {
        await queryClient.invalidateQueries({
          queryKey: ['feature', 'admin', 'menu-review-menu-items', restaurantId],
        });
      }
    },
    onError: (error: unknown) => {
      setActionErrorMessage(getErrorMessage(error, 'Could not delete menu item.'));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: {
      status: ReviewRequestStatus;
      notes: string;
    }): Promise<MenuReviewRequestRecord> => {
      return updateCollectionRecord<MenuReviewRequestRecord>('menu_review_requests', requestId, {
        status: payload.status,
        adminNotes: payload.notes.trim(),
      });
    },
    onSuccess: async () => {
      setActionErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['feature', 'admin', 'menu-review-requests'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['feature', 'admin', 'pending-menu-review-count'],
        }),
      ]);

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('AdminMenuReviews');
      }
    },
    onError: (error: unknown) => {
      setActionErrorMessage(getErrorMessage(error, 'Could not update review request.'));
    },
  });

  const handleSaveMenuItem = () => {
    if (!editingItem) {
      return;
    }

    if (!editingItem.name.trim()) {
      setActionErrorMessage('Menu item name cannot be empty.');
      return;
    }

    setActionErrorMessage(null);
    updateMenuItemMutation.mutate({
      itemId: editingItem.id,
      name: editingItem.name,
      description: editingItem.description,
      visibility: editingItem.visibility,
    });
  };

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('AdminMenuReviews');
  };

  const headerRestaurantName = reviewRequestQuery.data?.expand?.restaurant?.name?.trim() || 'Menu Review';
  const headerStatusLabel =
    reviewRequestQuery.data?.status === 'reviewed'
      ? 'Reviewed'
      : reviewRequestQuery.data?.status === 'dismissed'
        ? 'Dismissed'
        : 'Pending';
  const headerTitle = reviewRequestQuery.data
    ? truncateHeaderText(headerRestaurantName)
    : 'Menu Review';
  const headerSubtitle = reviewRequestQuery.data
    ? `Menu Review · ${headerStatusLabel}`
    : 'Review and moderate the flagged restaurant menu.';
  const reviewReporterLabel =
    reviewRequestQuery.data?.expand?.requestedBy?.name?.trim() ||
    reviewRequestQuery.data?.expand?.requestedBy?.email?.trim() ||
    reviewRequestQuery.data?.requestedBy ||
    'Unknown user';
  const reviewCreatedDate = reviewRequestQuery.data?.created
    ? formatDisplayDate(reviewRequestQuery.data.created, {
        fallback: 'Unknown date',
        options: {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        },
      })
    : 'Unknown date';
  const reviewReason = reviewRequestQuery.data?.reason?.trim();

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    reviewSummaryCard: {
      gap: theme.spacing.sm,
    },
    reviewSummaryHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.xs,
    },
    reviewSummaryHeaderText: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    reviewSummaryLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    requestMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    requestMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    requestMetaChip: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 4,
    },
    requestMetaChipLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      lineHeight: 16,
    },
    reasonCard: {
      gap: theme.spacing.xxs,
    },
    reasonLabel: {
      color: theme.colors.text.warning,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    reasonText: {
      color: theme.colors.text.primary,
      fontSize: 13,
      lineHeight: 18,
    },
    menuItemsSection: {
      gap: theme.spacing.sm,
    },
    menuItemsSectionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    menuItemsSectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
    },
    menuItemsCount: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    menuItemCard: {
      gap: theme.spacing.sm,
    },
    menuItemTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    menuItemDescription: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    menuItemMeta: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'space-between',
    },
    menuItemMetaText: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    menuItemBadgeRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    visibilitySection: {
      gap: theme.spacing.xxs,
    },
    rowActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    rowActionButton: {
      flex: 1,
    },
    compactActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    compactActionButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      height: 30,
      justifyContent: 'center',
      width: 30,
    },
    compactActionDanger: {
      borderColor: theme.colors.border.danger,
    },
    destructiveButton: {
      backgroundColor: theme.colors.text.danger,
    },
    editInput: {
      minHeight: 64,
      textAlignVertical: 'top',
    },
    deleteConfirmCard: {
      gap: theme.spacing.xs,
    },
    deleteConfirmText: {
      color: theme.colors.text.danger,
      fontSize: 12,
      lineHeight: 16,
    },
    reviewActionsCard: {
      gap: theme.spacing.sm,
    },
    notesInput: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
    statusActionRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    statusActionButton: {
      flex: 1,
    },
  });

  return (
    <FeatureDetailScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      rightAccessory={isAdmin ? <RoleBadge /> : undefined}
      subtitle={headerSubtitle}
      title={headerTitle}
    >
      {!isAdmin ? (
        <EmptyState
          actionLabel="Back to Profile"
          description="This route is restricted to admin users."
          onAction={() => {
            navigation.navigate('Profile');
          }}
          title="Access denied"
        />
      ) : null}

      {isAdmin && reviewRequestQuery.isLoading ? (
        <>
          <Skeleton height={20} />
          <Skeleton height={20} />
        </>
      ) : null}

      <PageErrorToast
        errorMessage={isAdmin && reviewRequestQuery.isError ? 'Could not load this review request.' : null}
        title="Review unavailable"
        actionLabel="Retry"
        onAction={() => {
          void reviewRequestQuery.refetch();
        }}
      />

      {isAdmin && !reviewRequestQuery.isLoading && !reviewRequestQuery.isError && !reviewRequestQuery.data ? (
        <EmptyState
          actionLabel="Back to Menu Reviews"
          description="The review request no longer exists or has already been processed."
          onAction={() => {
            navigation.navigate('AdminMenuReviews');
          }}
          title="Review not found"
        />
      ) : null}

      {isAdmin && reviewRequestQuery.data ? (
        <>
          <Card style={styles.reviewSummaryCard}>
            <View style={styles.reviewSummaryHeader}>
              <View style={styles.reviewSummaryHeaderText}>
                <Text style={styles.reviewSummaryLabel}>Review Details</Text>
                <Text style={styles.requestMeta}>This request is for the restaurant shown in the header.</Text>
              </View>
              <StatusPill
                label={headerStatusLabel}
                tone={
                  reviewRequestQuery.data.status === 'reviewed'
                    ? 'success'
                    : reviewRequestQuery.data.status === 'dismissed'
                      ? 'muted'
                      : 'warning'
                }
                uppercase
                variant="soft"
              />
            </View>

            <View style={styles.requestMetaRow}>
              <View style={styles.requestMetaChip}>
                <Ionicons color={theme.colors.text.muted} name="person-outline" size={14} />
                <Text style={styles.requestMetaChipLabel}>{reviewReporterLabel}</Text>
              </View>
              <View style={styles.requestMetaChip}>
                <Ionicons color={theme.colors.text.muted} name="calendar-outline" size={14} />
                <Text style={styles.requestMetaChipLabel}>{reviewCreatedDate}</Text>
              </View>
            </View>

            {reviewReason ? (
              <Card style={styles.reasonCard} tone="warning">
                <Text style={styles.reasonLabel}>Reason for report</Text>
                <Text style={styles.reasonText}>{reviewReason}</Text>
              </Card>
            ) : (
              <Card tone="info">
                <Text tone="secondary">No reason was provided with this report.</Text>
              </Card>
            )}
          </Card>

          <PageErrorToast
            errorMessage={actionErrorMessage}
            title="Admin action failed"
          />

          <Card style={styles.menuItemsSection}>
            <View style={styles.menuItemsSectionHeader}>
              <Text style={styles.menuItemsSectionTitle}>Menu Items</Text>
              {!menuItemsQuery.isLoading && !menuItemsQuery.isError ? (
                <Text style={styles.menuItemsCount}>{menuItemsQuery.data?.length ?? 0}</Text>
              ) : null}
            </View>

            {menuItemsQuery.isLoading ? (
              <>
                <Skeleton height={20} />
                <Skeleton height={20} />
              </>
            ) : null}

            <PageErrorToast
              errorMessage={menuItemsQuery.isError ? 'Could not load menu items for this restaurant.' : null}
              title="Menu items unavailable"
              actionLabel="Retry"
              onAction={() => {
                void menuItemsQuery.refetch();
              }}
            />

            {!menuItemsQuery.isLoading && !menuItemsQuery.isError && (menuItemsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                description="No menu items were found for this restaurant."
                icon={<Ionicons color={theme.colors.text.muted} name="list-outline" size={24} />}
                title="No menu items"
              />
            ) : null}

            {!menuItemsQuery.isLoading && !menuItemsQuery.isError
              ? menuItemsQuery.data?.map((menuItem) => {
                  const isEditing = editingItem?.id === menuItem.id;
                  const isConfirmingDelete = pendingDeleteItemId === menuItem.id;

                  return (
                    <Card key={menuItem.id} style={styles.menuItemCard} tone="muted">
                      {isEditing && editingItem ? (
                        <>
                          <Input
                            label="Name"
                            onChangeText={(value) => {
                              setEditingItem({
                                ...editingItem,
                                name: value,
                              });
                            }}
                            value={editingItem.name}
                          />
                          <Input
                            inputStyle={styles.editInput}
                            label="Description"
                            multiline
                            numberOfLines={3}
                            onChangeText={(value) => {
                              setEditingItem({
                                ...editingItem,
                                description: value,
                              });
                            }}
                            value={editingItem.description}
                          />
                          <View style={styles.visibilitySection}>
                            <Text variant="label">Visibility</Text>
                            <VisibilityOptionSelector
                              communityLabel="Public"
                              onChange={(value) => {
                                setEditingItem({
                                  ...editingItem,
                                  visibility: value,
                                });
                              }}
                              value={editingItem.visibility}
                            />
                          </View>
                          <View style={styles.rowActions}>
                            <Button
                              disabled={updateMenuItemMutation.isPending}
                              label={updateMenuItemMutation.isPending ? 'Saving...' : 'Save'}
                              onPress={handleSaveMenuItem}
                              style={styles.rowActionButton}
                            />
                            <Button
                              disabled={updateMenuItemMutation.isPending}
                              label="Cancel"
                              onPress={() => {
                                setEditingItem(null);
                              }}
                              style={styles.rowActionButton}
                              variant="secondary"
                            />
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.menuItemMeta}>
                            <View style={styles.menuItemMetaText}>
                              <Text style={styles.menuItemTitle}>{menuItem.name}</Text>
                              <View style={styles.menuItemBadgeRow}>
                                <VisibilityBadge
                                  communityLabel="Public"
                                  value={normalizeMenuItemVisibility(menuItem.visibility)}
                                />
                                <StatusPill
                                  label={menuItem.isFromOCR ? 'OCR' : 'Manual'}
                                  tone={menuItem.isFromOCR ? 'info' : 'muted'}
                                  variant="soft"
                                />
                              </View>
                            </View>
                            <View style={styles.compactActions}>
                              <Pressable
                                accessibilityLabel={`Edit ${menuItem.name}`}
                                disabled={deleteMenuItemMutation.isPending}
                                onPress={() => {
                                  setPendingDeleteItemId(null);
                                  setEditingItem({
                                    id: menuItem.id,
                                    name: menuItem.name,
                                    description: menuItem.description ?? '',
                                    visibility: normalizeMenuItemVisibility(menuItem.visibility),
                                  });
                                }}
                                style={({ pressed }) => [
                                  styles.compactActionButton,
                                  pressed && !deleteMenuItemMutation.isPending ? { opacity: 0.75 } : null,
                                ]}
                              >
                                <Ionicons color={theme.colors.text.secondary} name="create-outline" size={16} />
                              </Pressable>
                              <Pressable
                                accessibilityLabel={
                                  isConfirmingDelete
                                    ? `Cancel delete ${menuItem.name}`
                                    : `Delete ${menuItem.name}`
                                }
                                disabled={deleteMenuItemMutation.isPending}
                                onPress={() => {
                                  setEditingItem(null);
                                  setPendingDeleteItemId(isConfirmingDelete ? null : menuItem.id);
                                }}
                                style={({ pressed }) => [
                                  styles.compactActionButton,
                                  !isConfirmingDelete ? styles.compactActionDanger : null,
                                  pressed && !deleteMenuItemMutation.isPending ? { opacity: 0.75 } : null,
                                ]}
                              >
                                <Ionicons
                                  color={
                                    isConfirmingDelete
                                      ? theme.colors.text.secondary
                                      : theme.colors.text.danger
                                  }
                                  name={isConfirmingDelete ? 'close-outline' : 'trash-outline'}
                                  size={16}
                                />
                              </Pressable>
                            </View>
                          </View>
                          {menuItem.description?.trim() ? (
                            <Text style={styles.menuItemDescription}>{menuItem.description.trim()}</Text>
                          ) : null}
                        </>
                      )}

                      {isConfirmingDelete ? (
                        <Card style={styles.deleteConfirmCard} tone="danger">
                          <Text style={styles.deleteConfirmText}>
                            Delete this menu item permanently?
                          </Text>
                          <View style={styles.rowActions}>
                            <Button
                              disabled={deleteMenuItemMutation.isPending}
                              label="Keep Item"
                              onPress={() => {
                                setPendingDeleteItemId(null);
                              }}
                              style={styles.rowActionButton}
                              variant="secondary"
                            />
                            <Button
                              disabled={deleteMenuItemMutation.isPending}
                              label={deleteMenuItemMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
                              onPress={() => {
                                setActionErrorMessage(null);
                                deleteMenuItemMutation.mutate(menuItem.id);
                              }}
                              style={[styles.rowActionButton, styles.destructiveButton]}
                            />
                          </View>
                        </Card>
                      ) : null}
                    </Card>
                  );
                })
              : null}
          </Card>

          <Card style={styles.reviewActionsCard}>
            <Text variant="label">Review Action</Text>
            <Input
              inputStyle={styles.notesInput}
              label="Admin Notes (required for Mark Reviewed)"
              multiline
              numberOfLines={3}
              onChangeText={setAdminNotes}
              placeholder="Add notes before resolving this review"
              value={adminNotes}
            />
            <View style={styles.statusActionRow}>
              <Button
                disabled={updateStatusMutation.isPending || !adminNotes.trim()}
                label={updateStatusMutation.isPending ? 'Updating...' : 'Mark Reviewed'}
                onPress={() => {
                  const trimmedNotes = adminNotes.trim();
                  if (!trimmedNotes) {
                    setActionErrorMessage('Admin note is required before marking as reviewed.');
                    return;
                  }

                  setActionErrorMessage(null);
                  updateStatusMutation.mutate({
                    status: 'reviewed',
                    notes: trimmedNotes,
                  });
                }}
                style={styles.statusActionButton}
              />
              <Button
                disabled={updateStatusMutation.isPending}
                label={updateStatusMutation.isPending ? 'Updating...' : 'Dismiss'}
                onPress={() => {
                  setActionErrorMessage(null);
                  updateStatusMutation.mutate({
                    status: 'dismissed',
                    notes: adminNotes,
                  });
                }}
                style={styles.statusActionButton}
                variant="secondary"
              />
            </View>
          </Card>
        </>
      ) : null}
    </FeatureDetailScreenScaffold>
  );
}
