export const input = 'w-full rounded-md border border-ice-deep bg-white px-3 py-2 text-sm text-navy outline-none focus:border-navy focus:ring-2 focus:ring-gold/60'
export const btn = 'rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-soft focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50'
export const btnGold = 'rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:brightness-95 focus-visible:outline-2 focus-visible:outline-navy disabled:opacity-50'
export const btnLine = 'rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-ice focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50'

export function Avatar({ name = '?', size = 40 }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-ice">
      {initials}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

export function PageTitle({ title, sub }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold">{title}</h1>
      {sub && <p className="mt-1 max-w-xl text-sm text-muted">{sub}</p>}
    </div>
  )
}

export function Row({ children, accent = 'border-gold' }) {
  return <div className={`border-l-4 ${accent} bg-white p-4`}>{children}</div>
}

export function Tag({ children }) {
  return <span className="rounded bg-ice px-2 py-0.5 text-xs text-navy-soft">{children}</span>
}

export function Chips({ options, value = [], onChange }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button type="button" key={o} onClick={() => toggle(o)} aria-pressed={value.includes(o)}
          className={`rounded-full border px-3 py-1 text-xs ${value.includes(o) ? 'border-navy bg-navy text-white' : 'border-ice-deep bg-white hover:border-navy'}`}>
          {o}
        </button>
      ))}
    </div>
  )
}
