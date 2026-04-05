/**
 * 定时任务服务
 * 使用 node-schedule
 * 全局导出 emailCron 对象，支持热重载时取消旧任务
 */
const schedule = require('node-schedule');
const { PrismaClient } = require('@prisma/client');
const { sendDailySummary } = require('./email.service');

const prisma = new PrismaClient();

// ─── 全局 cron 对象 ────────────────────────────────────────
global.emailCron = null;

/**
 * 启动每日邮件汇总定时任务
 * @param {string} timeStr - 每天执行时间，格式 HH:mm，默认为 "09:00"
 * @returns {schedule.Job}
 */
function startEmailCron(timeStr = '09:00') {
  // 取消旧的
  if (global.emailCron) {
    global.emailCron.cancel();
    console.log('[Cron] 已取消旧的每日邮件任务');
  }

  // 解析时间
  const [hour, minute] = timeStr.split(':').map(Number);
  // node-schedule cron 格式：秒 分 时 日 月 周
  const rule = new schedule.RecurrenceRule();
  rule.hour = hour;
  rule.minute = minute;
  rule.tz = 'Asia/Shanghai';

  const job = schedule.scheduleJob(rule, async () => {
    console.log(`[Cron] ${new Date().toLocaleString('zh-CN')} — 开始执行每日邮件汇总`);
    try {
      await sendDailySummary();
      // 记录日志
      await prisma.emailLog.create({
        data: {
          type: 'DAILY_SUMMARY',
          subject: `每日汇总 ${new Date().toLocaleDateString('zh-CN')}`,
          toEmails: JSON.stringify([]), // 已在 sendDailySummary 中使用 settings
          status: 'SENT',
          sentAt: new Date(),
          remark: '系统自动发送',
        },
      });
    } catch (err) {
      console.error('[Cron] 每日邮件汇总失败:', err.message);
      try {
        await prisma.emailLog.create({
          data: {
            type: 'DAILY_SUMMARY',
            subject: `每日汇总 ${new Date().toLocaleDateString('zh-CN')}`,
            toEmails: '[]',
            status: 'FAILED',
            remark: `错误：${err.message}`,
          },
        });
      } catch {}
    }
  });

  global.emailCron = job;
  console.log(`[Cron] 每日邮件任务已启动，执行时间：每天 ${timeStr}（Asia/Shanghai）`);
  return job;
}

/**
 * 取消所有定时任务
 */
function stopAllCron() {
  if (global.emailCron) {
    global.emailCron.cancel();
    global.emailCron = null;
    console.log('[Cron] 所有定时任务已停止');
  }
  schedule.cancelAllJobs();
}

module.exports = { startEmailCron, stopAllCron };
