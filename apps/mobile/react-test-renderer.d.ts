declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestRenderer {
    unmount(): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): void | Promise<void>;
}
