import { View } from 'react-native';

import {
  PageErrorToast,
  VisibilityOptionSelector,
  type VisibilityOptionValue,
} from '../../components/shared';
import { createThemedStyles } from '../../theme';
import { Card, Input, Text } from '../../ui';

interface CreateVisitMenuItemEditorFormProps {
  description?: string;
  errorMessage: string | null;
  errorTitle: string;
  isOnline: boolean;
  menuItemName: string;
  offlineMessage: string;
  onMenuItemNameChange: (value: string) => void;
  onVisibilityChange: (value: VisibilityOptionValue) => void;
  visibility: VisibilityOptionValue;
}

const MENU_ITEM_VISIBILITY_OPTIONS: readonly VisibilityOptionValue[] = ['friends', 'private'];

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  visibilitySection: {
    gap: theme.spacing.xs,
  },
}));

export function CreateVisitMenuItemEditorForm({
  description,
  errorMessage,
  errorTitle,
  isOnline,
  menuItemName,
  offlineMessage,
  onMenuItemNameChange,
  onVisibilityChange,
  visibility,
}: CreateVisitMenuItemEditorFormProps) {
  const styles = useStyles();

  return (
    <View style={styles.body}>
      <PageErrorToast errorMessage={errorMessage} title={errorTitle} />

      {!isOnline ? (
        <Card tone="muted">
          <Text tone="warning">{offlineMessage}</Text>
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        {description ? <Text tone="secondary">{description}</Text> : null}

        <Input
          autoCapitalize="words"
          label="Item Name"
          onChangeText={onMenuItemNameChange}
          placeholder="Menu item name"
          value={menuItemName}
        />

        <View style={styles.visibilitySection}>
          <Text variant="label">Visibility</Text>
          <VisibilityOptionSelector
            onChange={(nextVisibility) => {
              onVisibilityChange(nextVisibility === 'private' ? 'private' : 'friends');
            }}
            options={MENU_ITEM_VISIBILITY_OPTIONS}
            value={visibility}
          />
        </View>
      </Card>
    </View>
  );
}
