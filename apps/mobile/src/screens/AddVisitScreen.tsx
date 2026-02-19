import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddOptionCard } from '../components/add';
import { ScreenHeader, TabRootScreenScaffold } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useTheme } from '../theme';

type AddVisitScreenProps = NativeStackScreenProps<RootStackParamList, 'AddVisit'>;
type AddOptionId = 'restaurant-visit' | 'quick-track' | 'log-note' | 'process-photos' | 'manage-notes';

interface AddOptionConfig {
  id: AddOptionId;
  title: string;
  description: string;
  icon: ComponentProps<typeof AddOptionCard>['icon'];
  iconBackground: string;
  iconColor: string;
}

export function AddVisitScreen({ navigation }: AddVisitScreenProps) {
  const theme = useTheme();

  const optionColors = {
    restaurant: theme.colors.text.info,
    quickTrack: theme.colors.text.success,
    logNote: theme.colors.text.warning,
    processPhotos: theme.colors.text.brand,
    manageNotes: theme.colors.text.secondary,
    iconOnColor: theme.colors.text.inverse,
  } as const;

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: theme.colors.background.muted,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    header: {
      gap: theme.spacing.xxs,
      paddingBottom: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    headerTitle: {
      color: theme.colors.text.primary,
      fontSize: 30,
      fontWeight: '700',
      lineHeight: 36,
    },
    body: {
      flex: 1,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
    },
  });

  const options: AddOptionConfig[] = [
    {
      id: 'restaurant-visit',
      title: 'Track Restaurant Visit',
      description: 'Full experience with restaurant, menu items, and ratings',
      icon: 'restaurant-outline',
      iconBackground: optionColors.restaurant,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'quick-track',
      title: 'Quick Track Item',
      description: 'Quickly rate any item without a restaurant',
      icon: 'flash-outline',
      iconBackground: optionColors.quickTrack,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'log-note',
      title: 'Log a Note',
      description: 'Jot down notes about food/places for later',
      icon: 'document-text-outline',
      iconBackground: optionColors.logNote,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'process-photos',
      title: 'Process Saved Photos',
      description: 'Upload multiple photos and rate each one',
      icon: 'images-outline',
      iconBackground: optionColors.processPhotos,
      iconColor: optionColors.iconOnColor,
    },
    {
      id: 'manage-notes',
      title: 'Manage Notes',
      description: 'View, edit, or delete your saved notes',
      icon: 'folder-open-outline',
      iconBackground: optionColors.manageNotes,
      iconColor: optionColors.iconOnColor,
    },
  ];

  const handleOptionPress = (optionId: AddOptionId) => {
    if (optionId === 'restaurant-visit') {
      trackObservabilityEvent('Visit Creation Started', { source: 'AddVisitScreen' });
      navigation.navigate('CreateVisit');
      return;
    }

    if (optionId === 'quick-track') {
      trackObservabilityEvent('Quick Track Started', { source: 'AddVisitScreen' });
      navigation.navigate('QuickTrack');
      return;
    }

    if (optionId === 'process-photos') {
      trackObservabilityEvent('Photo Processing Started', { source: 'AddVisitScreen' });
      navigation.navigate('ProcessPhotos');
      return;
    }

    if (optionId === 'log-note') {
      navigation.navigate('NoteEditor');
      return;
    }

    navigation.navigate('Notes');
  };

  return (
    <TabRootScreenScaffold
      contentStyle={styles.screenContent}
      scrollUnderlayColor={theme.colors.background.muted}
      testID="add-visit-selector"
    >
      <ScreenHeader
        style={styles.header}
        subtitle="Choose how you want to track your food"
        title="Add New"
        titleStyle={styles.headerTitle}
      />

      <View style={styles.body}>
        {options.map((option) => (
          <AddOptionCard
            description={option.description}
            icon={option.icon}
            iconBackground={option.iconBackground}
            iconColor={option.iconColor}
            key={option.id}
            onPress={() => {
              handleOptionPress(option.id);
            }}
            testID={`add-option-${option.id}`}
            title={option.title}
          />
        ))}
      </View>
    </TabRootScreenScaffold>
  );
}
