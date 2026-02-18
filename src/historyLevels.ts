import fs from 'fs'
import path from 'path'

interface Candle {
	time: number
	high: number
	low: number
}

interface Level {
	time: number
	price: number
}

function makeKey(time: number, price: number) {
	return `${time}_${price}`
}

function ensureDir(filePath: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function normalizeLevels(raw: any[]): Level[] {
	return raw
		.map(l => {
			const price = l.price ?? l.high ?? l.low ?? l.value
			if (typeof price !== 'number' || typeof l.time !== 'number') return null
			return { time: l.time, price }
		})
		.filter(Boolean) as Level[]
}

export function filterUnbrokenHighs(history: Candle[]): Level[] {
	const result: Level[] = []
	let maxHigh = -Infinity

	for (let i = history.length - 1; i >= 0; i--) {
		const c = history[i]
		if (c.high > maxHigh) {
			result.push({ time: c.time, price: c.high })
			maxHigh = c.high
		}
	}
	return result
}

export function filterUnbrokenLows(history: Candle[]): Level[] {
	const result: Level[] = []
	let minLow = Infinity

	for (let i = history.length - 1; i >= 0; i--) {
		const c = history[i]
		if (c.low < minLow) {
			result.push({ time: c.time, price: c.low })
			minLow = c.low
		}
	}
	return result
}

export async function processHistoryLevels(ticker: string) {
	const baseDir = path.resolve(process.cwd(), 'data')

	// ===== HISTORY =====
	const historyPath = path.resolve(baseDir, 'history', `${ticker}_history.json`)

	if (!fs.existsSync(historyPath)) {
		console.warn(`[historyLevels] not found: ${historyPath}`)
		return
	}

	const history: Candle[] = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))

	// ===== DONCHIAN PATHS (FIXED) =====
	const donchianHighsPath = path.resolve(
		baseDir,
		'donchian_highs',
		`${ticker}_donchian_highs.json`
	)

	const donchianLowsPath = path.resolve(
		baseDir,
		'donchian_lows',
		`${ticker}_donchian_lows.json`
	)

	const donchianHighKeys = new Set<string>()
	const donchianLowKeys = new Set<string>()

	if (fs.existsSync(donchianHighsPath)) {
		const raw = JSON.parse(fs.readFileSync(donchianHighsPath, 'utf-8'))
		normalizeLevels(raw).forEach(l =>
			donchianHighKeys.add(makeKey(l.time, l.price))
		)
	}

	if (fs.existsSync(donchianLowsPath)) {
		const raw = JSON.parse(fs.readFileSync(donchianLowsPath, 'utf-8'))
		normalizeLevels(raw).forEach(l =>
			donchianLowKeys.add(makeKey(l.time, l.price))
		)
	}

	// ===== FILTER =====
	const historyHighs = filterUnbrokenHighs(history).filter(
		l => !donchianHighKeys.has(makeKey(l.time, l.price))
	)

	const historyLows = filterUnbrokenLows(history).filter(
		l => !donchianLowKeys.has(makeKey(l.time, l.price))
	)

	// ===== SAVE HISTORY LEVELS =====
	const historyHighsPath = path.resolve(
		baseDir,
		'history_highs',
		`${ticker}_history_highs.json`
	)
	ensureDir(historyHighsPath)
	fs.writeFileSync(historyHighsPath, JSON.stringify(historyHighs, null, 2))

	const historyLowsPath = path.resolve(
		baseDir,
		'history_lows',
		`${ticker}_history_lows.json`
	)
	ensureDir(historyLowsPath)
	fs.writeFileSync(historyLowsPath, JSON.stringify(historyLows, null, 2))
}
