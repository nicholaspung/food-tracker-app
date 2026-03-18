import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecordModel } from 'pocketbase';

import {
  ErrorState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  Skeleton,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
} from '../components/shared';
import {
  deleteCollectionRecord,
  getAuthRecord,
  getProfile,
  listFeedback,
  saveAuthRecord,
  sendApiRequest,
  updateCollectionRecord,
  updateProfile,
} from '../features';
import { formatDisplayDate } from '../lib/dateFormatting';
import { getErrorMessage } from '../lib/errorUtils';
import {
  getSeenWhatsNewVersion,
  hasUnseenWhatsNew,
  WHATS_NEW_SEEN_QUERY_KEY,
} from '../lib/whatsNewState';
import { formatAppVersionLabel } from '../lib/appMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'Profile'>;
type ExpandablePanel = 'account' | 'invite' | 'danger';

interface InviteCode {
  id: string;
  code: string;
  locked?: boolean;
}

const INVITE_SIGNUP_DEEP_LINK_PREFIX = 'yummyrecs://signup?code=';

function buildInviteShareMessage(code: string): string {
  const signupUrl = `${INVITE_SIGNUP_DEEP_LINK_PREFIX}${encodeURIComponent(code)}`;

  return [
    "Hey! You're invited to join our app!",
    '',
    'Use this link to sign up:',
    signupUrl,
    '',
    `Your invite code: ${code}`,
    '',
    'Looking forward to seeing you there!',
  ].join('\n');
}

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { actualUser, user, signOut } = useAuth();
  const authRecord = getAuthRecord();
  const isAdmin = actualUser?.isAdmin === true;
  const isSubscriber = actualUser?.isSubscriber === true;
  const isBetaUser = actualUser?.isBetaUser === true;
  const isInitialUser = authRecord?.isInitialUser === true;

  const profileQuery = useQuery({
    queryKey: ["feature", "profile"],
    queryFn: getProfile,
  });

  const feedbackQuery = useQuery({
    queryKey: ["feature", "feedback"],
    queryFn: () => listFeedback({ status: "all" }),
  });
  const whatsNewSeenVersionQuery = useQuery({
    queryKey: WHATS_NEW_SEEN_QUERY_KEY,
    queryFn: getSeenWhatsNewVersion,
    staleTime: Infinity,
  });

  const [expandedPanels, setExpandedPanels] = useState<
    Record<ExpandablePanel, boolean>
  >({
    account: true,
    invite: false,
    danger: false,
  });
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [inviteErrorMessage, setInviteErrorMessage] = useState<string | null>(
    null,
  );
  const [isInviteLoading, setIsInviteLoading] = useState(true);
  const [isGeneratingCodes, setIsGeneratingCodes] = useState(false);
  const [activeInviteCodeId, setActiveInviteCodeId] = useState<string | null>(
    null,
  );
  const [dangerErrorMessage, setDangerErrorMessage] = useState<string | null>(
    null,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editedAccountName, setEditedAccountName] = useState("");
  const [accountNameErrorMessage, setAccountNameErrorMessage] = useState<
    string | null
  >(null);

  const fetchInviteCodes = async () => {
    setIsInviteLoading(true);
    setInviteErrorMessage(null);

    try {
      const response = await sendApiRequest<{ codes?: InviteCode[] }>(
        "/api/invite-codes",
        {
          method: "GET",
        },
      );

      setInviteCodes(response.codes ?? []);
    } catch (error) {
      setInviteErrorMessage(
        getErrorMessage(error, "Could not load invite codes."),
      );
    } finally {
      setIsInviteLoading(false);
    }
  };

  useEffect(() => {
    void fetchInviteCodes();
  }, [user?.id]);

  const accountName = useMemo(() => {
    const profileName = profileQuery.data?.displayName?.trim() ?? "";
    if (profileName) {
      return profileName;
    }

    return user?.name ?? "Not set";
  }, [profileQuery.data?.displayName, user?.name]);
  const editableAccountName = useMemo(() => {
    const profileName = profileQuery.data?.displayName?.trim() ?? "";
    if (profileName) {
      return profileName;
    }

    return user?.name?.trim() ?? "";
  }, [profileQuery.data?.displayName, user?.name]);

  const unreadFeedbackCount = useMemo(() => {
    return (feedbackQuery.data ?? []).reduce((count, feedbackItem) => {
      return count + (feedbackItem.status !== "closed" ? 1 : 0);
    }, 0);
  }, [feedbackQuery.data]);
  const showWhatsNewDot = hasUnseenWhatsNew(whatsNewSeenVersionQuery.data);
  const appVersionLabel = formatAppVersionLabel();

  const accountCreated = formatDisplayDate(authRecord?.created, {
    fallback: "Unknown",
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
    trackObservabilityEvent("PROFILE_INVITE_CODES_GENERATE_STARTED", {
      source: "ProfileScreen",
    });
    setInviteErrorMessage(null);
    setIsGeneratingCodes(true);

    try {
      await sendApiRequest("/api/invite-codes/generate", {
        method: "POST",
      });
      await fetchInviteCodes();
      trackObservabilityEvent("PROFILE_INVITE_CODES_GENERATE_COMPLETED", {
        source: "ProfileScreen",
      });
    } catch (error) {
      trackObservabilityEvent("PROFILE_INVITE_CODES_GENERATE_FAILED", {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : "unknown_error",
        source: "ProfileScreen",
      });
      setInviteErrorMessage(
        getErrorMessage(error, "Could not generate invite codes."),
      );
    } finally {
      setIsGeneratingCodes(false);
    }
  };

  const handleShareInviteCode = async (codeId: string, code: string) => {
    trackObservabilityEvent("PROFILE_INVITE_CODE_SHARE_STARTED", {
      codeId,
      source: "ProfileScreen",
    });
    setInviteErrorMessage(null);
    setActiveInviteCodeId(codeId);

    try {
      const shareResult = await Share.share({
        message: buildInviteShareMessage(code),
      });

      if (shareResult.action !== Share.sharedAction) {
        trackObservabilityEvent("PROFILE_INVITE_CODE_SHARE_CANCELED", {
          codeId,
          source: "ProfileScreen",
        });
        return;
      }

      await sendApiRequest("/api/invite-codes/lock", {
        method: "POST",
        body: { codeId },
      });

      await fetchInviteCodes();
      trackObservabilityEvent("PROFILE_INVITE_CODE_SHARE_COMPLETED", {
        codeId,
        source: "ProfileScreen",
      });
    } catch (error) {
      trackObservabilityEvent("PROFILE_INVITE_CODE_SHARE_FAILED", {
        codeId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : "unknown_error",
        source: "ProfileScreen",
      });
      setInviteErrorMessage(
        getErrorMessage(error, "Could not share invite code."),
      );
    } finally {
      setActiveInviteCodeId(null);
    }
  };

  const updateAccountNameMutation = useMutation({
    mutationFn: async (nextName: string): Promise<string> => {
      const trimmedName = nextName.trim();
      if (!trimmedName) {
        throw new Error("Name cannot be empty.");
      }

      if (!user?.id) {
        throw new Error("Could not find user account.");
      }

      const updatedUserRecord = await updateCollectionRecord<RecordModel>(
        "users",
        user.id,
        {
          name: trimmedName,
        },
      );

      await updateProfile({
        displayName: trimmedName,
      });

      saveAuthRecord(updatedUserRecord);

      return trimmedName;
    },
    onSuccess: (nextName) => {
      setAccountNameErrorMessage(null);
      setIsEditingAccountName(false);
      setEditedAccountName(nextName);

      queryClient.setQueryData(
        ["feature", "profile"],
        (currentProfile: unknown) => {
          const profile =
            currentProfile && typeof currentProfile === "object"
              ? (currentProfile as Record<string, unknown>)
              : {};

          return {
            ...profile,
            displayName: nextName,
          };
        },
      );
    },
    onError: (error: unknown) => {
      setAccountNameErrorMessage(
        getErrorMessage(error, "Could not update name."),
      );
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
      setAccountNameErrorMessage("Name cannot be empty.");
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
      setDangerErrorMessage("Could not find user account.");
      return;
    }

    setDangerErrorMessage(null);
    setIsDeletingAccount(true);

    try {
      await deleteCollectionRecord("users", user.id);
      await signOut();
    } catch (error) {
      setDangerErrorMessage(
        getErrorMessage(error, "Could not delete account."),
      );
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
      fontWeight: "700",
      lineHeight: 24,
      marginBottom: theme.spacing.sm,
    },
    optionBadge: {
      alignItems: "center",
      backgroundColor: theme.colors.text.danger,
      borderRadius: theme.radii.pill,
      justifyContent: "center",
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    optionBadgeText: {
      color: theme.colors.text.inverse,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16,
    },
    optionDot: {
      backgroundColor: theme.colors.text.danger,
      borderRadius: theme.radii.pill,
      height: 8,
      width: 8,
    },
    optionMetaText: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16,
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
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    inlineEditRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    inlineEditInputContainer: {
      flex: 1,
    },
    detailLabel: {
      color: theme.colors.text.muted,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 17,
    },
    detailValue: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 22,
    },
    detailValueMono: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 17,
    },
    inlineIconActionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    inlineIconButton: {
      alignItems: "center",
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    inlineIconButtonDisabled: {
      opacity: 0.5,
    },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
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
    inviteCodeCardLocked: {
      backgroundColor: theme.colors.status.warningBg,
      borderColor: theme.colors.border.warning,
    },
    inviteCodeText: {
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 1.2,
      lineHeight: 20,
    },
    inviteCodeMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    inviteCodeMetaLocked: {
      color: theme.colors.text.warning,
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
      fontWeight: "700",
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
      testID="profile-screen"
    >
      <TabBrandHeader subtitle="Your account information" title="Profile" />

      <View style={styles.body}>
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <OptionList>
            <OptionListRow
              iconName="chatbox-ellipses-outline"
              onPress={() => {
                navigation.navigate("Feedback");
              }}
              rightAccessory={
                unreadFeedbackCount > 0 ? (
                  <View style={styles.optionBadge}>
                    <Text style={styles.optionBadgeText}>
                      {unreadFeedbackCount}
                    </Text>
                  </View>
                ) : null
              }
              subtitle="Report issues and contact support"
              testID="profile-feedback-link"
              title="Feedback & Support"
            />
            <OptionListRow
              iconName="sparkles-outline"
              onPress={() => {
                navigation.navigate("WhatsNew");
              }}
              rightAccessory={
                showWhatsNewDot ? <View style={styles.optionDot} /> : null
              }
              subtitle="Latest updates and product improvements"
              testID="profile-whats-new-link"
              title="What's New"
            />
            <OptionListRow
              iconName="information-circle-outline"
              isLast
              onPress={() => {
                navigation.navigate("About");
              }}
              rightAccessory={
                <Text style={styles.optionMetaText}>{appVersionLabel}</Text>
              }
              subtitle="Current version, legal information, and app details"
              testID="profile-about-link"
              title="About"
            />
          </OptionList>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          <OptionList>
            <OptionListRow
              chevron={expandedPanels.account ? "up" : "down"}
              connected={expandedPanels.account}
              iconName="person-circle-outline"
              isLast={!expandedPanels.account}
              onPress={() => {
                togglePanel("account");
              }}
              subtitle="Name, email, status, and user info"
              testID="profile-account-details-toggle"
              title="Account Details"
            />

            {expandedPanels.account ? (
              <OptionListInlineBody testID="profile-account-details-panel">
                <View style={styles.detailRow}>
                  <View style={styles.detailHeaderRow}>
                    <Text style={styles.detailLabel}>Name</Text>
                    {!isEditingAccountName ? (
                      <Pressable
                        accessibilityLabel="Edit account name"
                        accessibilityRole="button"
                        onPress={handleStartEditAccountName}
                        style={({ pressed }) => [
                          styles.inlineIconButton,
                          pressed ? { opacity: 0.75 } : null,
                        ]}
                        testID="profile-edit-account-name-button"
                      >
                        <Ionicons
                          color={theme.colors.text.muted}
                          name="create-outline"
                          size={18}
                        />
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
                          testID="profile-account-name-input"
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
                              updateAccountNameMutation.isPending
                                ? styles.inlineIconButtonDisabled
                                : null,
                              pressed ? { opacity: 0.75 } : null,
                            ]}
                          >
                            {updateAccountNameMutation.isPending ? (
                              <ActivityIndicator
                                color={theme.colors.text.success}
                                size="small"
                              />
                            ) : (
                              <Ionicons
                                color={theme.colors.text.success}
                                name="checkmark"
                                size={18}
                              />
                            )}
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Cancel editing account name"
                            accessibilityRole="button"
                            disabled={updateAccountNameMutation.isPending}
                            onPress={handleCancelEditAccountName}
                            style={({ pressed }) => [
                              styles.inlineIconButton,
                              updateAccountNameMutation.isPending
                                ? styles.inlineIconButtonDisabled
                                : null,
                              pressed ? { opacity: 0.75 } : null,
                            ]}
                            testID="profile-cancel-edit-account-name-button"
                          >
                            <Ionicons
                              color={theme.colors.text.danger}
                              name="close"
                              size={18}
                            />
                          </Pressable>
                        </View>
                      </View>
                      {accountNameErrorMessage ? (
                        <Text tone="danger">{accountNameErrorMessage}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.detailValue}>{accountName}</Text>
                  )}
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>
                    {user?.email ?? "Unknown"}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email Verified</Text>
                  <Text style={styles.detailValue}>
                    {user?.verified ? "Yes" : "No"}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Created</Text>
                  <Text style={styles.detailValue}>{accountCreated}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Membership</Text>
                  <View style={styles.statusRow}>
                    {isAdmin ? (
                      <StatusPill
                        label="Admin"
                        size="md"
                        tone="brand"
                        variant="solid"
                      />
                    ) : null}
                    {isBetaUser ? (
                      <StatusPill
                        label="Beta"
                        size="md"
                        tone="warning"
                        variant="solid"
                      />
                    ) : null}
                    {isSubscriber ? (
                      <StatusPill
                        label="Subscriber"
                        size="md"
                        tone="info"
                        variant="solid"
                      />
                    ) : null}
                    {!isSubscriber ? (
                      <Text tone="secondary">Standard Account</Text>
                    ) : null}
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
              chevron={expandedPanels.invite ? "up" : "down"}
              connected={expandedPanels.invite}
              iconName="ticket-outline"
              onPress={() => {
                togglePanel("invite");
              }}
              subtitle="Share invite codes with friends"
              testID="profile-invite-codes-toggle"
              title="Invite Codes"
            />

            {expandedPanels.invite ? (
              <OptionListInlineBody testID="profile-invite-codes-panel" withBottomDivider>
                {isInitialUser ? (
                  <Button
                    label={
                      isGeneratingCodes ? "Generating..." : "Generate 5 More"
                    }
                    loading={isGeneratingCodes}
                    onPress={() => {
                      void handleGenerateInviteCodes();
                    }}
                    variant="secondary"
                  />
                ) : null}

                <PageErrorToast
                  errorMessage={inviteErrorMessage}
                  title="Invite codes unavailable"
                  actionLabel="Retry"
                  onAction={() => {
                    void fetchInviteCodes();
                  }}
                />

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
                        <View
                          key={inviteCode.id}
                          style={[
                            styles.inviteCodeCard,
                            inviteCode.locked ? styles.inviteCodeCardLocked : null,
                          ]}
                        >
                          <Text style={styles.inviteCodeText}>
                            {inviteCode.code}
                          </Text>
                          <Text
                            style={[
                              styles.inviteCodeMeta,
                              inviteCode.locked ? styles.inviteCodeMetaLocked : null,
                            ]}
                          >
                            {inviteCode.locked
                              ? "Copied recently"
                              : "Available"}
                          </Text>
                          <Button
                            label={
                              activeInviteCodeId === inviteCode.id
                                ? "Sharing..."
                                : "Share Invite"
                            }
                            loading={activeInviteCodeId === inviteCode.id}
                            onPress={() => {
                              void handleShareInviteCode(
                                inviteCode.id,
                                inviteCode.code,
                              );
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
              isLast
              onPress={() => {
                navigation.navigate("Settings");
              }}
              subtitle="App-level settings and controls"
              testID="profile-settings-link"
              title="Settings"
            />
          </OptionList>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <OptionList>
            <OptionListRow
              chevron={expandedPanels.danger ? "up" : "down"}
              iconColor={theme.colors.text.danger}
              iconName="trash-outline"
              isLast
              onPress={() => {
                togglePanel("danger");
              }}
              subtitle="Permanently remove your account"
              testID="profile-delete-account-toggle"
              title="Delete Account"
            />
          </OptionList>

          {expandedPanels.danger ? (
            <View style={styles.sectionBody} testID="profile-delete-account-panel">
              <View style={styles.dangerPanel}>
                <Text style={styles.dangerTitle}>This action is permanent</Text>
                <Text style={styles.dangerCopy}>
                  Deleting your account removes all associated data and cannot
                  be undone.
                </Text>
              </View>

              <PageErrorToast
                errorMessage={dangerErrorMessage}
                title="Delete account failed"
              />

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
          testID="profile-logout-button"
          variant="secondary"
        />
      </View>
    </TabRootScreenScaffold>
  );
}
