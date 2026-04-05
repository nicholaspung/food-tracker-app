import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RATING_OPTIONS } from '../../lib/ratingConstants';
import { useTheme } from '../../theme';
import { Card, Text } from '../../ui';
import { resolveRatingColor } from './RatingSelector';

interface RatingLegendProps {
    initiallyExpanded?: boolean;
    persistenceKey?: string | null;
}

const DEFAULT_PERSISTENCE_KEY = 'ui.ratingGuide.expanded';

export function RatingLegend({
    initiallyExpanded = false,
    persistenceKey = DEFAULT_PERSISTENCE_KEY,
}: RatingLegendProps) {
    const theme = useTheme();
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

    const dynamicStyles = StyleSheet.create({
        card: {
            borderWidth: 2,
            borderColor: theme.colors.border.info,
        },
        badge: {
            width: 28,
            height: 28,
            borderRadius: 6,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
        },
        badgeText: {
            color: theme.colors.text.inverse,
        },
    });

    return (
        <Card style={dynamicStyles.card}>
            <Pressable onPress={handleToggle} style={styles.header} testID="rating-legend-toggle">
                <Text variant="label">Rating Guide</Text>
                <Text tone="muted">{isExpanded ? '▲' : '▼'}</Text>
            </Pressable>

            {isExpanded && (
                <View style={styles.options}>
                    {RATING_OPTIONS.map((option) => (
                        <View key={option.value} style={styles.optionRow}>
                            <View style={[dynamicStyles.badge, { backgroundColor: resolveRatingColor(theme, option.value) }]}>
                                <Text style={dynamicStyles.badgeText} variant="labelStrong">{option.value}</Text>
                            </View>
                            <Text tone="secondary">{option.label}</Text>
                        </View>
                    ))}
                </View>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    options: {
        marginTop: 12,
        gap: 8,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
});
