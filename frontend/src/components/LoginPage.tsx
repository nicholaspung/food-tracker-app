import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";
import { logger } from "@/lib/logger";

interface LoginPageProps {
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword?: () => void;
  onLoginSuccess?: () => void;
}

export default function LoginPage({ onNavigateToSignUp, onNavigateToForgotPassword, onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerificationSent(false);
    setLoading(true);

    try {
      const authData = await pb.collection('users').authWithPassword(email, password);
      logger.log("Login successful:", pb.authStore.model);

      // Check if user is verified
      if (!authData.record.verified) {
        // User is not verified, log them out
        pb.authStore.clear();
        setError("verify");
        setLoading(false);
        return;
      }

      // Call success callback
      onLoginSuccess?.();
    } catch (err: any) {
      logger.error("Login error:", err);
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    setVerificationSent(false);

    try {
      await pb.collection('users').requestVerification(email);
      setVerificationSent(true);
    } catch (err: any) {
      logger.error("Resend verification error:", err);
      setError("Failed to resend verification email. Please try again.");
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="login-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="login-title">Welcome back</CardTitle>
          <CardDescription className="text-center" data-testid="login-description">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin} data-testid="login-form">
          <CardContent className="space-y-4">
            {error === "verify" && (
              <div className="p-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md" data-testid="login-verify-error">
                <div className="font-semibold mb-1">Email Not Verified</div>
                <div className="mb-2">Please verify your email address before logging in. Check your inbox for the verification link.</div>
                {verificationSent ? (
                  <div className="text-green-700">Verification email sent! Check your inbox.</div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={resendingVerification}
                    className="mt-2"
                    data-testid="login-resend-verification"
                  >
                    {resendingVerification ? "Sending..." : "Resend Verification Email"}
                  </Button>
                )}
              </div>
            )}
            {error && error !== "verify" && (
              <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md" data-testid="login-error">
                {error}
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
                data-testid="login-email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {onNavigateToForgotPassword && (
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={onNavigateToForgotPassword}
                    disabled={loading}
                    data-testid="login-forgot-password"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                data-testid="login-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Don't have an account?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={onNavigateToSignUp}
                disabled={loading}
                data-testid="login-goto-signup"
              >
                Sign up
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}