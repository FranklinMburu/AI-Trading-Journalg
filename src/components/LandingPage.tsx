import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'motion/react';
import { TrendingUp, Brain, Shield, Zap, Target, BarChart3, ChevronRight, Globe, Lock, Cpu, Sparkles, Binary, Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface LandingPageProps {
  onSignIn: () => void;
}

interface FeatureModuleProps {
  module: {
    icon: any;
    title: string;
    desc: string;
    detail: string;
    color: string;
  };
  index: number;
  total: number;
}

const FeatureModule = React.memo(({ module, index, total }: FeatureModuleProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  // Snappier spring for more immediate visual feedback
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, mass: 0.25 });

  // Transform mapping for cinematic camera feel - Adjusted for mobile
  const z = useTransform(smoothProgress, [0, 0.45, 0.55, 1], [-600, 0, 0, -600]);
  const scale = useTransform(smoothProgress, [0, 0.45, 0.55, 1], [0.6, 1, 1, 0.6]);
  const opacity = useTransform(smoothProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  
  // Parallax elements with different depth properties
  const titleZ = useTransform(smoothProgress, [0, 0.5, 1], [-50, 80, -50]);
  const iconZ = useTransform(smoothProgress, [0, 0.5, 1], [-30, 150, -30]);

  // Smoother mouse interactions using MotionValues to avoid React re-renders
  const mouseX = useSpring(0, { stiffness: 100, damping: 30 });
  const mouseY = useSpring(0, { stiffness: 100, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Disable heavy mouse-follow on mobile to prevent layout shift
    if (window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Mapping for rotational transitions
  const scrollRotateX = useTransform(smoothProgress, [0, 0.5, 1], [25, 0, -25]);
  
  // Combined mouse and scroll transforms
  const rotateX = useTransform([scrollRotateX, mouseY], ([s, m]) => (s as number) + (m as number) * -15);
  const rotateY = useTransform(mouseX, (m) => m * 15);

  return (
    <div 
      ref={ref} 
      onClick={() => {
        if ((window as any).lenis) {
          (window as any).lenis.scrollTo(ref.current);
        } else {
          ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }}
      className="relative h-[150vh] md:h-[200vh] w-full flex items-center justify-center isolation-isolate cursor-pointer px-4 md:px-0"
    >
      <div className="sticky top-0 flex h-screen w-full items-center justify-center perspective-[1500px] md:perspective-[2500px]">
        {/* Cinematic Backdrop Glow that follows card depth */}
        <motion.div 
          style={{ opacity, scale: useTransform(smoothProgress, [0, 0.5, 1], [0.8, 1.2, 0.8]) }}
          className={cn("pointer-events-none absolute inset-[-10%] md:inset-[-20%] blur-[80px] md:blur-[150px] opacity-10 -z-10 translate-z-0", module.color.replace('from-', 'bg-'))} 
        />

        <motion.div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileHover={{ 
            scale: 1.01,
            transition: { duration: 0.4, ease: "easeOut" }
          }}
          style={{
            z,
            scale,
            opacity,
            rotateX,
            rotateY,
            transformStyle: "preserve-3d"
          }}
          // Performance-optimized drift
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="relative w-full max-w-5xl rounded-[2.5rem] md:rounded-[4.5rem] border border-white/10 bg-zinc-900/50 p-1 backdrop-blur-xl shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] md:shadow-[0_80px_160px_-40px_rgba(0,0,0,0.8)] group/card will-change-transform transform-gpu"
        >
          {/* Interactive Border Glow - Active on Hover */}
          <div className="absolute inset-0 rounded-[2.4rem] md:rounded-[4.4rem] overflow-hidden pointer-events-none z-[-1] transform-gpu">
             <div className={cn(
               "absolute inset-0 opacity-0 group-hover/card:opacity-30 transition-opacity duration-700 blur-xl translate-z-0",
               module.color.replace('from-', 'bg-')
             )} />
          </div>

          {/* Surface Glass Effects with performance flags */}
          <div className="absolute inset-0 rounded-[2.4rem] md:rounded-[4.4rem] overflow-hidden pointer-events-none translate-z-[-1px] transform-gpu">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent opacity-40" />
            <motion.div 
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -skew-x-12 will-change-transform"
            />
          </div>

          <div className="relative flex h-full w-full flex-col md:flex-row items-center gap-10 md:gap-20 rounded-[2.4rem] md:rounded-[4.4rem] bg-zinc-950/95 p-8 md:p-20 overflow-hidden transform-gpu">
            {/* 3D Layered Icon Stage */}
            <motion.div 
              style={{ translateZ: iconZ }}
              className="relative perspective-1000 will-change-transform"
            >
              <div className={cn(
                "relative flex h-32 w-32 md:h-56 md:w-56 items-center justify-center rounded-[1.5rem] md:rounded-[3.5rem] bg-zinc-900 border border-white/5 shadow-2xl overflow-hidden group/icon",
                module.color === "from-indigo-500" ? "text-indigo-400" : 
                module.color === "from-emerald-500" ? "text-emerald-400" :
                module.color === "from-cyan-500" ? "text-cyan-400" : "text-white"
              )}>
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-15", module.color)} />
                <div className={cn("absolute inset-2 blur-2xl md:blur-3xl opacity-20", module.color.replace('from-', 'bg-'))} />
                <module.icon className="size-16 md:size-24 shrink-0 relative z-10 drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]" strokeWidth={1} />
              </div>
            </motion.div>

            <motion.div 
              style={{ translateZ: titleZ }}
              className="flex-1 space-y-4 md:space-y-10 text-center md:text-left will-change-transform"
            >
              <div className="space-y-2 md:space-y-5">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.5em] text-zinc-600">
                    {module.detail}
                  </span>
                </div>
                <h3 className="text-4xl font-black tracking-tighter text-white sm:text-7xl lg:text-8xl leading-[0.85] bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
                  {module.title}
                </h3>
              </div>
              
              <p className="max-w-xl text-lg md:text-2xl font-medium leading-tight text-zinc-500 tracking-tight">
                {module.desc}
              </p>

              <div className="flex items-center justify-center md:justify-start gap-6 pt-4 md:pt-10">
                 <div className="flex h-10 w-10 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl bg-white/5 border border-white/10 text-emerald-400">
                    <Sparkles size={20} className="md:size-24" />
                 </div>
                 <div className="space-y-1">
                    <div className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] text-zinc-600">Neural Sync Integrity</div>
                    <div className="flex items-center gap-2">
                       <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-emerald-500 animate-pulse" />
                       <span className="text-sm md:text-base font-black text-white italic tracking-tighter">DATA STREAM OPTIMIZED</span>
                    </div>
                 </div>
              </div>
            </motion.div>
          </div>

          <div 
            style={{ transform: "translateZ(300px)" }}
            className="absolute bottom-8 right-8 md:bottom-20 md:left-20 text-[80px] md:text-[180px] font-black text-white/[0.015] pointer-events-none select-none italic will-change-transform"
          >
            0{index + 1}
          </div>
        </motion.div>
      </div>
    </div>
  );
});

export default function LandingPage({ onSignIn }: LandingPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const scaleX = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 30,
    restDelta: 0.001
  });

  const mouseX = useSpring(0, { stiffness: 50, damping: 30 });
  const mouseY = useSpring(0, { stiffness: 50, damping: 30 });

  useEffect(() => {
    // Disable on mobile/touch to save cycles
    if (window.innerWidth < 768) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div ref={containerRef} className="relative min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30 font-sans">
      {/* Cinematic Progress Bar */}
      <motion.div 
        className="fixed top-0 left-0 right-0 z-[100] h-[2px] bg-gradient-to-r from-indigo-500 via-emerald-500 to-cyan-500 origin-left"
        style={{ scaleX }}
      />

      {/* Optimized Atmospheric Layering */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-zinc-950">
        <motion.div 
          className="absolute inset-[-20%] opacity-[0.15] saturate-[1.2] will-change-transform"
          style={{
            x: useTransform(mouseX, [ -1, 1 ], [ 30, -30 ]),
            y: useTransform(mouseY, [ -1, 1 ], [ 30, -30 ]),
          }}
        >
          <div 
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 15% 15%, var(--color-indigo-600) 0%, transparent 50%), radial-gradient(circle at 85% 85%, var(--color-cyan-600) 0%, transparent 50%)',
              filter: 'blur(120px)',
              transform: 'translateZ(0)'
            }}
          />
        </motion.div>

        <motion.div 
          className="absolute inset-[-20%] opacity-[0.1] saturate-[1.5] will-change-transform"
          style={{
            x: useTransform(mouseX, [ -1, 1 ], [ -40, 40 ]),
            y: useTransform(mouseY, [ -1, 1 ], [ -40, 40 ]),
          }}
        >
          <div 
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 75% 25%, var(--color-emerald-600) 0%, transparent 45%), radial-gradient(circle at 25% 75%, var(--color-indigo-600) 0%, transparent 45%)',
              filter: 'blur(100px)',
              transform: 'translateZ(0)'
            }}
          />
        </motion.div>
        
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay pointer-events-none invert grayscale" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(9,9,11,0.5)_100%)] pointer-events-none" />
      </div>

      {/* Floating Interactive Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-6 md:py-8">
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          className="mx-auto flex max-w-5xl items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/40 px-4 md:px-8 py-3 md:py-4 backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center gap-3 md:gap-4 group cursor-pointer">
            <div className="relative flex h-8 w-8 md:h-10 md:w-10 items-center justify-center overflow-hidden rounded-lg md:rounded-xl bg-zinc-900 border border-white/5">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 via-emerald-500 to-cyan-500 opacity-20 group-hover:opacity-100 transition-opacity" />
              <TrendingUp size={20} className="relative z-10 text-emerald-400 group-hover:text-white transition-colors" />
            </div>
            <span className="text-lg md:text-xl font-bold tracking-tight text-white">TradeFlow</span>
          </div>
          
          <div className="hidden items-center gap-10 lg:gap-12 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500 md:flex">
            {['Features', 'Intelligence', 'Security'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="relative group transition-colors hover:text-white">
                {item}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-emerald-500 transition-all group-hover:w-full" />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSignIn}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-white px-4 md:px-6 py-2 md:py-2.5 text-[10px] md:text-[11px] font-black uppercase tracking-widest text-zinc-950 transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              <span className="relative z-10 hidden sm:inline">Access Terminal</span>
              <span className="relative z-10 sm:hidden">Access</span>
              <ChevronRight size={14} className="relative z-10 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 transition-transform group-hover:translate-x-0" />
            </button>

            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex md:hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </motion.div>

        {/* Mobile menu overlay */}
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-24 left-4 right-4 rounded-2xl border border-white/10 bg-zinc-950/95 p-8 backdrop-blur-2xl md:hidden"
          >
            <div className="flex flex-col gap-6 text-sm font-black uppercase tracking-[0.4em] text-zinc-400">
              <a href="#features" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-400">Features</a>
              <a href="#intelligence" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-400">Intelligence</a>
              <a href="#security" onClick={() => setIsMenuOpen(false)} className="hover:text-emerald-400">Security</a>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 md:px-6 pt-32 sm:pt-64 pb-20 md:pb-32">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="mb-8 md:mb-12 inline-flex items-center gap-3 rounded-full border border-white/5 bg-white/5 px-6 py-2.5 text-[8px] md:text-[10px] font-bold uppercase tracking-[0.35em] text-emerald-400 backdrop-blur-3xl shadow-[0_0_30px_rgba(16,185,129,0.1)]"
          >
            <Sparkles size={12} className="animate-pulse" />
            <span>The Standard in Digital Asset Management</span>
          </motion.div>

          <div className="relative mb-12">
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-6xl text-5xl font-bold leading-[0.95] tracking-tighter sm:text-8xl md:text-[10rem] lg:text-[13rem]"
            >
              <span className="block text-zinc-500 opacity-50 uppercase tracking-widest text-lg sm:text-4xl md:text-6xl mb-4">Trade with</span>
              <span className="relative inline-block bg-gradient-to-b from-white via-white to-zinc-600 bg-clip-text text-transparent italic">
                PRECISION.
              </span>
            </motion.h1>
            
            {/* Cinematic Lens Flare Light */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2, delay: 0.8 }}
              className="absolute -top-20 left-1/2 -z-10 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[100px]"
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.8 }}
            className="mb-16 max-w-2xl text-xl font-medium leading-relaxed tracking-tight text-zinc-400 sm:text-2xl"
          >
            The ultimate workstation for modern traders. <br />
            Track every move, analyze strategies with AI, and master your psychological edge.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 1, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-8 sm:flex-row"
          >
            <button
              onClick={onSignIn}
              className="relative group flex items-center justify-center gap-6 rounded-2xl p-[1px] transition-all hover:scale-[1.02] active:scale-95 overflow-hidden"
            >
              <div className="absolute inset-0 bg-emerald-400 opacity-0 group-hover:opacity-10 transition-opacity duration-1000" />
              <div className="relative flex items-center justify-center gap-4 md:gap-6 rounded-[calc(1rem-1px)] bg-white px-8 md:px-16 py-4 md:py-8 text-xl md:text-2xl font-black uppercase tracking-tighter text-zinc-950 shadow-[0_30px_60px_-15px_rgba(255,255,255,0.2)]">
                <span>Start Your Journal</span>
                <ChevronRight size={24} className="md:size-28 transition-transform group-hover:translate-x-2" />
              </div>
            </button>
            
            <button
              onClick={onSignIn}
              className="group flex items-center justify-center gap-4 md:gap-6 rounded-2xl border border-white/10 bg-white/5 px-8 md:px-16 py-4 md:py-8 text-xl md:text-2xl font-bold tracking-tighter backdrop-blur-3xl transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 text-white"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-6 w-6 md:h-8 md:w-8" alt="Google" />
              <span className="shrink-0">Sign in with Google</span>
            </button>
          </motion.div>
        </div>

        {/* Cinematic Intelligence Stage */}
        <div id="features" className="relative mt-32">
          {/* Parallax Background Glow for Features Section */}
          <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
            <motion.div 
               style={{ rotate: useTransform(scrollYProgress, [0, 1], [0, 20]) }}
               className="absolute top-0 left-1/2 -translate-x-1/2 h-screen w-full bg-[radial-gradient(circle_at_center,var(--color-emerald-500)/0.03_0%,transparent_70%)] blur-[100px]" 
            />
          </div>

          <div className="relative">
            <div className="flex flex-col items-center text-center px-6 mb-32">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8 flex items-center gap-3 rounded-full border border-emerald-500/20 bg-emerald-950/30 px-6 py-2 text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400"
              >
                <Sparkles size={12} className="text-emerald-400 shrink-0" />
                <span>Recursive Synthesis</span>
              </motion.div>
              <h2 className="text-6xl font-black tracking-tighter sm:text-[12rem] lg:text-[15rem] leading-[0.75] bg-gradient-to-b from-white via-white/80 to-zinc-900 bg-clip-text text-transparent italic">
                AI <br />
                <span className="text-zinc-800">Insights.</span>
              </h2>
            </div>

            <div className="flex flex-col">
              {[
                {
                  icon: Brain,
                  title: "Neural Engine",
                  desc: "Recursive strategy analysis of trading psychology and technical patterns. Identifies mapping inconsistencies in your execution.",
                  detail: "STRATEGY ANALYSIS MODE",
                  color: "from-indigo-500",
                },
                {
                  icon: Shield,
                  title: "Risk Synthesis",
                  desc: "Automated risk-of-ruin simulations and position sizing logic to ensure capital preservation and strategic stability.",
                  detail: "PROTECTION MODULE",
                  color: "from-emerald-500",
                },
                {
                  icon: Target,
                  title: "Logic Auditor",
                  desc: "Analyzes setup efficiency and filters noise. Identifies profitable anomalies and audits the logical consistency of your edge.",
                  detail: "STRATEGIC CORE",
                  color: "from-cyan-500",
                },
                {
                  icon: Binary,
                  title: "Neural Analytics",
                  desc: "High-fidelity data visualization and institutional-grade equity tracking. Real-time forecasting powered by decentralized logic.",
                  detail: "SYNTHETIC FEED",
                  color: "from-white",
                }
              ].map((feature, i) => (
                <FeatureModule key={feature.title} module={feature} index={i} total={4} />
              ))}
            </div>
          </div>
        </div>

        {/* Cinematic Stats Section */}
        <div className="mt-40 md:mt-72 overflow-hidden rounded-[2.5rem] md:rounded-[4rem] border border-white/10 bg-zinc-900/10 py-20 md:py-32 backdrop-blur-3xl relative [content-visibility:auto]">
          <div className="absolute inset-0 bg-radial-gradient(circle at top left, var(--color-emerald-500)/0.05 0%, transparent 50%)" />
          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-12 md:gap-24 px-6 md:px-24">
            {[
              { label: "Active Nodes", value: "10k+", detail: "Across 4 continents" },
              { label: "Analyzed Data", value: "2.4M", detail: "Tick-level precision" },
              { label: "Neural Insights", value: "500k+", detail: "94% correlation" },
              { label: "System Uptime", value: "99.9%", detail: "Institutional backbone" }
            ].map((stat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                className="group flex flex-col items-start gap-4"
              >
                <div className="text-7xl font-black tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent group-hover:from-emerald-400 group-hover:to-white transition-all duration-500">
                  {stat.value}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-px w-4 bg-emerald-500/30 group-hover:w-10 group-hover:bg-emerald-500 transition-all duration-500" />
                  <div className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-500 group-hover:text-zinc-300 transition-colors">
                    {stat.label}
                  </div>
                </div>
                <div className="text-[10px] font-bold text-zinc-600 tracking-wider italic opacity-0 group-hover:opacity-100 transition-all duration-500 -translate-x-2 group-hover:translate-x-0">
                  {stat.detail}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Intelligence / Nexus Highlight */}
        <div id="intelligence" className="mt-40 md:mt-72 flex flex-col items-center gap-20 md:gap-32 md:flex-row [content-visibility:auto]">
          <div className="flex-1 space-y-8 md:space-y-12">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-3 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-400"
            >
              <Zap size={12} className="text-indigo-400" />
              <span>Nexus Intelligence Protocol</span>
            </motion.div>
            
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-5xl font-bold tracking-tighter leading-[0.9] text-white sm:text-7xl lg:text-9xl"
            >
              The digital ghost <br />
              <span className="text-zinc-600">in the terminal.</span>
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-lg md:text-2xl font-medium tracking-tight text-zinc-500 leading-relaxed max-w-xl"
            >
              Nexus doesn't just track data — it learns your edge. It identifies the subtle patterns in your execution that lead to victory or ruin.
            </motion.p>
          </div>

          <div className="relative flex-1">
            <div className="aspect-square relative flex items-center justify-center isolation-isolate">
              {/* Floating Brain Group */}
              <motion.div 
                animate={{ 
                  y: [0, -15, 0],
                }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex items-center justify-center translate-z-0"
              >
                {/* Contained Aura - Moves with artifact */}
                <div className="absolute inset-[-20px] bg-indigo-500/10 rounded-full pointer-events-none blur-3xl translate-z-0" />
                
                {/* Center Artifact - Brain Core */}
                <div className="relative h-72 w-72 overflow-hidden rounded-[3.5rem] border border-white/10 bg-zinc-900/60 p-2 shadow-2xl">
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.05] to-transparent" />
                  <div className="flex h-full w-full items-center justify-center relative overflow-hidden rounded-[3.3rem] bg-zinc-950">
                    <div className="absolute inset-0 bg-radial-gradient(circle at center, var(--color-indigo-500)/0.2 0%, transparent 70%)" />
                    <Brain size={110} className="text-indigo-400 relative z-10 opacity-90" />
                  </div>
                </div>
              </motion.div>

              {/* Orbiting Intelligence Nodes - Optimized with CSS rotation logic where possible */}
              {[45, 165, 285].map((angle, i) => (
                <motion.div 
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 25 + i * 5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-[-40px] pointer-events-none translate-z-0"
                >
                   <div 
                    style={{ transform: `rotate(${angle}deg) translate(180px) rotate(-${angle}deg)` }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                   >
                     <div className="h-14 w-14 rounded-2xl border border-white/10 bg-zinc-900/80 flex items-center justify-center shadow-xl transition-all hover:scale-110">
                        {i === 0 && <Zap size={20} className="text-indigo-400" />}
                        {i === 1 && <Target size={20} className="text-emerald-400" />}
                        {i === 2 && <TrendingUp size={20} className="text-cyan-400" />}
                     </div>
                   </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Security / Nexus Highlight */}
        <div id="security" className="mt-40 md:mt-72 flex flex-col items-center gap-20 md:gap-32 md:flex-row-reverse [content-visibility:auto]">
          <div className="flex-1 space-y-8 md:space-y-12">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-4 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.4em] text-emerald-400"
            >
              <Lock size={14} />
              <span>Enterprise-Grade Security Protocol</span>
            </motion.div>
            
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-5xl font-bold tracking-tighter leading-[0.9] text-white sm:text-7xl lg:text-8xl"
            >
              Your data remains <br />
              <span className="text-zinc-600">Private & Secured.</span>
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-lg md:text-2xl font-medium tracking-tight text-zinc-500 leading-relaxed max-w-xl"
            >
              We leverage end-to-end encryption and the same decentralized logic that powers Nexus to ensure your intellectual property never leaves your control.
            </motion.p>
            
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {[
                { label: 'AES-256 Symmetric Encryption', icon: Shield },
                { label: 'OAuth 2.0 Identity Synthesis', icon: Lock },
                { label: 'Recursive Security Audits', icon: Target },
                { label: 'Isolated Neural Processing', icon: Cpu }
              ].map((item, i) => (
                <motion.li 
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 group"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                    <item.icon size={20} />
                  </div>
                  <span className="text-sm font-bold tracking-tight text-zinc-300 group-hover:text-white transition-colors">{item.label}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="relative flex-1">
            <div className="aspect-square relative flex items-center justify-center isolation-isolate">
              {/* Floating Shield Group */}
              <motion.div 
                animate={{ 
                  y: [0, -20, 0],
                }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex items-center justify-center translate-z-0"
              >
                {/* Contained Aura - Moves with artifact and doesn't spill */}
                <div className="absolute inset-[-30px] bg-emerald-500/10 rounded-full pointer-events-none blur-3xl translate-z-0" />
                
                {/* Floating Shield Artifact with Soft Shimmer */}
                <div className="relative h-72 w-72 overflow-hidden rounded-[4rem] border border-white/10 bg-zinc-900/60 shadow-2xl p-[2px]">
                  <div className="relative h-full w-full rounded-[3.9rem] bg-zinc-950 flex items-center justify-center overflow-hidden">
                    {/* INTERNAL HOLOGRAPHIC SHIMMER */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent opacity-30" />
                    <div className="absolute inset-0 bg-radial-gradient(circle at center, var(--color-emerald-500)/0.1 0%, transparent 75%)" />
                    
                    <Shield size={120} className="text-emerald-500 relative z-10 opacity-90" />
                  </div>
                </div>
              </motion.div>

              {/* Orbiting Metadata Nodes */}
              {[0, 120, 240].map((angle, i) => (
                <motion.div 
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18 + i * 5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-[-30px] pointer-events-none translate-z-0"
                >
                   <div 
                    style={{ transform: `rotate(${angle}deg) translate(190px) rotate(-${angle}deg)` }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                   >
                     <div className="h-12 w-12 rounded-2xl border border-white/10 bg-zinc-900/80 flex items-center justify-center shadow-xl">
                        {i === 0 && <Brain size={18} className="text-indigo-400" />}
                        {i === 1 && <Lock size={18} className="text-emerald-400" />}
                        {i === 2 && <Target size={18} className="text-cyan-400" />}
                     </div>
                   </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Final CTA Card */}
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-40 md:mt-72 rounded-[2.5rem] md:rounded-[4rem] p-1 bg-gradient-to-br from-white/10 via-white/5 to-transparent overflow-hidden"
        >
          <div className="relative overflow-hidden rounded-[2.4rem] md:rounded-[3.9rem] bg-zinc-950 px-6 md:px-12 py-20 md:py-32 text-center">
            <div className="absolute inset-0 bg-radial-gradient(circle at bottom right, var(--color-emerald-500)/0.1 0%, transparent 60%)" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
            
            <h2 className="relative z-10 mb-8 md:mb-12 text-5xl font-bold tracking-tighter sm:text-8xl">
              Ready to elevate your <br />
              <span className="text-zinc-600">execution?</span>
            </h2>
            
            <button
              onClick={onSignIn}
              className="relative group transition-all active:scale-95 z-20 w-full sm:w-auto"
            >
               <div className="flex items-center justify-center gap-4 md:gap-6 rounded-2xl md:rounded-3xl bg-white px-8 md:px-20 py-6 md:py-10 text-xl md:text-3xl font-black uppercase tracking-tighter text-zinc-950 transition-all hover:shadow-[0_40px_80px_-20px_rgba(255,255,255,0.3)]">
                  Engage Now
                  <ChevronRight size={24} className="md:size-32 transition-transform group-hover:translate-x-2" />
               </div>
            </button>
          </div>
        </motion.div>
      </main>

      {/* Futuristic Stately Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-zinc-950 px-6 md:px-12 py-20 md:py-32 mt-40 md:mt-72 [content-visibility:auto]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-16 md:gap-24 md:flex-row">
          <div className="space-y-8 md:space-y-12">
            <div className="flex items-center gap-4">
               <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-zinc-900 border border-white/10 text-white">
                  <TrendingUp size={20} className="md:size-24" />
               </div>
               <span className="text-2xl md:text-3xl font-bold tracking-tight">TradeFlow</span>
            </div>
            <p className="max-w-sm text-base md:text-lg font-medium tracking-tight text-zinc-500 leading-relaxed">
              Empowering the next generation of digital asset traders with recursive AI intelligence and institutional-grade logic.
            </p>
            <div className="flex gap-4 md:gap-6">
               {['Twitter', 'Discord', 'Github'].map(soc => (
                 <a key={soc} href="#" className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                    <span className="sr-only">{soc}</span>
                    <div className="h-px w-4 bg-current" />
                 </a>
               ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-16 md:gap-32 sm:grid-cols-3">
             <div className="space-y-6 md:space-y-8">
                <h4 className="text-[10px] md:text-[12px] font-bold uppercase tracking-[0.4em] text-zinc-400">Terminal</h4>
                <ul className="space-y-3 md:space-y-4 text-xs md:text-sm font-medium text-zinc-500 tracking-tight">
                   <li><a href="#" className="hover:text-white transition-colors">Trade Flow</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Risk Auditor</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Intelligence</a></li>
                </ul>
             </div>
             <div className="space-y-6 md:space-y-8">
                <h4 className="text-[10px] md:text-[12px] font-bold uppercase tracking-[0.4em] text-zinc-400">Modular</h4>
                <ul className="space-y-3 md:space-y-4 text-xs md:text-sm font-medium text-zinc-500 tracking-tight">
                   <li><a href="#" className="hover:text-white transition-colors">Nexus Protocol</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Security Synthesis</a></li>
                </ul>
             </div>
             <div className="space-y-6 md:space-y-8 hidden sm:block">
                <h4 className="text-[10px] md:text-[12px] font-bold uppercase tracking-[0.4em] text-zinc-400">Legal</h4>
                <ul className="space-y-3 md:space-y-4 text-xs md:text-sm font-medium text-zinc-500 tracking-tight">
                   <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                   <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                </ul>
             </div>
          </div>
        </div>
        
        <div className="mx-auto mt-20 md:mt-32 max-w-7xl border-t border-white/5 pt-12 flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="text-[9px] md:text-[11px] font-bold uppercase tracking-[0.5em] text-zinc-600 text-center md:text-left">
             Modular Intelligence Systems inc.
           </div>
           <div className="flex items-center gap-2 md:gap-3 text-[8px] md:text-[10px] font-bold tracking-[0.2em] text-zinc-700">
              <Shield size={10} className="md:size-12" />
              SYSTEM STATUS: OPTIMAL
           </div>
        </div>
      </footer>
    </div>
  );
}
