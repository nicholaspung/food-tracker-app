import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { buildPocketBaseFileUrl } from '../features';
import { CachedRemoteImage, LoadingState, SectionHeader } from '../components/shared';
import { APP_NAME, BRAND_LOGO } from '../lib/branding';
import { getRatingColor, getRatingLabel } from '../lib/ratingConstants';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useLayoutChrome } from '../providers/LayoutChromeProvider';
import { createThemedStyles, getVisitSharePalette, useTheme } from '../theme';
import { Button, Text } from '../ui';

type VisitShareCustomizationScreenProps = NativeStackScreenProps<RootStackParamList, 'VisitShareCustomization'>;
type VisitShareItem = RootStackParamList['VisitShareCustomization']['items'][number];
type ShareTheme = 'modern' | 'rustic' | 'minimal' | 'neon';

const STORY_CANVAS_ASPECT_RATIO = 9 / 16;
const STORY_EXPORT_WIDTH = 1080;
const STORY_EXPORT_HEIGHT = 1920;
const BRAND_LOGO_HEIGHT = 16;
const FOOTER_META_GAP = 2;

const visitDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatVisitDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return visitDateFormatter.format(parsed);
}

function buildPhotoUrl(item: VisitShareItem, thumb?: string): string {
  return buildPocketBaseFileUrl({
    collectionId: item.photoCollectionId,
    collectionName: item.photoCollectionName ?? 'visit_photos',
    recordId: item.photoId,
    filename: item.photoFilename,
    thumb,
  });
}

function getStoryCaptureSize(pixelRatio: number) {
  return {
    height: STORY_EXPORT_HEIGHT / pixelRatio,
    width: STORY_EXPORT_WIDTH / pixelRatio,
  };
}

function getFooterMetaLineHeight(theme: ReturnType<typeof useTheme>, shareTheme: ShareTheme): number {
  if (shareTheme === 'rustic' || shareTheme === 'minimal') {
    return theme.typography.bodyMdTight.lineHeight;
  }

  if (shareTheme === 'neon') {
    return theme.typography.metaTight.lineHeight;
  }

  return theme.typography.bodyBase.lineHeight;
}

function getShareFooterHeight({
  shareTheme,
  showDate,
  showRestaurantName,
  theme,
}: {
  shareTheme: ShareTheme;
  showDate: boolean;
  showRestaurantName: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const visibleMetaLineCount = Number(showRestaurantName) + Number(showDate);
  const metaLineHeight = getFooterMetaLineHeight(theme, shareTheme);
  const brandRowHeight = Math.max(BRAND_LOGO_HEIGHT, theme.typography.label.lineHeight);
  const footerOuterGap = visibleMetaLineCount > 0 ? theme.spacing.xxs : 0;
  const footerMetaHeight =
    visibleMetaLineCount > 0
      ? visibleMetaLineCount * metaLineHeight + Math.max(visibleMetaLineCount - 1, 0) * FOOTER_META_GAP
      : 0;

  return theme.spacing.xs * 2 + brandRowHeight + footerOuterGap + footerMetaHeight;
}

const useStyles = createThemedStyles((theme, sharePalette: ReturnType<typeof getVisitSharePalette>) => ({
  screen: {
    backgroundColor: sharePalette.screenBackground,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
  },
  headerTitleWrap: {
    flex: 1,
    gap: 2,
    paddingRight: theme.spacing.sm,
  },
  headerTitle: {
    color: sharePalette.headerTitle,
  },
  headerSubtitle: {
    color: sharePalette.headerSubtitle,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: sharePalette.closeButtonBackground,
    borderRadius: theme.radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  previewScroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  previewScrollContent: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  shareCanvas: {
    aspectRatio: STORY_CANVAS_ASPECT_RATIO,
    borderRadius: 0,
    borderWidth: 1,
    gap: 0,
    overflow: 'hidden',
    padding: 0,
    position: 'relative',
  },
  shareCanvasContent: {
    backgroundColor: theme.colors.background.inverse,
    flex: 1,
    gap: 0,
    minHeight: 0,
  },
  shareItemCard: {
    borderRadius: 0,
    borderWidth: 1,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  shareBrandFooter: {
    alignItems: 'center',
    bottom: 0,
    borderTopWidth: 1,
    gap: theme.spacing.xxs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    position: 'absolute',
    right: 0,
    left: 0,
    width: '100%',
  },
  shareFooterMeta: {
    alignItems: 'center',
    gap: 2,
    width: '100%',
  },
  shareFooterMetaText: {
    textAlign: 'center',
    width: '100%',
  },
  shareBrandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  shareBrandLogo: {
    height: BRAND_LOGO_HEIGHT,
    width: BRAND_LOGO_HEIGHT,
  },
  shareBrandLabel: {
    textTransform: 'none',
  },
  shareImage: {
    backgroundColor: theme.colors.background.muted,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  shareOverlay: {
    bottom: 0,
    gap: 4,
    left: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    position: 'absolute',
    right: 0,
  },
  shareOverlayModern: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
    paddingVertical: theme.spacing.xs,
  },
  shareOverlayRustic: {
    borderTopWidth: 2,
    borderBottomWidth: 1,
    paddingVertical: theme.spacing.xs + 1,
  },
  shareOverlayMinimal: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 2,
    paddingVertical: theme.spacing.xs - 1,
  },
  shareOverlayNeon: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
    gap: 3,
    paddingVertical: theme.spacing.xs - 1,
  },
  overlayPrimaryRustic: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  overlayPrimaryNeon: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  overlaySecondaryRustic: {
    fontStyle: 'italic',
    letterSpacing: 0.45,
  },
  overlaySecondaryNeon: {
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  ratingBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
  ratingBadgeAlignedRight: {
    alignSelf: 'flex-end',
  },
  ratingBadgeModern: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  ratingBadgeRustic: {
    backgroundColor: sharePalette.metaRightBackground,
    borderColor: sharePalette.metaRightBorderColor,
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ratingBadgeMinimal: {
    backgroundColor: sharePalette.metaRightBackground,
    borderColor: sharePalette.metaRightBorderColor,
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ratingBadgeNeon: {
    backgroundColor: sharePalette.metaRightBackground,
    borderColor: sharePalette.metaRightBorderColor,
    borderRadius: 0,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ratingDot: {
    borderRadius: theme.radii.pill,
    height: 10,
    width: 10,
  },
  ratingDotRustic: {
    height: 11,
    width: 11,
  },
  ratingDotMinimal: {
    height: 9,
    width: 9,
  },
  dateTextRustic: {
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  dateTextMinimal: {
    letterSpacing: 0.2,
  },
  dateTextNeon: {
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  ratingTextRustic: {
    letterSpacing: 0.35,
  },
  ratingTextNeon: {
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  optionPanel: {
    backgroundColor: sharePalette.optionPanelBackground,
    borderTopColor: sharePalette.optionPanelBorder,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  optionSectionHeader: {
    marginBottom: theme.spacing.xxs,
  },
  optionSectionTitle: {
    opacity: 0.9,
  },
  chipRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  chipButton: {
    alignItems: 'center',
    borderColor: sharePalette.chipBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 36,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  chipButtonActive: {
    backgroundColor: sharePalette.chipActiveBackground,
    borderColor: sharePalette.chipActiveBorder,
  },
  chipLabel: {
    color: sharePalette.chipLabel,
    ...theme.typography.bodySmTightSemiBold,
  },
  chipLabelActive: {
    color: sharePalette.chipLabelActive,
  },
  statusText: {
    color: sharePalette.statusText,
    ...theme.typography.bodySmTight,
    minHeight: 16,
    textAlign: 'center',
  },
  statusLoading: {
    justifyContent: 'center',
    minHeight: 16,
  },
  statusErrorText: {
    color: theme.colors.text.danger,
  },
  shareButton: {
    marginTop: theme.spacing.xxs,
  },
}));

export function VisitShareCustomizationScreen({ navigation, route }: VisitShareCustomizationScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { topInsetConsumedByOverlay } = useLayoutChrome();
  const { width: viewportWidth } = useWindowDimensions();
  const shareCanvasRef = useRef<View>(null);

  const [shareTheme, setShareTheme] = useState<ShareTheme>('modern');
  const [showDishNames, setShowDishNames] = useState(true);
  const [showRestaurantName, setShowRestaurantName] = useState(true);
  const [showRating, setShowRating] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [readyPhotoIds, setReadyPhotoIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { items, restaurantName, visitDate } = route.params;
  const formattedVisitDate = useMemo(() => formatVisitDate(visitDate), [visitDate]);
  const previewItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        photoUrl: buildPhotoUrl(item),
      })),
    [items],
  );

  const previewWidth = Math.min(viewportWidth - theme.spacing.lg * 2, 420);
  const storyCaptureSize = useMemo(() => getStoryCaptureSize(PixelRatio.get()), []);
  const areAllPhotosReady = readyPhotoIds.size >= previewItems.length;
  const hasVisibleItemOverlay = showDishNames || showRating;
  const hasVisibleFooterMeta = showRestaurantName || showDate;
  const shareFooterHeight = useMemo(
    () =>
      getShareFooterHeight({
        shareTheme,
        showDate,
        showRestaurantName,
        theme,
      }),
    [shareTheme, showDate, showRestaurantName, theme],
  );
  const isRusticTheme = shareTheme === 'rustic';
  const isMinimalTheme = shareTheme === 'minimal';
  const isNeonTheme = shareTheme === 'neon';
  const themedDateLabel = useMemo(() => {
    if (shareTheme === 'rustic') {
      return formattedVisitDate.replace(',', '').toUpperCase();
    }

    if (shareTheme === 'minimal') {
      return formattedVisitDate.replace(',', '');
    }

    if (shareTheme === 'neon') {
      return formattedVisitDate.replace(',', '').toUpperCase();
    }

    return formattedVisitDate;
  }, [formattedVisitDate, shareTheme]);

  const sharePalette = useMemo(() => getVisitSharePalette(theme, shareTheme), [shareTheme, theme]);
  const styles = useStyles(sharePalette);
  const effectiveTopInset = topInsetConsumedByOverlay ? 0 : insets.top;

  const markPhotoReady = useCallback((photoId: string) => {
    setReadyPhotoIds((previous) => {
      if (previous.has(photoId)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(photoId);
      return next;
    });
  }, []);

  const handleShare = useCallback(async () => {
    if (!shareCanvasRef.current) {
      return;
    }

    trackObservabilityEvent('VISIT_SHARE_RENDER_STARTED', {
      itemCount: items.length,
      source: 'VisitShareCustomizationScreen',
      theme: shareTheme,
    });
    setErrorMessage(null);
    setIsSharing(true);

    try {
      const capturedUri = await captureRef(shareCanvasRef, {
        format: 'jpg',
        height: storyCaptureSize.height,
        quality: 0.95,
        result: 'tmpfile',
        width: storyCaptureSize.width,
      });

      const shareResult = await Share.share({
        message:
          Platform.OS === 'android'
            ? `Check out what I tried at ${restaurantName}!`
            : undefined,
        url: capturedUri,
      });
      trackObservabilityEvent('VISIT_SHARE_COMPLETED', {
        action: shareResult.action,
        itemCount: items.length,
        source: 'VisitShareCustomizationScreen',
      });

      navigation.goBack();
    } catch (error) {
      trackObservabilityEvent('VISIT_SHARE_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'VisitShareCustomizationScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not share visit image.');
    } finally {
      setIsSharing(false);
    }
  }, [items.length, navigation, restaurantName, shareTheme, storyCaptureSize.height, storyCaptureSize.width]);
  const overlayPrimaryVariant = isRusticTheme
    ? 'titleXs'
    : isMinimalTheme
      ? 'bodyLgTightSemiBold'
      : isNeonTheme
        ? 'titleXsTight'
        : 'titleBase';
  const overlaySecondaryVariant = isRusticTheme || isMinimalTheme
    ? 'bodyMdTight'
    : isNeonTheme
      ? 'metaTight'
      : 'bodyBase';
  const overlayRatingVariant = isRusticTheme
    ? 'labelMd'
    : isMinimalTheme
      ? 'bodyMdTightMedium'
      : isNeonTheme
        ? 'metaTightStrong'
        : 'bodyBase';
  const overlayPrimaryDecorationStyle = isRusticTheme
    ? styles.overlayPrimaryRustic
    : isNeonTheme
      ? styles.overlayPrimaryNeon
      : null;
  const overlaySecondaryDecorationStyle = isRusticTheme
    ? styles.overlaySecondaryRustic
    : isNeonTheme
      ? styles.overlaySecondaryNeon
      : null;
  const overlayDateDecorationStyle = isRusticTheme
    ? styles.dateTextRustic
    : isMinimalTheme
      ? styles.dateTextMinimal
      : isNeonTheme
        ? styles.dateTextNeon
        : null;
  const overlayRatingDecorationStyle = isRusticTheme
    ? styles.ratingTextRustic
    : isNeonTheme
      ? styles.ratingTextNeon
      : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.sm, effectiveTopInset + theme.spacing.xs) }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} variant="cardTitle">
            Share Visit
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle} variant="metaRegular">
            {previewItems.length} dish{previewItems.length === 1 ? '' : 'es'} from {restaurantName}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close share customization"
          onPress={() => {
            navigation.goBack();
          }}
          style={styles.closeButton}
        >
          <Ionicons color={sharePalette.closeIcon} name="close" size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.previewScrollContent} style={styles.previewScroll}>
        <View
          collapsable={false}
          ref={shareCanvasRef}
          testID="visit-share-canvas"
          style={[
            styles.shareCanvas,
            {
              backgroundColor: sharePalette.canvasBackground,
              borderColor: sharePalette.canvasBorder,
              width: previewWidth,
            },
          ]}
        >
          <View
            style={[
              styles.shareCanvasContent,
              {
                paddingBottom: shareFooterHeight,
              },
            ]}
            testID="visit-share-canvas-content"
          >
            {previewItems.map((item) => (
              <View
                key={item.itemId}
                style={[
                  styles.shareItemCard,
                  {
                    backgroundColor: sharePalette.itemBackground,
                    borderColor: sharePalette.itemBorder,
                  },
                  isRusticTheme ? { borderWidth: 2, borderRadius: 0 } : null,
                  isMinimalTheme ? { borderWidth: 1, borderRadius: 0 } : null,
                  isNeonTheme ? { borderWidth: 2, borderRadius: 0 } : null,
                  shareTheme === 'modern' ? { borderWidth: 1, borderRadius: 0 } : null,
                ]}
              >
                <CachedRemoteImage
                  onError={() => {
                    markPhotoReady(item.photoId);
                  }}
                  onLoad={() => {
                    markPhotoReady(item.photoId);
                  }}
                  resizeMode="cover"
                  style={styles.shareImage}
                  uri={item.photoUrl}
                />
                {hasVisibleItemOverlay ? (
                  <View
                    style={[
                      styles.shareOverlay,
                      isRusticTheme
                        ? styles.shareOverlayRustic
                        : isMinimalTheme
                          ? styles.shareOverlayMinimal
                          : isNeonTheme
                            ? styles.shareOverlayNeon
                            : styles.shareOverlayModern,
                      {
                        backgroundColor: sharePalette.overlayBackground,
                        borderTopColor: sharePalette.overlayTopBorderColor,
                        borderBottomColor: sharePalette.overlayBottomBorderColor,
                      },
                    ]}
                  >
                    {showDishNames ? (
                      <Text
                        style={[
                          overlayPrimaryDecorationStyle,
                          { color: sharePalette.primaryText },
                        ]}
                        variant={overlayPrimaryVariant}
                      >
                        {item.itemName}
                      </Text>
                    ) : null}
                    {showRating ? (
                      <View
                        style={[
                          styles.ratingRow,
                          styles.ratingBadge,
                          isRusticTheme
                            ? styles.ratingBadgeRustic
                            : isMinimalTheme
                              ? styles.ratingBadgeMinimal
                              : isNeonTheme
                                ? styles.ratingBadgeNeon
                                : styles.ratingBadgeModern,
                          !showDishNames ? styles.ratingBadgeAlignedRight : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.ratingDot,
                            isRusticTheme
                              ? styles.ratingDotRustic
                              : isMinimalTheme
                                ? styles.ratingDotMinimal
                                : null,
                            { backgroundColor: getRatingColor(theme, item.rating) },
                          ]}
                        />
                        <Text
                          style={[
                            overlayRatingDecorationStyle,
                            { color: sharePalette.secondaryText },
                          ]}
                          variant={overlayRatingVariant}
                        >
                          {getRatingLabel(item.rating)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <View
            testID="visit-share-brand-footer"
            style={[
              styles.shareBrandFooter,
              {
                backgroundColor: sharePalette.brandFooterBackground,
                borderTopColor: sharePalette.brandFooterBorder,
                height: shareFooterHeight,
              },
            ]}
          >
            {hasVisibleFooterMeta ? (
              <View style={styles.shareFooterMeta} testID="visit-share-footer-meta">
                {showRestaurantName ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.shareFooterMetaText,
                      overlaySecondaryDecorationStyle,
                      { color: sharePalette.brandFooterText },
                    ]}
                    testID="visit-share-footer-restaurant"
                    variant={overlaySecondaryVariant}
                  >
                    {restaurantName}
                  </Text>
                ) : null}
                {showDate ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.shareFooterMetaText,
                      overlayDateDecorationStyle,
                      { color: sharePalette.brandFooterText },
                    ]}
                    testID="visit-share-footer-date"
                    variant={overlaySecondaryVariant}
                  >
                    {themedDateLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.shareBrandRow}>
              <Image resizeMode="contain" source={BRAND_LOGO} style={styles.shareBrandLogo} />
              <Text style={[styles.shareBrandLabel, { color: sharePalette.brandFooterText }]} variant="label">
                {APP_NAME}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.optionPanel, { paddingBottom: Math.max(theme.spacing.sm, insets.bottom) }]}>
        <View>
          <SectionHeader
            style={styles.optionSectionHeader}
            title="Overlay style"
            titleStyle={styles.optionSectionTitle}
            titleTone="inverse"
            titleVariant="label"
          />
          <View style={styles.chipRow}>
            {(['modern', 'rustic', 'minimal', 'neon'] as const).map((option) => {
              const isActive = shareTheme === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setShareTheme(option);
                  }}
                  style={[styles.chipButton, isActive && styles.chipButtonActive]}
                >
                  <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <SectionHeader
            style={styles.optionSectionHeader}
            title="Show on photos"
            titleStyle={styles.optionSectionTitle}
            titleTone="inverse"
            titleVariant="label"
          />
          <View style={styles.chipRow}>
            {[
              { key: 'dish' as const, label: 'Dish Name', active: showDishNames, setValue: setShowDishNames },
              { key: 'rating' as const, label: 'Rating', active: showRating, setValue: setShowRating },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  option.setValue((previous) => !previous);
                }}
                style={[styles.chipButton, option.active && styles.chipButtonActive]}
              >
                <Text style={[styles.chipLabel, option.active && styles.chipLabelActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <SectionHeader
            style={styles.optionSectionHeader}
            title="Show in footer"
            titleStyle={styles.optionSectionTitle}
            titleTone="inverse"
            titleVariant="label"
          />
          <View style={styles.chipRow}>
            {[
              { key: 'restaurant' as const, label: 'Restaurant', active: showRestaurantName, setValue: setShowRestaurantName },
              { key: 'date' as const, label: 'Date', active: showDate, setValue: setShowDate },
            ].map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  option.setValue((previous) => !previous);
                }}
                style={[styles.chipButton, option.active && styles.chipButtonActive]}
              >
                <Text style={[styles.chipLabel, option.active && styles.chipLabelActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {errorMessage ? (
          <Text style={[styles.statusText, styles.statusErrorText]}>{errorMessage}</Text>
        ) : !areAllPhotosReady ? (
          <LoadingState label="Loading photos..." style={styles.statusLoading} />
        ) : (
          <Text style={styles.statusText}>{''}</Text>
        )}

        <Button
          disabled={!areAllPhotosReady}
          label="Share Visit"
          loading={isSharing}
          onPress={() => {
            void handleShare();
          }}
          style={styles.shareButton}
        />
      </View>
    </View>
  );
}
