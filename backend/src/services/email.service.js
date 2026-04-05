/**
 * 邮件服务模块
 * 使用 nodemailer + QQ SMTP
 * 敏感配置（SMTP 密码等）从环境变量读取
 * 可配置项（收件邮箱、定时任务开关）存储在 JSON 配置文件中
 */
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = path.join(__dirname, '../../config/email-settings.json');

// ─── 配置读写 ─────────────────────────────────────────────
function loadSettings() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return { toEmails: [], cronEnabled: false };
}

function saveSettings(data) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── 邮件传输器 ─────────────────────────────────────────────
function createTransport() {
  const host = process.env.SMTP_HOST || 'smtp.qq.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER / SMTP_PASS 环境变量未配置');
  }

  return nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });
}

// ─── 发送邮件 ─────────────────────────────────────────────
async function sendEmail({ to, subject, html, cc, attachments }) {
  const transporter = createTransport();
  const result = await transporter.sendMail({
    from: `"活动平台" <${process.env.SMTP_USER}>`,
    to,
    cc: cc || [],
    subject,
    html,
    attachments: attachments || [],
  });
  return result;
}

// ─── 发送报名汇总邮件（每日定时任务调用）────────────────────
async function sendDailySummary() {
  const settings = loadSettings();
  if (!settings.cronEnabled) {
    console.log('[Email] 定时任务已关闭，跳过');
    return;
  }
  if (!settings.toEmails || settings.toEmails.length === 0) {
    console.log('[Email] 未配置收件邮箱，跳过');
    return;
  }

  // 查询今日报名
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const projects = await prisma().registrationProject.findMany({
    include: {
      registrations: {
        where: { createdAt: { gte: start, lt: end } },
        include: { project: { select: { title: true } } },
      },
    },
  });

  const total = projects.reduce((sum, p) => sum + p.registrations.length, 0);
  if (total === 0) {
    console.log('[Email] 今日无报名，跳过');
    return;
  }

  const html = buildSummaryHtml(projects, today);
  const subject = `📊 活动平台报名汇总 — ${today.toLocaleDateString('zh-CN')}`;

  await sendEmail({ to: settings.toEmails, subject, html });
  console.log(`[Email] 每日汇总已发送至 ${settings.toEmails.join(', ')}`);
}

// ─── 发送指定项目报名汇总 ──────────────────────────────────
async function sendProjectSummary(projectId, extraEmails) {
  const settings = loadSettings();
  const allEmails = [...new Set([...(settings.toEmails || []), ...(extraEmails || [])])];
  if (allEmails.length === 0) throw new Error('未配置收件邮箱');

  const project = await prisma().registrationProject.findUnique({
    where: { id: projectId },
    include: {
      registrations: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, email: true } } },
      },
    },
  });
  if (!project) throw new Error('项目不存在');

  const html = buildProjectHtml(project);
  const subject = `📋 报名汇总 — ${project.title}`;
  const attachments = [];

  await sendEmail({ to: allEmails, subject, html, attachments });
  console.log(`[Email] 项目「${project.title}」汇总已发送至 ${allEmails.join(', ')}`);
}

// ─── HTML 模板 ─────────────────────────────────────────────
function buildSummaryHtml(projects, date) {
  let rows = '';
  let grandTotal = 0;
  for (const p of projects) {
    grandTotal += p.registrations.length;
    rows += `
      <tr>
        <td style="padding:8px;border:1px solid #ddd">${p.title}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center">${p.registrations.length}</td>
        <td style="padding:8px;border:1px solid #ddd">${p.registrations.map(r => `${r.realName}(${r.phone})`).join('<br>') || '-'}</td>
      </tr>`;
  }

  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px">
  <h2 style="color:#333">📊 活动平台报名日报</h2>
  <p style="color:#666">统计日期：${date.toLocaleDateString('zh-CN', { weekday: 'long' })} ${date.toLocaleDateString('zh-CN')}</p>
  <p>今日共 <strong>${grandTotal}</strong> 笔新报名，覆盖 <strong>${projects.length}</strong> 个项目。</p>
  ${grandTotal > 0 ? `
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead><tr style="background:#f5f5f5">
      <th style="padding:8px;border:1px solid #ddd;text-align:left">项目名称</th>
      <th style="padding:8px;border:1px solid #ddd">报名数</th>
      <th style="padding:8px;border:1px solid #ddd;text-align:left">报名人</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>` : '<p>暂无新报名。</p>'}
  <hr style="margin:24px 0">
  <p style="color:#aaa;font-size:12px">此邮件由活动平台系统自动发送 · ${new Date().toLocaleString('zh-CN')}</p>
</body></html>`;
}

function buildProjectHtml(project) {
  const regs = project.registrations;
  let rows = '';
  regs.forEach((r, i) => {
    rows += `<tr>
      <td style="padding:6px;border:1px solid #ddd;text-align:center">${i + 1}</td>
      <td style="padding:6px;border:1px solid #ddd">${r.realName}</td>
      <td style="padding:6px;border:1px solid #ddd">${r.phone}</td>
      <td style="padding:6px;border:1px solid #ddd">${r.user?.email || '-'}</td>
      <td style="padding:6px;border:1px solid #ddd">${r.channel || '-'}</td>
      <td style="padding:6px;border:1px solid #ddd">${regStatusLabel(r.status)}</td>
      <td style="padding:6px;border:1px solid #ddd">${new Date(r.createdAt).toLocaleString('zh-CN')}</td>
    </tr>`;
  });

  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px">
  <h2 style="color:#333">📋 ${project.title} — 报名明细</h2>
  <p>共 <strong>${regs.length}</strong> 人报名 · 报名费 ¥${Number(project.price)}</p>
  ${regs.length > 0 ? `
  <table style="width:100%;border-collapse:collapse;margin-top:12px">
    <thead><tr style="background:#f5f5f5">
      <th style="padding:6px;border:1px solid #ddd">#</th>
      <th style="padding:6px;border:1px solid #ddd">姓名</th>
      <th style="padding:6px;border:1px solid #ddd">手机号</th>
      <th style="padding:6px;border:1px solid #ddd">邮箱</th>
      <th style="padding:6px;border:1px solid #ddd">渠道</th>
      <th style="padding:6px;border:1px solid #ddd">状态</th>
      <th style="padding:6px;border:1px solid #ddd">报名时间</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>` : '<p>暂无报名。</p>'}
  <hr style="margin:24px 0">
  <p style="color:#aaa;font-size:12px">此邮件由活动平台系统自动发送 · ${new Date().toLocaleString('zh-CN')}</p>
</body></html>`;
}

function regStatusLabel(s) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝', CANCELLED: '已取消' }[s] || s;
}

// ─── Prisma 懒加载（避免循环依赖）──────────────────────────
let _prisma;
function prisma() {
  if (!_prisma) _prisma = new (require('@prisma/client')).PrismaClient();
  return _prisma;
}

module.exports = {
  loadSettings,
  saveSettings,
  sendEmail,
  sendDailySummary,
  sendProjectSummary,
};
