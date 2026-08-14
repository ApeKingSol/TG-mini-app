import { AnimatePresence, motion } from 'framer-motion';
import { Car, ChevronRight, Gauge, Wallet, Wrench } from 'lucide-react';
import { useState } from 'react';

interface OnboardingModalProps {
  onComplete: () => void;
}

const STEPS = [
  {
    kicker: 'FTUE.01',
    title: 'Welcome to the Grid',
    body: 'Build your street machine from scrap, race through hostile circuits, and earn your way up the neon food chain.',
    Icon: Car,
    accent: 'cyan',
  },
  {
    kicker: 'FTUE.02',
    title: 'Scavenge & Upgrade',
    body: 'Collect Scrap, tune your engine, reinforce parts, and turn every run into a faster, harder-hitting garage build.',
    Icon: Wrench,
    accent: 'amber',
  },
  {
    kicker: 'FTUE.03',
    title: 'Connect & Dominate',
    body: 'Connect a TON wallet when you are ready to unlock Web3 rewards and take your Cyber-Garage identity beyond the app.',
    Icon: Wallet,
    accent: 'magenta',
  },
] as const;

const ACCENT_CLASSES = {
  cyan: {
    border: 'border-neon-cyan/60',
    bg: 'bg-neon-cyan/10',
    text: 'text-neon-cyan',
    glow: 'shadow-[0_0_34px_rgba(0,240,255,0.22)]',
    dot: 'bg-neon-cyan',
  },
  amber: {
    border: 'border-amber/60',
    bg: 'bg-amber/10',
    text: 'text-amber',
    glow: 'shadow-[0_0_34px_rgba(255,149,0,0.18)]',
    dot: 'bg-amber',
  },
  magenta: {
    border: 'border-neon-magenta/60',
    bg: 'bg-neon-magenta/10',
    text: 'text-neon-magenta',
    glow: 'shadow-[0_0_34px_rgba(255,46,230,0.2)]',
    dot: 'bg-neon-magenta',
  },
} as const;

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];
  const accent = ACCENT_CLASSES[step.accent];
  const isFinalStep = currentStep === STEPS.length - 1;

  const handlePrimaryAction = () => {
    if (isFinalStep) {
      onComplete();
      return;
    }

    setCurrentStep((value) => value + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,240,255,0.14),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(255,149,0,0.12),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(0,240,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />

      <section className="panel-cut relative w-full max-w-md overflow-hidden border border-neon-cyan/35 bg-bg-deep/95 shadow-[0_0_60px_rgba(0,0,0,0.75)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />
        <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-amber/70 to-transparent" />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-neon-cyan shadow-[0_0_12px_rgba(0,240,255,0.9)]" />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-500">
                Cyber-Garage Init
              </p>
            </div>
            <Gauge className="h-4 w-4 text-amber" strokeWidth={1.75} />
          </div>

          <div className="mt-7 min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: 26 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -26 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                className="flex min-h-[300px] flex-col items-center text-center"
              >
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-xl border ${accent.border} ${accent.bg} ${accent.glow}`}
                >
                  <step.Icon className={`h-10 w-10 ${accent.text}`} strokeWidth={1.5} />
                </div>

                <p className={`mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.32em] ${accent.text}`}>
                  {step.kicker}
                </p>
                <h2
                  id="onboarding-title"
                  className="mt-3 font-display text-2xl font-black uppercase tracking-wide text-neutral-100 drop-shadow-[0_0_18px_rgba(0,240,255,0.24)]"
                >
                  {step.title}
                </h2>
                <p className="mt-4 max-w-[19rem] text-sm font-medium leading-6 text-neutral-400">
                  {step.body}
                </p>

                <div className="mt-auto flex items-center gap-2 pt-8" aria-label="Onboarding progress">
                  {STEPS.map((item, index) => (
                    <span
                      key={item.title}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        index === currentStep
                          ? `w-8 ${accent.dot}`
                          : index < currentStep
                            ? 'w-3 bg-neutral-500'
                            : 'w-3 bg-neutral-800'
                      }`}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={handlePrimaryAction}
            className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 border ${accent.border} ${accent.bg} px-4 py-3 font-display text-sm font-black uppercase tracking-[0.2em] ${accent.text} ${accent.glow} transition-colors active:scale-[0.99]`}
          >
            {isFinalStep ? 'Start Engine' : 'Next'}
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </section>
    </div>
  );
}
