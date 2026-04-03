"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<{ displayName: string | null; email: string | null } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) =>
      setUser(u ? { displayName: u.displayName, email: u.email } : null)
    );
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-bg/90 backdrop-blur-xl border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-green flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 7h8M3 4.5h4.5M3 9.5h5"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="font-semibold text-[15px] text-white tracking-tight">
            QA <span className="text-green">Deck</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-7">
          <a href="#features" className="text-sm text-white/60 hover:text-white transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-white/60 hover:text-white transition-colors">
            How it works
          </a>
          <a href="#frameworks" className="text-sm text-white/60 hover:text-white transition-colors">
            Frameworks
          </a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/dashboard/projects"
              className="text-sm font-medium text-white bg-green px-4 py-2 rounded-lg hover:bg-green-dark transition-colors"
            >
              Projects
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm font-medium text-bg bg-white px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
