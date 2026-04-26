import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
