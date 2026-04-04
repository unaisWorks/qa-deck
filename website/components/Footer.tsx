import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border py-12 bg-bg">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-green flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M3 4.5h4.5M3 9.5h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-sm text-white">
            QA <span className="text-green">Deck</span>
          </span>
        </div>

        <p className="text-xs text-white/30 text-center">
          © 2025 QA Deck · qadeck.com · AI-powered QA automation for modern teams
        </p>

        <div className="flex items-center gap-5 text-xs text-white/40">
          <Link href="/signin" className="hover:text-white transition-colors">Sign In</Link>
          <Link href="/signup" className="hover:text-white transition-colors">Sign Up</Link>
          <Link href="/dashboard/projects" className="hover:text-white transition-colors">Projects</Link>
        </div>
      </div>
    </footer>
  );
}
