import axios from 'axios'
import fs from 'fs'
import path from 'path'

/**
 * =========================================================
 * КОНФИГУРАЦИЯ
 * =========================================================
 */

const DATA_DIR = path.resolve(process.cwd(), 'data', 'history')
const BOARD = 'TQBR'
const TF = 900 // 15 минут в секундах

/**
 * =========================================================
 * AXIOS CLIENT
 * =========================================================
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

function ensureDir(filePath: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function loadExistingHistory(filePath: string): any[] {
	if (!fs.existsSync(filePath)) return []

	try {
		const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
		// НЕ УМНОЖАЕМ НА 1000 - время уже в секундах в файле
		return Array.isArray(raw) ? raw : []
	} catch {
		console.warn(`⚠️ Не удалось прочитать историю: ${filePath}`)
		return []
	}
}

/**
 * =========================================================
 * API
 * =========================================================
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
			from: params.from,
			to: params.to,
		},
		validateStatus: s => s === 200,
	})
}

/**
 * =========================================================
 * MAIN
 * =========================================================
 *
 * Инкрементально догружает историю свечей
 */
export async function updateTickerIncremental(ticker: string) {
	const filePath = path.resolve(DATA_DIR, `${ticker}_history.json`)
	ensureDir(filePath)

	const existing = loadExistingHistory(filePath)

	if (existing.length === 0) {
		console.warn(`⚠️ ${ticker} → истории нет, используй обычный updateTicker`)
		return null
	}

	// предполагаем стандартное поле времени Alor — time (unix seconds)
	const lastCandle = existing[existing.length - 1]
	const lastTime = lastCandle?.time // время в секундах

	console.log({
		lastSaved: lastTime,
		lastSavedHuman: new Date(lastTime * 1000).toISOString(), // умножаем на 1000 только для отображения
		now: Date.now(),
		nowHuman: new Date().toISOString(),
	})

	if (!Number.isFinite(lastTime)) {
		console.warn(`⚠️ ${ticker} → не удалось определить последнюю свечу`)
		return null
	}

	// from и to должны быть в секундах для API
	const from = lastTime + TF
	const to = Math.floor(Date.now() / 1000)

	console.log({
		from,
		fromHuman: new Date(from * 1000).toISOString(),
		to,
		toHuman: new Date(to * 1000).toISOString(),
		diff: to - from,
	})

	if (from >= to) {
		console.log(`ℹ️ ${ticker} → история уже актуальна`)
		return null
	}

	try {
		const res = await fetchHistory({
			symbol: ticker,
			board: BOARD,
			from,
			to,
		})

		const candles = Array.isArray(res.data?.history)
			? res.data.history
			: (res.data?.history?.data ?? res.data?.history?.candles ?? [])

		if (!Array.isArray(candles) || candles.length === 0) {
			console.log(`ℹ️ ${ticker} → новых свечей нет`)
			return null
		}

		/**
		 * 🔒 Объединение без дублей по time
		 */
		const map = new Map<number, any>()

		for (const c of existing) {
			if (Number.isFinite(c?.time)) {
				map.set(c.time, c)
			}
		}

		for (const c of candles) {
			if (Number.isFinite(c?.time)) {
				map.set(c.time, c)
			}
		}

		const merged = Array.from(map.values()).sort((a, b) => a.time - b.time)

		fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))

		console.log(
			`✅ ${ticker} → догружено ${candles.length} свечей (всего ${merged.length})`,
		)

		return { ticker, added: candles.length }
	} catch (e: any) {
		console.error(`❌ Ошибка Alor incremental (${ticker}):`, e.message)
		return null
	}
}
