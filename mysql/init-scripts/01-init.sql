-- ═══════════════════════════════════════════════════════
-- MySQL 初始化脚本
-- 首次创建容器时自动执行（通过 docker-entrypoint-initdb.d）
-- 注意：环境变量 MYSQL_DATABASE=event_platform 由 docker-compose 创建
--       此处仅做精细化授权和额外配置
-- ═══════════════════════════════════════════════════════

-- ─── 设置时区 ────────────────────────────────────────
SET GLOBAL time_zone = '+08:00';
SET time_zone = '+08:00';
SET @@session.time_zone = '+08:00';

-- ─── 性能优化参数（session 级覆盖）───────────────────
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET collation_connection = 'utf8mb4_unicode_ci';

-- ─── 为应用创建专用账号（不要用 root 连接后端）─────────
-- 密码通过环境变量传入，这里用占位符
CREATE USER IF NOT EXISTS 'eventapp'@'%' IDENTIFIED BY 'eventapp_password_placeholder';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON event_platform.* TO 'eventapp'@'%';

-- ─── 创建只读监控账号（可选，供 Prometheus 等监控工具使用）──
CREATE USER IF NOT EXISTS 'eventmon'@'localhost' IDENTIFIED BY 'read_only_monitor';
GRANT SELECT ON event_platform.* TO 'eventmon'@'localhost';

-- ─── 刷新权限 ─────────────────────────────────────────
FLUSH PRIVILEGES;

-- ─── 打印完成信息 ─────────────────────────────────────
SELECT 'MySQL 初始化完成：event_platform 数据库已就绪' AS '✅ Init Status';
