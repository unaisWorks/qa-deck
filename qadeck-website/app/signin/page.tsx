"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { signInWithEmail, handleGoogleRedirect, getAuthErrorMessage } from "@/lib/auth";
import GoogleSignInBtn from "@/components/GoogleSignInBtn";
import { auth } from "@/lib/firebase";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const user = await handleGoogleRedirect();
        if (!cancelled && user) {
          router.replace("/dashboard/connect-extension");
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setError(getAuthErrorMessage(err, "google"));
        }
      }

      if (!auth) {
        if (!cancelled) {
          setError("Firebase is not configured. Add your keys to .env.local");
          setCheckingSession(false);
        }
        return;
      }

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (cancelled) return;
        if (user) {
          router.replace("/dashboard/connect-extension");
          return;
        }
        setCheckingSession(false);
      });

      return unsubscribe;
    }

    let unsubscribe: (() => void) | undefined;
    bootstrap().then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      router.replace("/dashboard/connect-extension");
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, "signin"));
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4 bg-grid">
        <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 bg-grid">
      <Link href="/" className="fixed top-6 left-6 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-green flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8M3 4.5h4.5M3 9.5h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="font-semibold text-sm text-white">QA <span className="text-green">Deck</span></span>
      </Link>

      <div className="w-full max-w-md">
        <div className="bg-bg-card border border-border rounded-2xl p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-white/50 text-sm">Sign in to your QA Deck account</p>
          </div>

          <GoogleSignInBtn label="Sign in with Google" />

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-white/30">or continue with email</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-green/50 transition-colors"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-green/50 transition-colors"/>
            </div>

            {error && <div className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full bg-green text-white font-semibold py-3 rounded-xl hover:bg-green-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-white/40 mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-green hover:text-green-dark transition-colors font-medium">Sign up free</Link>
        </p>
      </div>
    </div>
  );
}
