import {
  Component,
  Suspense,
  createElement,
  lazy,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from 'react';
import { View } from 'react-native';

import { ErrorState } from '../components/shared/ErrorState';
import { LoadingState } from '../components/shared/LoadingState';
import { createThemedStyles } from '../theme';

type LazyScreenModule<T extends ComponentType<any>> = Promise<{ default: T }>;

interface LazyScreenErrorBoundaryProps {
  children: ReactNode;
  screenName: string;
}

interface LazyScreenErrorBoundaryState {
  hasError: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  state: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
}));

function LazyScreenLoadingState() {
  const styles = useStyles();

  return (
    <View style={styles.state}>
      <LoadingState label="Loading screen..." />
    </View>
  );
}

function LazyScreenErrorState({ screenName }: { screenName: string }) {
  const styles = useStyles();

  return (
    <View style={styles.state}>
      <ErrorState
        analyticsProps={{ screenName }}
        analyticsSource="LazyScreen"
        description="Restart the app to try again."
        title="Screen could not be loaded"
      />
    </View>
  );
}

class LazyScreenErrorBoundary extends Component<
  LazyScreenErrorBoundaryProps,
  LazyScreenErrorBoundaryState
> {
  state: LazyScreenErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyScreenErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <LazyScreenErrorState screenName={this.props.screenName} />;
    }

    return this.props.children;
  }
}

export function createLazyScreen<T extends ComponentType<any>>(
  screenName: string,
  load: () => LazyScreenModule<T>,
): T {
  const LazyComponent = lazy(load);

  function LazyScreen(props: ComponentProps<T>) {
    return (
      <LazyScreenErrorBoundary screenName={screenName}>
        <Suspense fallback={<LazyScreenLoadingState />}>
          {createElement(LazyComponent, props)}
        </Suspense>
      </LazyScreenErrorBoundary>
    );
  }

  LazyScreen.displayName = `Lazy${screenName}`;
  return LazyScreen as T;
}
