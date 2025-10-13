import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";

interface ResetPasswordPageProps {
  token: string;
  onNavigateToLogin: () => void;
  onResetSuccess?: () => void;
}

export default function ResetPasswordPage({ token, onNavigateToLogin, onResetSuccess }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    // Client-side validation
    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);
      setSuccess(true);
      
      // Call success callback after a short delay
      setTimeout(() => {
        onResetSuccess?.();
      }, 2000);
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(err?.message || "Failed to reset password. The link may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="reset-password-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="reset-password-title">
            Reset Password
          </CardTitle>
          <CardDescription className="text-center" data-testid="reset-password-description">
            Enter your new password
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} data-testid="reset-password-form">
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md" data-testid="reset-password-error">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm text-green-500 bg-green-50 border border-green-200 rounded-md" data-testid="reset-password-success">
                Password reset successfully! Redirecting to login...
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter new password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading || success}
                data-testid="reset-password-password"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirm Password</Label>
              <Input
                id="passwordConfirm"
                type="password"
                placeholder="Confirm new password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                disabled={loading || success}
                data-testid="reset-password-confirm"
                minLength={8}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || success} data-testid="reset-password-submit">
              {loading ? "Resetting..." : success ? "Password Reset!" : "Reset Password"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Remember your password?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={onNavigateToLogin}
                disabled={loading}
                data-testid="reset-password-goto-login"
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
