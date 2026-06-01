import type { ComponentProps } from 'react';
import { Ionicons as ReactNativeIonicons } from '@react-native-vector-icons/ionicons';
import glyphMap from '@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json';

export const Ionicons = Object.assign(ReactNativeIonicons, { glyphMap });

export type AppIconName = ComponentProps<typeof Ionicons>['name'];
