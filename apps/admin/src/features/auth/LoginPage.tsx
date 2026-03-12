import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not sign in to the admin workspace.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <form className="auth-content" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Internal access</p>
            <h1 style={{ marginBottom: 8 }}>Sign in to the admin website</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              This console is intended for trusted moderators and operators only.
            </p>
          </div>

          {errorMessage ? (
            <div className="state-panel error">
              <strong>Sign-in failed</strong>
              <span className="text-muted">{errorMessage}</span>
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              autoComplete="email"
              className="input"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              type="email"
              value={email}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              autoComplete="current-password"
              className="input"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              type="password"
              value={password}
            />
          </div>

          <button className="button primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>

      <section className="auth-hero">
        <div className="hero-panel">
          <div>
            <p className="eyebrow">Why this app exists</p>
            <h2 style={{ marginBottom: 12 }}>Built for moderation-first operations</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              The scaffold focuses on the admin jobs you described: menu review queues, support
              triage, user lookup, and moderation surfaces for user-generated uploads.
            </p>
          </div>

          <div className="hero-grid">
            <div className="mini-stat">
              <strong>Menu integrity</strong>
              <p className="text-muted">
                Review flagged menus, inspect generated items, and document moderator decisions.
              </p>
            </div>
            <div className="mini-stat">
              <strong>Support inbox</strong>
              <p className="text-muted">
                Watch open or stalled feedback threads and route follow-up faster.
              </p>
            </div>
            <div className="mini-stat">
              <strong>User review</strong>
              <p className="text-muted">
                Search accounts, inspect recent content, and prepare for broader abuse tooling.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
