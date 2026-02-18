import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { AlorAuthService } from './alor-auth.service.js'

type OrderSide = 'buy' | 'sell'
type Exchange = 'MOEX' | 'SPBX'

@Injectable()
export class AlorService {
	private readonly logger = new Logger(AlorService.name)

	private readonly api: AxiosInstance = axios.create({
		baseURL: 'https://api.alor.ru',
		headers: {
			'Content-Type': 'application/json',
		},
	})

	constructor(private readonly auth: AlorAuthService) {}

	/**
	 * Получить последнюю цену по инструменту
	 */
	async getLastPrice(symbol: string): Promise<number> {
		try {
			const res = await axios.get('https://api.alor.ru/md/v2/quotes', {
				params: { symbols: symbol },
				headers: await this.authHeaders(),
			})

			const quote = res.data?.[0]

			if (!quote || !quote.last_price) {
				throw new Error(`No quote for ${symbol}`)
			}

			return Number(quote.last_price)
		} catch (e: any) {
			this.logger.error(`❌ ALOR QUOTE ERROR ${symbol}`)
			this.logger.error(e.response?.data || e.message)
			throw e
		}
	}

	/**
	 * Пакетное получение цен (для симулятора)
	 */
	async getLastPrices(symbols: string[]): Promise<Record<string, number>> {
		const out: Record<string, number> = {}

		for (const s of symbols) {
			try {
				out[s] = await this.getLastPrice(s)
			} catch {
				// пропускаем, чтобы не валить весь цикл
			}
		}

		return out
	}

	// ==========================================================
	// INTERNAL HELPERS
	// ==========================================================

	private async authHeaders() {
		const token = await this.auth.getAccessToken()
		return {
			Authorization: `Bearer ${token}`,
		}
	}

	private resolveExchange(board: string): Exchange {
		const moexBoards = [
			'TQBR', // акции
			'TQTF', // ETF
			'TQOB', // облигации
			'SMAL', // 🚨 Small Cap
			'FQBR', // иностранные акции на MOEX
		]
		const spbxBoards = ['SPBXM', 'SPBXD']

		if (moexBoards.includes(board)) return 'MOEX'
		if (spbxBoards.includes(board)) return 'SPBX'

		throw new Error(`Unsupported instrumentGroup "${board}"`)
	}

	// ==========================================================
	// PUBLIC API
	// ==========================================================

	/**
	 * PLACE LIMIT ORDER
	 *
	 * Полное соответствие:
	 * POST /commandapi/warptrans/TRADE/v2/client/orders/actions/limit
	 */
	async placeLimitOrder(order: {
		symbol: string
		board: string
		side: OrderSide
		price: number
		quantity: number // ❗ В ЛОТАХ
		timeInForce?: 'oneday' | 'gtc' | 'ioc' | 'fok'

		comment?: string
	}) {
		const requestId = uuidv4()
		this.logger.log(`📤 ALOR LIMIT ORDER [${requestId}]`)

		const exchange = this.resolveExchange(order.board)

		const body = {
			side: order.side,
			quantity: order.quantity,
			price: order.price,

			instrument: {
				symbol: order.symbol,
				exchange,
				instrumentGroup: order.board,
			},

			user: {
				portfolio: process.env.ALOR_PORTFOLIO,
			},

			timeInForce: order.timeInForce ?? 'oneday',
			comment: requestId,
		}

		this.logger.log(`📤 ALOR LIMIT ORDER [${requestId}]`)
		this.logger.log(JSON.stringify(body, null, 2))

		try {
			const res = await this.api.post(
				'/commandapi/warptrans/TRADE/v2/client/orders/actions/limit',
				body,
				{
					headers: {
						...(await this.authHeaders()),
						'X-REQID': requestId,
					},
				},
			)

			this.logger.log(
				`✅ ALOR LIMIT ORDER OK [${requestId}] ${JSON.stringify(res.data)}`,
			)

			return res.data
		} catch (e: any) {
			this.logger.error(`❌ ALOR LIMIT ORDER ERROR [${requestId}]`)
			this.logger.error('STATUS:', e.response?.status)
			this.logger.error('DATA:', JSON.stringify(e.response?.data))
			throw e
		}
	}

	/**
	 * STOP / TAKE-PROFIT ORDER
	 */
	async placeStopOrder(order: {
		symbol: string
		board: string
		side: OrderSide
		triggerPrice: number
		quantity: number
		condition: string
		endUnixTime?: number
	}) {
		const requestId = uuidv4()
		const exchange = this.resolveExchange(order.board)
		this.logger.log(`📤 ALOR LIMIT ORDER [${requestId}]`)

		const body = {
			side: order.side,
			quantity: order.quantity,
			condition: order.condition,
			triggerPrice: order.triggerPrice,
			stopEndUnixTime: order.endUnixTime,
			activate: true,

			instrument: {
				symbol: order.symbol,
				exchange,
				instrumentGroup: order.board,
			},

			user: {
				portfolio: process.env.ALOR_PORTFOLIO,
			},
			comment: requestId,
		}

		this.logger.log(`📤 ALOR STOP ORDER [${requestId}]`)
		this.logger.log(JSON.stringify(body, null, 2))

		try {
			const res = await this.api.post(
				'/commandapi/warptrans/TRADE/v2/client/orders/actions/stop',
				body,
				{
					headers: {
						...(await this.authHeaders()),
						'X-REQID': requestId,
					},
				},
			)
			console.log(body)

			this.logger.log(
				`✅ ALOR STOP ORDER OK [${requestId}] ${JSON.stringify(res.data)}`,
			)

			return res.data
		} catch (e: any) {
			this.logger.error(`❌ ALOR STOP ORDER ERROR [${requestId}]`)
			this.logger.error('STATUS:', e.response?.status)
			this.logger.error('DATA:', JSON.stringify(e.response?.data))
			throw e
		}
	}

	/**
	 * Instruments lookup (md/v2)
	 */
	async getInstrumentBySymbol(symbol: string): Promise<{
		symbol: string
		exchange: Exchange
		instrumentGroup: string
	}> {
		const res = await axios.get('https://api.alor.ru/md/v2/Securities/search', {
			params: { query: symbol },
		})

		const item = res.data?.find((i: any) => i.symbol === symbol)

		if (!item) {
			throw new Error(`Instrument ${symbol} not found in ALOR`)
		}

		return {
			symbol: item.symbol,
			exchange: item.exchange,
			instrumentGroup: item.instrumentGroup,
		}
	}
}
