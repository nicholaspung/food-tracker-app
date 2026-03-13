import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';
import brandLogo from '../../../../mobile/assets/brand-logo.png';

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
            <div className="auth-brand">
              <span className="brand-mark">
                <img alt="" aria-hidden="true" className="brand-mark-image" src={brandLogo} />
              </span>
              <div>
                <p className="eyebrow">Yummy Recs</p>
                <p className="text-muted" style={{ margin: 0 }}>
                  Admin
                </p>
              </div>
            </div>
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
    </div>
  );
}
