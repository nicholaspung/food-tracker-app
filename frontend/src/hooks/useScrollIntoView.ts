import { useRef, useEffect } from 'react';

/**
 * Hook to automatically scroll an input into view when focused
 * Useful on mobile where the keyboard can cover the input
 */
export function useScrollIntoView<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleFocus = () => {
      // Small delay to allow keyboard to appear
      setTimeout(() => {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    };

    element.addEventListener('focus', handleFocus);

    return () => {
      element.removeEventListener('focus', handleFocus);
    };
  }, []);

  return ref;
}
