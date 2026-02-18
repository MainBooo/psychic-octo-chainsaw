export type OrderSide = 'BUY' | 'SELL'
export type OrderStatus =
	| 'PENDING' // лимитка не зацепилась
	| 'FILLED' // исполнена
	| 'TP_CLOSED' // закрыта по тейку
	| 'SL_CLOSED' // закрыта по стопу

export interface SimOrder {
	id: string
	ticker: string
	side?: 'BUY' | 'SELL'
	qty: number
	priceBuy?: number // для BUY
	priceSell?: number // для SELL
	limitPrice?: number // можно оставить для старой логики
	takeProfit: number
	stopLoss: number
	entryPrice?: number
	exitPrice?: number
	status?: 'PENDING' | 'FILLED' | 'TP_CLOSED' | 'SL_CLOSED'
	createdAt: number
	filledAt?: number | null
	closedAt?: number
	pnl?: number
}
