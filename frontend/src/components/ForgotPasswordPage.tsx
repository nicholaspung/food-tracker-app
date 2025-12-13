import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";
import { pb } from "@/lib/pocketbase";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { ERROR_MESSAGES } from "@/lib/errorMessages";

interface ForgotPasswordPageProps {
  onNavigateToLogin: () => void;
}

export default function ForgotPasswordPage({ onNavigateToLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const { error, handleError, clearError, showSuccess } = useErrorHandler({
    source: 'ForgotPasswordPage',
    defaultSeverity: 'error',
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccess(false);
    setLoading(true);

    try {
      await pb.collection('users').requestPasswordReset(email);
      setSuccess(true);
      showSuccess("Password reset email sent! Check your inbox.");
      setEmail(""); // Clear the form
    } catch (err: any) {
      logger.error("Password reset request error:", err);
      handleError(err, { customMessage: ERROR_MESSAGES.AUTH.SEND_RESET_EMAIL_FAILED });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="forgot-password-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="forgot-password-title">
            Forgot Password?
          </CardTitle>
          <CardDescription className="text-center" data-testid="forgot-password-description">
            Enter your email address and we'll send you a password reset link
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} data-testid="forgot-password-form">
          <CardContent className="space-y-4">
            <ErrorDisplay error={error} onClear={clearError} testId="forgot-password-error" />
            {success && (
              <div className="p-3 text-sm text-green-500 bg-green-50 border border-green-200 rounded-md" data-testid="forgot-password-success">
                Password reset email sent! Please check your inbox and spam folder.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                data-testid="forgot-password-email"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || success} data-testid="forgot-password-submit">
              {loading ? "Sending..." : success ? "Email Sent" : "Send Reset Link"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Remember your password?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={onNavigateToLogin}
                disabled={loading}
                data-testid="forgot-password-goto-login"
              >
                Back to login
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
