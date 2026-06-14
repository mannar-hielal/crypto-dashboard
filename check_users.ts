import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      account: true,
    },
  });

  /* eslint-disable no-console */
  console.log(`Found ${users.length} users:`);
  for (const user of users) {
    console.log(
      `- ${user.username} (${user.email}): ${user.account ? user.account.totalBalance : 'No account'}`
    );
  }
  /* eslint-enable no-console */
}
main()
  .catch((err) => {
    /* eslint-disable no-console */
    console.error(err);
    /* eslint-enable no-console */
  })
  .finally(() => prisma.$disconnect());
