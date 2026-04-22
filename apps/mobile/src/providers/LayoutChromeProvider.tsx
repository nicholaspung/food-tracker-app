import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

interface LayoutChromeContextValue {
  topInsetConsumedByOverlay: boolean;
  topOverlayHeight: number;
}

const DEFAULT_LAYOUT_CHROME: LayoutChromeContextValue = {
  topInsetConsumedByOverlay: false,
  topOverlayHeight: 0,
};

const LayoutChromeContext = createContext<LayoutChromeContextValue>(DEFAULT_LAYOUT_CHROME);

interface LayoutChromeProviderProps {
  topInsetConsumedByOverlay?: boolean;
  topOverlayHeight?: number;
}

export function LayoutChromeProvider({
  children,
  topInsetConsumedByOverlay = false,
  topOverlayHeight = 0,
}: PropsWithChildren<LayoutChromeProviderProps>) {
  const value = useMemo<LayoutChromeContextValue>(
    () => ({
      topInsetConsumedByOverlay,
      topOverlayHeight,
    }),
    [topInsetConsumedByOverlay, topOverlayHeight],
  );

  return <LayoutChromeContext.Provider value={value}>{children}</LayoutChromeContext.Provider>;
}

export function useLayoutChrome() {
  return useContext(LayoutChromeContext);
}
