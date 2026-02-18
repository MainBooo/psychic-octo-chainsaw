import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import logger from '../utils/logger.js'

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
	private isShuttingDown = false

	async onApplicationShutdown(signal?: string) {
		if (this.isShuttingDown) {
			return
		}

		this.isShuttingDown = true
		logger.info(`Received shutdown signal: ${signal}`)

		try {
			// Даём время завершить текущие операции
			logger.info('Finishing current operations...')
			await this.gracefulShutdown()

			logger.info('Application shutdown completed successfully')
			process.exit(0)
		} catch (error) {
			logger.error('Error during shutdown:', error)
			process.exit(1)
		}
	}

	private async gracefulShutdown(): Promise<void> {
		// Ждём завершения текущих операций (максимум 10 секунд)
		await new Promise(resolve => setTimeout(resolve, 2000))

		// Здесь можно добавить дополнительную логику:
		// - закрытие соединений с БД
		// - сохранение состояния
		// - отмена активных задач
	}

	public setupSignalHandlers(app: any): void {
		// Обработка различных сигналов завершения
		const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2']

		signals.forEach(signal => {
			process.on(signal, async () => {
				logger.info(`Received ${signal}, starting graceful shutdown...`)
				await app.close()
			})
		})

		// Обработка необработанных ошибок
		process.on('uncaughtException', error => {
			logger.error('Uncaught Exception:', error)
			process.exit(1)
		})

		process.on('unhandledRejection', (reason, promise) => {
			logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
			process.exit(1)
		})
	}
}
