const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth.middleware');
const { success, fail, catchAsync } = require('../utils/response');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient();

// 共享 volume 路径（挂载到 node-app 和 nginx 同一 host 目录）
const SHARED_DIR = '/opt/custom-domain';
const DOMAIN_FILE = path.join(SHARED_DIR, 'domain.txt');
const DOMAIN_STATE_FILE = path.join(SHARED_DIR, 'domain-state.txt');
const NGINX_CONF_FILE = '/opt/custom-domain/custom-domain.conf';

const OLD_DOMAIN_FILE = path.join(SHARED_DIR, 'domain.txt'); // 兼容旧路径

// ─── 获取网站设置 ─────────────────────────────────────────
router.get('/', catchAsync(async (req, res) => {
  const settings = await prisma.siteSetting.findMany({
    orderBy: { key: 'asc' },
  });
  // 转换为 key-value 对象
  const result = {};
  for (const s of settings) result[s.key] = s.value;
  res.json(success(result));
}));

// ─── 保存网站设置 ─────────────────────────────────────────
router.put('/', catchAsync(async (req, res) => {
  const { siteName, siteLogo, siteDescription, icpNumber, contactEmail, contactPhone, customDomain } = req.body;
  
  const fields = { siteName, siteLogo, siteDescription, icpNumber, contactEmail, contactPhone, customDomain };
  
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      await prisma.siteSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  }
  
  // 同步域名到共享文件（nginx 容器会感知并重载）
  await syncDomainToFile(customDomain || '');
  
  res.json(success(null, '网站设置已保存'));
}));

// ─── 同步域名到共享文件 ────────────────────────────────────
async function syncDomainToFile(domain) {
  try {
    // 确保目录存在
    if (!fs.existsSync(SHARED_DIR)) fs.mkdirSync(SHARED_DIR, { recursive: true });
    
    const trimmed = domain.trim();
    
    // 写入当前域名（nginx 用 inotify 或 polling 检测）
    fs.writeFileSync(DOMAIN_FILE, trimmed, 'utf8');
    
    // 对比旧域名，变化时重写 nginx 配置
    const oldDomain = fs.existsSync(DOMAIN_STATE_FILE)
      ? fs.readFileSync(DOMAIN_STATE_FILE, 'utf8').trim()
      : '';
    
    if (trimmed !== oldDomain) {
      fs.writeFileSync(DOMAIN_STATE_FILE, trimmed, 'utf8');
      writeNginxConf(trimmed);
    }
  } catch (err) {
    console.error('[Domain] sync failed:', err.message);
  }
}

// ─── 生成 nginx 配置片段 ──────────────────────────────────
function writeNginxConf(domain) {
  // 写入 nginx 可读的 include 文件（通过 volume 共享）
  const includeFile = '/opt/custom-domain/domain.conf';
  
  if (!domain) {
    // 清空域名 → 不加载任何自定义 server 块
    try { fs.unlinkSync(includeFile); } catch {}
    return;
  }
  
  // 自定义域名 server 块（HTTP only — SSL 证书需用户自行配置）
  const conf = `# 自定义域名配置 — 由网站设置自动生成，请勿手动修改
# 域名: ${domain}

server {
    listen 80;
    server_name ${domain};

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none';" always;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files \\$uri \\$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://node-app:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_read_timeout 60s;
        proxy_hide_header Content-Security-Policy;
    }

    location ^~ /uploads/ {
        proxy_pass http://node-app:3000/uploads/;
        proxy_set_header Host \\$host;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`;
  fs.writeFileSync(includeFile, conf, 'utf8');
}

module.exports = router;
