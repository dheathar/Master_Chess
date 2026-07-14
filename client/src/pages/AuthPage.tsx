import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, register, error, clearError } = useAuthStore();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch {
      // error surfaced via store
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-glyph">♔</span>
          <h1>Master Chess</h1>
        </div>
        <p className="brand-tagline">Turn your own games into your training plan.</p>

        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              clearError();
            }}
            type="button"
          >
            Log in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              clearError();
            }}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          {mode === "register" ? (
            <label>
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <p className="auth-footer-note">Upload your games. Get a coach that never contradicts the engine.</p>
      </div>
    </div>
  );
}
