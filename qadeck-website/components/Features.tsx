const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="18" height="18" rx="4" fill="rgba(29,158,117,0.15)" stroke="#1D9E75" strokeWidth="1.2"/>
        <path d="M7 11h8M7 7.5h4.5M7 14.5h6" stroke="#1D9E75" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: "AI Test Generation",
    desc: "Claude AI analyzes your page and generates 10–14 structured test cases covering happy paths, edge cases, error states, accessibility, and security.",
    bullets: ["Happy path & negative flows", "Accessibility (axe-core)", "Edge case coverage"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="10" cy="10" r="7" stroke="#1D9E75" strokeWidth="1.2" fill="rgba(29,158,117,0.1)"/>
        <circle cx="10" cy="10" r="2.5" fill="#1D9E75"/>
        <path d="M10 3V1M10 19v-2M3 10H1M19 10h-2M4.5 4.5L3 3M17 17l-1.5-1.5M4.5 15.5L3 17M17 5l-1.5 1.5" stroke="#1D9E75" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    title: "Smart Selector Inspector",
    desc: "Click any element on the page to instantly see every possible locator — ranked by quality from BEST to FRAGILE with explanations.",
    bullets: ["9 locator types per element", "BEST / GOOD / OK / FRAGILE tiers", "Copy & test in one click"],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="5" width="18" height="14" rx="3" fill="rgba(29,158,117,0.1)" stroke="#1D9E75" strokeWidth="1.2"/>
        <path d="M7 2v4M15 2v4M2 9h18" stroke="#1D9E75" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M7 13l2 2 4-4" stroke="#1D9E75" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "5-File POM Export",
    desc: "Download a production-ready Page Object Model project as a ZIP — base class, page objects, test data, tests, and config files included.",
    bullets: ["Selenium Python · Java", "Playwright Python · TypeScript", "GitHub Actions & Jenkins CI/CD"],
  },
];

export default function Features() {
  return (
    <section id="features" className="py-28 bg-bg">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-green text-sm font-semibold uppercase tracking-widest">Features</span>
          <h2 className="text-4xl font-bold mt-3 mb-4">
            Everything QA teams need
          </h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            From raw webpage to running tests — QA Deck handles the boilerplate so your team can focus on what matters.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-border bg-bg-card p-7 hover:border-green/30 transition-all duration-300 hover:-translate-y-1"
            >
              {/* Top glow on hover */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-2xl" />

              <div className="mb-5">{f.icon}</div>
              <h3 className="text-[17px] font-semibold text-white mb-3">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed mb-5">{f.desc}</p>
              <ul className="space-y-2">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-xs text-white/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-green/70 flex-shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
