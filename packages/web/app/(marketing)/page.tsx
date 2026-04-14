"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import {
  Brain,
  TrendingUp,
  Users,
  Shield,
  ArrowRight,
  ChevronDown,
  Instagram,
  Target,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";

const HeroScene = dynamic(() => import("@/components/landing/hero-scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 -z-10" />,
});

// ============================================================
// ANIMATED SECTION WRAPPER
// ============================================================

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// NAV
// ============================================================

function Nav() {
  const { isSignedIn } = useAuth();

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 backdrop-blur-xl bg-background/60 border-b border-border/30"
    >
      <Image src="/logo.svg" alt="Loyola Digital" width={130} height={30} className="brightness-0 invert" />
      <div className="flex items-center gap-3">
        {isSignedIn ? (
          <Link
            href="/minds"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover transition-colors"
          >
            Ir para o Dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover transition-colors"
            >
              Começar agora
            </Link>
          </>
        )}
      </div>
    </motion.nav>
  );
}

// ============================================================
// HERO
// ============================================================

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.8], [0, -100]);
  const scale = useTransform(scrollYProgress, [0, 0.8], [1, 0.95]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <HeroScene />

      {/* Gradient overlay */}
      <div className="absolute inset-0 -z-[5] bg-gradient-to-b from-background/30 via-background/10 to-background" />

      <motion.div style={{ opacity, y, scale }} className="relative z-10 text-center px-6 max-w-4xl mx-auto pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-block mb-6 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand border border-brand/30 rounded-full bg-brand/5">
            Plataforma de Marketing Digital
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]"
        >
          Inteligência que{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand via-yellow-300 to-brand">
            transforma
          </span>
          <br />
          resultados digitais
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
        >
          Gerencie campanhas, analise métricas do Instagram e Meta Ads,
          e tome decisões com IA — tudo em uma central unificada.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-wrap gap-4 justify-center"
        >
          <Link
            href="/sign-up"
            className="group inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-sm font-semibold text-brand-foreground hover:bg-brand-hover transition-all hover:gap-3"
          >
            Começar gratuitamente
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 px-7 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            Explorar recursos
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
          <ChevronDown className="h-5 w-5 text-muted-foreground/50" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// ============================================================
// METRICS BAR
// ============================================================

function MetricsBar() {
  return (
    <section className="border-y border-border/30 bg-card/30">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        {[
          { value: "10x", label: "Mais rápido que planilhas" },
          { value: "360°", label: "Visão de funil completo" },
          { value: "24/7", label: "Monitoramento contínuo" },
          { value: "100%", label: "Dados em tempo real" },
        ].map((item, i) => (
          <Reveal key={item.label} delay={i * 0.1} className="text-center">
            <p className="text-3xl md:text-4xl font-bold text-brand">{item.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// FEATURES
// ============================================================

const FEATURES = [
  {
    icon: Brain,
    title: "Central de Mentes",
    description: "Agentes de IA especializados que entendem seu negócio. Cada \"mente\" é treinada com contexto real da sua operação.",
    accent: "from-violet-500/20 to-violet-500/5",
  },
  {
    icon: Instagram,
    title: "Instagram Analytics",
    description: "Alcance, impressões, audiência e demographics. Dados atualizados direto da API oficial, sem scraping.",
    accent: "from-pink-500/20 to-pink-500/5",
  },
  {
    icon: TrendingUp,
    title: "Meta Ads Dashboard",
    description: "Full funnel analytics: campanhas, ad sets, criativos. Compare performance, identifique winners e corte perdas.",
    accent: "from-blue-500/20 to-blue-500/5",
  },
  {
    icon: Target,
    title: "Criativos & Gallery",
    description: "Visualize seus anúncios lado a lado. Ranking por CTR, ROAS, CPL — saiba exatamente o que funciona.",
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    description: "Empresas, permissões granulares, convites. Cada membro vê exatamente o que precisa, nada mais.",
    accent: "from-amber-500/20 to-amber-500/5",
  },
  {
    icon: Shield,
    title: "Dados Protegidos",
    description: "Tokens criptografados, acesso por empresa, auditoria completa. Seus dados de cliente nunca ficam expostos.",
    accent: "from-cyan-500/20 to-cyan-500/5",
  },
];

function Features() {
  return (
    <section id="features" className="py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <Reveal className="text-center mb-16">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Recursos</span>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">
            Tudo que você precisa.<br />Nada que não precisa.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feat, i) => (
            <Reveal key={feat.title} delay={i * 0.08}>
              <div className="group relative rounded-2xl border border-border/40 bg-card/50 p-6 hover:border-brand/30 transition-all duration-300 h-full">
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${feat.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand mb-4">
                    <feat.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feat.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// HOW IT WORKS — 3D PERSPECTIVE SCROLL
// ============================================================

function HowItWorks() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start end", "end start"] });
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [8, 0, -4]);
  const perspective = 1200;

  const steps = [
    { num: "01", title: "Conecte suas contas", desc: "Vincule Instagram e Meta Ads em segundos. Zero configuração técnica." },
    { num: "02", title: "Visualize o funil completo", desc: "Campanhas, criativos, métricas — tudo cruzado e atualizado automaticamente." },
    { num: "03", title: "Tome decisões com IA", desc: "As Mentes analisam padrões e sugerem otimizações baseadas nos seus dados reais." },
  ];

  return (
    <section ref={containerRef} className="py-24 md:py-32 px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-20">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Como funciona</span>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">
            Três passos para<br />resultados reais
          </h2>
        </Reveal>

        <motion.div style={{ perspective, rotateX }} className="space-y-8">
          {steps.map((step, i) => (
            <Reveal key={step.num} delay={i * 0.15}>
              <div className="flex gap-6 md:gap-10 items-start group">
                <span className="text-5xl md:text-7xl font-black text-brand/15 group-hover:text-brand/30 transition-colors shrink-0 leading-none select-none">
                  {step.num}
                </span>
                <div className="pt-2 md:pt-4">
                  <h3 className="text-xl md:text-2xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed max-w-lg">{step.desc}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="ml-8 md:ml-12 h-px bg-gradient-to-r from-border/50 to-transparent mt-8" />
              )}
            </Reveal>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================
// DASHBOARD PREVIEW — 3D TILT ON SCROLL
// ============================================================

function DashboardPreview() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rotateX = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [12, 2, 2, -6]);
  const scale = useTransform(scrollYProgress, [0, 0.4, 1], [0.9, 1, 0.97]);
  const opacity = useTransform(scrollYProgress, [0, 0.2], [0, 1]);

  return (
    <section ref={ref} className="py-16 md:py-24 px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-12">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Interface</span>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">
            Projetado para quem<br />não tem tempo a perder
          </h2>
        </Reveal>

        <motion.div
          style={{ rotateX, scale, opacity, perspective: 1200 }}
          className="rounded-2xl border border-border/40 overflow-hidden bg-card shadow-2xl shadow-black/30"
        >
          {/* Simulated dashboard */}
          <div className="p-1">
            <div className="rounded-xl bg-background border border-border/30 p-6 md:p-8 space-y-6">
              {/* Title bar */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand/60">Loyola X</p>
                  <p className="text-lg font-bold">Full Funnel Analytics</p>
                </div>
                <div className="flex gap-2">
                  {["7d", "14d", "30d"].map((d, i) => (
                    <span key={d} className={`px-3 py-1 text-xs rounded-md ${i === 2 ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"}`}>{d}</span>
                  ))}
                </div>
              </div>
              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Investido", value: "R$ 12.4K" },
                  { label: "Alcance", value: "284K" },
                  { label: "Cliques", value: "8.2K" },
                  { label: "CPL", value: "R$ 4.82" },
                  { label: "ROAS", value: "3.7x" },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl bg-card border border-border/30 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">{kpi.label}</p>
                    <p className="text-lg font-bold mt-0.5">{kpi.value}</p>
                  </div>
                ))}
              </div>
              {/* Chart placeholder */}
              <div className="h-32 rounded-xl bg-gradient-to-r from-brand/5 via-brand/10 to-brand/5 border border-border/20 flex items-end px-4 pb-3 gap-1">
                {Array.from({ length: 30 }).map((_, i) => {
                  const h = 20 + Math.sin(i * 0.5) * 30 + Math.random() * 25;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-brand/40 min-w-[2px]"
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============================================================
// CTA
// ============================================================

function CTA() {
  return (
    <section className="py-24 md:py-32 px-6">
      <Reveal>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Pronto para ver seus<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-yellow-300">
              números de verdade?
            </span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto">
            Configure em minutos. Sem cartão de crédito. Sem compromisso.
          </p>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-semibold text-brand-foreground hover:bg-brand-hover transition-all hover:gap-3"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ============================================================
// FOOTER
// ============================================================

function Footer() {
  return (
    <footer className="border-t border-border/30 py-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <Image src="/logo.svg" alt="Loyola Digital" width={100} height={24} className="brightness-0 invert opacity-50" />
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Loyola Digital. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}

// ============================================================
// PAGE
// ============================================================

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <MetricsBar />
      <Features />
      <HowItWorks />
      <DashboardPreview />
      <CTA />
      <Footer />
    </div>
  );
}
