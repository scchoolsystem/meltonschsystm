function App() {
  return (
    <div className="min-h-screen bg-espresso text-warm-cream">
      <nav className="flex items-center justify-between px-8 py-6">
        <span className="font-medium text-warm-cream">ABL</span>
        <div className="flex gap-3">
          <button className="rounded-full border border-warm-cream px-4 py-2.5 text-sm font-medium text-warm-cream">
            Patient Portal
          </button>
          <button className="rounded-full bg-amber-forge px-4 py-2.5 text-sm font-medium text-warm-cream">
            Join the list
          </button>
        </div>
      </nav>

      <section className="mx-auto max-w-[1200px] px-8 py-[52px]">
        <h1 className="max-w-xl text-[73px] leading-[1] tracking-[-0.8px] font-normal text-warm-cream">
          Your age is a number. Your biology is a choice.
        </h1>
        <p className="mt-6 max-w-[440px] text-base text-driftwood">
          Placeholder subtext — swap in real copy. This proves the tokens
          from theme.css are wired through Tailwind.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <button className="rounded-full bg-amber-forge px-[15px] py-3 text-sm font-medium text-warm-cream">
            Get started
          </button>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-forge text-espresso">
            →
          </span>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 border-t border-walnut px-8 py-[52px] sm:grid-cols-3">
        {['Feature one', 'Feature two', 'Feature three'].map((title) => (
          <div key={title} className="border-b border-walnut p-3">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-walnut" />
            <h3 className="text-sm font-medium text-warm-cream">{title}</h3>
            <p className="mt-1 text-sm text-driftwood">
              Replace with real feature copy per DESIGN.md.
            </p>
          </div>
        ))}
      </section>
    </div>
  )
}

export default App
