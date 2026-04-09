const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // 创建管理员账户
  const hashedPassword = await bcrypt.hash('Admin@123456', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { password: hashedPassword },
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: '管理员',
      role: 'ADMIN',
    },
  });
  
  console.log('管理员账户已创建/更新:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
