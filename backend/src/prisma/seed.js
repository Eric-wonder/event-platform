require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库...');

  // 创建管理员
  const adminHash = await bcrypt.hash(process.env.ADMIN_INIT_PASSWORD || 'Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });
  console.log('管理员已创建:', admin.email);

  // 创建测试组织者
  const orgHash = await bcrypt.hash('Organizer@123', 12);
  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@example.com' },
    update: {},
    create: {
      username: 'organizer',
      email: 'organizer@example.com',
      passwordHash: orgHash,
      role: 'ORGANIZER',
    },
  });
  console.log('组织者已创建:', organizer.email);

  // 创建测试用户
  const userHash = await bcrypt.hash('User@123456', 12);
  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      username: 'testuser',
      email: 'user@example.com',
      passwordHash: userHash,
      role: 'USER',
    },
  });
  console.log('测试用户已创建:', user.email);

  // 创建示例活动
  const activity = await prisma.activity.upsert({
    where: { id: 1 },
    update: {},
    create: {
      title: '2026 城市马拉松赛',
      description: '一年一度的城市马拉松，诚邀各位运动爱好者参与！',
      category: '体育竞技',
      status: 'PUBLISHED',
      maxCapacity: 500,
      currentCount: 0,
      fee: 99,
      location: '北京市朝阳区奥体中心',
      startTime: new Date('2026-05-01T07:00:00+08:00'),
      endTime: new Date('2026-05-01T14:00:00+08:00'),
      regDeadline: new Date('2026-04-25T23:59:59+08:00'),
      organizerId: organizer.id,
      formFields: {
        create: [
          { label: '紧急联系人', fieldType: 'TEXT', required: true, sortOrder: 0 },
          { label: '紧急联系人电话', fieldType: 'TEXT', required: true, sortOrder: 1 },
          { label: '服装尺码', fieldType: 'SELECT', required: true, options: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', 'XXL']), sortOrder: 2 },
          { label: '有无既往病史', fieldType: 'CHECKBOX', required: false, options: JSON.stringify(['心脏病', '高血压', '糖尿病', '无']), sortOrder: 3 },
        ],
      },
    },
  });
  console.log('示例活动已创建:', activity.title);

  console.log('\n初始化完成！测试账号：');
  console.log('管理员: admin@example.com / Admin@123456');
  console.log('组织者: organizer@example.com / Organizer@123');
  console.log('普通用户: user@example.com / User@123456');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
