import { cookies } from 'next/headers'
import { verifySession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Header } from '@/components/Header'

export const dynamic = 'force-dynamic'

export default async function MyReportsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value

  if (!token) {
    redirect('/')
  }

  const payload = await verifySession(token)

  if (!payload || !payload.userId) {
    redirect('/')
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      reports: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!user) {
    redirect('/')
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#FBFBFA]">
      <Header />
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 md:px-12 py-12 md:py-24">
        <h1 className="font-serif text-3xl font-bold text-[#1a1108] mb-8">My Reports</h1>

        {user.reports.length === 0 ? (
          <p className="text-[#5c4a36]">You don&apos;t have any reports yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {user.reports.map((report) => (
              <a
                key={report.id}
                href={`/results?report_id=${report.id}`}
                className="block p-6 bg-white border border-[#e5dccd] rounded-xl hover:border-[#b87333] transition-colors shadow-sm"
              >
                <div className="text-sm text-[#9c8a76] mb-2">
                  {new Date(report.createdAt).toLocaleDateString()}
                </div>
                <div className="font-serif text-xl font-medium text-[#1a1108]">
                  Report {report.id.slice(0, 8)}
                </div>
                <div className="mt-4 text-[#FF4F00] text-sm font-medium">View Report &rarr;</div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
