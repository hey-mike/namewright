'use client'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-3)' }}>Something went wrong</p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-4)', maxWidth: '40ch' }}>
        {error.message ?? 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 1.25rem',
          fontSize: '0.875rem',
          background: 'var(--color-accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
