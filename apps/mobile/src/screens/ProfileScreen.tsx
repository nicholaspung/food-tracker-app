import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  ActivityIndicator,
  Pressable,
  Share,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDestructiveModal,
  ErrorState,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  ScreenContentSection,
  Skeleton,
  StatusPill,
  TabBrandHeader,
  TabRootScreenScaffold,
} from '../components/shared';
import {
  deleteAccount,
  feedbackQueryKeys,
  generateInviteCodes,
  getAuthRecord,
  getFeedbackCountSummary,
  invalidateInviteCodesQueries,
  getProfile,
  listInviteCodes,
  lockInviteCode,
  profileQueryKeys,
  updateProfile,
} from '../features';
import { formatDisplayDate } from '../lib/dateFormatting';
import { formatEmailVerificationRemainingTime } from '../lib/emailVerificationAccess';
import { getErrorMessage } from '../lib/errorUtils';
import { formatAppVersionLabel } from '../lib/appMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Screen, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'Profile'>;
type ExpandablePanel = 'account' | 'invite' | 'danger';

const INVITE_SIGNUP_DEEP_LINK_PREFIX = 'yummyrecs://signup?code=';

const useStyles = createThemedStyles((theme) => ({
  screenContent: {
    backgroundColor: theme.colors.background.surface,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bodyScroll: {
    backgroundColor: theme.colors.background.app,
    flex: 1,
  },
  body: {
    flexGrow: 1,
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
    marginBottom: theme.spacing.sm,
  },
  optionBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.fill.danger,
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  optionBadgeText: {
    color: theme.colors.text.inverse,
  },
  optionMetaText: {
    color: theme.colors.text.secondary,
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
  },
  detailValue: {
    color: theme.colors.text.primary,
  },
  detailValueMono: {
    color: theme.colors.text.secondary,
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
  inviteCodeCardLocked: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
  },
  inviteCodeText: {
    letterSpacing: 1.2,
  },
  inviteCodeMeta: {
    color: theme.colors.text.muted,
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
  },
  dangerCopy: {
    color: theme.colors.text.danger,
  },
  logoutButton: {
    marginTop: theme.spacing.xs,
  },
  verificationCard: {
    marginTop: theme.spacing.xs,
  },
}));

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
  const styles = useStyles();
  const queryClient = useQueryClient();
  const {
    actualUser,
    user,
    signOut,
    verificationGraceEndsAt,
    verificationStatus,
  } = useAuth();
  const authRecord = getAuthRecord();
  const isAdmin = actualUser?.isAdmin === true;
  const isSubscriber = actualUser?.isSubscriber === true;
  const isBetaUser = actualUser?.isBetaUser === true;
  const isInitialUser = authRecord?.isInitialUser === true;

  const profileQuery = useQuery({
    queryKey: profileQueryKeys.profile,
    queryFn: ({ signal }) => getProfile({ signal }),
  });

  const feedbackSummaryQuery = useQuery({
    queryKey: feedbackQueryKeys.summary,
    queryFn: ({ signal }) => getFeedbackCountSummary({ signal }),
  });

  const [expandedPanels, setExpandedPanels] = useState<
    Record<ExpandablePanel, boolean>
  >({
    account: false,
    invite: false,
    danger: false,
  });
  const [inviteErrorMessage, setInviteErrorMessage] = useState<string | null>(
    null,
  );
  const [activeInviteCodeId, setActiveInviteCodeId] = useState<string | null>(
    null,
  );
  const [dangerErrorMessage, setDangerErrorMessage] = useState<string | null>(
    null,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [editedAccountName, setEditedAccountName] = useState("");
  const [accountNameErrorMessage, setAccountNameErrorMessage] = useState<
    string | null
  >(null);
  const inviteCodesQuery = useQuery({
    queryKey: profileQueryKeys.inviteCodes(user?.id),
    queryFn: ({ signal }) => listInviteCodes({ signal }),
    enabled: expandedPanels.invite && Boolean(user?.id),
  });
  const generateInviteCodesMutation = useMutation({
    mutationFn: generateInviteCodes,
    onSuccess: async () => {
      await invalidateInviteCodesQueries(queryClient, user?.id);
    },
  });
  const lockInviteCodeMutation = useMutation({
    mutationFn: lockInviteCode,
    onSuccess: async () => {
      await invalidateInviteCodesQueries(queryClient, user?.id);
    },
  });

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

  const activeFeedbackCount = feedbackSummaryQuery.data?.activeCount ?? 0;
  const appVersionLabel = formatAppVersionLabel();

  const accountCreated = formatDisplayDate(authRecord?.created, {
    fallback: "Unknown",
  });
  const verificationDeadline = formatDisplayDate(verificationGraceEndsAt, {
    fallback: 'your verification deadline',
  });
  const verificationReminderMessage =
    verificationStatus === 'grace_period' && verificationGraceEndsAt
      ? `Verify by ${verificationDeadline} to keep using the app. ${formatEmailVerificationRemainingTime(verificationGraceEndsAt)}`
      : 'Please verify your email to continue using the app.';
  const hasBlockingProfileError = profileQuery.isError && !profileQuery.data;
  const hasProfileRefreshError = profileQuery.isError && Boolean(profileQuery.data);
  const inviteCodes = inviteCodesQuery.data ?? [];
  const hasBlockingInviteQueryError =
    inviteCodesQuery.isError && inviteCodes.length === 0;
  const inviteError =
    inviteErrorMessage ??
    (hasBlockingInviteQueryError
      ? getErrorMessage(inviteCodesQuery.error, "Could not load invite codes.")
      : inviteCodesQuery.isError
        ? "Could not refresh invite codes. Showing saved data."
        : null);
  const isInviteLoading = inviteCodesQuery.isLoading;
  const isGeneratingCodes = generateInviteCodesMutation.isPending;

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

    try {
      await generateInviteCodesMutation.mutateAsync();
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

      await lockInviteCodeMutation.mutateAsync(codeId);
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

      const updatedProfile = await updateProfile({
        displayName: trimmedName,
      });

      return updatedProfile.displayName.trim() || trimmedName;
    },
    onSuccess: (nextName) => {
      trackObservabilityEvent("PROFILE_ACCOUNT_NAME_SAVE_SUCCEEDED", {
        source: "ProfileScreen",
        nameLength: nextName.length,
      });
      setAccountNameErrorMessage(null);
      setIsEditingAccountName(false);
      setEditedAccountName(nextName);

      queryClient.setQueryData(
        profileQueryKeys.profile,
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
      const message = getErrorMessage(error, "Could not update name.");
      trackObservabilityEvent("PROFILE_ACCOUNT_NAME_SAVE_FAILED", {
        source: "ProfileScreen",
        errorMessage: message,
        errorType: error instanceof Error ? error.name : "unknown_error",
      });
      setAccountNameErrorMessage(message);
    },
  });

  const handleStartEditAccountName = () => {
    trackObservabilityEvent("PROFILE_ACCOUNT_NAME_EDIT_STARTED", {
      source: "ProfileScreen",
    });
    setAccountNameErrorMessage(null);
    setEditedAccountName(editableAccountName);
    setIsEditingAccountName(true);
  };

  const handleCancelEditAccountName = () => {
    trackObservabilityEvent("PROFILE_ACCOUNT_NAME_EDIT_CANCELED", {
      source: "ProfileScreen",
    });
    setAccountNameErrorMessage(null);
    setEditedAccountName(editableAccountName);
    setIsEditingAccountName(false);
  };

  const handleSaveAccountName = () => {
    const trimmedName = editedAccountName.trim();
    if (!trimmedName) {
      trackObservabilityEvent("PROFILE_ACCOUNT_NAME_SAVE_VALIDATION_FAILED", {
        source: "ProfileScreen",
        reason: "missing_name",
      });
      setAccountNameErrorMessage("Name cannot be empty.");
      return;
    }

    if (trimmedName === editableAccountName) {
      handleCancelEditAccountName();
      return;
    }

    setAccountNameErrorMessage(null);
    trackObservabilityEvent("PROFILE_ACCOUNT_NAME_SAVE_STARTED", {
      source: "ProfileScreen",
      nameLength: trimmedName.length,
    });
    updateAccountNameMutation.mutate(trimmedName);
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_VALIDATION_FAILED", {
        source: "ProfileScreen",
        reason: "missing_user",
      });
      setDangerErrorMessage("Could not find user account.");
      return;
    }

    if (!deleteAccountPassword.trim()) {
      trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_VALIDATION_FAILED", {
        source: "ProfileScreen",
        reason: "missing_password",
      });
      setDangerErrorMessage("Current password is required.");
      return;
    }

    setDangerErrorMessage(null);
    trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_STARTED", {
      source: "ProfileScreen",
    });
    setIsDeletingAccount(true);

    try {
      await deleteAccount(deleteAccountPassword);
      trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_SUCCEEDED", {
        source: "ProfileScreen",
      });
      await signOut();
    } catch (error) {
      const message = getErrorMessage(error, "Could not delete account.");
      trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_FAILED", {
        source: "ProfileScreen",
        errorMessage: message,
        errorType: error instanceof Error ? error.name : "unknown_error",
      });
      setDangerErrorMessage(message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const closeDeleteAccountModal = () => {
    if (isDeletingAccount) {
      return;
    }

    setShowDeleteConfirm(false);
    setDeleteAccountPassword("");
    setDangerErrorMessage(null);
  };

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (hasBlockingProfileError) {
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
      keyboardAware={false}
      scroll={false}
      scrollUnderlayColor={theme.colors.background.app}
      testID="profile-screen"
    >
      <TabBrandHeader subtitle="Your account information" title="Profile" />

      <ScreenContentSection fill testID="profile-screen-content-section">
        <KeyboardAwareScrollView
          automaticallyAdjustKeyboardInsets={false}
          bottomOffset={theme.spacing.sm}
          contentContainerStyle={styles.body}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          style={styles.bodyScroll}
        >
          <PageErrorToast
            actionLabel="Retry"
            errorMessage={
              hasProfileRefreshError
                ? "Could not refresh profile. Showing saved data."
                : null
            }
            onAction={() => {
              void profileQuery.refetch();
            }}
            title="Profile may be stale"
          />

          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle} variant="cardTitle">Account</Text>
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
                    <Text style={styles.detailLabel} variant="metaTightSemiBold">Name</Text>
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
                    <Text style={styles.detailValue} variant="titleSmSemiBold">{accountName}</Text>
                  )}
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel} variant="metaTightSemiBold">Email</Text>
                  <Text style={styles.detailValue} variant="titleSmSemiBold">
                    {user?.email ?? "Unknown"}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel} variant="metaTightSemiBold">Email Verified</Text>
                  <Text style={styles.detailValue} variant="titleSmSemiBold">
                    {user?.verified ? "Yes" : "No"}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel} variant="metaTightSemiBold">Account Created</Text>
                  <Text style={styles.detailValue} variant="titleSmSemiBold">{accountCreated}</Text>
                </View>
                {!user?.verified ? (
                  <Card style={styles.verificationCard} tone="warning">
                    <Text tone="warning" variant="metaTightSemiBold">
                      Verification Required
                    </Text>
                    <Text>{verificationReminderMessage}</Text>
                    <Button
                      label="Verify Email"
                      onPress={() => {
                        navigation.navigate('VerifyEmail', {
                          source: 'profile',
                        });
                      }}
                      variant="secondary"
                    />
                  </Card>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel} variant="metaTightSemiBold">Membership</Text>
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
          <Text style={styles.sectionTitle} variant="cardTitle">Invites & Settings</Text>
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
                  errorMessage={inviteError}
                  title="Invite codes unavailable"
                  actionLabel={inviteCodesQuery.isError ? "Retry" : undefined}
                  onAction={
                    inviteCodesQuery.isError
                      ? () => {
                          setInviteErrorMessage(null);
                          void inviteCodesQuery.refetch();
                        }
                      : undefined
                  }
                />

                {isInviteLoading ? (
                  <>
                    <Skeleton height={16} />
                    <Skeleton height={16} />
                  </>
                ) : null}

                {!isInviteLoading &&
                (!inviteError || inviteCodes.length > 0) ? (
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
                          <Text style={styles.inviteCodeText} variant="bodyLgTightBold">
                            {inviteCode.code}
                          </Text>
                          <Text
                            style={[
                              styles.inviteCodeMeta,
                              inviteCode.locked ? styles.inviteCodeMetaLocked : null,
                            ]}
                            variant="bodySmTight"
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
          <Text style={styles.sectionTitle} variant="cardTitle">Support & Info</Text>
          <OptionList>
            <OptionListRow
              iconName="chatbox-ellipses-outline"
              onPress={() => {
                navigation.navigate("Feedback");
              }}
              rightAccessory={
                activeFeedbackCount > 0 ? (
                  <View style={styles.optionBadge}>
                    <Text style={styles.optionBadgeText} variant="bodySmTightBold">
                      {activeFeedbackCount}
                    </Text>
                  </View>
                ) : null
              }
              subtitle="Report issues and contact support"
              testID="profile-feedback-link"
              title="Feedback & Support"
            />
            <OptionListRow
              iconName="information-circle-outline"
              isLast
              onPress={() => {
                navigation.navigate("About");
              }}
              rightAccessory={
                <Text style={styles.optionMetaText} variant="bodySmTightSemiBold">{appVersionLabel}</Text>
              }
              subtitle="Current version, legal information, and app details"
              testID="profile-about-link"
              title="About"
            />
          </OptionList>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle} variant="cardTitle">Danger Zone</Text>
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
                <Text style={styles.dangerTitle} variant="labelMdBold">This action is permanent</Text>
                <Text style={styles.dangerCopy}>
                  Deleting your account removes all associated data and cannot
                  be undone.
                </Text>
              </View>

              <PageErrorToast
                errorMessage={dangerErrorMessage}
                title="Delete account failed"
              />

              <Button
                label="Delete Account"
                onPress={() => {
                  trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_TAPPED", {
                    source: "ProfileScreen",
                  });
                  setDangerErrorMessage(null);
                  setDeleteAccountPassword("");
                  setShowDeleteConfirm(true);
                }}
              />
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
        </KeyboardAwareScrollView>
      </ScreenContentSection>

      <ConfirmDestructiveModal
        cancelLabel="Keep Account"
        confirmLabel="Delete Account"
        confirmLoadingLabel="Deleting..."
        description="Enter your current password to permanently delete your account and remove your personal data."
        disabled={!deleteAccountPassword.trim()}
        loading={isDeletingAccount}
        onCancel={closeDeleteAccountModal}
        onConfirm={() => {
          trackObservabilityEvent("PROFILE_DELETE_ACCOUNT_CONFIRMED", {
            source: "ProfileScreen",
          });
          void handleDeleteAccount();
        }}
        testID="profile-delete-account-confirmation-modal"
        title="Delete Account?"
        visible={showDeleteConfirm}
      >
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          errorText={dangerErrorMessage}
          label="Current Password"
          onChangeText={(value) => {
            setDeleteAccountPassword(value);
            if (dangerErrorMessage) {
              setDangerErrorMessage(null);
            }
          }}
          placeholder="Enter your password"
          secureTextEntry
          textContentType="password"
          value={deleteAccountPassword}
        />
      </ConfirmDestructiveModal>
    </TabRootScreenScaffold>
  );
}
