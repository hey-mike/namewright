'use client'

const AFFILIATE_LINKS = [
  {
    label: 'Check domains on Namecheap',
    url: 'https://www.namecheap.com/',
    note: 'domain registration',
  },
  {
    label: 'File a trademark via Trademark Engine',
    url: 'https://www.trademarkengine.com/',
    note: 'trademark filing',
  },
  {
    label: 'Incorporate with Stripe Atlas',
    url: 'https://stripe.com/atlas',
    note: 'company formation',
  },
]

export function AffiliateLinks() {
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {AFFILIATE_LINKS.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block p-4 rounded"
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            transition: 'border-color 0.12s',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--color-accent)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--color-border)')
          }
        >
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-1)' }}>
            {item.label}
          </p>
          <p className="mono text-[10px] uppercase ink-softer">{item.note}</p>
        </a>
      ))}
    </div>
  )
}
