import { useCallback, useEffect } from 'react';
import {
  Image,
  type ImageErrorEventData,
  type ImageLoadEventData,
  type ImageResizeMode,
  type NativeSyntheticEvent,
  type StyleProp,
  type ImageStyle,
} from 'react-native';

import {
  buildCachedImageSource,
  markPhotoImageLoaded,
  prefetchPhotoImages,
} from '../../lib/photoImageCache';

export interface CachedRemoteImageProps {
  accessibilityLabel?: string;
  onError?: (event: NativeSyntheticEvent<ImageErrorEventData>) => void;
  onLoad?: (event: NativeSyntheticEvent<ImageLoadEventData>) => void;
  resizeMode?: ImageResizeMode;
  style?: StyleProp<ImageStyle>;
  testID?: string;
  uri: string;
}

export function CachedRemoteImage({
  accessibilityLabel,
  onError,
  onLoad,
  resizeMode,
  style,
  testID,
  uri,
}: CachedRemoteImageProps) {
  useEffect(() => {
    prefetchPhotoImages([uri]);
  }, [uri]);

  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      markPhotoImageLoaded(uri);
      onLoad?.(event);
    },
    [onLoad, uri],
  );

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      fadeDuration={0}
      onError={onError}
      onLoad={handleLoad}
      resizeMode={resizeMode}
      source={buildCachedImageSource(uri)}
      style={style}
      testID={testID}
    />
  );
}
