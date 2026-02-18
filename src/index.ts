import fs from 'fs'
import path from 'path'
import { saveDonchianLevels } from './donchian.js'
import { updateTicker } from './history.js'
import { updateTickerIncremental } from './historyIncremental.js'
import { processHistoryLevels } from './historyLevels.js'
import { getOrders } from './orders/getOrders.js'
import { getOrdersSell } from './orders/getOrdersSell.js'
import { tickers } from './tickers.js'

console.log('TS build works')

const HISTORY_DIR = path.resolve(process.cwd(), 'data', 'history')

async function run() {
	for (const ticker of tickers) {
		try {
			const historyPath = path.resolve(HISTORY_DIR, `${ticker}_history.json`)

			// 1️⃣ История: либо полная, либо инкремент
			if (fs.existsSync(historyPath)) {
				await updateTickerIncremental(ticker)
			} else {
				const result = await updateTicker(ticker)
				if (!result) continue
			}

			// 2️⃣ Donchian
			saveDonchianLevels(ticker)

			// 3️⃣ Highs / Lows
			await processHistoryLevels(ticker)

			// 4️⃣ Ордера
			getOrders(ticker)
			getOrdersSell(ticker)
		} catch (e) {
			console.error('Error for', ticker, e)
		}
	}
}

run()
setInterval(run, 1 * 60 * 60 * 1000)
