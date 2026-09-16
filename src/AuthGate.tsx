import { useEffect, useState, type ReactNode } from "react";
import { authClient, cloudMode, authHeaders } from "./auth";
export default function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!cloudMode),
    [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!authClient) return;
    authClient.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data } = authClient.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!cloudMode) return;
    function download(event: MouseEvent) {
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!anchor) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
        return;
      event.preventDefault();
      void (async () => {
        try {
          const response = await fetch(url, { headers: await authHeaders() });
          if (!response.ok)
            throw new Error(
              (await response.json()).error || "Download failed.",
            );
          const blob = URL.createObjectURL(await response.blob());
          const a = document.createElement("a");
          a.href = blob;
          a.download =
            response.headers
              .get("Content-Disposition")
              ?.match(/filename="([^"]+)"/)?.[1] || "dialed-export";
          a.click();
          setTimeout(() => URL.revokeObjectURL(blob), 1000);
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    }
    document.addEventListener("click", download, true);
    return () => document.removeEventListener("click", download, true);
  }, []);
  if (!cloudMode) return children;
  if (!authClient)
    return (
      <main className="auth-panel">
        <h1>Dialed</h1>
        <p>
          Cloud sign-in is not configured. The notebook is unavailable until
          setup is complete.
        </p>
      </main>
    );
  if (!ready) return <main className="auth-panel">Opening Dialed…</main>;
  if (signedIn)
    return (
      <>
        <div className="cloud-session">
          <span>Private shared notebook</span>
          <button onClick={() => void authClient!.auth.signOut()}>
            Sign out
          </button>
        </div>
        {error && (
          <div role="alert" className="cloud-session">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {children}
      </>
    );
  return (
    <main className="auth-panel">
      <span className="eyebrow">DIALED · ROAST LAB</span>
      <h1>Your coffee, thoughtfully recorded.</h1>
      <p>
        Sign in to your shared roasting notebook. Access is limited to your
        team.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { error } = await authClient!.auth.signInWithPassword({
              email,
              password,
            });
            if (error) throw error;
            setPassword("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <small>Use the account created for you by the notebook owner.</small>
    </main>
  );
}
