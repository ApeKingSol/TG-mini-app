const fs = require('fs');
const file = 'src/screens/SyndicateHub.tsx';
let src = fs.readFileSync(file, 'utf8');

if (!src.includes('Info,')) {
  src = src.replace('Crown,', 'Crown, Info,');
}

const activeScreenSignature = 'function ActiveScreen({ syndicate, onLeft, onSyndicateUpdate }: ActiveScreenProps) {';
const activeScreenReplacement = `function ActiveScreen({ syndicate, onLeft, onSyndicateUpdate }: ActiveScreenProps) {
  const [isEarningsInfoOpen, setIsEarningsInfoOpen] = useState(false);`;

src = src.replace(activeScreenSignature, activeScreenReplacement);

const topBlock = `<div className="rounded-2xl border border-neon-cyan/30 bg-white/5 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-neon-cyan">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">Syndicate</p>
              <button onClick={() => setIsEarningsInfoOpen(true)} className="ml-1 rounded-full bg-neon-cyan/20 p-0.5 text-neon-cyan hover:bg-neon-cyan/40">
                <Info className="h-3 w-3" />
              </button>
            </div>
            <p className="truncate font-display text-lg font-bold uppercase tracking-wide text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">`;

src = src.replace(/<div className="rounded-2xl border border-neon-cyan\/30 bg-white\/5 p-4 backdrop-blur-xl">[\s\S]*?<p className="truncate font-display text-lg font-bold uppercase tracking-wide text-neon-cyan drop-shadow-\[0_0_10px_rgba\(0,240,255,0\.5\)\]">/, topBlock);

const returnWrapper = `return (
    <div className="flex flex-col gap-3">
      <AnimatePresence>
        {isEarningsInfoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-neon-cyan/50 bg-cyber-dark p-6 shadow-[0_0_30px_rgba(0,240,255,0.15)]"
            >
              <h3 className="font-display text-lg font-bold uppercase tracking-widest text-neon-cyan mb-4 flex items-center gap-2">
                <Info className="h-5 w-5" />
                Earnings Split
              </h3>
              <div className="space-y-4 text-sm text-neutral-300">
                <p>When a Syndicate member wins a race, a percentage of the payout is distributed among the Syndicate:</p>
                <ul className="space-y-2">
                  <li className="flex items-center justify-between rounded border border-amber/30 bg-amber/5 px-3 py-2">
                    <span className="font-bold text-amber">Leader</span>
                    <span className="font-mono text-amber">Gets highest %</span>
                  </li>
                  <li className="flex items-center justify-between rounded border border-neon-cyan/30 bg-neon-cyan/5 px-3 py-2">
                    <span className="font-bold text-neon-cyan">Co-Leaders</span>
                    <span className="font-mono text-neon-cyan">Get medium %</span>
                  </li>
                  <li className="flex items-center justify-between rounded border border-neutral-700 bg-white/5 px-3 py-2">
                    <span className="font-bold text-neutral-300">Members</span>
                    <span className="font-mono text-neutral-400">Share remaining %</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => setIsEarningsInfoOpen(false)}
                className="mt-6 w-full rounded-lg bg-neon-cyan py-3 font-mono text-sm font-bold uppercase tracking-widest text-black"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>`;

src = src.replace('return (\n    <div className="flex flex-col gap-3">', returnWrapper);

fs.writeFileSync(file, src);
