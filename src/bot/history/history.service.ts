import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import axios from 'axios'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { Candles } from './history,types.js'

/**
 * HistoryService
 *
 * Отвечает за:
 * - загрузку исторических свечей из ALOR
 * - преобразование данных
 * - сохранение в JSON файл
 * - автообновление каждые 4 часа
 */
@Injectable()
export class HistoryService implements OnModuleInit {
	private readonly logger = new Logger(HistoryService.name)

	// путь к файлу в корне проекта
	private readonly filePath = path.resolve(process.cwd(), 'abio_history.json')

	// базовый URL запроса
	private readonly baseUrl = 'https://api.alor.ru/md/v2/history'

	/**
	 * Хук NestJS — вызывается при старте приложения
	 */
	async onModuleInit() {
		// сразу загружаем данные при старте
		await this.updateHistory()

		// обновление каждые 4 часа (4 * 60 * 60 * 1000)
		setInterval(
			() => {
				this.updateHistory().catch(err =>
					this.logger.error('Update error', err),
				)
			},
			4 * 60 * 60 * 1000,
		)
	}

	/**
	 * Основной метод обновления истории
	 */
	private async updateHistory(): Promise<void> {
		this.logger.log('Updating ABIO history...')

		// текущее время в UNIX (секунды)
		const to = Math.floor(Date.now() / 1000)

		// если файл уже есть — берём последний timestamp
		const from = this.getFromTimestamp()

		const response = await axios.get(this.baseUrl, {
			params: {
				exchange: 'MOEX',
				symbol: 'ABIO',
				board: 'TQBR',
				tf: 900, // 15 минут
				from,
				to,
			},
		})

		// защита от пустых данных
		if (!response.data?.history?.length) {
			this.logger.warn('No new data received')
			return
		}

		// преобразуем данные
		const mappedData = response.data.history.map((candle: Candles) => ({
			id: randomUUID(), // уникальный id
			time: candle.time, // timestamp
			open: candle.open, // open
			high: candle.high, // high
			low: candle.low, // low
			close: candle.close, // close
			volume: candle.volume, // volume
		}))

		// объединяем с существующими данными
		const mergedData = this.mergeWithExisting(mappedData)

		// сохраняем в файл
		fs.writeFileSync(
			this.filePath,
			JSON.stringify(mergedData, null, 2),
			'utf-8',
		)

		this.logger.log(
			`Saved ${mappedData.length} new candles (total: ${mergedData.length})`,
		)
	}

	/**
	 * Получаем timestamp, с которого начинать загрузку
	 */
	private getFromTimestamp(): number {
		if (!fs.existsSync(this.filePath)) {
			// если файла нет — используем стартовый timestamp
			return 1759423062
		}

		const file = fs.readFileSync(this.filePath, 'utf-8')
		const data = JSON.parse(file)

		if (!data.length) {
			return 1759423062
		}

		// берём последний time + 1 секунда
		return data[data.length - 1].time + 1
	}

	/**
	 * Объединяем новые данные со старыми
	 */
	private mergeWithExisting(newData: any[]) {
		if (!fs.existsSync(this.filePath)) {
			return newData
		}

		const existing = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))

		return [...existing, ...newData]
	}
}
