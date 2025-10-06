import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pb } from "@/lib/pocketbase";

interface LoginPageProps {
  onNavigateToSignUp: () => void;
  onLoginSuccess?: () => void;
}

export default function LoginPage({ onNavigateToSignUp, onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await pb.collection('users').authWithPassword(email, password);
      console.log("Login successful:", pb.authStore.model);

      // Call success callback
      onLoginSuccess?.();
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
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
            {error && (
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
              <Label htmlFor="password">Password</Label>
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