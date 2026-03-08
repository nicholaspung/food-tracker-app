import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal as RNModal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPhotoViewerPalette, useTheme } from '../../theme';
import { Text } from '../../ui';

export interface PhotoViewerModalProps {
  visible: boolean;
  urls: string[];
  ownerLabels?: string[];
  initialIndex?: number;
  onRequestClose: () => void;
}

export function PhotoViewerModal({
  visible,
  urls,
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
  }, [boundedInitialIndex, urls.length, visible]);

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

  const styles = StyleSheet.create({
    modalContainer: {
      backgroundColor: viewerPalette.background,
      flex: 1,
    },
    topBar: {
      alignItems: 'flex-end',
      paddingHorizontal: theme.spacing.md,
      paddingTop: Math.max(theme.spacing.sm, insets.top + theme.spacing.xs),
    },
    closeButton: {
      alignItems: 'center',
      backgroundColor: viewerPalette.controlBackground,
      borderRadius: theme.radii.pill,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    list: {
      flex: 1,
    },
    slide: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: {
      height: '100%',
      resizeMode: 'contain',
      width: '100%',
    },
    bottomBar: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm),
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    navButton: {
      alignItems: 'center',
      backgroundColor: viewerPalette.controlBackground,
      borderRadius: theme.radii.pill,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    navButtonDisabled: {
      opacity: 0.35,
    },
    count: {
      color: viewerPalette.text,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
    },
    centerMeta: {
      alignItems: 'center',
      flex: 1,
      gap: 2,
    },
    ownerLabel: {
      color: viewerPalette.text,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
      opacity: 0.9,
    },
  });

  return (
    <RNModal
      animationType="fade"
      onRequestClose={onRequestClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.modalContainer}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Close photo viewer" onPress={onRequestClose} style={styles.closeButton}>
            <Ionicons color={theme.colors.text.inverse} name="close" size={22} />
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
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: viewportWidth }]}>
                <Image source={{ uri: item }} style={styles.image} />
              </View>
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
            <Ionicons color={theme.colors.text.inverse} name="chevron-back" size={24} />
          </Pressable>

          <View style={styles.centerMeta}>
            {currentOwnerLabel ? <Text style={styles.ownerLabel}>{currentOwnerLabel}</Text> : null}
            <Text style={styles.count}>
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
            <Ionicons color={theme.colors.text.inverse} name="chevron-forward" size={24} />
          </Pressable>
        </View>
      </View>
    </RNModal>
  );
}
