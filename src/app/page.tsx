export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 shadow-2xl backdrop-blur">
        <div className="inline-block rounded-full bg-emerald-500/10 px-4 py-1 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
          Backend & Database Ready
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Bestie AI
        </h1>
        <p className="text-sm text-slate-400">
          Emotionally adaptive AI companion architecture initialized with Next.js App Router, Prisma ORM, and SQLite.
        </p>
      </div>
    </main>
  );
}
