#!/usr/bin/env node
/**
 * 📊 Генератор отчёта по симуляции торгового бота
 * Использование: node generate-report.js
 * Читает: sim-history/takeprofit.json, sim-history/stoploss.json
 * Создаёт: report.html
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// =========================================================
// ЗАГРУЗКА ДАННЫХ
// =========================================================

function loadOrders(filePath) {
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

const simDir = path.resolve(process.cwd(), 'sim-history')
const tp = loadOrders(path.join(simDir, 'takeprofit.json'))
const sl = loadOrders(path.join(simDir, 'stoploss.json'))
const allClosed = [...tp, ...sl]

if (allClosed.length === 0) {
  console.error('❌ Нет закрытых сделок. Проверь sim-history/takeprofit.json и stoploss.json')
  process.exit(1)
}

// =========================================================
// РАСЧЁТ СТАТИСТИКИ
// =========================================================

function calcStats(orders) {
  if (!orders.length) return null

  const totalTrades = orders.length
  const wins = orders.filter(o => o.status === 'TP_CLOSED').length
  const losses = orders.filter(o => o.status === 'SL_CLOSED').length
  const winRate = ((wins / totalTrades) * 100).toFixed(1)

  const totalPnl = orders.reduce((sum, o) => sum + (o.pnl ?? 0), 0)
  const avgPnl = totalPnl / totalTrades

  const bestTrade = orders.reduce((best, o) => (o.pnl > (best?.pnl ?? -Infinity) ? o : best), null)
  const worstTrade = orders.reduce((worst, o) => (o.pnl < (worst?.pnl ?? Infinity) ? o : worst), null)

  // Максимальная просадка
  let peak = 0, maxDrawdown = 0, cumPnl = 0
  for (const o of orders.sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))) {
    cumPnl += o.pnl ?? 0
    if (cumPnl > peak) peak = cumPnl
    const drawdown = peak - cumPnl
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
  }

  return { totalTrades, wins, losses, winRate, totalPnl, avgPnl, bestTrade, worstTrade, maxDrawdown }
}

// Группировка по месяцам
function groupByMonth(orders) {
  const map = {}
  for (const o of orders) {
    const date = new Date(o.closedAt ?? o.createdAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!map[key]) map[key] = []
    map[key].push(o)
  }
  return map
}

// Кривая капитала (нарастающий PnL)
function buildEquityCurve(orders) {
  const sorted = [...orders].sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0))
  let cum = 0
  return sorted.map(o => {
    cum += o.pnl ?? 0
    return {
      date: new Date(o.closedAt ?? o.createdAt).toLocaleDateString('ru-RU'),
      pnl: parseFloat(cum.toFixed(2)),
      ticker: o.ticker,
      side: o.side,
      status: o.status,
    }
  })
}

const stats = calcStats(allClosed)
const monthly = groupByMonth(allClosed)
const equityCurve = buildEquityCurve(allClosed)

const monthlyRows = Object.entries(monthly)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([month, orders]) => {
    const s = calcStats(orders)
    const [year, m] = month.split('-')
    const monthName = new Date(+year, +m - 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
    return { month: monthName, ...s }
  })

const recentTrades = [...allClosed]
  .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
  .slice(0, 20)

// =========================================================
// HTML ГЕНЕРАЦИЯ
// =========================================================

const equityData = JSON.stringify(equityCurve)
const monthlyData = JSON.stringify(monthlyRows)
const recentData = JSON.stringify(recentTrades.map(o => ({
  date: new Date(o.closedAt ?? o.createdAt).toLocaleDateString('ru-RU'),
  ticker: o.ticker,
  side: o.side ?? 'BUY',
  entryPrice: o.entryPrice,
  exitPrice: o.exitPrice,
  pnl: o.pnl?.toFixed(2),
  status: o.status,
})))

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AlphaFlow — Отчёт по симуляции</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Unbounded:wght@300;700;900&display=swap');

  :root {
    --bg: #0a0a0f;
    --surface: #111118;
    --border: #1e1e2e;
    --accent: #00ff88;
    --accent2: #ff3b6b;
    --accent3: #3b82f6;
    --text: #e2e8f0;
    --muted: #4a5568;
    --win: #00ff88;
    --loss: #ff3b6b;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'IBM Plex Mono', monospace;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* GRID BACKGROUND */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .container {
    position: relative;
    z-index: 1;
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px 80px;
  }

  /* HEADER */
  header {
    margin-bottom: 56px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 32px;
  }

  .logo {
    font-family: 'Unbounded', sans-serif;
    font-size: 11px;
    font-weight: 300;
    letter-spacing: 0.4em;
    color: var(--accent);
    text-transform: uppercase;
    margin-bottom: 12px;
    opacity: 0.8;
  }

  h1 {
    font-family: 'Unbounded', sans-serif;
    font-size: clamp(28px, 5vw, 48px);
    font-weight: 900;
    line-height: 1.1;
    color: #fff;
    letter-spacing: -0.02em;
  }

  h1 span {
    color: var(--accent);
    display: block;
  }

  .report-date {
    margin-top: 12px;
    font-size: 12px;
    color: var(--muted);
  }

  /* KPI GRID */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    margin-bottom: 40px;
  }

  .kpi {
    background: var(--surface);
    padding: 24px 20px;
    position: relative;
    overflow: hidden;
    transition: background 0.2s;
  }

  .kpi::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 2px;
    background: var(--accent);
    transform: scaleX(0);
    transition: transform 0.3s;
    transform-origin: left;
  }

  .kpi:hover::after { transform: scaleX(1); }
  .kpi:hover { background: #14141f; }

  .kpi-label {
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 10px;
  }

  .kpi-value {
    font-family: 'Unbounded', sans-serif;
    font-size: clamp(20px, 3vw, 28px);
    font-weight: 700;
    color: #fff;
    line-height: 1;
  }

  .kpi-value.positive { color: var(--win); }
  .kpi-value.negative { color: var(--loss); }
  .kpi-value.neutral { color: var(--accent3); }

  .kpi-sub {
    font-size: 11px;
    color: var(--muted);
    margin-top: 6px;
  }

  /* SECTIONS */
  .section {
    margin-bottom: 48px;
  }

  .section-title {
    font-family: 'Unbounded', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* CHART */
  .chart-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 24px;
    position: relative;
  }

  .chart-wrap canvas {
    max-height: 280px;
  }

  /* MONTHLY TABLE */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  thead tr {
    border-bottom: 2px solid var(--accent);
  }

  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 400;
  }

  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  tbody tr:hover { background: #14141f; }

  td {
    padding: 12px 12px;
    color: var(--text);
  }

  td.win { color: var(--win); font-weight: 600; }
  td.loss { color: var(--loss); font-weight: 600; }
  td.neutral { color: var(--accent3); }

  /* BADGE */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 2px;
    font-size: 10px;
    letter-spacing: 0.1em;
    font-weight: 600;
  }

  .badge-tp { background: rgba(0,255,136,0.12); color: var(--win); border: 1px solid rgba(0,255,136,0.3); }
  .badge-sl { background: rgba(255,59,107,0.12); color: var(--loss); border: 1px solid rgba(255,59,107,0.3); }
  .badge-buy { background: rgba(59,130,246,0.12); color: var(--accent3); border: 1px solid rgba(59,130,246,0.3); }
  .badge-sell { background: rgba(255,59,107,0.12); color: var(--loss); border: 1px solid rgba(255,59,107,0.3); }

  /* FOOTER */
  footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .warning {
    background: rgba(255,59,107,0.06);
    border: 1px solid rgba(255,59,107,0.2);
    padding: 16px 20px;
    font-size: 12px;
    color: #ff8099;
    margin-bottom: 40px;
    line-height: 1.6;
  }

  @media (max-width: 600px) {
    .kpi-grid { grid-template-columns: 1fr 1fr; }
    table { font-size: 11px; }
    th, td { padding: 8px 8px; }
  }
</style>
</head>
<body>
<div class="container">

  <header>
    <div class="logo">AlphaFlow Trading</div>
    <h1>Отчёт<span>по автотрейдингу</span></h1>
    <div class="report-date">Сформирован: ${new Date().toLocaleString('ru-RU')} · Стратегия: Donchian Levels · MOEX</div>
  </header>

  <!-- KPI -->
  <div class="kpi-grid" id="kpi-grid"></div>

  <div class="warning">
    ⚠️ Данные получены в режиме симуляции. Результаты симуляции не гарантируют аналогичных результатов при реальной торговле. Торговля на бирже сопряжена с риском потери капитала.
  </div>

  <!-- EQUITY CURVE -->
  <div class="section">
    <div class="section-title">Кривая капитала</div>
    <div class="chart-wrap">
      <canvas id="equityChart"></canvas>
    </div>
  </div>

  <!-- MONTHLY -->
  <div class="section">
    <div class="section-title">По месяцам</div>
    <table id="monthly-table">
      <thead>
        <tr>
          <th>Месяц</th>
          <th>Сделок</th>
          <th>Win</th>
          <th>Loss</th>
          <th>Win%</th>
          <th>PnL</th>
          <th>Просадка</th>
        </tr>
      </thead>
      <tbody id="monthly-body"></tbody>
    </table>
  </div>

  <!-- RECENT TRADES -->
  <div class="section">
    <div class="section-title">Последние сделки</div>
    <table>
      <thead>
        <tr>
          <th>Дата</th>
          <th>Тикер</th>
          <th>Сторона</th>
          <th>Вход</th>
          <th>Выход</th>
          <th>PnL %</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody id="trades-body"></tbody>
    </table>
  </div>

  <footer>
    <span>AlphaFlow · Стратегия Donchian Levels · MOEX</span>
    <span>Симуляция · ${new Date().getFullYear()}</span>
  </footer>

</div>

<script>
const equity = ${equityData}
const monthly = ${monthlyData}
const trades = ${recentData}
const stats = ${JSON.stringify(stats)}

// ---- KPI ----
const kpis = [
  { label: 'Всего сделок', value: stats.totalTrades, cls: 'neutral' },
  { label: 'Winrate', value: stats.winRate + '%', cls: parseFloat(stats.winRate) >= 60 ? 'positive' : 'negative' },
  { label: 'Общий PnL', value: stats.totalPnl.toFixed(1) + '%', cls: stats.totalPnl >= 0 ? 'positive' : 'negative', sub: 'суммарно по всем сделкам' },
  { label: 'Ср. PnL сделки', value: stats.avgPnl.toFixed(2) + '%', cls: stats.avgPnl >= 0 ? 'positive' : 'negative' },
  { label: 'Макс. просадка', value: '-' + stats.maxDrawdown.toFixed(1) + '%', cls: 'negative' },
  { label: 'Лучшая сделка', value: '+' + stats.bestTrade?.pnl?.toFixed(2) + '%', cls: 'positive', sub: stats.bestTrade?.ticker },
]

const kpiGrid = document.getElementById('kpi-grid')
kpis.forEach(k => {
  kpiGrid.innerHTML += \`
    <div class="kpi">
      <div class="kpi-label">\${k.label}</div>
      <div class="kpi-value \${k.cls}">\${k.value}</div>
      \${k.sub ? \`<div class="kpi-sub">\${k.sub}</div>\` : ''}
    </div>
  \`
})

// ---- EQUITY CHART ----
const ctx = document.getElementById('equityChart').getContext('2d')
const isPositive = equity.length ? equity[equity.length-1].pnl >= 0 : true
const lineColor = isPositive ? '#00ff88' : '#ff3b6b'

new Chart(ctx, {
  type: 'line',
  data: {
    labels: equity.map(e => e.date),
    datasets: [{
      label: 'Накопленный PnL %',
      data: equity.map(e => e.pnl),
      borderColor: lineColor,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: lineColor,
      fill: true,
      backgroundColor: (ctx) => {
        const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280)
        gradient.addColorStop(0, isPositive ? 'rgba(0,255,136,0.15)' : 'rgba(255,59,107,0.15)')
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        return gradient
      },
      tension: 0.3,
    }]
  },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111118',
        borderColor: '#1e1e2e',
        borderWidth: 1,
        titleColor: '#4a5568',
        bodyColor: '#e2e8f0',
        callbacks: {
          label: ctx => \` PnL: \${ctx.parsed.y.toFixed(2)}%\`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#4a5568', font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 8 },
        grid: { color: '#1e1e2e' }
      },
      y: {
        ticks: {
          color: '#4a5568',
          font: { family: 'IBM Plex Mono', size: 10 },
          callback: v => v.toFixed(1) + '%'
        },
        grid: { color: '#1e1e2e' }
      }
    }
  }
})

// ---- MONTHLY TABLE ----
const tbody = document.getElementById('monthly-body')
monthly.forEach(m => {
  const pnlClass = parseFloat(m.totalPnl) >= 0 ? 'win' : 'loss'
  tbody.innerHTML += \`
    <tr>
      <td>\${m.month}</td>
      <td class="neutral">\${m.totalTrades}</td>
      <td class="win">\${m.wins}</td>
      <td class="loss">\${m.losses}</td>
      <td class="\${parseFloat(m.winRate) >= 60 ? 'win' : 'loss'}">\${m.winRate}%</td>
      <td class="\${pnlClass}">\${parseFloat(m.totalPnl) >= 0 ? '+' : ''}\${m.totalPnl.toFixed(1)}%</td>
      <td class="loss">-\${m.maxDrawdown.toFixed(1)}%</td>
    </tr>
  \`
})

// ---- RECENT TRADES ----
const tradesTbody = document.getElementById('trades-body')
trades.forEach(t => {
  const pnl = parseFloat(t.pnl)
  tradesTbody.innerHTML += \`
    <tr>
      <td style="color:var(--muted)">\${t.date}</td>
      <td style="font-weight:600">\${t.ticker}</td>
      <td><span class="badge \${t.side === 'BUY' ? 'badge-buy' : 'badge-sell'}">\${t.side}</span></td>
      <td>\${t.entryPrice ?? '—'}</td>
      <td>\${t.exitPrice ?? '—'}</td>
      <td class="\${pnl >= 0 ? 'win' : 'loss'}">\${pnl >= 0 ? '+' : ''}\${t.pnl}%</td>
      <td><span class="badge \${t.status === 'TP_CLOSED' ? 'badge-tp' : 'badge-sl'}">\${t.status === 'TP_CLOSED' ? 'TP' : 'SL'}</span></td>
    </tr>
  \`
})
</script>
</body>
</html>`

// =========================================================
// СОХРАНЕНИЕ
// =========================================================

const outPath = path.resolve(process.cwd(), 'report.html')
fs.writeFileSync(outPath, html)
console.log(`✅ Отчёт сохранён: ${outPath}`)
console.log(`📊 Сделок: ${stats.totalTrades} | Winrate: ${stats.winRate}% | PnL: ${stats.totalPnl.toFixed(1)}%`)
