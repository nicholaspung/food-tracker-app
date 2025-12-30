import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
  /** Duration in ms before long press triggers (default: 500) */
  threshold?: number;
  /** Callback when long press is detected */
  onLongPress: () => void;
  /** Optional callback for regular click/tap */
  onClick?: () => void;
}

export interface UseLongPressResult {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onContextMenu: (e: React.MouseEvent | React.TouchEvent) => void;
}

/**
 * Hook to detect long-press gestures on both touch and mouse devices.
 *
 * @example
 * const longPressHandlers = useLongPress({
 *   threshold: 500,
 *   onLongPress: () => setShowMenu(true),
 *   onClick: () => console.log('regular click'),
 * });
 *
 * return <div {...longPressHandlers}>Long press me</div>;
 */
export function useLongPress({
  threshold = 500,
  onLongPress,
  onClick,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const startPress = useCallback(
    (x: number, y: number) => {
      isLongPressRef.current = false;
      startPosRef.current = { x, y };

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress();
      }, threshold);
    },
    [onLongPress, threshold]
  );

  const cancelPress = useCallback(
    (triggerClick: boolean = false) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // If it wasn't a long press and we should trigger click
      if (triggerClick && !isLongPressRef.current && onClick) {
        onClick();
      }

      startPosRef.current = null;
    },
    [onClick]
  );

  // Mouse handlers
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left click
      if (e.button !== 0) return;
      startPress(e.clientX, e.clientY);
    },
    [startPress]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      cancelPress(true);
    },
    [cancelPress]
  );

  const onMouseLeave = useCallback(() => {
    cancelPress(false);
  }, [cancelPress]);

  // Touch handlers
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startPress(touch.clientX, touch.clientY);
    },
    [startPress]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Prevent mouse events from firing after touch
      e.preventDefault();
      cancelPress(true);
    },
    [cancelPress]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Cancel if finger moves more than 10px (scrolling, not long press)
      if (startPosRef.current) {
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - startPosRef.current.x);
        const dy = Math.abs(touch.clientY - startPosRef.current.y);
        if (dx > 10 || dy > 10) {
          cancelPress(false);
        }
      }
    },
    [cancelPress]
  );

  // Prevent native context menu on long press
  const onContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  }, []);

  return {
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onContextMenu,
  };
}
