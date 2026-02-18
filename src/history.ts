import axios from 'axios'
import fs from 'fs'
import path from 'path'

/**
 * =========================================================
 * КОНФИГУРАЦИЯ
 * =========================================================
 */

// Папка для сохранения истории
const DATA_DIR = path.resolve(process.cwd(), 'data', 'history')

// Торговая доска MOEX (для ABIO — TQBR)
const BOARD = 'TQBR'

// Таймфрейм в секундах (900 = 15 минут)
const TF = 900

// Максимальная глубина intraday истории (эмпирически ~30 дней)
const MAX_DAYS = 30

/**
 * =========================================================
 * AXIOS CLIENT
 * =========================================================
 *
 * Минимальная и стабильная конфигурация под Alor API
 */
const api = axios.create({
	timeout: 15000,
	headers: {
		'Accept-Encoding': 'identity',
		'User-Agent': 'alor-stable-client',
	},
})

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

/**
 * Создаёт директорию под файл, если она не существует
 */
function ensureDir(filePath: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

/**
 * =========================================================
 * API
 * =========================================================
 *
 * Единственная функция обращения к Alor API
 * Никаких чанков, миллисекунд и циклов
 */
async function fetchHistory(params: {
	symbol: string
	board: string
	from: number
	to: number
}) {
	return api.get('https://api.alor.ru/md/v2/history', {
		params: {
			exchange: 'MOEX',
			symbol: params.symbol,
			board: params.board,
			tf: TF,
			from: params.from, // UNIX seconds
			to: params.to, // UNIX seconds
		},
		validateStatus: s => s === 200,
	})
}

/**
 * =========================================================
 * MAIN
 * =========================================================
 *
 * Загружает и сохраняет историю свечей в файл:
 *
 * data/history/${ticker}_history.json
 */
export async function updateTicker(ticker: string) {
	// ⚠️ Alor принимает время ТОЛЬКО в секундах
	const to = Math.floor(Date.now() / 1000)
	const from = to - MAX_DAYS * 86400

	try {
		const res = await fetchHistory({
			symbol: ticker,
			board: BOARD,
			from,
			to,
		})

		/**
		 * Нормализация формата ответа Alor
		 *
		 * Возможные варианты:
		 * - history: Candle[]
		 * - history: { data: Candle[] }
		 * - history: { candles: Candle[] }
		 */
		const candles = Array.isArray(res.data?.history)
			? res.data.history
			: (res.data?.history?.data ?? res.data?.history?.candles ?? [])

		if (!Array.isArray(candles) || candles.length === 0) {
			console.error(`❌ ${ticker} → пустая история (${BOARD})`)
			return null
		}

		const filePath = path.resolve(DATA_DIR, `${ticker}_history.json`)
		ensureDir(filePath)

		fs.writeFileSync(filePath, JSON.stringify(candles, null, 2))

		console.log(`✅ ${ticker} → сохранено ${candles.length} свечей`)
		return { ticker, board: BOARD }
	} catch (e: any) {
		console.error(`❌ Ошибка Alor (${ticker}):`, e.message)
		return null
	}
}
