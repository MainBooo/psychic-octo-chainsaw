import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'
import { AppModule } from './app.module.js'
import { config, configService } from '../config/config.service.js'
import logger from '../utils/logger.js'
import { ShutdownService } from '../utils/shutdown.service.js'
import { HealthController, HealthService } from '../health/health.controller.js'

// Глобальная обработка необработанных Promise rejection
process.on('unhandledRejection', (error: any) => {
  console.error('🚨 Unhandled Promise Rejection:', error);
  // НЕ падать, просто логировать
});

// Глобальная обработка необработанных исключений
process.on('uncaughtException', (error: any) => {
  console.error('🚨 Uncaught Exception:', error);
  // НЕ падать, просто логировать
});

process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (error: any) => {
  console.error('🚨 Unhandled Rejection (non-fatal):', error?.message || error);
});

async function bootstrap() {
	try {
		logger.info('🚀 Starting MOEX Trading Bot...')
		logger.info(`Environment: ${config.nodeEnv}`)
		logger.info(`Mock Mode: ${config.mockMode}`)

		// Создаём application context для бота
		const app = await NestFactory.create(AppModule, {
			logger: configService.isDevelopment()
				? ['log', 'error', 'warn', 'debug', 'verbose']
				: ['error', 'warn', 'log'],
		})

		// Включаем CORS если нужно
		app.enableCors()

		// Регистрируем health check
		const healthService = app.get(HealthService)
		const healthController = new HealthController(healthService)

		// Настраиваем graceful shutdown
		const shutdownService = app.get(ShutdownService)
		shutdownService.setupSignalHandlers(app)

		// Запускаем HTTP сервер для health checks
		await app.listen(config.port)

		logger.info(`✅ Bot started successfully`)
		logger.info(`📊 Health check available at http://localhost:${config.port}/health`)
		logger.info(`🤖 Telegram bot is running in background mode`)

		// Выводим информацию о конфигурации
		if (config.mockMode) {
			logger.warn('⚠️  MOCK MODE is enabled - using test data instead of real APIs')
		}

		// Логируем успешный старт
		logger.info('🎉 Application is ready to handle requests')
	} catch (error) {
		logger.error('💥 Fatal error during bootstrap:', error)
		process.exit(1)
	}
}

// Запускаем приложение
bootstrap().catch(error => {
	logger.error('Unhandled error during bootstrap:', error)
	process.exit(1)
})
