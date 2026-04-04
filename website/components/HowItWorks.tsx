const steps = [
  {
    num: "01",
    title: "Scan the Page",
    desc: "Open QA Deck in the Chrome side panel and click Scan. The extension extracts every interactive element — inputs, buttons, links, forms — with smart locators.",
    tag: "< 2 seconds",
  },
  {
    num: "02",
    title: "Review & Generate Tests",
    desc: "AI generates 10–14 test cases organized by category: functional, error handling, accessibility, edge cases. Edit, delete, or reorder before generating code.",
    tag: "10–14 test cases",
  },
  {
    num: "03",
    title: "Download & Run",
    desc: "Pick your framework, click Generate Script, and download a ready-to-run ZIP. Unzip, install requirements, run pytest or npx playwright test.",
    tag: "5-file POM project",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-green text-sm font-semibold uppercase tracking-widest">How it works</span>
          <h2 className="text-4xl font-bold mt-3 mb-4">
            From page to tests in 3 steps
          </h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            No configuration, no setup, no boilerplate. Just open the extension and go.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px bg-gradient-to-r from-green/40 via-green/20 to-green/40" />

          {steps.map((step, i) => (
            <div key={step.num} className="relative text-center">
              {/* Step number circle */}
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 rounded-full border-2 border-green/40 bg-green/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-green">{i + 1}</span>
                </div>
                <div className="absolute inset-0 rounded-full bg-green/5 blur-xl" />
              </div>

              <div className="inline-block px-2.5 py-1 rounded-full bg-green/10 border border-green/20 text-green text-xs font-medium mb-4">
                {step.tag}
              </div>

              <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
