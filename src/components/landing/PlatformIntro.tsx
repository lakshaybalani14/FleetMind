import Link from "next/link";
import { ArrowDown, ArrowUpRight, BellRing, BrainCircuit, ChartNoAxesCombined, Clock3, Cpu, Github, Radio, RadioTower, ShieldAlert, ShieldCheck, Waypoints } from "lucide-react";
import Safari_01 from "@/components/ui/Safari_01";
import CognitoEntryButton from "./CognitoEntryButton";
import ParticleText from "./ParticleText";

const capabilities = [
  { kind: "bidirectional", icon: Waypoints, eyebrow: "Two way by design", title: "Commands out. Confirmation back.", body: "Send relay controls to the board and watch its reported state return through the same connected fleet." },
  { kind: "board", icon: RadioTower, eyebrow: "Board level visibility", title: "Monitor the system, not just its sensors.", body: "Dedicated heartbeats and health state help show when a board is offline or telemetry has gone quiet." },
  { kind: "stream", icon: Radio, eyebrow: "Live WebSocket stream", title: "Fresh updates as they arrive.", body: "A persistent WebSocket connection keeps dashboard readings and device status moving in real time." },
  { kind: "prevention", icon: ShieldAlert, eyebrow: "Preventive response", title: "Act before a reading becomes an incident.", body: "Threshold rules, live trends, and board health give operators time to respond to changing conditions." },
  { kind: "freshness", icon: Clock3, eyebrow: "Data freshness", title: "Late readings stay visible as late.", body: "Separate device status from telemetry freshness so an old reading cannot quietly look current." },
  { kind: "fleet", icon: Cpu, eyebrow: "Fleet management", title: "Many nodes. One cloud gateway.", body: "Bring multiple devices into one central handler and monitor the fleet from a shared workspace." },
  { kind: "alerts", icon: BellRing, eyebrow: "AWS SNS alerts", title: "Escalate when the board goes quiet.", body: "Optional health alarms can notify your team when a device misses its expected heartbeat." },
  { kind: "bedrock", icon: BrainCircuit, eyebrow: "Amazon Bedrock", title: "Get context for an alert.", body: "Use a language model to explain threshold alerts in plain language alongside the telemetry." },
  { kind: "analysis", icon: ChartNoAxesCombined, eyebrow: "Telemetry analysis", title: "Spot patterns behind the signal.", body: "Review sensor history and flagged readings to support earlier investigation and threat awareness." },
];

function CapabilityGraphic({ kind }: { kind: (typeof capabilities)[number]["kind"] }) {
  return (
    <div className={`feature-graphic feature-graphic-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 440 156" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        {kind === "bidirectional" && <>
          <path d="M56 78H176M264 78H384" className="feature-line feature-line-dashed" />
          <path d="M94 50H146M294 106H346" className="feature-line" />
          <rect x="174" y="47" width="92" height="62" rx="14" className="feature-panel" />
          <text x="220" y="74" textAnchor="middle" className="feature-label">GATEWAY</text>
          <text x="220" y="91" textAnchor="middle" className="feature-caption">COMMAND ↔ STATE</text>
          <circle cx="55" cy="78" r="22" className="feature-node" /><text x="55" y="82" textAnchor="middle" className="feature-label">WEB</text>
          <circle cx="385" cy="78" r="22" className="feature-node" /><text x="385" y="82" textAnchor="middle" className="feature-label">BOARD</text>
          <circle cx="85" cy="78" r="3.5" className="feature-packet feature-packet-one" />
          <circle cx="336" cy="78" r="3.5" className="feature-packet feature-packet-two" />
        </>}
        {kind === "board" && <>
          <circle cx="220" cy="77" r="54" className="feature-orbit" />
          <circle cx="220" cy="77" r="38" className="feature-orbit feature-orbit-inner" />
          <circle cx="220" cy="77" r="23" className="feature-node feature-pulse" />
          <path d="M206 78h7l5-12 7 23 6-13h8" className="feature-wave" />
          <circle cx="269" cy="39" r="4" className="feature-status-dot" />
          <text x="220" y="148" textAnchor="middle" className="feature-caption">BOARD HEARTBEAT · LIVE</text>
        </>}
        {kind === "stream" && <>
          {[0, 1, 2, 3, 4].map((item) => <g key={item}>
            <rect x="35" y={19 + item * 25} width="370" height="17" rx="8.5" className="feature-stream-row" />
            <circle cx={58 + (item % 2) * 23} cy={27.5 + item * 25} r="3.5" className={`feature-status-dot feature-stream-dot feature-delay-${item}`} />
            <path d={`M92 ${27.5 + item * 25}h${108 + (item % 3) * 45}`} className="feature-line feature-stream-line" />
            <text x="374" y={31 + item * 25} textAnchor="end" className="feature-caption">{["TEMP", "HUMIDITY", "MQ-2", "STATUS", "RELAY"][item]}</text>
          </g>)}
        </>}
        {kind === "prevention" && <>
          <path d="M28 120H412" className="feature-line" />
          <path d="M28 62H412" className="feature-threshold" />
          <text x="405" y="54" textAnchor="end" className="feature-caption feature-caption-alert">RESPONSE THRESHOLD</text>
          <path d="M30 108C65 106 67 93 97 98S142 113 168 88 205 98 230 80 265 87 285 63 321 79 341 48 378 63 410 33" className="feature-wave feature-wave-chart" />
          <circle cx="341" cy="48" r="5" className="feature-status-dot feature-alert-pulse" />
        </>}
        {kind === "freshness" && <>
          <path d="M48 85H392" className="feature-line feature-line-dashed" />
          {[72, 170, 268, 366].map((x, index) => <g key={x}>
            <circle cx={x} cy="85" r={index === 3 ? 7 : 5} className={index === 3 ? "feature-status-dot feature-pulse" : "feature-node"} />
            <text x={x} y="112" textAnchor="middle" className="feature-caption">{["09:41", "09:42", "09:43", "LATE"][index]}</text>
          </g>)}
          <text x="220" y="44" textAnchor="middle" className="feature-label">READING FRESHNESS</text>
        </>}
        {kind === "fleet" && <>
          <path d="M220 78L100 32M220 78L100 124M220 78L340 32M220 78L340 124M220 78L220 22M220 78L220 134" className="feature-line feature-line-dashed" />
          <rect x="178" y="51" width="84" height="54" rx="13" className="feature-panel feature-panel-accent" />
          <text x="220" y="75" textAnchor="middle" className="feature-label">CLOUD</text>
          <text x="220" y="91" textAnchor="middle" className="feature-caption">GATEWAY</text>
          {[[100, 32], [100, 124], [340, 32], [340, 124], [220, 22], [220, 134]].map(([cx, cy], index) => <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="12" className="feature-node" />
            <circle cx={cx} cy={cy} r="3" className={`feature-status-dot feature-delay-${index}`} />
          </g>)}
        </>}
        {kind === "alerts" && <>
          <rect x="88" y="20" width="264" height="116" rx="13" className="feature-panel" />
          <circle cx="119" cy="52" r="13" className="feature-alert-icon" /><path d="M119 45v9m0 5h.01" className="feature-alert-mark" />
          <text x="145" y="50" className="feature-label">BOARD HEARTBEAT MISSED</text>
          <text x="145" y="66" className="feature-caption">SNS HEALTH ALERT</text>
          <path d="M109 88h222" className="feature-line" />
          <path d="M109 104h153" className="feature-line feature-line-dim" />
          <circle cx="319" cy="104" r="5" className="feature-status-dot feature-alert-pulse" />
        </>}
        {kind === "bedrock" && <>
          <rect x="60" y="20" width="320" height="116" rx="13" className="feature-panel" />
          <rect x="78" y="37" width="37" height="37" rx="11" className="feature-panel feature-panel-accent" />
          <text x="96.5" y="61" textAnchor="middle" className="feature-label">AI</text>
          <text x="130" y="49" className="feature-label">ALERT EXPLANATION</text>
          <text x="130" y="65" className="feature-caption">AMAZON BEDROCK</text>
          <path d="M80 91h246" className="feature-line feature-type-line-one" />
          <path d="M80 108h177" className="feature-line feature-type-line-two" />
          <circle cx="269" cy="108" r="2.5" className="feature-status-dot feature-caret" />
        </>}
        {kind === "analysis" && <>
          <path d="M30 126H410M30 88H410M30 50H410" className="feature-line feature-grid-line" />
          <path d="M34 112C72 110 80 78 116 91S160 109 192 74 236 92 268 59 316 79 340 46 378 56 407 26" className="feature-wave feature-wave-chart" />
          <path d="M340 28V132" className="feature-threshold feature-analysis-cursor" />
          <circle cx="340" cy="46" r="5" className="feature-status-dot feature-pulse" />
          <rect x="345" y="20" width="61" height="20" rx="5" className="feature-panel feature-panel-accent" />
          <text x="375" y="34" textAnchor="middle" className="feature-caption">ANOMALY</text>
        </>}
      </svg>
    </div>
  );
}

export default function PlatformIntro() {
  return (
    <div className="relative isolate overflow-x-clip bg-[#080a10]">
    <main className="platform-intro relative z-10 w-full rounded-b-3xl border-b border-white/10 bg-[#080a10] text-zinc-100 shadow-[0_30px_80px_rgba(0,0,0,0.58)]">
      <a href="#intro" className="sr-only z-50 rounded-lg bg-white p-3 text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="relative z-10 mx-auto flex h-24 max-w-[1320px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link href="/" aria-label="FleetMind home" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-200"><Cpu className="h-5 w-5" aria-hidden="true" /></span>
          FleetMind<span className="ml-0.5 mt-1 h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
        </Link>
        <nav className="hidden items-center gap-8 text-[13px] text-zinc-400 md:flex" aria-label="Introduction">
          <a className="transition-colors hover:text-white" href="#capabilities">Capabilities</a>
          <a className="transition-colors hover:text-white" href="#platform">The platform</a>
        </nav>
        <a
          href="https://github.com/lakshaybalani14/FleetMind"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="FleetMind on GitHub"
          title="FleetMind on GitHub"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-zinc-300 transition hover:border-white/30 hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300"
        >
          <Github className="h-[18px] w-[18px]" aria-hidden="true" />
        </a>
      </header>

      <section id="intro" className="relative mx-auto max-w-[1320px] px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-20 sm:pt-20">
        <div className="intro-halo pointer-events-none absolute -top-44 left-1/2 h-[620px] w-[1000px] -translate-x-1/2" aria-hidden="true" />
        <div className="intro-reveal relative">
          <div className="particle-hero relative mx-auto mt-5 max-w-5xl" aria-label="Every signal. A clearer picture.">
            <div className="particle-horizon pointer-events-none absolute inset-x-0 bottom-0 h-[55%]" aria-hidden="true" />
            <h1 className="relative z-[1] flex flex-col items-center font-medium leading-none tracking-[-0.055em]">
              <span className="block h-[clamp(4.5rem,12vw,8rem)] w-full"><ParticleText text="Every signal." /></span>
              <span className="intro-gradient block h-[clamp(4.5rem,12vw,8rem)] w-full"><ParticleText text="A clearer picture." color="#c7d7ff" highlightColor="#ff5a36" /></span>
            </h1>
          </div>
          <p className="mx-auto mt-7 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
            Meet FleetMind. One connected workspace to monitor your sensor nodes, understand your telemetry, and stay in control.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <CognitoEntryButton variant="primary" />
            <a href="#platform" className="inline-flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 transition hover:text-white">Take a closer look <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></a>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-blue-200/60" aria-hidden="true" /> Sign-in secured by Amazon Cognito</p>
        </div>
      </section>

      <section id="capabilities" className="relative mx-auto max-w-[1320px] scroll-mt-8 px-5 pb-16 sm:px-8 lg:pb-20" aria-labelledby="capabilities-heading">
        <div className="border-t border-white/10 pt-10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-200/80">Built for the whole device lifecycle</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 id="capabilities-heading" className="max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl">From early signal to informed action.</h2>
            <p className="max-w-md pb-1 text-xs leading-6 text-zinc-500">Board health, real time telemetry, and cloud guided response in one fleet view.</p>
          </div>
        </div>
        <div className="feature-grid mt-8">
          {capabilities.map(({ kind, icon: Icon, eyebrow, title, body }, index) => (
            <article key={eyebrow} className={`feature-card feature-card-${kind} group`}>
              <CapabilityGraphic kind={kind} />
              <div className="feature-copy">
                <div className="flex items-center gap-2 text-orange-200/75">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <p className="text-[9px] font-medium uppercase tracking-[0.18em]">{eyebrow}</p>
                  <span className="ml-auto font-mono text-[10px] text-zinc-700">0{index + 1}</span>
                </div>
                <h3 className="mt-2 text-base font-medium leading-6 text-zinc-100 sm:text-lg">{title}</h3>
                <p className="mt-2 max-w-[48ch] text-xs leading-6 text-zinc-500">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="platform" className="relative mx-auto max-w-[1320px] scroll-mt-8 px-5 pb-24 sm:px-8 lg:pb-36" aria-labelledby="platform-heading">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-7">
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-blue-200/70">Inside FleetMind</p><h2 id="platform-heading" className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">Two views. One connected system.</h2></div>
          <p className="pb-1 text-xs text-zinc-500">A look inside the actual platform</p>
        </div>
        <div className="grid gap-10 md:grid-cols-2 md:gap-7">
          <article className="min-w-0">
            <Link href="/monitoring" className="group block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-blue-300" aria-label="Open the Monitoring dashboard">
              <div className="relative"><div className="pointer-events-none absolute -inset-6 rounded-full bg-blue-500/[0.07] blur-3xl" aria-hidden="true" />
                <Safari_01 image="/previews/monitoring-current.svg" alt="FleetMind Monitoring dashboard showing the relay controls inside the relay state card, live sensor readings, device status, and telemetry chart" address="FleetMind / Monitoring" priority className="relative transition-transform duration-500 group-hover:-translate-y-1" />
              </div>
              <div className="mt-5 flex items-center justify-between"><h3 className="flex items-center gap-3 text-sm font-medium"><span className="font-mono text-[10px] text-zinc-600">01 /</span> Monitoring</h3><ArrowUpRight className="h-4 w-4 text-blue-200 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></div>
              <p className="ml-9 mt-2 max-w-md text-xs leading-6 text-zinc-500">Device status, live sensor readings, and relay control. Your operation at a glance.</p>
            </Link>
          </article>
          <article className="min-w-0 md:translate-y-12">
            <Link href="/analysis" className="group block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-violet-300" aria-label="Open the Analytics dashboard">
              <div className="relative"><div className="pointer-events-none absolute -inset-6 rounded-full bg-violet-500/[0.07] blur-3xl" aria-hidden="true" />
                <Safari_01 image="/previews/analytics-current.svg" alt="FleetMind Analysis dashboard showing all four recent telemetry cards, a sensor trend chart, and normal versus flagged reading distribution" address="FleetMind / Analytics" priority className="relative transition-transform duration-500 group-hover:-translate-y-1" />
              </div>
              <div className="mt-5 flex items-center justify-between"><h3 className="flex items-center gap-3 text-sm font-medium"><span className="font-mono text-[10px] text-zinc-600">02 /</span> Analytics</h3><ArrowUpRight className="h-4 w-4 text-violet-200 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></div>
              <p className="ml-9 mt-2 max-w-md text-xs leading-6 text-zinc-500">Follow the trends. Explore sensor history and see how normal and flagged readings compare.</p>
            </Link>
          </article>
        </div>
      </section>

    </main>
    </div>
  );
}
