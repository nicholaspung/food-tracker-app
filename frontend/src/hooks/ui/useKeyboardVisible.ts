import { useEffect, useState, useRef } from 'react';

/**
 * Hook to detect if the mobile keyboard is visible
 * Uses the Visual Viewport API to detect viewport height changes
 * which typically indicate the keyboard is shown/hidden
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const maxHeightRef = useRef<number>(0);

  useEffect(() => {
    // Check if Visual Viewport API is supported
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    // Track the maximum height we've seen - this is the "full" viewport height
    maxHeightRef.current = Math.max(maxHeightRef.current, viewport.height);

    const handleResize = () => {
      if (!viewport) return;

      const currentHeight = viewport.height;

      // Update max height if we see a larger viewport (keyboard dismissed, orientation change, etc.)
      if (currentHeight > maxHeightRef.current) {
        maxHeightRef.current = currentHeight;
      }

      // If viewport height decreased significantly (more than 150px) from max,
      // keyboard is likely visible
      const heightDiff = maxHeightRef.current - currentHeight;
      const isKeyboardShown = heightDiff > 150;

      setIsKeyboardVisible(isKeyboardShown);
    };

    viewport.addEventListener('resize', handleResize);

    // Initial check
    handleResize();

    return () => {
      viewport.removeEventListener('resize', handleResize);
    };
  }, []);

  return isKeyboardVisible;
}
