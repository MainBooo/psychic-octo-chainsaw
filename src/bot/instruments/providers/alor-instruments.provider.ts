import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { AlorAuthService } from '../../alor/alor-auth.service.js'
import { Instrument } from '../types/instrument.type.js'

/**
 * Провайдер инструментов, получаемых из API брокера Alor.
 *
 * Отвечает ТОЛЬКО за:
 * - загрузку списка торговых инструментов
 * - маппинг данных API → внутренний тип Instrument
 *
 * ❗ Не содержит бизнес-логики, кэша или фильтрации —
 * этим должны заниматься сервисы уровнем выше.
 */
@Injectable()
export class AlorInstrumentsProvider {
	/**
	 * @param authService
	 * Сервис аутентификации Alor.
	 * Инкапсулирует логику получения и обновления access token.
	 *
	 * Внедряется через DI NestJS, что:
	 * - упрощает тестирование
	 * - исключает жёсткие зависимости
	 */
	constructor(private readonly authService: AlorAuthService) {}

	/**
	 * Загружает список инструментов с биржи MOEX через API Alor.
	 *
	 * @returns Promise<Instrument[]>
	 * Массив инструментов в унифицированном формате приложения.
	 */
	async load(): Promise<Instrument[]> {
		/**
		 * Получаем актуальный access token.
		 * Внутри authService может быть:
		 * - кэширование
		 * - автоматическое обновление токена
		 * - повторные попытки
		 */
		const token = await this.authService.getAccessToken()

		/**
		 * HTTP-запрос к API Alor Market Data.
		 *
		 * Используется axios, так как:
		 * - он стабилен
		 * - имеет удобный API
		 * - хорошо работает с TypeScript
		 */
		const { data } = await axios.get('https://api.alor.ru/md/v2/Securities', {
			headers: {
				// Авторизация через Bearer Token
				Authorization: `Bearer ${token}`,
			},
			params: {
				// Явно указываем биржу
				exchange: 'MOEX',
			},
		})

		/**
		 * Маппинг ответа API Alor → внутренний тип Instrument.
		 *
		 * ⚠️ Важно:
		 * - мы не прокидываем "сырые" данные API дальше по системе
		 * - это снижает связанность
		 * - упрощает возможную смену провайдера в будущем
		 */
		return data.map(
			(s: any): Instrument => ({
				// Биржевой тикер инструмента
				symbol: s.symbol,

				// Человекочитаемое описание
				name: s.description,

				// Биржа (жёстко зафиксирована для этого провайдера)
				exchange: 'MOEX',

				// Торговая площадка / режим торгов
				board: s.board,

				// Валюта расчётов
				currency: s.currency,

				// Размер лота (количество бумаг в одном лоте)
				lot: s.lotSize,
			}),
		)
	}
}
