import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Frameworks from "@/components/Frameworks";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg text-white">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Frameworks />

      {/* CTA Banner */}
      <section className="py-28 bg-bg relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[300px] bg-green/8 blur-[100px] rounded-full" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
            Start generating tests
            <br />
            <span className="gradient-text">in 2 minutes</span>
          </h2>
          <p className="text-white/50 text-lg mb-10">
            Install the Chrome extension, scan your first page, and get production-ready tests in seconds.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="https://chromewebstore.google.com/detail/qa-deck/gbccfimmhbdebhiihkgmcdajnbakojed"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green text-white font-semibold px-8 py-4 rounded-xl hover:bg-green-dark transition-all hover:scale-[1.02] active:scale-[0.98] text-base"
            >
              Install Extension — Free
            </a>
            <Link
              href="/signup"
              className="bg-white/8 text-white font-semibold px-8 py-4 rounded-xl border border-white/10 hover:bg-white/12 transition-all text-base"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
