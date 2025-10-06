import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";

interface SignUpPageProps {
  onNavigateToLogin: () => void;
  onSignUpSuccess?: () => void;
}

export default function SignUpPage({ onNavigateToLogin, onSignUpSuccess }: SignUpPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate passwords match
    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      // Create the user account
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm,
      });

      // Automatically log in the user after successful registration
      await pb.collection('users').authWithPassword(email, password);

      // Call success callback
      onSignUpSuccess?.();
    } catch (err: any) {
      console.error("Sign up error:", err);

      // Handle specific error messages from PocketBase
      if (err?.response?.data) {
        const errorData = err.response.data;
        if (errorData.email) {
          setError(`Email: ${errorData.email.message}`);
        } else if (errorData.password) {
          setError(`Password: ${errorData.password.message}`);
        } else {
          setError(err.message || "Failed to create account. Please try again.");
        }
      } else {
        setError("Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="signup-page">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center" data-testid="signup-title">Create an account</CardTitle>
          <CardDescription className="text-center" data-testid="signup-description">
            Enter your email and password to sign up
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignUp} data-testid="signup-form">
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md" data-testid="signup-error">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                data-testid="signup-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={8}
                data-testid="signup-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password-confirm">Confirm Password</Label>
              <Input
                id="signup-password-confirm"
                type="password"
                placeholder="Confirm your password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                disabled={loading}
                minLength={8}
                data-testid="signup-password-confirm"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading} data-testid="signup-submit">
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={onNavigateToLogin}
                disabled={loading}
                data-testid="signup-goto-login"
              >
                Sign in
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
