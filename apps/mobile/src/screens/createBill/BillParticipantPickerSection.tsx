import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "../../ui/AppIcon";
import { Pressable, ScrollView, View } from "react-native";

import { OptionList, OptionListRow, Skeleton } from "../../components/shared";
import { createEntityId, type FriendRecord } from "../../features";
import {
  isSyntheticFriendEmail,
  normalizeFriendName,
  sanitizeParticipantName,
  type DraftCustomParticipant,
} from "../../features/bills/billDraft";
import { createThemedStyles, useTheme } from "../../theme";
import { Button, Card, Input, Modal, Text } from "../../ui";

interface BillParticipantPickerSelection {
  friendIds: string[];
  customParticipants: DraftCustomParticipant[];
}

type BillParticipantPickerMode = "billParticipants" | "friendInvites";

const EMPTY_CUSTOM_PARTICIPANTS: DraftCustomParticipant[] = [];

interface BillParticipantPickerSectionProps {
  allowCustomParticipants?: boolean;
  confirmLabel?: string;
  customParticipants: DraftCustomParticipant[];
  emptyFriendsText?: string;
  emptySelectionLabel?: string;
  friendSearchQuery: string;
  hasBlockingFriendsError: boolean;
  hint?: string;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  mode?: BillParticipantPickerMode;
  normalizedFriendSearchQuery: string;
  pickerAccessibilityLabel?: string;
  pickerDescription?: string;
  pickerModalTestID?: string;
  pickerTitle?: string;
  pickerTriggerTestID?: string;
  selectedCountLabel?: (count: number) => string;
  selectedFriendIds: string[];
  selectedFriends: FriendRecord[];
  title?: string;
  totalAcceptedFriends: number;
  visibleFriends: FriendRecord[];
  onChangeFriendSearchQuery: (value: string) => void;
  onConfirmSelection: (selection: BillParticipantPickerSelection) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  showLoadMore: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  customParticipantAddButton: {
    alignItems: "center",
    backgroundColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.md,
    height: theme.sizes.inputMinHeight,
    justifyContent: "center",
    width: theme.sizes.inputMinHeight,
  },
  customParticipantAddButtonDisabled: {
    backgroundColor: theme.colors.button.primaryDisabledBg,
  },
  customParticipantComposer: {
    gap: theme.spacing.xs,
  },
  customParticipantInput: {
    flex: 1,
  },
  customParticipantInputRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  fieldValue: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyLg,
  },
  friendRowSelected: {
    backgroundColor: theme.colors.status.infoBg,
  },
  friendSearchInput: {
    marginTop: theme.spacing.xs,
  },
  loadMoreButton: {
    marginTop: theme.spacing.xs,
  },
  loadingRow: {
    gap: theme.spacing.xs,
  },
  modalBody: {
    gap: theme.spacing.sm,
  },
  modalListContent: {
    gap: theme.spacing.sm,
  },
  modalListScroll: {
    maxHeight: 280,
  },
  participantGroupLabel: {
    color: theme.colors.text.secondary,
  },
  removeCustomParticipantButton: {
    alignItems: "center",
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  removeCustomParticipantButtonPressed: {
    backgroundColor: theme.colors.status.dangerBg,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  sectionHint: {
    color: theme.colors.text.muted,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
  },
  sectionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  selectedParticipantsSummary: {
    color: theme.colors.text.secondary,
  },
  triggerPlaceholder: {
    color: theme.colors.text.muted,
    ...theme.typography.bodyLg,
  },
}));

function formatCustomParticipantName(
  participant: DraftCustomParticipant,
  index: number,
): string {
  return sanitizeParticipantName(participant.name, `Person ${index + 1}`);
}

function formatSelectedParticipantsLabel(
  selectedFriends: FriendRecord[],
  customParticipants: DraftCustomParticipant[],
  emptySelectionLabel: string,
): string {
  const selectedNames = [
    ...selectedFriends.map((friend) => normalizeFriendName(friend)),
    ...customParticipants.map((participant, index) =>
      formatCustomParticipantName(participant, index),
    ),
  ];

  if (selectedNames.length === 0) {
    return emptySelectionLabel;
  }

  if (selectedNames.length <= 2) {
    return selectedNames.join(", ");
  }

  return `${selectedNames.slice(0, 2).join(", ")} +${selectedNames.length - 2} more`;
}

export function BillParticipantPickerSection({
  allowCustomParticipants: allowCustomParticipantsProp,
  confirmLabel = "Confirm",
  customParticipants,
  emptyFriendsText = "No friends available right now. You can still add people by name.",
  emptySelectionLabel = "Add friends or type a name",
  friendSearchQuery,
  hasBlockingFriendsError,
  hint = "You are always included in the bill. Add friends or type anyone else.",
  isFetchingNextPage,
  isLoading,
  mode = "billParticipants",
  normalizedFriendSearchQuery,
  pickerAccessibilityLabel = "Select bill participants",
  pickerDescription = "Choose friends or add people by name, then confirm your selection.",
  pickerModalTestID = "bill-friends-picker-modal",
  pickerTitle = "Add Participants",
  pickerTriggerTestID = "bill-friends-picker-trigger",
  selectedCountLabel,
  selectedFriendIds,
  selectedFriends,
  title = "Participants",
  totalAcceptedFriends,
  visibleFriends,
  onChangeFriendSearchQuery,
  onConfirmSelection,
  onLoadMore,
  onRetry,
  showLoadMore,
}: BillParticipantPickerSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const allowCustomParticipants =
    allowCustomParticipantsProp ?? mode !== "friendInvites";
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftCustomParticipantName, setDraftCustomParticipantName] =
    useState("");
  const [draftCustomParticipants, setDraftCustomParticipants] = useState<
    DraftCustomParticipant[]
  >(allowCustomParticipants ? customParticipants : []);
  const [draftSelectedFriendIds, setDraftSelectedFriendIds] =
    useState<string[]>(selectedFriendIds);
  const effectiveCustomParticipants = useMemo(
    () =>
      allowCustomParticipants ? customParticipants : EMPTY_CUSTOM_PARTICIPANTS,
    [allowCustomParticipants, customParticipants],
  );
  const effectiveDraftCustomParticipants = useMemo(
    () =>
      allowCustomParticipants
        ? draftCustomParticipants
        : EMPTY_CUSTOM_PARTICIPANTS,
    [allowCustomParticipants, draftCustomParticipants],
  );
  const selectedParticipantsCount =
    selectedFriendIds.length + effectiveCustomParticipants.length;
  const draftSelectedParticipantsCount =
    draftSelectedFriendIds.length + effectiveDraftCustomParticipants.length;
  const formatSelectedCount =
    selectedCountLabel ??
    ((count: number) =>
      ` ${count} participant${count === 1 ? "" : "s"} selected`.trim());
  const selectedParticipantsLabel = useMemo(
    () =>
      formatSelectedParticipantsLabel(
        selectedFriends,
        effectiveCustomParticipants,
        emptySelectionLabel,
      ),
    [effectiveCustomParticipants, emptySelectionLabel, selectedFriends],
  );
  useEffect(() => {
    if (!isPickerVisible) {
      return;
    }

    setDraftSelectedFriendIds(selectedFriendIds);
    setDraftCustomParticipants(
      allowCustomParticipants ? customParticipants : [],
    );
    setDraftCustomParticipantName("");
  }, [
    allowCustomParticipants,
    customParticipants,
    isPickerVisible,
    selectedFriendIds,
  ]);

  const handleClosePicker = () => {
    setIsPickerVisible(false);
    setDraftCustomParticipantName("");
    onChangeFriendSearchQuery("");
  };

  const handleConfirmSelection = () => {
    onConfirmSelection({
      friendIds: draftSelectedFriendIds,
      customParticipants: allowCustomParticipants
        ? draftCustomParticipants
        : [],
    });
    handleClosePicker();
  };

  const handleToggleDraftFriend = (friend: FriendRecord) => {
    setDraftSelectedFriendIds((currentIds) =>
      currentIds.includes(friend.id)
        ? currentIds.filter((currentId) => currentId !== friend.id)
        : [...currentIds, friend.id],
    );
  };

  const handleAddDraftCustomParticipant = () => {
    if (!draftCustomParticipantName.trim()) {
      return;
    }

    setDraftCustomParticipants((currentParticipants) => [
      ...currentParticipants,
      {
        id: `custom:${createEntityId("bill_participant_draft")}`,
        name: sanitizeParticipantName(draftCustomParticipantName, "Person"),
      },
    ]);
    setDraftCustomParticipantName("");
  };

  const handleRemoveDraftCustomParticipant = (participantId: string) => {
    setDraftCustomParticipants((currentParticipants) =>
      currentParticipants.filter(
        (participant) => participant.id !== participantId,
      ),
    );
  };
  const isAddCustomParticipantDisabled = !draftCustomParticipantName.trim();
  const shouldShowFriendsPickerGroup =
    !isLoading &&
    !hasBlockingFriendsError &&
    (normalizedFriendSearchQuery.length > 0 || totalAcceptedFriends > 0);

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionTitleRow}>
        <Ionicons
          color={theme.colors.text.secondary}
          name="people-outline"
          size={16}
        />
        <Text style={styles.sectionTitle} variant="titleSm">
          {title}
        </Text>
      </View>
      <Text style={styles.sectionHint} variant="bodySmCompact">
        {hint}
      </Text>

      <OptionList>
        <OptionListRow
          accessibilityLabel={pickerAccessibilityLabel}
          isLast
          onPress={() => {
            setDraftSelectedFriendIds(selectedFriendIds);
            setDraftCustomParticipants(
              allowCustomParticipants ? customParticipants : [],
            );
            setDraftCustomParticipantName("");
            setIsPickerVisible(true);
          }}
          testID={pickerTriggerTestID}
          title={selectedParticipantsLabel}
          titleStyle={
            selectedParticipantsCount === 0
              ? styles.triggerPlaceholder
              : styles.fieldValue
          }
        />
      </OptionList>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </View>
      ) : null}

      {!isLoading && hasBlockingFriendsError ? (
        <>
          <Text style={styles.sectionHint} variant="bodySmCompact">
            Could not load your friend list right now.
          </Text>
          <Button
            label="Retry"
            onPress={onRetry}
            style={styles.loadMoreButton}
            variant="secondary"
          />
        </>
      ) : null}

      {!isLoading &&
      !hasBlockingFriendsError &&
      normalizedFriendSearchQuery.length === 0 &&
      totalAcceptedFriends === 0 ? (
        <Text style={styles.sectionHint} variant="bodySmCompact">
          {emptyFriendsText}
        </Text>
      ) : null}

      <Text style={styles.selectedParticipantsSummary} variant="bodySmCompact">
        {formatSelectedCount(selectedParticipantsCount)}
      </Text>

      <Modal
        description={pickerDescription}
        onRequestClose={handleClosePicker}
        primaryAction={{
          label: confirmLabel,
          onPress: handleConfirmSelection,
          testID: "bill-friends-picker-confirm-button",
        }}
        secondaryAction={{
          label: "Cancel",
          onPress: handleClosePicker,
          testID: "bill-friends-picker-cancel-button",
        }}
        testID={pickerModalTestID}
        title={pickerTitle}
        visible={isPickerVisible}
      >
        <View style={styles.modalBody}>
          {allowCustomParticipants ? (
            <View style={styles.customParticipantComposer}>
              <Text
                style={styles.participantGroupLabel}
                variant="bodySmCompact"
              >
                Type a name
              </Text>
              <View style={styles.customParticipantInputRow}>
                <Input
                  containerStyle={styles.customParticipantInput}
                  onChangeText={setDraftCustomParticipantName}
                  onSubmitEditing={() => {
                    handleAddDraftCustomParticipant();
                  }}
                  placeholder="Alex"
                  testID="bill-custom-participant-input"
                  value={draftCustomParticipantName}
                />
                <Pressable
                  accessibilityLabel="Add Person"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isAddCustomParticipantDisabled }}
                  disabled={isAddCustomParticipantDisabled}
                  onPress={handleAddDraftCustomParticipant}
                  style={({ pressed }) => [
                    styles.customParticipantAddButton,
                    isAddCustomParticipantDisabled
                      ? styles.customParticipantAddButtonDisabled
                      : null,
                    pressed && !isAddCustomParticipantDisabled
                      ? { opacity: 0.8 }
                      : null,
                  ]}
                  testID="bill-custom-participant-add-button"
                >
                  <Ionicons color={theme.colors.text.inverse} name="add" size={22} />
                </Pressable>
              </View>
              <Text style={styles.sectionHint} variant="bodySmCompact">
                Use this for people without an account or outside your friend
                list.
              </Text>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingRow}>
              <Skeleton height={20} />
              <Skeleton height={20} />
              <Skeleton height={20} />
            </View>
          ) : null}

          {!isLoading && hasBlockingFriendsError ? (
            <>
              <Text style={styles.sectionHint} variant="bodySmCompact">
                Could not load your friend list right now.
              </Text>
              <Button
                label="Retry"
                onPress={onRetry}
                style={styles.loadMoreButton}
                variant="secondary"
              />
            </>
          ) : null}

          {!isLoading &&
          !hasBlockingFriendsError &&
          normalizedFriendSearchQuery.length === 0 &&
          totalAcceptedFriends === 0 ? (
            <Text style={styles.sectionHint} variant="bodySmCompact">
              {emptyFriendsText}
            </Text>
          ) : null}

          {effectiveDraftCustomParticipants.length > 0 ||
          shouldShowFriendsPickerGroup ? (
            <>
              {allowCustomParticipants &&
              effectiveDraftCustomParticipants.length > 0 ? (
                <>
                  <Text
                    style={styles.participantGroupLabel}
                    variant="bodySmCompact"
                  >
                    Typed People
                  </Text>
                  <OptionList>
                    {effectiveDraftCustomParticipants.map(
                      (participant, index) => (
                        <OptionListRow
                          isLast={
                            index ===
                            effectiveDraftCustomParticipants.length - 1
                          }
                          key={participant.id}
                          rightAccessory={
                            <Pressable
                              accessibilityLabel={`Remove ${formatCustomParticipantName(
                                participant,
                                index,
                              )}`}
                              accessibilityRole="button"
                              hitSlop={12}
                              onPress={() => {
                                handleRemoveDraftCustomParticipant(
                                  participant.id,
                                );
                              }}
                              style={({ pressed }) => [
                                styles.removeCustomParticipantButton,
                                pressed
                                  ? styles.removeCustomParticipantButtonPressed
                                  : null,
                              ]}
                              testID={`bill-custom-participant-remove-${index}`}
                            >
                              <Ionicons
                                color={theme.colors.text.danger}
                                name="trash-outline"
                                size={18}
                              />
                            </Pressable>
                          }
                          subtitle={
                            participant.userId
                              ? "Existing participant outside your friend list"
                              : "Added by name"
                          }
                          title={formatCustomParticipantName(
                            participant,
                            index,
                          )}
                        />
                      ),
                    )}
                  </OptionList>
                </>
              ) : null}

              {shouldShowFriendsPickerGroup ? (
                <>
                  <Text
                    style={styles.participantGroupLabel}
                    variant="bodySmCompact"
                  >
                    Friends
                  </Text>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    style={styles.modalListScroll}
                  >
                    <View style={styles.modalListContent}>
                      <Input
                        containerStyle={styles.friendSearchInput}
                        onChangeText={onChangeFriendSearchQuery}
                        placeholder="Search friends"
                        testID="bill-friends-search-input"
                        value={friendSearchQuery}
                      />
                      {normalizedFriendSearchQuery.length > 0 &&
                      visibleFriends.length === 0 ? (
                        <Text style={styles.sectionHint} variant="bodySmCompact">
                          No friends match your search.
                        </Text>
                      ) : null}
                      {visibleFriends.length > 0 ? (
                        <OptionList>
                          {visibleFriends.map((friend, index) => {
                            const isSelected = draftSelectedFriendIds.includes(
                              friend.id,
                            );
                            const friendSubtitle = isSyntheticFriendEmail(
                              friend.email,
                            )
                              ? undefined
                              : friend.email;

                            return (
                              <OptionListRow
                                chevron={false}
                                isLast={index === visibleFriends.length - 1}
                                key={friend.id}
                                leading={
                                  <Ionicons
                                    color={
                                      isSelected
                                        ? theme.colors.text.brand
                                        : theme.colors.text.muted
                                    }
                                    name={
                                      isSelected ? "checkbox" : "square-outline"
                                    }
                                    size={20}
                                  />
                                }
                                onPress={() => {
                                  handleToggleDraftFriend(friend);
                                }}
                                style={
                                  isSelected ? styles.friendRowSelected : undefined
                                }
                                subtitle={friendSubtitle}
                                testID={`bill-friends-option-${index}`}
                                title={normalizeFriendName(friend)}
                              />
                            );
                          })}
                        </OptionList>
                      ) : null}
                    </View>
                  </ScrollView>
                </>
              ) : null}
            </>
          ) : null}

          {!isLoading && !hasBlockingFriendsError && showLoadMore ? (
            <Button
              label={
                isFetchingNextPage ? "Loading more..." : "Load more friends"
              }
              loading={isFetchingNextPage}
              onPress={onLoadMore}
              style={styles.loadMoreButton}
              testID="bill-friends-load-more-button"
              variant="secondary"
            />
          ) : null}

          <Text
            style={styles.selectedParticipantsSummary}
            variant="bodySmCompact"
          >
            {formatSelectedCount(draftSelectedParticipantsCount)}
          </Text>
        </View>
      </Modal>
    </Card>
  );
}
