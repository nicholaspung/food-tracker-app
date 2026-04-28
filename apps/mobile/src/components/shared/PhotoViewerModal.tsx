import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  type ImageErrorEventData,
  type ImageLoadEventData,
  type ImageStyle,
  Modal as RNModal,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  type StyleProp,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildCachedImageSource,
  getPhotoImageCacheStatus,
  markPhotoImageLoaded,
  prefetchPhotoImages,
} from '../../lib/photoImageCache';
import { createThemedStyles, getPhotoViewerPalette, useTheme } from '../../theme';
import { Text } from '../../ui';
import { CachedRemoteImage } from './CachedRemoteImage';

export interface PhotoViewerModalProps {
  visible: boolean;
  urls: string[];
  previewUrls?: string[];
  ownerLabels?: string[];
  initialIndex?: number;
  onRequestClose: () => void;
}

const useStyles = createThemedStyles((
  theme,
  topPadding: number,
  bottomPadding: number,
  viewerBackground: string,
  viewerControlBackground: string,
  viewerText: string,
) => ({
  modalContainer: {
    backgroundColor: viewerBackground,
    flex: 1,
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingTop: topPadding,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: viewerControlBackground,
    borderRadius: theme.radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  list: {
    flex: 1,
  },
  bottomBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: bottomPadding,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: viewerControlBackground,
    borderRadius: theme.radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  count: {
    color: viewerText,
  },
  centerMeta: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  ownerLabel: {
    color: viewerText,
    opacity: 0.9,
  },
}));

const slideStyles = StyleSheet.create({
  image: {
    resizeMode: 'contain',
    ...StyleSheet.absoluteFillObject,
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideContent: {
    flex: 1,
    position: 'relative',
    width: '100%',
  },
});

interface PhotoViewerSlideProps {
  previewUri?: string;
  uri: string;
  visible: boolean;
  width: number;
}

interface ViewerImageProps {
  onError: (event: NativeSyntheticEvent<ImageErrorEventData>) => void;
  onLoad: (event: NativeSyntheticEvent<ImageLoadEventData>) => void;
  style: StyleProp<Animated.WithAnimatedValue<ImageStyle>>;
  testID: string;
  uri: string;
}

function ViewerImage({
  onError,
  onLoad,
  style,
  testID,
  uri,
}: ViewerImageProps) {
  return (
    <Animated.Image
      onError={onError}
      onLoad={onLoad}
      source={buildCachedImageSource(uri)}
      style={style}
      testID={testID}
    />
  );
}

function PhotoViewerSlide({
  previewUri,
  uri,
  visible,
  width,
}: PhotoViewerSlideProps) {
  const shouldShowPreview = Boolean(previewUri && previewUri !== uri);
  const cachedFullImageStatus = getPhotoImageCacheStatus(uri);
  const [isFullImageLoaded, setIsFullImageLoaded] = useState(
    !shouldShowPreview || cachedFullImageStatus === 'loaded',
  );
  const fullImageOpacity = useRef(
    new Animated.Value(shouldShowPreview && cachedFullImageStatus === 'unknown' ? 0 : 1),
  ).current;

  useEffect(() => {
    const nextCachedFullImageStatus = getPhotoImageCacheStatus(uri);
    const hasLoadedFullImage = nextCachedFullImageStatus === 'loaded';
    const initialOpacity = shouldShowPreview && nextCachedFullImageStatus === 'unknown' ? 0 : 1;
    setIsFullImageLoaded(!shouldShowPreview || hasLoadedFullImage);
    fullImageOpacity.stopAnimation();
    fullImageOpacity.setValue(initialOpacity);
  }, [fullImageOpacity, shouldShowPreview, uri, previewUri, visible]);

  const handleFullImageLoad = useCallback(() => {
    markPhotoImageLoaded(uri);

    if (!shouldShowPreview) {
      setIsFullImageLoaded(true);
      fullImageOpacity.stopAnimation();
      fullImageOpacity.setValue(1);
      return;
    }

    setIsFullImageLoaded(true);
    fullImageOpacity.stopAnimation();
    Animated.timing(fullImageOpacity, {
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [fullImageOpacity, shouldShowPreview, uri]);

  const handleFullImageError = useCallback(() => {
    if (!shouldShowPreview) {
      return;
    }

    fullImageOpacity.stopAnimation();
    fullImageOpacity.setValue(0);
  }, [fullImageOpacity, shouldShowPreview]);

  return (
    <View style={[slideStyles.slide, { width }]}>
      <View style={slideStyles.slideContent}>
        {shouldShowPreview && previewUri && !isFullImageLoaded ? (
          <CachedRemoteImage
            uri={previewUri}
            style={slideStyles.image}
            testID="photo-viewer-preview-image"
          />
        ) : null}
        <ViewerImage
          onError={handleFullImageError}
          onLoad={handleFullImageLoad}
          style={[slideStyles.image, { opacity: fullImageOpacity }]}
          testID="photo-viewer-full-image"
          uri={uri}
        />
      </View>
    </View>
  );
}

export function PhotoViewerModal({
  visible,
  urls,
  previewUrls,
  ownerLabels,
  initialIndex = 0,
  onRequestClose,
}: PhotoViewerModalProps) {
  const theme = useTheme();
  const viewerPalette = getPhotoViewerPalette(theme);
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const boundedInitialIndex = Math.max(0, Math.min(initialIndex, Math.max(0, urls.length - 1)));
  const hasPreviousPhoto = currentIndex > 0;
  const hasNextPhoto = currentIndex < urls.length - 1;
  const currentOwnerLabel = ownerLabels?.[currentIndex]?.trim() || null;
  const styles = useStyles(
    Math.max(theme.spacing.sm, insets.top + theme.spacing.xs),
    Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm),
    viewerPalette.background,
    viewerPalette.controlBackground,
    viewerPalette.text,
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setCurrentIndex(boundedInitialIndex);
    setTimeout(() => {
      if (urls.length === 0) {
        return;
      }

      listRef.current?.scrollToIndex({
        animated: false,
        index: boundedInitialIndex,
      });
    }, 0);
  }, [boundedInitialIndex, urls, visible]);

  useEffect(() => {
    if (!visible || urls.length === 0) {
      return;
    }

    prefetchPhotoImages([
      urls[currentIndex - 1],
      urls[currentIndex],
      urls[currentIndex + 1],
    ].filter((url): url is string => Boolean(url)));
  }, [currentIndex, urls, visible]);

  const goToPhotoIndex = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= urls.length) {
      return;
    }

    listRef.current?.scrollToIndex({ animated: true, index: targetIndex });
    setCurrentIndex(targetIndex);
  };

  const handleMomentumScrollEnd = (offsetX: number) => {
    if (viewportWidth <= 0 || urls.length === 0) {
      return;
    }

    const rawIndex = Math.round(offsetX / viewportWidth);
    const boundedIndex = Math.max(0, Math.min(rawIndex, urls.length - 1));
    setCurrentIndex(boundedIndex);
  };

  return (
    <RNModal
      animationType="fade"
      onRequestClose={onRequestClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.modalContainer}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Close photo viewer"
            onPress={onRequestClose}
            style={styles.closeButton}
            testID="photo-viewer-close-button"
          >
            <Ionicons color={viewerPalette.text} name="close" size={22} />
          </Pressable>
        </View>

        {urls.length > 0 ? (
          <FlatList
            ref={listRef}
            data={urls}
            getItemLayout={(_, index) => ({
              index,
              length: viewportWidth,
              offset: viewportWidth * index,
            })}
            horizontal
            initialScrollIndex={boundedInitialIndex}
            keyExtractor={(item, index) => `${item}_${index}`}
            onMomentumScrollEnd={(event) => {
              handleMomentumScrollEnd(event.nativeEvent.contentOffset.x);
            }}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({ animated: false, index });
              }, 0);
            }}
            pagingEnabled
            renderItem={({ item, index }) => (
              <PhotoViewerSlide
                previewUri={previewUrls?.[index]}
                uri={item}
                visible={visible}
                width={viewportWidth}
              />
            )}
            showsHorizontalScrollIndicator={false}
            style={styles.list}
          />
        ) : null}

        <View style={styles.bottomBar}>
          <Pressable
            accessibilityLabel="Previous photo"
            disabled={!hasPreviousPhoto}
            onPress={() => {
              goToPhotoIndex(currentIndex - 1);
            }}
            style={[styles.navButton, !hasPreviousPhoto && styles.navButtonDisabled]}
          >
            <Ionicons color={viewerPalette.text} name="chevron-back" size={24} />
          </Pressable>

          <View style={styles.centerMeta}>
            {currentOwnerLabel ? (
              <Text style={styles.ownerLabel} variant="bodySmTightSemiBold">
                {currentOwnerLabel}
              </Text>
            ) : null}
            <Text style={styles.count} variant="labelMd">
              {urls.length === 0 ? '0 / 0' : `${currentIndex + 1} / ${urls.length}`}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Next photo"
            disabled={!hasNextPhoto}
            onPress={() => {
              goToPhotoIndex(currentIndex + 1);
            }}
            style={[styles.navButton, !hasNextPhoto && styles.navButtonDisabled]}
          >
            <Ionicons color={viewerPalette.text} name="chevron-forward" size={24} />
          </Pressable>
        </View>
      </View>
    </RNModal>
  );
}
