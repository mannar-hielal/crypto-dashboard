import { PrismaClient } from './apps/server/generated/prisma/index.js';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { email: true, username: true } });
  console.log(JSON.stringify(users, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
