# Multi-stage build для оптимизации размера образа
FROM node:20-alpine AS builder

# Установка зависимостей для сборки
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production && \
    npm cache clean --force

# Копируем исходный код
COPY tsconfig.json ./
COPY src/ ./src/

# Собираем приложение
RUN npm run build

# Production образ
FROM node:20-alpine

# Создаем пользователя для запуска приложения
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Копируем node_modules из builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Копируем собранное приложение
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Создаем директории для данных
RUN mkdir -p data/history data/orders data/donchian_highs data/donchian_lows data/history_highs data/history_lows sim-history && \
    chown -R nodejs:nodejs data sim-history

# Переключаемся на непривилегированного пользователя
USER nodejs

# Открываем порт для health check endpoint
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запуск приложения
CMD ["node", "dist/bot/main.js"]
