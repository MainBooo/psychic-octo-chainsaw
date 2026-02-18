import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

/**
 * AlorAuthService
 *
 * Отвечает ТОЛЬКО за:
 *  - получение access token
 *  - автоматическое обновление
 *  - хранение токена в памяти
 *
 * ❌ НЕ знает:
 *  - ничего про ордера
 *  - ничего про стратегии
 *  - ничего про инструменты
 */
@Injectable()
export class AlorAuthService {
	private readonly logger = new Logger(AlorAuthService.name)

	private accessToken: string | null = null
	private expiresAt = 0
	private refreshInProgress: Promise<string> | null = null

	/**
	 * Возвращает валидный access token
	 * - гарантирует одиночный refresh
	 * - защищён от race condition
	 */
	async getAccessToken(): Promise<string> {
		if (!process.env.ALOR_REFRESH_TOKEN) {
			throw new Error('ALOR_REFRESH_TOKEN is missing')
		}

		if (this.accessToken && Date.now() < this.expiresAt) {
			return this.accessToken
		}

		this.logger.log('🔑 Refreshing ALOR access token')

		const res = await axios.post('https://oauth.alor.ru/refresh', {
			token: process.env.ALOR_REFRESH_TOKEN,
		})

		this.accessToken = res.data.AccessToken
		this.expiresAt = Date.now() + res.data.ExpiresIn * 1000 - 10_000

		return this.accessToken!
	}

	// ==========================================================
	// INTERNAL
	// ==========================================================

	private async refreshToken(): Promise<string> {
		this.logger.log('🔑 Refreshing ALOR access token')

		if (!process.env.ALOR_REFRESH_TOKEN) {
			throw new Error('ALOR_REFRESH_TOKEN is missing')
		}

		try {
			const res = await axios.post('https://oauth.alor.ru/refresh', {
				token: process.env.ALOR_REFRESH_TOKEN,
			})

			/**
			 * ALOR response:
			 * {
			 *   AccessToken: string
			 *   ExpiresIn: number (seconds)
			 * }
			 */
			this.accessToken = res.data.AccessToken
			this.expiresAt = Date.now() + res.data.ExpiresIn * 1000 - 15_000 // safety margin

			this.logger.log(`✅ ALOR token refreshed (valid ${res.data.ExpiresIn}s)`)

			return this.accessToken!
		} catch (e: any) {
			this.logger.error('❌ Failed to refresh ALOR token')
			this.logger.error('STATUS:', e.response?.status)
			this.logger.error('DATA:', JSON.stringify(e.response?.data))
			throw e
		}
	}
}
