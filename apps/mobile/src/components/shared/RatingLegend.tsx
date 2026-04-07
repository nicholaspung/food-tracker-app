import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { RATING_OPTIONS } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import { resolveRatingColor } from './RatingSelector';

interface RatingLegendProps {
  initiallyExpanded?: boolean;
  persistenceKey?: string | null;
}

const DEFAULT_PERSISTENCE_KEY = 'ui.ratingGuide.expanded';

const useStyles = createThemedStyles((theme) => ({
  card: {
    borderColor: theme.colors.border.info,
    borderWidth: 2,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  options: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 6,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  badgeText: {
    color: theme.colors.text.inverse,
  },
}));

export function RatingLegend({
  initiallyExpanded = false,
  persistenceKey = DEFAULT_PERSISTENCE_KEY,
}: RatingLegendProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  useEffect(() => {
    if (!persistenceKey) {
      return;
    }

    let isMounted = true;

    const loadPreference = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(persistenceKey);
        if (!isMounted || storedValue === null) {
          return;
        }

        setIsExpanded(storedValue === '1');
      } catch {
        // Ignore storage read errors and keep in-memory state.
      }
    };

    void loadPreference();

    return () => {
      isMounted = false;
    };
  }, [persistenceKey]);

  const handleToggle = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (persistenceKey) {
        void AsyncStorage.setItem(persistenceKey, next ? '1' : '0');
      }
      return next;
    });
  };

  return (
    <Card style={styles.card}>
      <Pressable onPress={handleToggle} style={styles.header} testID="rating-legend-toggle">
        <Text variant="label">Rating Guide</Text>
        <Text tone="muted">{isExpanded ? '▲' : '▼'}</Text>
      </Pressable>

      {isExpanded ? (
        <View style={styles.options}>
          {RATING_OPTIONS.map((option) => (
            <View key={option.value} style={styles.optionRow}>
              <View style={[styles.badge, { backgroundColor: resolveRatingColor(theme, option.value) }]}>
                <Text style={styles.badgeText} variant="labelStrong">{option.value}</Text>
              </View>
              <Text tone="secondary">{option.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
