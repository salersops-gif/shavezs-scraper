import { PrismaClient } from '../src/generated/prisma/index.js'

const prisma = new PrismaClient()

async function main() {
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  console.log(JSON.stringify(leads, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
