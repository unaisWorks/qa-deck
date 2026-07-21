"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { disconnectExtensionSession } from "@/lib/extension-bridge";
import { auth } from "@/lib/firebase";
import { signOut } from "@/lib/auth";

export interface UseDashboardSessionOptions {
  /**
   * When false, signed-out visitors are left with user=null instead of being
   * redirected to /signin. Defaults to true so every existing call site
   * (which relies on the redirect) keeps its current behavior unchanged.
   */
  redirectOnSignedOut?: boolean;
}

export function useDashboardSession(options: UseDashboardSessionOptions = {}) {
  const { redirectOnSignedOut = true } = options;
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!auth) {
      if (redirectOnSignedOut) router.replace("/signin");
      setReady(true);
      return;
    }
    const firebaseAuth = auth;

    let settled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      const nextUser = firebaseAuth.currentUser;
      if (!nextUser) {
        if (redirectOnSignedOut) router.replace("/signin");
        setUser(null);
      } else {
        setUser(nextUser);
      }
      setReady(true);
    }, 3000);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      if (!nextUser) {
        if (redirectOnSignedOut) router.replace("/signin");
        setUser(null);
        setReady(true);
        return;
      }

      setUser(nextUser);
      setReady(true);
    });

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [router, redirectOnSignedOut]);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await disconnectExtensionSession().catch(() => {});
      await signOut();
      setUser(null);
      router.replace("/signin");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return { user, ready, signingOut, handleSignOut };
}
