const fs = require('fs');
const path = require('path');

// Функция для загрузки .env файла
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const envVars = {};
  
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          envVars[key] = value;
        }
      }
    });
  }
  
  return envVars;
}

const envVars = loadEnv();

module.exports = {
  apps: [
    // Приложение 1: Telegram Bot
    {
      name: 'moex-bot',
      script: './dist/bot/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      cwd: '/opt/alphaflow/deploy-ready',
      env: {
        ...envVars,
        NODE_ENV: 'production',
        TZ: 'Europe/Moscow'
      },
      error_file: './logs/pm2-bot-error.log',
      out_file: './logs/pm2-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true
    },
    
    // Приложение 2: Main Application
    {
      name: 'moex-app',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      cwd: '/opt/alphaflow/deploy-ready',
      env: {
        ...envVars,
        NODE_ENV: 'production',
        TZ: 'Europe/Moscow'
      },
      error_file: './logs/pm2-app-error.log',
      out_file: './logs/pm2-app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true
    }
  ]
};