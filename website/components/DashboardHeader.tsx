"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "firebase/auth";
import { openExtensionSidePanel, useExtensionConnection } from "@/lib/extension-bridge";

interface DashboardHeaderProps {
  user: User | null;
  onSignOut: () => void | Promise<void>;
  signingOut?: boolean;
}

const NAV_ITEMS = [
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/suites", label: "Suites" },
];

export default function DashboardHeader({
  user,
  onSignOut,
  signingOut = false,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const { state: extension } = useExtensionConnection({ enabled: true });
  const [openingExtension, setOpeningExtension] = useState(false);

  async function handleOpenExtension() {
    setOpeningExtension(true);
    try {
      const opened = await openExtensionSidePanel();
      if (!opened) {
        window.location.href = "/dashboard/connect-extension";
      }
    } finally {
      setOpeningExtension(false);
    }
  }

  return (
    <header className="border-b border-border bg-bg-card/70 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 min-w-0">
          <Link href="/dashboard/projects" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-green flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M3 4.5h4.5M3 9.5h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-white">
              QA <span className="text-green">Deck</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                    active
                      ? "bg-green/15 text-green border border-green/25"
                      : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          {extension.connected ? (
            <button
              onClick={handleOpenExtension}
              disabled={openingExtension}
              className="hidden md:inline-flex text-xs text-green border border-green/20 bg-green/10 px-3 py-1.5 rounded-lg transition-colors shrink-0 hover:bg-green/15 disabled:opacity-60"
            >
              {openingExtension ? "Opening..." : "Open QA Deck"}
            </button>
          ) : (
            <Link
              href="/dashboard/connect-extension"
              className="hidden md:inline-flex text-xs text-white/60 border border-border px-3 py-1.5 rounded-lg transition-colors shrink-0 hover:text-white hover:border-white/20"
            >
              Connect extension
            </Link>
          )}

          {user?.photoURL ? (
            <Image
              src={user.photoURL}
              alt="Avatar"
              width={32}
              height={32}
              className="rounded-full border border-border shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-green/15 border border-green/25 text-green flex items-center justify-center text-xs font-semibold shrink-0">
              {(user?.displayName || user?.email || "U").slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-medium text-white leading-none truncate">{user?.displayName || "User"}</p>
            <p className="text-xs text-white/40 mt-0.5 truncate">{user?.email}</p>
          </div>

          <button
            onClick={onSignOut}
            disabled={signingOut}
            className="text-xs text-white/50 hover:text-white border border-border px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            {signingOut ? "..." : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
