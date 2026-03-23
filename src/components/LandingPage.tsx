import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Brain, Shield, Zap, Target, BarChart3, ChevronRight, Globe, Lock } from 'lucide-react';
import { cn } from '../lib/utils';

interface LandingPageProps {
  onSignIn: () => void;
}

export default function LandingPage({ onSignIn }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30">
      {/* Atmospheric Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] h-[60%] w-[60%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] h-[50%] w-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] left-[20%] h-[40%] w-[40%] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <TrendingUp size={24} />
          </div>
          <span className="text-xl font-bold tracking-tighter">TradeFlow</span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-medium text-zinc-400 md:flex">
          <a href="#features" className="transition-colors hover:text-white">Features</a>
          <a href="#ai" className="transition-colors hover:text-white">AI Engine</a>
          <a href="#security" className="transition-colors hover:text-white">Security</a>
        </div>
        <button
          onClick={onSignIn}
          className="group relative flex items-center gap-2 overflow-hidden rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:scale-105 active:scale-95"
        >
          <span className="relative z-10">Get Started</span>
          <ChevronRight size={16} className="relative z-10 transition-transform group-hover:translate-x-1" />
          <div className="absolute inset-0 -translate-x-full bg-emerald-400 transition-transform group-hover:translate-x-0" />
        </button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-32">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400 backdrop-blur-sm"
          >
            <Zap size={14} />
            <span>Next-Gen Trading Intelligence</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="mb-8 max-w-4xl text-6xl font-black leading-[0.9] tracking-tighter sm:text-8xl lg:text-9xl"
          >
            TRADE WITH <br />
            <span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              PRECISION.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mb-12 max-w-2xl text-lg text-zinc-400 sm:text-xl"
          >
            The ultimate workstation for modern traders. Track every move, analyze strategies with AI, and master your psychological edge.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex flex-col gap-4 sm:flex-row"
          >
            <button
              onClick={onSignIn}
              className="flex items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-10 py-5 text-lg font-bold text-zinc-950 transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] active:scale-95"
            >
              Start Your Journal
              <ChevronRight size={20} />
            </button>
            <button
              onClick={onSignIn}
              className="flex items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-10 py-5 text-lg font-bold backdrop-blur-xl transition-all hover:bg-zinc-800 active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-6 w-6" alt="Google" />
              Sign in with Google
            </button>
          </motion.div>
        </div>

        {/* Feature Grid */}
        <div id="features" className="mt-40 grid gap-8 md:grid-cols-3">
          {[
            {
              icon: Brain,
              title: "AI Performance Engine",
              desc: "Get deep psychological and technical insights powered by advanced Gemini models.",
              color: "text-purple-400",
              bg: "bg-purple-400/10"
            },
            {
              icon: Shield,
              title: "Risk Management",
              desc: "Automated risk-of-ruin simulations and position sizing calculators to protect your capital.",
              color: "text-blue-400",
              bg: "bg-blue-400/10"
            },
            {
              icon: Target,
              title: "Strategy Analysis",
              desc: "Identify your most profitable setups and eliminate the ones holding you back.",
              color: "text-emerald-400",
              bg: "bg-emerald-400/10"
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="group relative rounded-3xl border border-zinc-800 bg-zinc-900/30 p-8 transition-all hover:border-zinc-700 hover:bg-zinc-900/50"
            >
              <div className={cn("mb-6 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-110", feature.bg, feature.color)}>
                <feature.icon size={28} />
              </div>
              <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
              <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Stats Section */}
        <div className="mt-40 rounded-[40px] border border-zinc-800 bg-zinc-900/20 p-12 backdrop-blur-md">
          <div className="grid gap-12 md:grid-cols-4">
            {[
              { label: "Active Traders", value: "10k+" },
              { label: "Trades Tracked", value: "2.4M" },
              { label: "AI Insights", value: "500k+" },
              { label: "Uptime", value: "99.9%" }
            ].map((stat, i) => (
              <div key={i} className="text-center md:text-left">
                <div className="mb-1 text-4xl font-black tracking-tighter">{stat.value}</div>
                <div className="text-sm font-medium text-zinc-500 uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Section */}
        <div id="security" className="mt-40 flex flex-col items-center gap-12 md:flex-row">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-400">
              <Lock size={14} />
              <span>Enterprise-Grade Security</span>
            </div>
            <h2 className="text-5xl font-bold tracking-tight">Your data is yours. <br />Always.</h2>
            <p className="text-lg text-zinc-400">
              We use end-to-end encryption and secure cloud infrastructure to ensure your trading data, strategies, and insights remain private and protected.
            </p>
            <ul className="space-y-4">
              {[
                "AES-256 Data Encryption",
                "Secure Google Authentication",
                "Regular Security Audits",
                "Private AI Processing"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-zinc-300">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                    <ChevronRight size={12} />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative flex-1">
            <div className="aspect-square rounded-full bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 blur-3xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-3xl border border-zinc-700 bg-zinc-900 p-8 shadow-2xl">
                <Shield size={120} className="text-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-900 bg-zinc-950 px-6 py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-12 md:flex-row">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-emerald-500" />
              <span className="text-xl font-bold tracking-tighter">TradeFlow</span>
            </div>
            <p className="max-w-xs text-sm text-zinc-500">
              Empowering traders with data-driven insights and AI-powered performance analysis.
            </p>
          </div>
          <div className="flex gap-12">
            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Product</h4>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li><a href="#" className="hover:text-white">Features</a></li>
                <li><a href="#" className="hover:text-white">AI Engine</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Company</h4>
              <ul className="space-y-2 text-sm text-zinc-500">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Privacy</a></li>
                <li><a href="#" className="hover:text-white">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-20 max-w-7xl text-center text-xs text-zinc-600">
          © {new Date().getFullYear()} TradeFlow. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
