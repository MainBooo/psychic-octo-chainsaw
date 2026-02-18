import * as dotenv from 'dotenv'

// Загружаем .env файл
dotenv.config()

export interface AppConfig {
	// Telegram
	telegramBotToken: string
	telegramChatId: string

	// Alor
	alorRefreshToken: string
	alorClientId: string
	alorPortfolio: string

	// Application
	nodeEnv: string
	port: number
	logLevel: string

	// Features
	mockMode: boolean

	// API Settings
	moexApiTimeout: number
	alorApiTimeout: number
	apiRateLimitMax: number
	apiRateLimitWindowMs: number

	// Cron
	trackOrdersCron: string
	updateHistoryCron: string
}

class ConfigService {
	private static instance: ConfigService
	private config: AppConfig

	private constructor() {
		this.config = this.loadConfig()
		this.validateConfig()
	}

	public static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService()
		}
		return ConfigService.instance
	}

	private loadConfig(): AppConfig {
		return {
			// Telegram
			telegramBotToken: process.env.TG_BOT_TOKEN || '',
			telegramChatId: process.env.TG_CHAT_ID || '',

			// Alor
			alorRefreshToken: process.env.ALOR_REFRESH_TOKEN || '',
			alorClientId: process.env.ALOR_CLIENT || '',
			alorPortfolio: process.env.ALOR_PORTFOLIO || '',

			// Application
			nodeEnv: process.env.NODE_ENV || 'development',
			port: parseInt(process.env.PORT || '3000', 10),
			logLevel: process.env.LOG_LEVEL || 'info',

			// Features
			mockMode: process.env.MOCK_MODE === 'true',

			// API Settings
			moexApiTimeout: parseInt(process.env.MOEX_API_TIMEOUT || '10000', 10),
			alorApiTimeout: parseInt(process.env.ALOR_API_TIMEOUT || '15000', 10),
			apiRateLimitMax: parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10),
			apiRateLimitWindowMs: parseInt(
				process.env.API_RATE_LIMIT_WINDOW_MS || '60000',
				10,
			),

			// Cron
			trackOrdersCron: process.env.TRACK_ORDERS_CRON || '*/1 * * * *',
			updateHistoryCron: process.env.UPDATE_HISTORY_CRON || '0 */15 * * * *',
		}
	}

	private validateConfig(): void {
		const required = [
			'telegramBotToken',
			'telegramChatId',
			'alorRefreshToken',
			'alorClientId',
			'alorPortfolio',
		]

		const missing = required.filter(
			key => !this.config[key as keyof AppConfig],
		)

		if (missing.length > 0 && !this.config.mockMode) {
			throw new Error(
				`Missing required environment variables: ${missing.join(', ')}. ` +
					`Please check your .env file or set MOCK_MODE=true for testing.`,
			)
		}
	}

	public get(): AppConfig {
		return this.config
	}

	public isProduction(): boolean {
		return this.config.nodeEnv === 'production'
	}

	public isDevelopment(): boolean {
		return this.config.nodeEnv === 'development'
	}
}

export const configService = ConfigService.getInstance()
export const config = configService.get()
