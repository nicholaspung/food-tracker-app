import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import { findNodeHandle, Keyboard, Platform } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

interface KeyboardAwareScrollContextValue {
  scrollToFocusedInput: (input: TextInput | null) => void;
  clearFocusedInput: (input?: TextInput | null) => void;
}

const noop = () => {};

const KeyboardAwareScrollContext = createContext<KeyboardAwareScrollContextValue>({
  scrollToFocusedInput: noop,
  clearFocusedInput: noop,
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
  const activeInputRef = useRef<TextInput | null>(null);

  const scrollInputIntoView = useCallback(
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

  const scrollToFocusedInput = useCallback(
    (input: TextInput | null) => {
      activeInputRef.current = input;
      scrollInputIntoView(input);
    },
    [scrollInputIntoView],
  );

  const clearFocusedInput = useCallback((input?: TextInput | null) => {
    if (!input || activeInputRef.current === input) {
      activeInputRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleKeyboardShow = () => {
      scrollInputIntoView(activeInputRef.current);
    };

    const showEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const frameChangeEventName = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : null;

    const showSubscription = Keyboard.addListener(showEventName, handleKeyboardShow);
    const frameChangeSubscription = frameChangeEventName
      ? Keyboard.addListener(frameChangeEventName, handleKeyboardShow)
      : null;

    return () => {
      showSubscription.remove();
      frameChangeSubscription?.remove();
    };
  }, [scrollInputIntoView]);

  return (
    <KeyboardAwareScrollContext.Provider value={{ clearFocusedInput, scrollToFocusedInput }}>
      {children}
    </KeyboardAwareScrollContext.Provider>
  );
}

export function useKeyboardAwareScroll() {
  return useContext(KeyboardAwareScrollContext);
}
