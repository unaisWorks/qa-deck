"use client";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
          <p className="text-slate-400 mt-2">Last updated: April 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16 prose prose-invert max-w-none">
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Overview</h2>
          <p className="text-slate-300 leading-relaxed">
            QA Deck is a Chrome extension that helps quality assurance teams generate test cases and automation scripts. We respect your privacy and are committed to transparent data practices.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Data Collection</h2>
          <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">What We Collect</h3>
          <ul className="text-slate-300 space-y-2 ml-5 mb-4">
            <li>
              <strong>Authentication Data:</strong> Email address and authentication tokens when you sign in via qadeck.com
            </li>
            <li>
              <strong>Page Content:</strong> DOM structure and element metadata when you use the Scan feature on webpages you choose
            </li>
            <li>
              <strong>Generated Content:</strong> Test cases, scripts, and locators you create and save
            </li>
            <li>
              <strong>Extension Usage:</strong> Features used and basic interaction telemetry
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">What We Don't Collect</h3>
          <ul className="text-slate-300 space-y-2 ml-5 mb-4">
            <li>✓ We do not track which websites you visit outside of the extension</li>
            <li>✓ We do not collect passwords or sensitive credentials</li>
            <li>✓ We do not collect browser history</li>
            <li>✓ We do not collect personal information beyond your email</li>
            <li>✓ We do not sell data to third parties</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">How We Use Your Data</h2>
          <ul className="text-slate-300 space-y-3 ml-5">
            <li>
              <strong>Page Scanning:</strong> DOM content you scan is sent to Claude API to generate test cases and automation scripts
            </li>
            <li>
              <strong>Cloud Storage:</strong> Your generated test cases and scripts are stored in Firestore to sync across devices
            </li>
            <li>
              <strong>Service Improvement:</strong> Aggregated usage analytics to improve the extension (no personal data included)
            </li>
            <li>
              <strong>Support:</strong> To help you with technical issues if you contact support
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Third-Party Services</h2>
          <p className="text-slate-300 mb-4">
            QA Deck uses the following third-party services:
          </p>
          <ul className="text-slate-300 space-y-2 ml-5">
            <li>
              <strong>Anthropic Claude API:</strong> For generating test cases and automation scripts from page content
            </li>
            <li>
              <strong>Google Firebase:</strong> For authentication and cloud data storage
            </li>
            <li>
              <strong>Chrome Web Store:</strong> For extension distribution
            </li>
          </ul>
          <p className="text-slate-300 mt-4">
            Each service has its own privacy policy. We recommend reviewing their policies at:
          </p>
          <ul className="text-blue-400 space-y-2 ml-5 mt-2">
            <li>
              <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">
                Anthropic Privacy Policy
              </a>
            </li>
            <li>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                Google Privacy Policy
              </a>
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Local Processing</h2>
          <p className="text-slate-300 mb-4">
            QA Deck includes a local backend mode (via <code className="bg-slate-900 px-2 py-1 rounded text-sm">npx qa-deck-backend</code>) that lets you:
          </p>
          <ul className="text-slate-300 space-y-2 ml-5">
            <li>✓ Run the Capture (recording) feature entirely on your machine</li>
            <li>✓ Keep page data local without sending to the cloud</li>
            <li>✓ Use Claude API offline fallback directly from the extension</li>
          </ul>
          <p className="text-slate-300 mt-4">
            When using local mode, your data never leaves your computer (except API calls you explicitly authorize to Claude).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Permissions</h2>
          <p className="text-slate-300 mb-4">
            The QA Deck extension requests these permissions:
          </p>
          <ul className="text-slate-300 space-y-2 ml-5">
            <li>
              <strong>activeTab:</strong> To read the current page structure when you scan
            </li>
            <li>
              <strong>scripting:</strong> To inject and read page content (DOM)
            </li>
            <li>
              <strong>webNavigation:</strong> To track page navigation for session context
            </li>
            <li>
              <strong>tabs:</strong> To manage tabs for the Capture workspace
            </li>
            <li>
              <strong>identity:</strong> To sign you in with your Google account
            </li>
            <li>
              <strong>storage:</strong> To save your projects and preferences locally
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Data Retention</h2>
          <ul className="text-slate-300 space-y-3 ml-5">
            <li>
              <strong>Cloud Data:</strong> Your test cases, scripts, and projects are stored as long as your account exists
            </li>
            <li>
              <strong>Local Storage:</strong> Extension preferences and draft data are stored locally on your device
            </li>
            <li>
              <strong>API Logs:</strong> Claude API may log requests for service improvement (see Anthropic's privacy policy)
            </li>
            <li>
              <strong>Account Deletion:</strong> You can delete your account anytime — we'll remove all associated data
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Security</h2>
          <p className="text-slate-300 mb-4">
            We take security seriously:
          </p>
          <ul className="text-slate-300 space-y-2 ml-5">
            <li>✓ All communication with qadeck.com uses HTTPS encryption</li>
            <li>✓ Authentication tokens are stored securely in your browser</li>
            <li>✓ We do not store passwords — Firebase handles auth securely</li>
            <li>✓ API keys and credentials should never be included in scans or generated code</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Contact Us</h2>
          <p className="text-slate-300">
            If you have questions about this privacy policy or your data, please contact us at{" "}
            <a href="mailto:privacy@qadeck.com" className="text-blue-400 hover:text-blue-300">
              privacy@qadeck.com
            </a>
          </p>
        </section>

        <section className="mb-8 pt-8 border-t border-slate-700">
          <p className="text-slate-400 text-sm">
            This privacy policy may be updated periodically. We'll notify you of significant changes via the extension or qadeck.com.
          </p>
        </section>
      </div>
    </div>
  );
}
