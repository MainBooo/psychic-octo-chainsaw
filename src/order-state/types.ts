export interface StoredOrder {
	ticker: string
	entryPrice: number
	stop: number
	take: number
	direction: 'BUY' | 'SELL'
	openedAt: string
}
