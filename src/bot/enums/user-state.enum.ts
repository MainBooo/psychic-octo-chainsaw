// enums/user-state.enum.ts
export enum UserState {
	IDLE = 'IDLE', // Главное меню
	VIEW_ORDERS = 'VIEW_ORDERS', // Экран списка ордеров
	VIEW_ACTIVE = 'VIEW_ACTIVE', // Экран активных ордеров
	FILTER_TICKER = 'FILTER_TICKER', // Ожидание ввода тикера
	VIEW_PNL = 'VIEW_PNL', // Экран PnL
	WORKING = 'WORKING', // Рабочий цикл — всё заблокировано

	// 👇 твои старые логические состояния
	WAIT_ALL = 'WAIT_ALL',
	WAIT_BUY = 'WAIT_BUY',
	WAIT_SELL = 'WAIT_SELL',
}
