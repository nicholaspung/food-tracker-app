import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";
import { pb } from "@/lib/pocketbase";
import { useErrorHandler } from "@/hooks/ui/useErrorHandler";
import { ErrorDisplay } from "@/components/shared/ErrorDisplay";
import { COLLECTIONS } from '@/constants/collections';
import { LoadingState } from "@/components/ui/LoadingState";

interface VerifyEmailPageProps {
  token: string;
  onNavigateToLogin: () => void;
}

export default function VerifyEmailPage({ token, onNavigateToLogin }: VerifyEmailPageProps) {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const { error, handleError, clearError } = useErrorHandler({
    source: 'VerifyEmailPage',
    defaultSeverity: 'error',
  });
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        await pb.collection(COLLECTIONS.USERS).confirmVerification(token);
        setStatus('success');
      } catch (err: any) {
        logger.error("Email verification error:", err);
        setStatus('error');
        handleError(err, { customMessage: "Failed to verify email. The link may be invalid or expired." });
      }
    };

    verifyEmail();
  }, [token]);

  // Auto-redirect countdown after successful verification
  useEffect(() => {
    if (status === 'success' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (status === 'success' && countdown === 0) {
      onNavigateToLogin();
    }
  }, [status, countdown, onNavigateToLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="verify-email-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="verify-email-title">
            {status === 'verifying' && 'Verifying Email...'}
            {status === 'success' && 'Email Verified! ✓'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
          <CardDescription className="text-center" data-testid="verify-email-description">
            {status === 'verifying' && 'Please wait while we verify your email address'}
            {status === 'success' && 'Your email has been successfully verified'}
            {status === 'error' && 'We couldn\'t verify your email address'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'verifying' && (
            <LoadingState message="" size="lg" />
          )}
          {status === 'success' && (
            <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md" data-testid="verify-email-success">
              <div className="font-semibold mb-1">Verification Complete!</div>
              <div>You can now log in to your account.</div>
              <div className="mt-2 text-xs text-green-600">Redirecting to login in {countdown}...</div>
            </div>
          )}
          {status === 'error' && (
            <ErrorDisplay error={error} onClear={clearError} testId="verify-email-error" />
          )}
        </CardContent>
        {status !== 'verifying' && (
          <CardFooter>
            <Button
              type="button"
              className="w-full"
              onClick={onNavigateToLogin}
              data-testid="verify-email-goto-login"
            >
              Go to Login
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
