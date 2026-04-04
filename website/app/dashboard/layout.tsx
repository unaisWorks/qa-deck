"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!auth) {
      router.replace("/signin");
      setChecking(false);
      return;
    }
    const firebaseAuth = auth;

    let settled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (settled) return;
      const user = firebaseAuth.currentUser;
      if (!user) {
        router.replace("/signin");
      }
      setChecking(false);
    }, 3000);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      if (!user) {
        router.replace("/signin");
      }
      setChecking(false);
    });

    return () => {
      settled = true;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
