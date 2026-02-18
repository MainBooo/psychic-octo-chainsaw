import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

interface Level {
	time: number
	price: number
	barIndex?: number
}

interface Order {
	id: string
	ticker: string
	priceBuy: number
	takeProfit: number
	stopLoss: number
}

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

function loadLevels(filePath: string): Level[] {
	if (!fs.existsSync(filePath)) return []

	let raw: unknown

	try {
		raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
	} catch {
		console.warn(`Ошибка чтения JSON: ${filePath}`)
		return []
	}

	if (!Array.isArray(raw)) return []

	// 🔒 ЖЁСТКАЯ, НО УМНАЯ НОРМАЛИЗАЦИЯ
	return raw
		.map((l: any, index: number) => {
			if (typeof l !== 'object' || l === null) return null

			const price =
				typeof l.price === 'number'
					? l.price
					: typeof l.value === 'number'
						? l.value
						: null

			const time =
				typeof l.barIndex === 'number'
					? l.barIndex
					: typeof l.time === 'number'
						? l.time
						: null

			if (
				price === null ||
				!Number.isFinite(price) ||
				time === null ||
				!Number.isFinite(time)
			) {
				return null
			}

			return {
				price,
				time,
				barIndex: typeof l.barIndex === 'number' ? l.barIndex : undefined,
			} as Level
		})
		.filter(Boolean) as Level[]
}

function ensureDir(filePath: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

/**
 * =========================================================
 * MAIN
 * =========================================================
 */

export function getOrders(ticker: string) {
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = path.dirname(__filename)
	const dataDir = path.resolve(__dirname, '../../data')

	const historyHighsPath = path.resolve(
		dataDir,
		'history_highs',
		`${ticker}_history_highs.json`,
	)

	const donchianHighsPath = path.resolve(
		dataDir,
		'donchian_highs',
		`${ticker}_donchian_highs.json`,
	)

	const fullMax = loadLevels(historyHighsPath)
	const globalMax = loadLevels(donchianHighsPath)

	if (globalMax.length === 0 || fullMax.length === 0) {
		console.warn(`${ticker} → нет данных для расчёта ордерофффф`)
		return
	}

	// сортировка обязательна
	fullMax.sort((a, b) => (a.barIndex ?? a.time) - (b.barIndex ?? b.time))

	const orders: Order[] = []

	const BAR_SEC = 15 * 60 // 900 секунд
	const MIN_BARS = 20
	const MIN_SEC = BAR_SEC * MIN_BARS

	for (const global of globalMax) {
		const gPrice = global.price
		const gBar = global.barIndex ?? global.time

		if (!Number.isFinite(gPrice) || !Number.isFinite(gBar)) continue

		for (const local of fullMax) {
			const lPrice = local.price
			const lBar = local.barIndex ?? local.time

			if (!Number.isFinite(lPrice) || !Number.isFinite(lBar)) continue

			// 1️⃣ local должен быть ПОЗЖЕ global
			if (lBar <= gBar) continue

			// 2️⃣ прошло минимум 20 баров
			if (lBar - gBar < MIN_SEC) continue

			// 3️⃣ цена подошла к уровню СНИЗУ
			if (lPrice >= gPrice) continue

			// 4️⃣ не дальше чем на 0.2%
			const diff = (gPrice - lPrice) / gPrice
			if (diff > 0.002) continue

			const reasons: string[] = []
			const barsPassed = Math.floor((gBar - lBar) / 900)

			if (barsPassed < 20) reasons.push('bars<20')
			if (Math.abs(diff) > 0.002) reasons.push('diff>0.2%')
			if (lPrice >= gPrice) reasons.push('not_from_above')

			console.log(
				`${ticker} | bars: ${barsPassed} | ` +
					`price: ${lPrice.toFixed(2)} vs ${gPrice.toFixed(2)} | ` +
					`diff: ${(diff * 100).toFixed(2)}% | ` +
					(reasons.length ? `FAIL: ${reasons.join(', ')}` : '✅ SIGNAL'),
			)

			const TAKE_PROFIT_PERCENT = 0.02
			const STOP_LOSS_PERCENT = 0.005

			const roundUp2 = (value: number) => Math.ceil(value * 100) / 100
			const roundDown2 = (value: number) => Math.floor(value * 100) / 100

			orders.push({
				id: uuidv4(),
				ticker,
				priceBuy: gPrice,
				takeProfit: roundUp2(gPrice * (1 + TAKE_PROFIT_PERCENT)),
				stopLoss: roundDown2(gPrice * (1 - STOP_LOSS_PERCENT)),
			})

			break
		}
	}

	// уникализация
	const uniqueOrders = orders.filter(
		(o, i, arr) => arr.findIndex(e => e.priceBuy === o.priceBuy) === i,
	)

	const ordersPath = path.resolve(dataDir, 'orders', 'ordersBuy.json')
	ensureDir(ordersPath)

	const existingOrders: Order[] = fs.existsSync(ordersPath)
		? JSON.parse(fs.readFileSync(ordersPath, 'utf-8'))
		: []

	const merged = [...existingOrders]

	for (const o of uniqueOrders) {
		if (!merged.some(e => e.priceBuy === o.priceBuy && e.ticker === o.ticker)) {
			merged.push(o)
			console.log(`${ticker} → BUY LIMIT ${o.priceBuy}`)
		}
	}

	fs.writeFileSync(ordersPath, JSON.stringify(merged, null, 2))
}
