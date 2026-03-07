import { createContext, useCallback, useContext } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import { findNodeHandle } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

interface KeyboardAwareScrollContextValue {
  scrollToFocusedInput: (input: TextInput | null) => void;
}

const noop = () => {};

const KeyboardAwareScrollContext = createContext<KeyboardAwareScrollContextValue>({
  scrollToFocusedInput: noop,
});

interface KeyboardAwareScrollProviderProps {
  scrollViewRef: RefObject<ScrollView | null>;
  extraKeyboardOffset?: number;
}

export function KeyboardAwareScrollProvider({
  children,
  scrollViewRef,
  extraKeyboardOffset = 0,
}: PropsWithChildren<KeyboardAwareScrollProviderProps>) {
  const scrollToFocusedInput = useCallback(
    (input: TextInput | null) => {
      const scrollView = scrollViewRef.current;
      const inputNodeHandle = input ? findNodeHandle(input) : null;

      if (!scrollView || !inputNodeHandle) {
        return;
      }

      requestAnimationFrame(() => {
        const scrollResponder = scrollView.getScrollResponder();

        if (typeof scrollResponder?.scrollResponderScrollNativeHandleToKeyboard !== 'function') {
          return;
        }

        scrollResponder.scrollResponderScrollNativeHandleToKeyboard(inputNodeHandle, extraKeyboardOffset, true);
      });
    },
    [extraKeyboardOffset, scrollViewRef],
  );

  return (
    <KeyboardAwareScrollContext.Provider value={{ scrollToFocusedInput }}>
      {children}
    </KeyboardAwareScrollContext.Provider>
  );
}

export function useKeyboardAwareScroll() {
  return useContext(KeyboardAwareScrollContext);
}
