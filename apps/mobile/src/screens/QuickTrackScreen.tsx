import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  LocalDatePickerField,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  PageErrorToast,
  PhotoSourceActionCards,
  RatingLegend,
  RatingSelector,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../components/shared';
import { createQuickTrack, getNoteById, type VisitPhotoUploadInput } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { pb } from '../lib/pocketbase';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type QuickTrackScreenProps = NativeStackScreenProps<RootStackParamList, 'QuickTrack'>;

const QUICK_TRACK_RATED_BEFORE_KEY = 'ui.quickTrack.hasRatedBefore';

const ITEM_CATEGORIES = [
  { value: 'convenience_store', label: 'Convenience Store' },
  { value: 'packaged_food', label: 'Packaged Food' },
  { value: 'homemade', label: 'Homemade' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'other', label: 'Other' },
] as const;

type ItemCategory = (typeof ITEM_CATEGORIES)[number]['value'];
type PhotoSource = 'camera' | 'gallery';
type QuickTrackVisibility = Extract<VisibilityOptionValue, 'private' | 'friends'>;

function formatDateToLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayLocalDateString(): string {
  return formatDateToLocalDateString(new Date());
}

function localDateStringToUTC(localDateString: string): string {
  return new Date(`${localDateString}T00:00:00`).toISOString();
}

function isValidLocalDate(localDateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDateString)) {
    return false;
  }

  const parsed = new Date(`${localDateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === localDateString;
}

function inferImageMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

function buildDraftPhotoName(uri: string): string {
  const baseName = uri.split('/').pop();
  if (baseName && baseName.includes('.')) {
    return baseName;
  }

  return `quick-track-${Date.now()}.jpg`;
}

function resolveDefaultQuickTrackVisibility(): QuickTrackVisibility {
  return pb.authStore.record?.defaultVisitVisibility === 'private' ? 'private' : 'friends';
}

export function QuickTrackScreen({ navigation, route }: QuickTrackScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const sourceNoteId = route.params?.sourceNoteId;

  const linkedNoteQuery = useQuery({
    queryKey: ['feature', 'note', sourceNoteId],
    queryFn: () => (sourceNoteId ? getNoteById(sourceNoteId) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
  });

  const [itemName, setItemName] = useState('');
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState('');
  const [itemCategory, setItemCategory] = useState<ItemCategory | null>(null);
  const [locationText, setLocationText] = useState('');
  const [visibility, setVisibility] = useState<QuickTrackVisibility>(resolveDefaultQuickTrackVisibility());
  const [itemDate, setItemDate] = useState(getTodayLocalDateString());
  const [photo, setPhoto] = useState<VisitPhotoUploadInput | null>(null);
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRatedBefore, setHasRatedBefore] = useState(false);
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const [isSelectingPhoto, setIsSelectingPhoto] = useState(false);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [locationPermissionNeedsSettings, setLocationPermissionNeedsSettings] = useState(false);
  const [photoPermissionNeedsSettings, setPhotoPermissionNeedsSettings] = useState(false);
  const [didApplyNotePrefill, setDidApplyNotePrefill] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedCategoryLabel = itemCategory
    ? ITEM_CATEGORIES.find((category) => category.value === itemCategory)?.label ?? 'Select category'
    : 'Select category';

  useEffect(() => {
    let isMounted = true;

    const loadRatedBefore = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(QUICK_TRACK_RATED_BEFORE_KEY);
        if (isMounted) {
          setHasRatedBefore(storedValue === '1');
        }
      } catch {
        // Ignore storage read errors and keep the default collapsed state.
      }
    };

    void loadRatedBefore();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!linkedNoteQuery.data || didApplyNotePrefill) {
      return;
    }

    setNotes((currentNotes) => (currentNotes.trim() ? currentNotes : linkedNoteQuery.data?.content ?? ''));
    setLocationText((currentLocation) =>
      currentLocation.trim() ? currentLocation : linkedNoteQuery.data?.locationText ?? '',
    );
    setDidApplyNotePrefill(true);
  }, [didApplyNotePrefill, linkedNoteQuery.data]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    photoSection: {
      gap: theme.spacing.sm,
    },
    photoPreview: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
    },
    photoImage: {
      backgroundColor: theme.colors.background.app,
      borderRadius: theme.radii.sm,
      height: 56,
      width: 56,
    },
    photoMeta: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    locationRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    locationInput: {
      flex: 1,
    },
    locationCaptureButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      height: 50,
      justifyContent: 'center',
      width: 50,
    },
    notesInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    categoryOptions: {
      gap: theme.spacing.xs,
    },
    categoryOption: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 42,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    categoryOptionSelected: {
      borderColor: theme.colors.border.info,
      backgroundColor: theme.colors.status.infoBg,
    },
    categoryPlaceholder: {
      color: theme.colors.text.muted,
    },
    linkedNoteCard: {
      gap: theme.spacing.xs,
    },
  });

  const handleVisibilityChange = (value: VisibilityOptionValue) => {
    if (value === 'private' || value === 'friends') {
      setVisibility(value);
    }
  };

  const handleCaptureLocation = async () => {
    setErrorMessage(null);
    setLocationPermissionNeedsSettings(false);
    setIsCapturingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationPermissionNeedsSettings(permission.canAskAgain === false);
        setErrorMessage(
          permission.canAskAgain === false
            ? 'Location permission is blocked. Enable it in settings.'
            : 'Location permission is required to capture your coordinates.',
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not capture your location.');
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const handlePhotoPick = async (source: PhotoSource) => {
    setErrorMessage(null);
    setPhotoPermissionNeedsSettings(false);
    setIsSelectingPhoto(true);

    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setPhotoPermissionNeedsSettings(permission.canAskAgain === false);
        throw new Error(
          source === 'camera'
            ? 'Camera permission is required to take a photo.'
            : 'Photo library permission is required to upload an image.',
        );
      }

      const pickerResult =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality: 0.8,
            });

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        return;
      }

      const selectedAsset = pickerResult.assets[0];
      const selectedUri = selectedAsset.uri;
      setPhoto({
        uri: selectedUri,
        name: selectedAsset.fileName?.trim() || buildDraftPhotoName(selectedUri),
        mimeType: selectedAsset.mimeType?.trim() || inferImageMimeType(selectedUri),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not select a photo.');
    } finally {
      setIsSelectingPhoto(false);
    }
  };

  const handleCreate = async () => {
    if (!itemName.trim()) {
      setErrorMessage('Item name is required.');
      return;
    }

    if (!isValidLocalDate(itemDate)) {
      setErrorMessage('Please choose a valid date.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await queueWrite('quick-track.create');
      await createQuickTrack({
        itemName,
        rating,
        notes: notes.trim() || undefined,
        itemCategory: itemCategory ?? undefined,
        locationText: locationText.trim() || undefined,
        visibility,
        itemDate: localDateStringToUTC(itemDate),
        latitude,
        longitude,
        photo: photo ?? undefined,
        sourceNoteId,
      });

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
      ];

      if (sourceNoteId) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }));
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'note', sourceNoteId] }));
      }

      await Promise.all(invalidations);
      await AsyncStorage.setItem(QUICK_TRACK_RATED_BEFORE_KEY, '1');
      navigation.navigate('Home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save quick track.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (sourceNoteId) {
      navigation.navigate('Notes');
      return;
    }

    navigation.navigate('AddVisit');
  };

  const hasCapturedCoordinates =
    typeof latitude === 'number' && typeof longitude === 'number';
  const coordinateLabel = hasCapturedCoordinates
    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    : null;

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleCancel}
      primaryAction={{
        label: 'Save Item',
        disabled: isSubmitting || !itemName.trim(),
        loading: isSubmitting,
        onPress: () => {
          void handleCreate();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: isSubmitting,
        onPress: handleCancel,
      }}
      subtitle="Quickly rate any item without a restaurant."
      title="Quick Track Item"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Quick track failed" />

        {sourceNoteId ? (
          <Card style={styles.linkedNoteCard} tone="muted">
            <Text variant="label">Linked Note</Text>
            {linkedNoteQuery.isLoading ? (
              <Text tone="secondary">Loading note details...</Text>
            ) : linkedNoteQuery.data ? (
              <>
                <Text tone="secondary">{linkedNoteQuery.data.title}</Text>
                <Text numberOfLines={4} tone="secondary" variant="bodySm">
                  {linkedNoteQuery.data.content}
                </Text>
              </>
            ) : (
              <Text tone="warning">Note details unavailable. You can still save this item.</Text>
            )}
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <LocalDatePickerField
            label="Date"
            modalTitle="Select item date"
            onChange={setItemDate}
            value={itemDate}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="label">Visibility</Text>
          <VisibilityOptionSelector
            onChange={handleVisibilityChange}
            options={['private', 'friends']}
            value={visibility}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Input
            autoCapitalize="words"
            label="Item Name *"
            onChangeText={setItemName}
            placeholder="e.g., Chocolate Bar, Coffee, Homemade Pasta"
            value={itemName}
          />

          <View style={styles.photoSection}>
            <Text variant="label">Photo (Optional)</Text>
            <PhotoSourceActionCards
              cameraSubtitle="Camera"
              cameraTitle="Take Photo"
              disabled={isSelectingPhoto || isSubmitting}
              gallerySubtitle="Photo Library"
              galleryTitle="Upload Image"
              onCameraPress={() => {
                void handlePhotoPick('camera');
              }}
              onGalleryPress={() => {
                void handlePhotoPick('gallery');
              }}
            />

            {photo ? (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                <View style={styles.photoMeta}>
                  <Text numberOfLines={1} variant="label">
                    {photo.name}
                  </Text>
                  <Button
                    label="Remove Photo"
                    onPress={() => {
                      setPhoto(null);
                    }}
                    variant="secondary"
                  />
                </View>
              </View>
            ) : null}

            {photoPermissionNeedsSettings ? (
              <Button
                label="Open Settings"
                onPress={() => {
                  void Linking.openSettings();
                }}
                variant="secondary"
              />
            ) : null}
          </View>
        </Card>

        <RatingLegend
          initiallyExpanded={!hasRatedBefore}
          persistenceKey="ui.quickTrack.ratingGuide.expanded"
        />

        <Card style={styles.sectionCard}>
          <Text variant="label">Rating *</Text>
          <RatingSelector
            onChange={setRating}
            value={rating}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text variant="label">Category (Optional)</Text>
          <OptionList>
            <OptionListRow
              chevron={isCategoryExpanded ? 'up' : 'down'}
              connected={isCategoryExpanded}
              isLast={!isCategoryExpanded}
              onPress={() => {
                setIsCategoryExpanded((currentValue) => !currentValue);
              }}
              title={selectedCategoryLabel}
              titleStyle={!itemCategory ? styles.categoryPlaceholder : undefined}
            />

            {isCategoryExpanded ? (
              <OptionListInlineBody>
                <View style={styles.categoryOptions}>
                  {ITEM_CATEGORIES.map((category) => {
                    const isSelected = itemCategory === category.value;
                    return (
                      <Pressable
                        key={category.value}
                        onPress={() => {
                          setItemCategory(category.value);
                          setIsCategoryExpanded(false);
                        }}
                        style={[styles.categoryOption, isSelected ? styles.categoryOptionSelected : null]}
                      >
                        <Text>{category.label}</Text>
                        {isSelected ? (
                          <Ionicons color={theme.colors.text.success} name="checkmark-circle" size={18} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {itemCategory ? (
                    <Button
                      label="Clear Category"
                      onPress={() => {
                        setItemCategory(null);
                        setIsCategoryExpanded(false);
                      }}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              </OptionListInlineBody>
            ) : null}
          </OptionList>

          <Text variant="label">Location (Optional)</Text>
          <View style={styles.locationRow}>
            <Input
              containerStyle={styles.locationInput}
              onChangeText={setLocationText}
              placeholder="e.g., Trader Joe's, Home Kitchen"
              value={locationText}
            />
            <Pressable
              accessibilityLabel="Capture current location"
              accessibilityRole="button"
              onPress={() => {
                void handleCaptureLocation();
              }}
              style={styles.locationCaptureButton}
            >
              <Ionicons
                color={hasCapturedCoordinates ? theme.colors.text.success : theme.colors.text.secondary}
                name={isCapturingLocation ? 'sync-outline' : 'location-outline'}
                size={18}
              />
            </Pressable>
          </View>
          {coordinateLabel ? (
            <Text tone="success" variant="bodySm">
              GPS coordinates captured: {coordinateLabel}
            </Text>
          ) : null}
          {locationPermissionNeedsSettings ? (
            <Button
              label="Open Settings"
              onPress={() => {
                void Linking.openSettings();
              }}
              variant="secondary"
            />
          ) : null}

          <Input
            inputStyle={styles.notesInput}
            label="Notes (Optional)"
            multiline
            onChangeText={setNotes}
            placeholder="Any additional thoughts or details..."
            value={notes}
          />
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
