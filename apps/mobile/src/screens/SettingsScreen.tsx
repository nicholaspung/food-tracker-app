import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BackHeaderScreenScaffold, EmptyState, Skeleton, StatusPill } from '../components/shared';
import { getCollectionRecord, updateCollectionRecord } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type VisitVisibility = 'friends' | 'private';
type RestaurantVisibility = 'private' | 'friends' | 'public';

interface UserSettingsRecord {
  defaultVisitVisibility?: unknown;
  defaultRestaurantVisibility?: unknown;
}

interface UserSettings {
  visitVisibility: VisitVisibility;
  restaurantVisibility: RestaurantVisibility;
}

function normalizeVisitVisibility(value: unknown): VisitVisibility {
  return value === 'private' ? 'private' : 'friends';
}

function normalizeRestaurantVisibility(
  value: unknown,
  isAdmin: boolean,
): RestaurantVisibility {
  if (value === 'private' || value === 'friends') {
    return value;
  }

  if (value === 'public' && isAdmin) {
    return 'public';
  }

  return 'private';
}

function mapUserSettings(record: UserSettingsRecord, isAdmin: boolean): UserSettings {
  return {
    visitVisibility: normalizeVisitVisibility(record.defaultVisitVisibility),
    restaurantVisibility: normalizeRestaurantVisibility(record.defaultRestaurantVisibility, isAdmin),
  };
}

interface VisibilityOptionProps {
  iconName: IoniconName;
  iconColor: string;
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  badgeLabel?: string;
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();
  const isAdmin = user?.isAdmin === true;
  const [visitVisibility, setVisitVisibility] = useState<VisitVisibility>('friends');
  const [restaurantVisibility, setRestaurantVisibility] = useState<RestaurantVisibility>('private');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const settingsQuery = useQuery({
    enabled: Boolean(user?.id),
    queryKey: ['feature', 'settings', user?.id],
    queryFn: async (): Promise<UserSettings> => {
      if (!user?.id) {
        throw new Error('Authentication required.');
      }

      const record = await getCollectionRecord<UserSettingsRecord>('users', user.id);
      return mapUserSettings(record, isAdmin);
    },
  });

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    sectionCard: {
      gap: theme.spacing.xs,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    sectionDescription: {
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing.xs,
    },
    optionList: {
      gap: theme.spacing.xs,
    },
    optionCard: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 2,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    optionCardSelected: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
    },
    optionCardPressed: {
      backgroundColor: theme.colors.background.muted,
    },
    optionRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    optionContent: {
      flex: 1,
      gap: theme.spacing.xxs,
    },
    optionTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    optionLabel: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    optionDescription: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    radioOuter: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 2,
      height: 20,
      justifyContent: 'center',
      marginTop: 2,
      width: 20,
    },
    radioOuterSelected: {
      backgroundColor: theme.colors.text.brand,
      borderColor: theme.colors.text.brand,
    },
    radioInner: {
      backgroundColor: theme.colors.text.inverse,
      borderRadius: theme.radii.pill,
      height: 8,
      width: 8,
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setVisitVisibility(settingsQuery.data.visitVisibility);
    setRestaurantVisibility(settingsQuery.data.restaurantVisibility);
  }, [settingsQuery.data]);

  const hasPendingChanges = useMemo(() => {
    if (!settingsQuery.data) {
      return false;
    }

    return (
      visitVisibility !== settingsQuery.data.visitVisibility ||
      restaurantVisibility !== settingsQuery.data.restaurantVisibility
    );
  }, [restaurantVisibility, settingsQuery.data, visitVisibility]);

  const handleSaveSettings = async () => {
    if (!user?.id) {
      setErrorMessage('Authentication required.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await queueWrite('settings.visibility.save');

      const updatedRecord = await updateCollectionRecord<UserSettingsRecord>('users', user.id, {
        defaultRestaurantVisibility: restaurantVisibility,
        defaultVisitVisibility: visitVisibility,
      });

      const nextSettings = mapUserSettings(updatedRecord, isAdmin);
      queryClient.setQueryData(['feature', 'settings', user.id], nextSettings);
      await queryClient.invalidateQueries({ queryKey: ['feature', 'settings', user.id] });
      setSuccessMessage('Settings saved successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update settings.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectVisitVisibility = (value: VisitVisibility) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setVisitVisibility(value);
  };

  const handleSelectRestaurantVisibility = (value: RestaurantVisibility) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setRestaurantVisibility(value);
  };

  const renderVisibilityOption = ({
    iconName,
    iconColor,
    label,
    description,
    selected,
    onPress,
    badgeLabel,
  }: VisibilityOptionProps) => {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.optionCard,
          selected && styles.optionCardSelected,
          pressed && styles.optionCardPressed,
        ]}
      >
        <View style={styles.optionRow}>
          <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
            {selected ? <View style={styles.radioInner} /> : null}
          </View>
          <View style={styles.optionContent}>
            <View style={styles.optionTitleRow}>
              <Ionicons color={iconColor} name={iconName} size={16} />
              <Text style={styles.optionLabel}>{label}</Text>
              {badgeLabel ? (
                <StatusPill label={badgeLabel} tone="info" uppercase variant="soft" />
              ) : null}
            </View>
            <Text style={styles.optionDescription}>{description}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (!user?.id) {
    return (
      <BackHeaderScreenScaffold
        onBackPress={() => {
          navigation.navigate('Profile');
        }}
        subtitle="Set defaults for new visits and restaurants"
        title="Settings"
      >
        <View style={styles.body}>
          <PageErrorToast
            errorMessage="Please sign in again to view settings."
            title="Settings unavailable"
          />
          <EmptyState description="Please sign in again to view settings." title="Settings unavailable" />
        </View>
      </BackHeaderScreenScaffold>
    );
  }

  return (
    <BackHeaderScreenScaffold
      onBackPress={() => {
        navigation.navigate('Profile');
      }}
      subtitle="Set defaults for new visits and restaurants"
      title="Settings"
    >
      <View style={styles.body}>
        {settingsQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        <PageErrorToast
          errorMessage={settingsQuery.isError ? 'Could not load settings.' : null}
          title="Settings unavailable"
          actionLabel="Retry"
          onAction={() => {
            void settingsQuery.refetch();
          }}
        />

        {settingsQuery.isError ? (
          <EmptyState
            description="Could not load settings."
            actionLabel="Retry"
            onAction={() => {
              void settingsQuery.refetch();
            }}
            title="Settings unavailable"
          />
        ) : null}

        {!settingsQuery.isLoading && !settingsQuery.isError ? (
          <>
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Default Visit Visibility</Text>
              <Text style={styles.sectionDescription}>
                Choose who can see your visits by default. You can change this on each visit later.
              </Text>

              <View style={styles.optionList}>
                {renderVisibilityOption({
                  description: 'Friends can see your visits and the dishes you rated.',
                  iconColor: theme.colors.text.info,
                  iconName: 'people-outline',
                  label: 'Friends',
                  onPress: () => {
                    handleSelectVisitVisibility('friends');
                  },
                  selected: visitVisibility === 'friends',
                })}
                {renderVisibilityOption({
                  description: 'Only you can see your visits and ratings.',
                  iconColor: theme.colors.text.secondary,
                  iconName: 'lock-closed-outline',
                  label: 'Private',
                  onPress: () => {
                    handleSelectVisitVisibility('private');
                  },
                  selected: visitVisibility === 'private',
                })}
              </View>
            </Card>

            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Default Restaurant Visibility</Text>
              <Text style={styles.sectionDescription}>
                Choose who can see restaurants you add by default. You can change this per restaurant later.
              </Text>

              <View style={styles.optionList}>
                {renderVisibilityOption({
                  description: 'Only you can see restaurants you add.',
                  iconColor: theme.colors.text.secondary,
                  iconName: 'lock-closed-outline',
                  label: 'Private',
                  onPress: () => {
                    handleSelectRestaurantVisibility('private');
                  },
                  selected: restaurantVisibility === 'private',
                })}
                {renderVisibilityOption({
                  description: 'Friends can see restaurants you add.',
                  iconColor: theme.colors.text.info,
                  iconName: 'people-outline',
                  label: 'Friends',
                  onPress: () => {
                    handleSelectRestaurantVisibility('friends');
                  },
                  selected: restaurantVisibility === 'friends',
                })}
                {isAdmin
                  ? renderVisibilityOption({
                      badgeLabel: 'Admin',
                      description: 'Everyone can see restaurants you add.',
                      iconColor: theme.colors.text.success,
                      iconName: 'earth-outline',
                      label: 'Public',
                      onPress: () => {
                        handleSelectRestaurantVisibility('public');
                      },
                      selected: restaurantVisibility === 'public',
                    })
                  : null}
              </View>
            </Card>

            <PageErrorToast errorMessage={errorMessage} title="Settings update failed" />
            {successMessage ? (
              <Card tone="success">
                <Text tone="success" variant="label">
                  {successMessage}
                </Text>
              </Card>
            ) : null}

            <Button
              disabled={!hasPendingChanges || isSaving}
              label={isSaving ? 'Saving...' : 'Save Settings'}
              loading={isSaving}
              onPress={() => {
                void handleSaveSettings();
              }}
            />
          </>
        ) : null}
      </View>
    </BackHeaderScreenScaffold>
  );
}
