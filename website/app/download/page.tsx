"use client";

import Link from "next/link";

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            <span className="text-white">QA </span>
            <span className="text-emerald-400">Deck</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-16">
          <h1 className="text-4xl font-bold text-white mb-4">Install QA Deck</h1>
          <p className="text-xl text-slate-300">
            Choose your installation method. Both options work perfectly — pick what suits you best.
          </p>
        </div>

        {/* Two Options */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Option 1: Chrome Web Store */}
          <div className="border border-emerald-500/30 rounded-lg p-8 bg-emerald-500/5 hover:bg-emerald-500/10 transition">
            <div className="mb-6">
              <div className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-sm font-semibold mb-4">
                ✓ RECOMMENDED
              </div>
              <h2 className="text-2xl font-bold text-white">Chrome Web Store</h2>
            </div>

            <p className="text-slate-300 mb-6">
              Official installation with auto-updates. The easiest and most secure way.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 font-bold mt-1">✓</span>
                <span className="text-slate-200">One-click installation</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 font-bold mt-1">✓</span>
                <span className="text-slate-200">Automatic updates</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 font-bold mt-1">✓</span>
                <span className="text-slate-200">Google security verification</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 font-bold mt-1">✓</span>
                <span className="text-slate-200">No manual updates needed</span>
              </div>
            </div>

            <button
              onClick={() => window.open("https://chromewebstore.google.com/detail/qa-deck/gbccfimmhbdebhiihkgmcdajnbakojed", "_blank")}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              Install from Chrome Web Store
            </button>

            <p className="text-sm text-slate-400 mt-4 text-center">
              Published &amp; live on Chrome Web Store
            </p>
          </div>

          {/* Option 2: Manual Installation */}
          <div className="border border-slate-600 rounded-lg p-8 bg-slate-800/30 hover:bg-slate-800/50 transition">
            <div className="mb-6">
              <div className="inline-block px-3 py-1 bg-slate-600/20 text-slate-300 rounded-full text-sm font-semibold mb-4">
                MANUAL INSTALL
              </div>
              <h2 className="text-2xl font-bold text-white">Developer Installation</h2>
            </div>

            <p className="text-slate-300 mb-6">
              Install now without waiting. Perfect for developers and testing.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-blue-400 font-bold mt-1">→</span>
                <span className="text-slate-200">Available immediately</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 font-bold mt-1">→</span>
                <span className="text-slate-200">Full functionality</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 font-bold mt-1">→</span>
                <span className="text-slate-200">No review wait time</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 font-bold mt-1">→</span>
                <span className="text-slate-200">Manual updates (when you choose)</span>
              </div>
            </div>

            <a
              href="https://github.com/unaisLearning/qa-deck/releases/download/v1.0.0/qa-deck-extension-v1.0.0.zip"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition text-center"
            >
              Download Extension ZIP
            </a>

            <p className="text-sm text-slate-400 mt-4 text-center">
              ~2.5 MB • Works on Chrome, Edge, Arc, Brave
            </p>
          </div>
        </div>

        {/* Installation Guide for Manual */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 mb-16">
          <h3 className="text-2xl font-bold text-white mb-6">How to Install Manually</h3>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-600 text-white font-bold">
                  1
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Download the ZIP file</h4>
                <p className="text-slate-300">
                  Click "Download Extension ZIP" above. Save it to your computer and unzip the folder.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-600 text-white font-bold">
                  2
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Open Chrome Extensions</h4>
                <p className="text-slate-300 mb-3">
                  In Chrome, go to:
                </p>
                <div className="bg-slate-900 rounded px-3 py-2 text-sm font-mono text-emerald-400 overflow-x-auto">
                  chrome://extensions
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-600 text-white font-bold">
                  3
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Enable Developer Mode</h4>
                <p className="text-slate-300">
                  In the top-right corner, toggle <span className="bg-slate-900 px-2 py-1 rounded text-sm font-mono">Developer mode</span> to ON.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-600 text-white font-bold">
                  4
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Load the Extension</h4>
                <p className="text-slate-300 mb-3">
                  Click <span className="bg-slate-900 px-2 py-1 rounded text-sm font-mono">Load unpacked</span> and select the unzipped extension folder.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-600 text-white font-bold">
                  5
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Done! 🎉</h4>
                <p className="text-slate-300">
                  The extension is now installed. Pin it to your toolbar and open qadeck.com to get started.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="bg-gradient-to-r from-emerald-600/10 to-blue-600/10 border border-emerald-500/30 rounded-lg p-8">
          <h3 className="text-2xl font-bold text-white mb-4">Next Steps</h3>
          <p className="text-slate-300 mb-6">
            Once installed, sign in at <span className="text-emerald-400 font-mono">qadeck.com</span> and start scanning webpages.
          </p>
          <Link
            href="/signin"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
