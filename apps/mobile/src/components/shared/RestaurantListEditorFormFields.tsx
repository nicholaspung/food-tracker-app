import { createThemedStyles } from '../../theme';
import { Card, Input, Text } from '../../ui';
import { VisibilityOptionSelector, type VisibilityOptionValue } from './VisibilityOptionSelector';

export type RestaurantListEditorVisibility = Extract<VisibilityOptionValue, 'friends' | 'private'>;

interface RestaurantListEditorFormFieldsProps {
  name: string;
  description: string;
  visibility: RestaurantListEditorVisibility;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: RestaurantListEditorVisibility) => void;
  namePlaceholder: string;
  descriptionPlaceholder?: string;
  nameTestID?: string;
  descriptionTestID?: string;
}

const LIST_VISIBILITY_OPTIONS: readonly RestaurantListEditorVisibility[] = ['friends', 'private'];

const useStyles = createThemedStyles((theme) => ({
  formCard: {
    borderColor: theme.colors.border.info,
    gap: theme.spacing.sm,
  },
  descriptionInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
}));

export function RestaurantListEditorFormFields({
  name,
  description,
  visibility,
  onNameChange,
  onDescriptionChange,
  onVisibilityChange,
  namePlaceholder,
  descriptionPlaceholder = 'Optional description',
  nameTestID,
  descriptionTestID,
}: RestaurantListEditorFormFieldsProps) {
  const styles = useStyles();

  return (
    <Card style={styles.formCard} tone="default">
      <Input
        autoCapitalize="words"
        label="List name"
        onChangeText={onNameChange}
        placeholder={namePlaceholder}
        testID={nameTestID}
        value={name}
      />
      <Input
        label="Description"
        inputStyle={styles.descriptionInput}
        multiline
        onChangeText={onDescriptionChange}
        placeholder={descriptionPlaceholder}
        testID={descriptionTestID}
        value={description}
      />
      <Text variant="label">Visibility</Text>
      <VisibilityOptionSelector
        onChange={(nextVisibility) => {
          const resolvedVisibility: RestaurantListEditorVisibility =
            nextVisibility === 'friends' ? 'friends' : 'private';
          onVisibilityChange(resolvedVisibility);
        }}
        options={LIST_VISIBILITY_OPTIONS}
        value={visibility}
      />
    </Card>
  );
}
