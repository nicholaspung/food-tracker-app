import { useCallback, useEffect, useState } from 'react';

import {
  checkAuthRateLimit,
  type AuthRateLimitDecision,
  type AuthRateLimitFlow,
} from '../lib/authRateLimiter';

const ALLOWED_DECISION: AuthRateLimitDecision = {
  allowed: true,
  failedAttempts: 0,
  message: null,
  remainingMs: 0,
};

export function useAuthRateLimit(flow: AuthRateLimitFlow, identifier?: string) {
  const [decision, setDecision] = useState<AuthRateLimitDecision>(ALLOWED_DECISION);

  const refresh = useCallback(async () => {
    const nextDecision = await checkAuthRateLimit(flow, identifier);
    setDecision(nextDecision);
    return nextDecision;
  }, [flow, identifier]);

  useEffect(() => {
    let isMounted = true;

    void checkAuthRateLimit(flow, identifier).then((nextDecision) => {
      if (isMounted) {
        setDecision(nextDecision);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [flow, identifier]);

  useEffect(() => {
    if (decision.allowed) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refresh();
    }, 1_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [decision.allowed, refresh]);

  return {
    decision,
    refresh,
    setDecision,
  };
}
