"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";
import {
  connectExtensionToWebsiteUser,
  openExtensionSidePanel,
  useExtensionConnection,
} from "@/lib/extension-bridge";
import { auth } from "@/lib/firebase";
import { useDashboardSession } from "@/lib/use-dashboard-session";

const EXTENSION_INSTALL_URL =
  process.env.NEXT_PUBLIC_QADECK_EXTENSION_INSTALL_URL || "https://qadeck.com";

export default function ConnectExtensionPage() {
  const router = useRouter();
  const { user, ready, signingOut, handleSignOut } = useDashboardSession();
  const { state: extension, refresh } = useExtensionConnection({
    enabled: ready && !!user,
    pollMs: 2500,
  });
  const [connecting, setConnecting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready || !user || !extension.ready) return;
    if (extension.connected) {
      router.replace("/dashboard/projects");
    }
  }, [extension.connected, extension.ready, ready, router, user]);

  useEffect(() => {
    const handleFocus = () => {
      refresh().catch(() => {});
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refresh]);

  const statusCopy = useMemo(() => {
    switch (extension.state) {
      case "extension_not_detected":
        return {
          eyebrow: "Step 1",
          title: "Install the QA Deck Chrome extension",
          body:
            "Your account is ready. Install QA Deck in this browser, then return here so we can connect the extension to your dashboard history.",
        };
      case "extension_detected_not_connected":
        return {
          eyebrow: "Step 2",
          title: "Connect QA Deck to your account",
          body:
            "QA Deck is installed in this browser. Connect it once and every saved project, journey, script, and version will appear in your dashboard.",
        };
      case "connected":
        return {
          eyebrow: "Connected",
          title: "QA Deck is ready",
          body:
            "Your extension is connected to this account. Open the side panel and start scanning or building journeys with cloud tracking enabled.",
        };
      default:
        return {
          eyebrow: "Checking",
          title: "Looking for QA Deck",
          body: "We are checking whether the extension is installed in this browser.",
        };
    }
  }, [extension.state]);

  async function handleConnect() {
    if (!auth?.currentUser) {
      setMessage("You need to be signed in on qadeck.com before connecting the extension.");
      return;
    }

    setConnecting(true);
    setMessage("");
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const nextState = await connectExtensionToWebsiteUser(idToken);
      if (nextState.connected) {
        router.replace("/dashboard/projects");
        return;
      }
      setMessage(
        "QA Deck queued the connection, but it is still waiting for the side panel to finish syncing. Keep the side panel open for a second, then try again."
      );
      const finalState = await refresh();
      if (finalState.connected) {
        router.replace("/dashboard/projects");
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect the extension right now.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleOpenExtension() {
    setOpening(true);
    setMessage("");
    try {
      const opened = await openExtensionSidePanel();
      if (!opened) {
        setMessage("Click the QA Deck icon in your Chrome toolbar to open the side panel.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open QA Deck from the browser.");
    } finally {
      setOpening(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <main className="max-w-3xl mx-auto px-6 py-20">
          <div className="bg-bg-card border border-border rounded-3xl p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-green/70 font-mono mb-3">
              Connect Extension
            </p>
            <h1 className="text-2xl font-bold mb-3">Sign in to connect QA Deck</h1>
            <p className="text-white/60 text-sm leading-7 mb-6">
              This browser tab is not signed in on qadeck.com yet. Sign in first, then come back here to attach the extension to your account.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signin"
                className="inline-flex items-center justify-center rounded-xl bg-green px-5 py-3 text-sm font-semibold text-white hover:bg-green-dark transition-colors"
              >
                Go to sign in
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
              >
                Back to home
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-white">
      <DashboardHeader user={user} signingOut={signingOut} onSignOut={handleSignOut} />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="max-w-3xl mb-10">
          <p className="text-xs uppercase tracking-[0.28em] text-green/70 font-mono mb-3">
            Connected Onboarding
          </p>
          <h1 className="text-3xl font-bold mb-3">{statusCopy.title}</h1>
          <p className="text-white/50 text-sm leading-7">{statusCopy.body}</p>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
          <section className="bg-bg-card border border-border rounded-3xl p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-green/20 bg-green/10 px-3 py-1 text-xs text-green mb-6">
              <span className="w-2 h-2 rounded-full bg-green" />
              {statusCopy.eyebrow}
            </div>

            <ol className="space-y-4 text-sm text-white/60 mb-8">
              <li className="border border-border rounded-2xl px-4 py-3 bg-white/[0.02]">
                1. Sign in on qadeck.com with email or Google.
              </li>
              <li className="border border-border rounded-2xl px-4 py-3 bg-white/[0.02]">
                2. Install QA Deck in this browser and return to this page.
              </li>
              <li className="border border-border rounded-2xl px-4 py-3 bg-white/[0.02]">
                3. Connect the extension once, then use the side panel for tracked work.
              </li>
            </ol>

            <div className="flex flex-wrap gap-3">
              {extension.state === "extension_not_detected" ? (
                <>
                  <a
                    href={EXTENSION_INSTALL_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-green px-5 py-3 text-sm font-semibold text-white hover:bg-green-dark transition-colors"
                  >
                    Install QA Deck
                  </a>
                  <button
                    onClick={() => refresh()}
                    className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Check again
                  </button>
                </>
              ) : extension.state === "extension_detected_not_connected" ? (
                <>
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="inline-flex items-center justify-center rounded-xl bg-green px-5 py-3 text-sm font-semibold text-white hover:bg-green-dark transition-colors disabled:opacity-60"
                  >
                    {connecting ? "Connecting QA Deck..." : "Connect QA Deck"}
                  </button>
                  <button
                    onClick={handleOpenExtension}
                    disabled={opening}
                    className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    {opening ? "Opening..." : "Open QA Deck"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleOpenExtension}
                    disabled={opening}
                    className="inline-flex items-center justify-center rounded-xl bg-green px-5 py-3 text-sm font-semibold text-white hover:bg-green-dark transition-colors disabled:opacity-60"
                  >
                    {opening ? "Opening..." : "Open QA Deck"}
                  </button>
                  <Link
                    href="/dashboard/projects"
                    className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Continue to projects
                  </Link>
                </>
              )}
            </div>

            {message && (
              <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {message}
              </div>
            )}
          </section>

          <aside className="bg-bg-card border border-border rounded-3xl p-8 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/35 font-mono mb-3">Browser State</p>
              <div className="space-y-3">
                <div className="rounded-2xl border border-border px-4 py-3 bg-white/[0.02]">
                  <div className="text-xs text-white/40 mb-1">Extension</div>
                  <div className="text-sm font-medium text-white">
                    {extension.installed ? "Installed in this browser" : "Not detected yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border px-4 py-3 bg-white/[0.02]">
                  <div className="text-xs text-white/40 mb-1">Connection</div>
                  <div className="text-sm font-medium text-white">
                    {extension.connected ? `Connected as ${extension.email || "your account"}` : "Not connected yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border px-4 py-3 bg-white/[0.02]">
                  <div className="text-xs text-white/40 mb-1">Tracked work after connection</div>
                  <div className="text-sm text-white/70">
                    Cloud projects, saved pages, test cases, scripts, and version history.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-green/20 bg-green/10 px-4 py-4">
              <div className="text-sm font-semibold text-white mb-2">Guest utility mode still works</div>
              <p className="text-sm text-white/60 leading-6">
                You can still use locator inspection, generated selectors, and selector testing in the extension before you connect.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
