const frameworks = [
  { name: "Selenium Python", lang: "Python", color: "#306998", badge: "pytest" },
  { name: "Selenium Java", lang: "Java", color: "#E76F00", badge: "TestNG" },
  { name: "Playwright Python", lang: "Python", color: "#2EAD33", badge: "pytest-playwright" },
  { name: "Playwright TypeScript", lang: "TypeScript", color: "#3178C6", badge: "Playwright Test" },
];

const cicd = ["GitHub Actions", "Jenkins", "Docker Compose", "Makefile"];

export default function Frameworks() {
  return (
    <section id="frameworks" className="py-28 bg-bg-card/40">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-green text-sm font-semibold uppercase tracking-widest">Frameworks</span>
          <h2 className="text-4xl font-bold mt-3 mb-4">Your stack, your choice</h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Generate scripts for the framework your team already uses. No lock-in.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {frameworks.map((fw) => (
            <div
              key={fw.name}
              className="rounded-xl border border-border bg-bg-card p-5 hover:border-white/15 transition-colors group"
            >
              {/* Color dot */}
              <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center" style={{ background: `${fw.color}20` }}>
                <div className="w-4 h-4 rounded-full" style={{ background: fw.color }} />
              </div>
              <div className="text-sm font-semibold text-white mb-1">{fw.name}</div>
              <div className="text-xs text-white/40 mb-3">{fw.lang}</div>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-white/5 text-white/40 border border-white/8">
                {fw.badge}
              </span>
            </div>
          ))}
        </div>

        {/* CI/CD */}
        <div className="rounded-2xl border border-border bg-bg-card p-8 text-center">
          <p className="text-sm text-white/40 uppercase tracking-widest font-semibold mb-5">
            CI/CD configs included
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {cicd.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-bg-elevated text-sm text-white/60 font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green" />
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
