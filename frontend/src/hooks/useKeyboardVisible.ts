import { useEffect, useState } from 'react';

/**
 * Hook to detect if the mobile keyboard is visible
 * Uses the Visual Viewport API to detect viewport height changes
 * which typically indicate the keyboard is shown/hidden
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Check if Visual Viewport API is supported
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    let initialHeight = viewport.height;

    const handleResize = () => {
      if (!viewport) return;

      const currentHeight = viewport.height;

      // If viewport height decreased significantly (more than 150px),
      // keyboard is likely visible
      const heightDiff = initialHeight - currentHeight;
      const isKeyboardShown = heightDiff > 150;

      setIsKeyboardVisible(isKeyboardShown);
    };

    // Set initial height when component mounts
    initialHeight = viewport.height;

    viewport.addEventListener('resize', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
    };
  }, []);

  return isKeyboardVisible;
}
