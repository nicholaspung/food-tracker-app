import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Button } from '../../ui';

const useStyles = createThemedStyles((theme) => ({
  footer: {
    paddingTop: theme.spacing.md,
  },
}));

interface FeatureListFooterProps {
  isFetchingNextPage: boolean;
  label: string;
  loadingLabel?: string;
  onLoadMore: () => Promise<unknown> | void;
  testID?: string;
}

export function FeatureListFooter({
  isFetchingNextPage,
  label,
  loadingLabel = 'Loading more...',
  onLoadMore,
  testID,
}: FeatureListFooterProps) {
  const styles = useStyles();

  return (
    <View style={styles.footer}>
      <Button
        label={isFetchingNextPage ? loadingLabel : label}
        loading={isFetchingNextPage}
        onPress={() => {
          void onLoadMore();
        }}
        testID={testID}
        variant="secondary"
      />
    </View>
  );
}
