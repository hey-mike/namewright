import { config } from 'dotenv'
config({ path: '.env.local' })
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const accounts = ['test@example.com', 'founder@namewright.co']

  for (const email of accounts) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
      },
    })
    console.log(`Seeded user: ${email}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
