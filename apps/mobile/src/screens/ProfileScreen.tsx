import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import {
  ErrorState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  Skeleton,
  StatusPill,
  TabRootScreenScaffold,
} from '../components/shared';
import { getProfile, listFeedback, updateProfile } from '../features';
import { formatDisplayDate } from '../lib/dateFormatting';
import { getErrorMessage } from '../lib/errorUtils';
import { pb } from '../lib/pocketbase';
import { getSeenWhatsNewVersion, hasUnseenWhatsNew, WHATS_NEW_SEEN_QUERY_KEY } from '../lib/whatsNewState';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';

type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'Profile'>;
type ExpandablePanel = 'account' | 'invite' | 'danger';

interface InviteCode {
  id: string;
  code: string;
  locked?: boolean;
}

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const authRecord = pb.authStore.record as Record<string, unknown> | null;
  const isAdmin = user?.isAdmin === true;
  const isSubscriber = user?.isSubscriber === true;
  const isInitialUser = authRecord?.isInitialUser === true;

  const profileQuery = useQuery({
    queryKey: ['feature', 'profile'],
    queryFn: getProfile,
  });

  const feedbackQuery = useQuery({
    queryKey: ['feature', 'feedback'],
    queryFn: () => listFeedback({ status: 'all' }),
  });
  const pendingMenuReviewCountQuery = useQuery({
    enabled: isAdmin,
    queryKey: ['feature', 'admin', 'pending-menu-review-count'],
    queryFn: async (): Promise<number> => {
      const response = await pb.collection('menu_review_requests').getList(1, 1, {
        filter: 'status = "pending"',
      });

      return response.totalItems;
    },
  });
  const whatsNewSeenVersionQuery = useQuery({
    queryKey: WHATS_NEW_SEEN_QUERY_KEY,
    queryFn: getSeenWhatsNewVersion,
    staleTime: Infinity,
  });

  const [expandedPanels, setExpandedPanels] = useState<Record<ExpandablePanel, boolean>>({
    account: true,
    invite: false,
    danger: false,
  });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [inviteErrorMessage, setInviteErrorMessage] = useState<string | null>(null);
  const [isInviteLoading, setIsInviteLoading] = useState(true);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);
  const [activeInviteCodeId, setActiveInviteCodeId] = useState<string | null>(null);
  const [dangerErrorMessage, setDangerErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editedAccountName, setEditedAccountName] = useState('');
  const [accountNameErrorMessage, setAccountNameErrorMessage] = useState<string | null>(null);

  const fetchInviteCodes = async () => {
    setIsInviteLoading(true);
    setInviteErrorMessage(null);

    try {
      const response = await pb.send<{ codes?: InviteCode[] }>('/api/invite-codes', {
        method: 'GET',
      });

      setInviteCodes(response.codes ?? []);
    } catch (error) {
      setInviteErrorMessage(getErrorMessage(error, 'Could not load invite codes.'));
    } finally {
      setIsInviteLoading(false);
    }
  };

  useEffect(() => {
    void fetchInviteCodes();
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void pendingMenuReviewCountQuery.refetch();
      }
    }, [isAdmin, pendingMenuReviewCountQuery]),
  );

  const accountName = useMemo(() => {
    const profileName = profileQuery.data?.displayName?.trim() ?? '';
    if (profileName) {
      return profileName;
    }

    return user?.name ?? 'Not set';
  }, [profileQuery.data?.displayName, user?.name]);
  const editableAccountName = useMemo(() => {
    const profileName = profileQuery.data?.displayName?.trim() ?? '';
    if (profileName) {
      return profileName;
    }

    return user?.name?.trim() ?? '';
  }, [profileQuery.data?.displayName, user?.name]);

  const unreadFeedbackCount = useMemo(() => {
    return (feedbackQuery.data ?? []).reduce((count, feedbackItem) => {
      return count + (feedbackItem.status !== 'closed' ? 1 : 0);
    }, 0);
  }, [feedbackQuery.data]);
  const showWhatsNewDot = hasUnseenWhatsNew(whatsNewSeenVersionQuery.data);

  const accountCreated = formatDisplayDate(authRecord?.created, {
    fallback: 'Unknown',
  });

  useEffect(() => {
    if (!isEditingAccountName) {
      setEditedAccountName(editableAccountName);
    }
  }, [editableAccountName, isEditingAccountName]);

  const togglePanel = (panel: ExpandablePanel) => {
    setExpandedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  };

  const handleGenerateInviteCodes = async () => {
    setInviteErrorMessage(null);
    setIsGeneratingCodes(true);

    try {
      await pb.send('/api/invite-codes/generate', {
        method: 'POST',
      });
      await fetchInviteCodes();
    } catch (error) {
      setInviteErrorMessage(getErrorMessage(error, 'Could not generate invite codes.'));
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  const handleShareInviteCode = async (codeId: string, code: string) => {
    setInviteErrorMessage(null);
    setActiveInviteCodeId(codeId);

    try {
      const shareResult = await Share.share({
        message: `Use invite code ${code} to join Yummy Recs.`,
      });

      if (shareResult.action !== Share.sharedAction) {
        return;
      }

      await pb.send('/api/invite-codes/lock', {
        method: 'POST',
        body: { codeId },
      });

      await fetchInviteCodes();
    } catch (error) {
      setInviteErrorMessage(getErrorMessage(error, 'Could not share invite code.'));
    } finally {
      setActiveInviteCodeId(null);
    }
  };

  const updateAccountNameMutation = useMutation({
    mutationFn: async (nextName: string): Promise<string> => {
      const trimmedName = nextName.trim();
      if (!trimmedName) {
        throw new Error('Name cannot be empty.');
      }

      if (!user?.id) {
        throw new Error('Could not find user account.');
      }

      const updatedUserRecord = await pb.collection('users').update<RecordModel>(user.id, {
        name: trimmedName,
      });

      await updateProfile({
        displayName: trimmedName,
      });

      if (pb.authStore.token) {
        pb.authStore.save(pb.authStore.token, updatedUserRecord);
      }

      return trimmedName;
    },
    onSuccess: (nextName) => {
      setAccountNameErrorMessage(null);
      setIsEditingAccountName(false);
      setEditedAccountName(nextName);

      queryClient.setQueryData(['feature', 'profile'], (currentProfile: unknown) => {
        const profile =
          currentProfile && typeof currentProfile === 'object'
            ? (currentProfile as Record<string, unknown>)
            : {};

        return {
          ...profile,
          displayName: nextName,
        };
      });
    },
    onError: (error: unknown) => {
      setAccountNameErrorMessage(getErrorMessage(error, 'Could not update name.'));
    },
  });

  const handleStartEditAccountName = () => {
    setAccountNameErrorMessage(null);
    setEditedAccountName(editableAccountName);
    setIsEditingAccountName(true);
  };

  const handleCancelEditAccountName = () => {
    setAccountNameErrorMessage(null);
    setEditedAccountName(editableAccountName);
    setIsEditingAccountName(false);
  };

  const handleSaveAccountName = () => {
    const trimmedName = editedAccountName.trim();
    if (!trimmedName) {
      setAccountNameErrorMessage('Name cannot be empty.');
      return;
    }

    if (trimmedName === editableAccountName) {
      handleCancelEditAccountName();
      return;
    }

    setAccountNameErrorMessage(null);
    updateAccountNameMutation.mutate(trimmedName);
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      setDangerErrorMessage('Could not find user account.');
      return;
    }

    setDangerErrorMessage(null);
    setIsDeletingAccount(true);

    try {
      await pb.collection('users').delete(user.id);
      await signOut();
    } catch (error) {
      setDangerErrorMessage(getErrorMessage(error, 'Could not delete account.'));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: theme.colors.background.app,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    header: {
      backgroundColor: theme.colors.background.surface,
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    brandRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    logoBadge: {
      alignItems: 'center',
      borderColor: theme.colors.text.brand,
      borderRadius: theme.radii.pill,
      borderWidth: 2,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    brandLabel: {
      color: theme.colors.text.secondary,
      fontSize: 28,
      fontWeight: '700',
      lineHeight: 32,
    },
    subtitle: {
      color: theme.colors.text.muted,
    },
    body: {
      flex: 1,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
    },
    sectionCard: {
      gap: 0,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 24,
      marginBottom: theme.spacing.sm,
    },
    optionBadge: {
      alignItems: 'center',
      backgroundColor: theme.colors.text.danger,
      borderRadius: theme.radii.pill,
      justifyContent: 'center',
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    optionBadgeText: {
      color: theme.colors.text.inverse,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    optionDot: {
      backgroundColor: theme.colors.text.danger,
      borderRadius: theme.radii.pill,
      height: 8,
      width: 8,
    },
    sectionBody: {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
      padding: theme.spacing.md,
    },
    detailRow: {
      gap: 2,
    },
    detailHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    inlineEditRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    inlineEditInputContainer: {
      flex: 1,
    },
    detailLabel: {
      color: theme.colors.text.muted,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 17,
    },
    detailValue: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 22,
    },
    detailValueMono: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 17,
    },
    inlineIconActionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    inlineIconButton: {
      alignItems: 'center',
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    inlineIconButtonDisabled: {
      opacity: 0.5,
    },
    statusRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xxs,
    },
    inviteList: {
      gap: theme.spacing.sm,
    },
    inviteCodeCard: {
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
    },
    inviteCodeText: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 1.2,
      lineHeight: 20,
    },
    inviteCodeMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    dangerPanel: {
      backgroundColor: theme.colors.status.dangerBg,
      borderColor: theme.colors.border.danger,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
    },
    dangerTitle: {
      color: theme.colors.text.danger,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    dangerCopy: {
      color: theme.colors.text.danger,
    },
    logoutButton: {
      marginTop: theme.spacing.xs,
    },
  });

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (profileQuery.isError) {
    return (
      <Screen>
        <ErrorState
          description="Could not load profile."
          onRetry={() => {
            void profileQuery.refetch();
          }}
          title="Profile unavailable"
        />
      </Screen>
    );
  }

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      scrollUnderlayColor={theme.colors.background.app}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Ionicons color={theme.colors.text.brand} name="restaurant-outline" size={16} />
          </View>
          <Text style={styles.brandLabel}>Yummy Recs</Text>
        </View>
        <Text variant="titleMd">Profile</Text>
        <Text style={styles.subtitle}>Your account information</Text>
      </View>

      <View style={styles.body}>
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <OptionList>
            <OptionListRow
              iconName="chatbox-ellipses-outline"
              onPress={() => {
                navigation.navigate('Feedback');
              }}
              rightAccessory={
                unreadFeedbackCount > 0 ? (
                  <View style={styles.optionBadge}>
                    <Text style={styles.optionBadgeText}>{unreadFeedbackCount}</Text>
                  </View>
                ) : null
              }
              subtitle="Report issues and contact support"
              title="Feedback & Support"
            />
            <OptionListRow
              iconName="sparkles-outline"
              isLast
              onPress={() => {
                navigation.navigate('WhatsNew');
              }}
              rightAccessory={showWhatsNewDot ? <View style={styles.optionDot} /> : null}
              subtitle="Latest updates and product improvements"
              title="What's New"
            />
          </OptionList>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          <OptionList>
            <OptionListRow
              chevron={expandedPanels.account ? 'up' : 'down'}
              connected={expandedPanels.account}
              iconName="person-circle-outline"
              isLast={!expandedPanels.account}
              onPress={() => {
                togglePanel('account');
              }}
              subtitle="Name, email, status, and user info"
              title="Account Details"
            />

            {expandedPanels.account ? (
              <OptionListInlineBody>
                <View style={styles.detailRow}>
                  <View style={styles.detailHeaderRow}>
                    <Text style={styles.detailLabel}>Name</Text>
                    {!isEditingAccountName ? (
                      <Pressable
                        accessibilityLabel="Edit account name"
                        accessibilityRole="button"
                        onPress={handleStartEditAccountName}
                        style={({ pressed }) => [styles.inlineIconButton, pressed ? { opacity: 0.75 } : null]}
                      >
                        <Ionicons color={theme.colors.text.muted} name="create-outline" size={18} />
                      </Pressable>
                    ) : null}
                  </View>
                  {isEditingAccountName ? (
                    <>
                      <View style={styles.inlineEditRow}>
                        <Input
                          autoCapitalize="words"
                          autoCorrect={false}
                          containerStyle={styles.inlineEditInputContainer}
                          editable={!updateAccountNameMutation.isPending}
                          onChangeText={setEditedAccountName}
                          onSubmitEditing={handleSaveAccountName}
                          placeholder="Enter your name"
                          returnKeyType="done"
                          value={editedAccountName}
                        />
                        <View style={styles.inlineIconActionRow}>
                          <Pressable
                            accessibilityLabel="Save account name"
                            accessibilityRole="button"
                            disabled={updateAccountNameMutation.isPending}
                            onPress={handleSaveAccountName}
                            style={({ pressed }) => [
                              styles.inlineIconButton,
                              updateAccountNameMutation.isPending ? styles.inlineIconButtonDisabled : null,
                              pressed ? { opacity: 0.75 } : null,
                            ]}
                          >
                            {updateAccountNameMutation.isPending ? (
                              <ActivityIndicator color={theme.colors.text.success} size="small" />
                            ) : (
                              <Ionicons color={theme.colors.text.success} name="checkmark" size={18} />
                            )}
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Cancel editing account name"
                            accessibilityRole="button"
                            disabled={updateAccountNameMutation.isPending}
                            onPress={handleCancelEditAccountName}
                            style={({ pressed }) => [
                              styles.inlineIconButton,
                              updateAccountNameMutation.isPending ? styles.inlineIconButtonDisabled : null,
                              pressed ? { opacity: 0.75 } : null,
                            ]}
                          >
                            <Ionicons color={theme.colors.text.danger} name="close" size={18} />
                          </Pressable>
                        </View>
                      </View>
                      {accountNameErrorMessage ? <Text tone="danger">{accountNameErrorMessage}</Text> : null}
                    </>
                  ) : (
                    <Text style={styles.detailValue}>{accountName}</Text>
                  )}
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>{user?.email ?? 'Unknown'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>User ID</Text>
                  <Text style={styles.detailValueMono}>{user?.id ?? 'Unknown'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email Verified</Text>
                  <Text style={styles.detailValue}>{user?.verified ? 'Yes' : 'No'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Created</Text>
                  <Text style={styles.detailValue}>{accountCreated}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Status</Text>
                  <View style={styles.statusRow}>
                    {isAdmin ? <StatusPill label="Admin" size="md" tone="brand" variant="solid" /> : null}
                    {isSubscriber ? (
                      <StatusPill label="Subscriber" size="md" tone="info" variant="solid" />
                    ) : null}
                    {!isAdmin && !isSubscriber ? <Text tone="secondary">Free Account</Text> : null}
                  </View>
                </View>
              </OptionListInlineBody>
            ) : null}
          </OptionList>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>More Options</Text>
          <OptionList>
            <OptionListRow
              chevron={expandedPanels.invite ? 'up' : 'down'}
              connected={expandedPanels.invite}
              iconName="ticket-outline"
              onPress={() => {
                togglePanel('invite');
              }}
              subtitle="Share invite codes with friends"
              title="Invite Codes"
            />

            {expandedPanels.invite ? (
              <OptionListInlineBody withBottomDivider>
                {isInitialUser ? (
                  <Button
                    label={isGeneratingCodes ? 'Generating...' : 'Generate 5 More'}
                    loading={isGeneratingCodes}
                    onPress={() => {
                      void handleGenerateInviteCodes();
                    }}
                    variant="secondary"
                  />
                ) : null}

                {inviteErrorMessage ? (
                  <ErrorState
                    description={inviteErrorMessage}
                    onRetry={() => {
                      void fetchInviteCodes();
                    }}
                    title="Invite codes unavailable"
                  />
                ) : null}

                {isInviteLoading ? (
                  <>
                    <Skeleton height={16} />
                    <Skeleton height={16} />
                  </>
                ) : null}

                {!isInviteLoading && !inviteErrorMessage ? (
                  <View style={styles.inviteList}>
                    {inviteCodes.length === 0 ? (
                      <Text tone="muted">No invite codes available.</Text>
                    ) : (
                      inviteCodes.map((inviteCode) => (
                        <View key={inviteCode.id} style={styles.inviteCodeCard}>
                          <Text style={styles.inviteCodeText}>{inviteCode.code}</Text>
                          <Text style={styles.inviteCodeMeta}>
                            {inviteCode.locked ? 'Copied recently' : 'Available'}
                          </Text>
                          <Button
                            label={activeInviteCodeId === inviteCode.id ? 'Sharing...' : 'Share Invite'}
                            loading={activeInviteCodeId === inviteCode.id}
                            onPress={() => {
                              void handleShareInviteCode(inviteCode.id, inviteCode.code);
                            }}
                            variant="secondary"
                          />
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </OptionListInlineBody>
            ) : null}

            <OptionListRow
              iconName="settings-outline"
              onPress={() => {
                navigation.navigate('Settings');
              }}
              subtitle="App-level settings and controls"
              title="Settings"
            />

            {isAdmin ? (
              <OptionListRow
                iconName="shield-checkmark-outline"
                isLast
                onPress={() => {
                  navigation.navigate('AdminFeatures');
                }}
                rightAccessory={
                  (pendingMenuReviewCountQuery.data ?? 0) > 0 ? (
                    <View style={styles.optionBadge}>
                      <Text style={styles.optionBadgeText}>{pendingMenuReviewCountQuery.data}</Text>
                    </View>
                  ) : null
                }
                subtitle="Open admin-only tools"
                title="Admin Features"
              />
            ) : (
              <OptionListRow
                chevron={false}
                iconColor={theme.colors.text.muted}
                iconName="shield-outline"
                isLast
                subtitle="Hidden for non-admin accounts"
                title="Admin Features"
              />
            )}
          </OptionList>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <OptionList>
            <OptionListRow
              chevron={expandedPanels.danger ? 'up' : 'down'}
              iconColor={theme.colors.text.danger}
              iconName="trash-outline"
              isLast
              onPress={() => {
                togglePanel('danger');
              }}
              subtitle="Permanently remove your account"
              title="Delete Account"
            />
          </OptionList>

          {expandedPanels.danger ? (
            <View style={styles.sectionBody}>
              <View style={styles.dangerPanel}>
                <Text style={styles.dangerTitle}>This action is permanent</Text>
                <Text style={styles.dangerCopy}>
                  Deleting your account removes all associated data and cannot be undone.
                </Text>
              </View>

              {dangerErrorMessage ? (
                <ErrorState description={dangerErrorMessage} title="Delete account failed" />
              ) : null}

              {!showDeleteConfirm ? (
                <Button
                  label="Delete Account"
                  onPress={() => {
                    setShowDeleteConfirm(true);
                  }}
                />
              ) : (
                <>
                  <Button
                    disabled={isDeletingAccount}
                    label="Cancel"
                    onPress={() => {
                      setShowDeleteConfirm(false);
                    }}
                    variant="secondary"
                  />
                  <Button
                    disabled={isDeletingAccount}
                    label="Confirm Delete Account"
                    loading={isDeletingAccount}
                    onPress={() => {
                      void handleDeleteAccount();
                    }}
                  />
                </>
              )}
            </View>
          ) : null}
        </Card>

        <Button
          label="Log out"
          onPress={() => {
            void signOut();
          }}
          style={styles.logoutButton}
          variant="secondary"
        />
      </View>
    </TabRootScreenScaffold>
  );
}
