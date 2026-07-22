"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

// Login screen styling. Adapted from the standalone Client Opening Tracker
// (index.html) login redesign and scoped under `.pp-login` so it stays
// self-contained and never leaks into the rest of the dashboard.
const LOGIN_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap');

.pp-login { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 0; overflow: hidden; background: radial-gradient(130% 120% at 78% 10%, #f4f6fa, #e6e9f0); color: #0f1626; font-family: 'Schibsted Grotesk', system-ui, -apple-system, sans-serif; }
.pp-login .login-bg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.pp-login .login-wash { position: absolute; bottom: -20%; left: -8%; width: 640px; height: 640px; border-radius: 50%; background: radial-gradient(circle, rgba(224,85,157,.10), transparent 62%); pointer-events: none; }
.pp-login .login-wrap { position: relative; z-index: 1; width: 100%; max-width: 1180px; margin: 0 auto; padding: 48px 56px; display: flex; align-items: center; gap: 40px; flex-wrap: wrap; }

.pp-login .login-brand { flex: 1; min-width: 320px; animation: loginRise .6s ease both; }
.pp-login .login-brandmark { display: flex; align-items: center; gap: 13px; margin-bottom: 44px; }
.pp-login .login-logo { width: 52px; height: 52px; border-radius: 15px; background: linear-gradient(150deg, #2b8fe0, #e0559d); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 26px rgba(43,143,224,.32); margin: 0; font-size: 0; }
.pp-login .login-wordmark { font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
.pp-login .login-wordmark span { color: rgba(15,22,38,.4); }
.pp-login .login-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #2f6ef0; margin-bottom: 26px; }
.pp-login .login-eyebrow span { width: 22px; height: 2px; background: #2f6ef0; border-radius: 2px; }
.pp-login .login-hero { font-size: 66px; line-height: .94; font-weight: 800; letter-spacing: -.045em; margin: 0 0 26px; color: #0f1626; }
.pp-login .login-hero .grad { background: linear-gradient(120deg, #2b8fe0, #e0559d); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.pp-login .login-sub { font-size: 18px; line-height: 1.62; font-weight: 400; color: rgba(15,22,38,.56); margin: 0; max-width: 400px; }
.pp-login .login-sub strong { color: #0f1626; font-weight: 600; }

.pp-login .login-card { flex: none; width: 420px; max-width: 100%; background: #fff; border: none; border-radius: 22px; padding: 42px 40px; text-align: left; box-shadow: 0 30px 70px rgba(15,22,38,.14), 0 2px 8px rgba(15,22,38,.05); animation: loginRise .7s ease .08s both; }
.pp-login .login-card h2 { font-size: 29px; font-weight: 800; letter-spacing: -.02em; margin: 0 0 8px; color: #0f1626; }
.pp-login .login-lead { font-size: 14.5px; line-height: 1.5; color: rgba(15,22,38,.5); margin: 0 0 30px; }
.pp-login .login-input { display: flex; align-items: center; gap: 11px; padding: 0 16px; height: 54px; margin-top: 16px; background: #f3f5f9; border: 1.5px solid rgba(15,22,38,.10); border-radius: 13px; transition: border-color .18s, background .18s, box-shadow .18s; }
.pp-login .login-input:first-of-type { margin-top: 0; }
.pp-login .login-input > svg { flex: none; color: rgba(15,22,38,.4); transition: color .18s; }
.pp-login .login-input:focus-within { background: #fff; border-color: #2f6ef0; box-shadow: 0 0 0 4px rgba(47,110,240,.14); }
.pp-login .login-input:focus-within > svg { color: #2f6ef0; }
.pp-login .login-card input { flex: 1; min-width: 0; width: auto; background: transparent; border: none; color: #0f1626; font: inherit; font-size: 15.5px; padding: 0; margin: 0; }
.pp-login .login-card input:focus { outline: none; box-shadow: none; border: none; }
.pp-login .login-card input::placeholder { color: rgba(15,22,38,.34); }
.pp-login .login-eye { flex: none; background: transparent; border: none; cursor: pointer; padding: 2px; display: flex; color: rgba(15,22,38,.4); }
.pp-login .login-eye .slash { display: inline; }
.pp-login .login-eye.on .slash { display: none; }
.pp-login .login-card .err { color: #d5364b; font-size: 13px; min-height: 18px; margin: 14px 2px 0; text-align: left; }
.pp-login .login-submit { width: 100%; margin-top: 22px; height: 54px; padding: 0; border: none; border-radius: 13px; cursor: pointer; font: inherit; font-size: 15.5px; font-weight: 700; color: #fff; display: flex; align-items: center; justify-content: center; gap: 9px; background: linear-gradient(135deg, #2f6ef0, #3f86ff); box-shadow: 0 8px 20px rgba(47,110,240,.28); transition: transform .15s, box-shadow .2s, filter .15s; }
.pp-login .login-submit:hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 14px 30px rgba(47,110,240,.42); }
.pp-login .login-submit:disabled { opacity: .7; cursor: default; transform: none; filter: none; }
.pp-login .login-spinner { width: 18px; height: 18px; animation: loginSpin .7s linear infinite; }
.pp-login .login-hint { text-align: center; margin: 22px 0 0; font-size: 13.5px; color: rgba(15,22,38,.5); }
.pp-login .login-hint a { color: #2f6ef0; font-weight: 600; text-decoration: none; border-bottom: 1.5px solid rgba(47,110,240,.35); padding-bottom: 1px; }
@keyframes loginRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
@keyframes loginSpin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .pp-login .login-wrap { padding: 32px 22px; justify-content: center; }
  .pp-login .login-brand { min-width: 0; flex-basis: 100%; text-align: center; margin-bottom: 8px; }
  .pp-login .login-brandmark, .pp-login .login-eyebrow { justify-content: center; }
  .pp-login .login-hero { font-size: 44px; }
  .pp-login .login-sub { margin: 0 auto; }
  .pp-login .login-card { margin: 0 auto; }
}

/* Dark mode — next-themes sets class="dark" on <html>; the choice persists, so
   the login screen honors it too. */
.dark .pp-login { background: radial-gradient(130% 120% at 78% 10%, #0f1a30, #070b16); color: #e6ebf5; }
.dark .pp-login .login-wordmark span { color: rgba(230,235,245,.4); }
.dark .pp-login .login-eyebrow { color: #6ea8ff; }
.dark .pp-login .login-eyebrow span { background: #6ea8ff; }
.dark .pp-login .login-hero { color: #f3f6fc; }
.dark .pp-login .login-sub { color: rgba(230,235,245,.6); }
.dark .pp-login .login-sub strong { color: #f3f6fc; }
.dark .pp-login .login-card { background: #131b2e; box-shadow: 0 30px 70px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3); }
.dark .pp-login .login-card h2 { color: #f3f6fc; }
.dark .pp-login .login-lead { color: rgba(230,235,245,.55); }
.dark .pp-login .login-input { background: #0f1626; border-color: rgba(230,235,245,.12); }
.dark .pp-login .login-input > svg { color: rgba(230,235,245,.45); }
.dark .pp-login .login-input:focus-within { background: #0f1626; border-color: #3f86ff; box-shadow: 0 0 0 4px rgba(63,134,255,.2); }
.dark .pp-login .login-input:focus-within > svg { color: #6ea8ff; }
.dark .pp-login .login-card input { color: #f3f6fc; }
.dark .pp-login .login-card input::placeholder { color: rgba(230,235,245,.35); }
.dark .pp-login .login-eye { color: rgba(230,235,245,.45); }
.dark .pp-login .login-hint { color: rgba(230,235,245,.5); }
.dark .pp-login .login-hint a { color: #6ea8ff; border-bottom-color: rgba(110,168,255,.35); }
`;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    searchParams.get("error") === "no_access"
      ? "Your login isn't set up on the Team page yet. Ask an admin to add you."
      : null
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="pp-login">
      <style dangerouslySetInnerHTML={{ __html: LOGIN_STYLES }} />

      {/* faint icon-pattern backdrop */}
      <svg className="login-bg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <pattern id="loginIcons" width="150" height="150" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <g fill="none" stroke="#0f1626" strokeOpacity="0.045" strokeWidth="1.5">
              <rect x="20" y="22" width="26" height="32" rx="3" />
              <circle cx="112" cy="36" r="13" />
              <rect x="94" y="92" width="34" height="24" rx="4" />
              <circle cx="34" cy="112" r="10" />
              <rect x="66" y="60" width="22" height="22" rx="5" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#loginIcons)" />
      </svg>

      {/* soft accent wash bottom-left */}
      <div className="login-wash" />

      <div className="login-wrap">
        {/* Left brand column */}
        <div className="login-brand">
          <div className="login-brandmark">
            <div className="login-logo">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
              </svg>
            </div>
            <div className="login-wordmark">
              PodPlay <span>CS</span>
            </div>
          </div>
          <div className="login-eyebrow">
            <span />
            Customer Success
          </div>
          <h1 className="login-hero">
            Every Pod.
            <br />
            <span className="grad">Every Play.</span>
            <br />
            Every Shift.
          </h1>
          <p className="login-sub">
          Client Tracker, HubSpot Onboarding, and the OPS Troubleshooting Guide, all in one place so shift handoffs never miss anything.
          </p>
        </div>

        {/* Right sign-in card */}
        <div className="login-card">
          <h2>Sign in</h2>
          <p className="login-lead">Use your PodPlay team credentials.</p>
          <form onSubmit={handleSubmit} noValidate>
            <div className="login-input">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <path d="m3.5 7 8.5 6 8.5-6" />
              </svg>
              <input
                id="loginEmail"
                type="email"
                placeholder="Email address"
                autoComplete="username"
                required
                disabled={loading}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="login-input">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="10" width="16" height="10" rx="2.5" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="loginPass"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                autoComplete="current-password"
                required
                disabled={loading}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={showPassword ? "login-eye on" : "login-eye"}
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword((v) => !v)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                  <path className="slash" d="m4 4 16 16" />
                </svg>
              </button>
            </div>

            <div className="err" role="alert" aria-live="polite">
              {error}
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? (
                <>
                  <svg className="login-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
          <p className="login-hint">
            Admin-created accounts only. No self-sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}
