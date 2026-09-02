import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { installKomariFixture } from './fixtures/komari'

const STABLE_STYLE = `
  *, *::before, *::after {
    animation: none !important;
    caret-color: transparent !important;
    transition: none !important;
  }
  html { scroll-behavior: auto !important; }
  .earth-globe-host canvas,
  .earth-globe-canvas { opacity: 0 !important; }
`

async function openStablePage(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Komari Visual Lab' })).toBeVisible()
  await page.addStyleTag({ content: STABLE_STYLE })
  await page.waitForTimeout(700)
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate(element => element.clientWidth))
}

async function expectNodeMetricIcons(page: Page): Promise<void> {
  for (const metric of ['cpu', 'memory', 'disk', 'traffic'])
    await expect(page.locator(`[data-node-metric-icon="${metric}"]`).first()).toBeVisible()
}

async function expectNodePingBars(page: Page): Promise<void> {
  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const barsByMetric = [
    card.locator('[data-node-ping-bars="latency"]'),
    card.locator('[data-node-ping-loss-bars]').first(),
  ]
  for (const bars of barsByMetric) {
    await expect(bars).toBeVisible()
    await expect.poll(() => bars.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(0)
  }
}

test('home light desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page)
  await openStablePage(page)
  await expectNodeMetricIcons(page)
  await expectNodePingBars(page)
  await expect(page).toHaveScreenshot('home-light-desktop.png', { fullPage: false })
})

test('node cards show the three China carrier ping panels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { pingTaskOrdering: true, hideEarth: true })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const latencyRows = card.locator('[data-node-ping-bars="latency"] [data-carrier-ping]')
  await expect(card.locator('[data-node-ping-bars="latency"]')).toBeVisible()
  await expect(card.locator('[data-node-ping-loss-bars]')).toHaveCount(6)
  await expect(card.locator('[data-node-ping-loss-bars]').first()).toBeVisible()
  await expect(latencyRows).toHaveCount(3)
  for (const [index, carrier] of ['telecom', 'unicom', 'mobile'].entries())
    await expect(latencyRows.nth(index)).toHaveAttribute('data-carrier-ping', carrier)
})

test('node cards filter China carrier ping tasks by configured region', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { pingTaskOrdering: true, carrierPingRegion: '广东', hideEarth: true })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const latencyRows = card.locator('[data-node-ping-bars="latency"] [data-carrier-ping]')
  await expect(card.locator('[title="广东"]')).toHaveCount(1)
  await expect(latencyRows.nth(0)).toContainText('电信')
  await expect(latencyRows.nth(0)).toContainText('130 ms')
  await expect(latencyRows.nth(0)).toHaveAttribute('title', /广东电信/)
  await expect(latencyRows.nth(1)).toContainText('联通')
  await expect(latencyRows.nth(1)).toContainText('120 ms')
  await expect(latencyRows.nth(1)).toHaveAttribute('title', /广东联通/)
  await expect(latencyRows.nth(2)).toContainText('移动')
  await expect(latencyRows.nth(2)).toContainText('140 ms')
  await expect(latencyRows.nth(2)).toHaveAttribute('title', /广东移动/)
  for (const row of await latencyRows.all())
    await expect(row).not.toHaveAttribute('title', /浙江/)
})

test('node cards keep IPv4 and IPv6 carrier ping values separate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { pingTaskOrdering: true, carrierPingIpv6: true, hideEarth: true })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const latencyRows = card.locator('[data-node-ping-bars="latency"] [data-carrier-ping]')
  await expect(latencyRows).toHaveCount(3)
  for (const row of await latencyRows.all()) {
    await expect(row.locator('[data-node-ping-family="ipv4"]')).toBeVisible()
    await expect(row.locator('[data-node-ping-family="ipv6"]')).toBeVisible()
  }
})

test('node cards show optional structured carrier route results', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { carrierRouteEnabled: true, hideEarth: true })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const probe = card.locator('[data-node-network-probe]')
  const latencyHeight = await probe.evaluate(element => element.getBoundingClientRect().height)
  await card.getByRole('tab', { name: '回程' }).click()
  await expect.poll(() => probe.evaluate(element => element.getBoundingClientRect().height)).toBe(latencyHeight)
  const panel = card.locator('[data-node-carrier-route]')
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-carrier-route-family="ipv4"] [data-carrier-route]')).toHaveCount(3)
  await expect(panel.locator('[data-carrier-route-family="ipv6"] [data-carrier-route]')).toHaveCount(3)
  const routeRows = await panel.locator('[data-carrier-route]').all()
  for (const routeRow of routeRows) {
    await expect(routeRow).toBeVisible()
    const routeLabel = routeRow.locator('[data-carrier-route-label]')
    await expect(routeLabel).toBeVisible()
    await expect.poll(async () => routeLabel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await expect.poll(async () => routeRow.evaluate((element) => {
      const row = element.getBoundingClientRect()
      const bounds = element.closest('[data-node-network-probe]')?.getBoundingClientRect()
      return Boolean(bounds && row.top >= bounds.top && row.bottom <= bounds.bottom)
    })).toBe(true)
  }
  const labelHeights = await panel.locator('[data-carrier-route-label]').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  expect(new Set(labelHeights)).toEqual(new Set([28]))
  await expect(panel).toContainText('CN2GIA')
  await expect(panel).toContainText('CMIN2->CMI')
  await expect(panel).not.toContainText('42 ms')
  await expect(panel).not.toContainText('0.0%')
})

test('carrier route trace opens as one complete non-paginated panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { carrierRouteEnabled: true, hideEarth: true })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  await card.getByRole('tab', { name: '回程' }).click()
  const routeRow = card.locator('[data-carrier-route="ipv4-telecom-广东-default"]')
  await routeRow.scrollIntoViewIfNeeded()
  await routeRow.click()

  const overlay = page.locator('[data-carrier-trace-overlay]')
  const tracePanel = overlay.locator('[data-carrier-trace-panel]')
  await expect(overlay).toBeVisible()
  await expect(tracePanel).toBeVisible()
  await expect(tracePanel.locator('[data-carrier-trace-hop]')).toHaveCount(3)
  await expect(tracePanel).toContainText('CN2GIA')
  await expect(tracePanel).toContainText('10.0.*.*')
  await expect(tracePanel).toContainText('202.97.*.*')
  await expect(tracePanel.locator('button', { hasText: '上一页' })).toHaveCount(0)
  await expect(tracePanel.locator('button', { hasText: '下一页' })).toHaveCount(0)
  await expect(routeRow.locator('[data-carrier-route-label]')).toHaveClass(/from-amber-100/)
  const initialPanelBounds = await tracePanel.boundingBox()
  if (!initialPanelBounds)
    throw new Error('trace panel bounds unavailable')
  await page.evaluate(() => window.scrollTo(0, 180))
  await expect.poll(async () => {
    const bounds = await tracePanel.boundingBox()
    return bounds && Math.abs(bounds.x - initialPanelBounds.x) < 1 && Math.abs(bounds.y - initialPanelBounds.y) < 1
  }).toBe(true)
  await expect.poll(async () => {
    const rowBounds = await routeRow.boundingBox()
    const panelBounds = await tracePanel.boundingBox()
    if (!rowBounds || !panelBounds)
      return false
    const rowCenter = rowBounds.y + rowBounds.height / 2
    const panelCenter = panelBounds.y + panelBounds.height / 2
    return Math.abs(panelCenter - rowCenter) < 360
      && panelBounds.y >= 8
      && panelBounds.y + panelBounds.height <= 712
  }).toBe(true)
})

test('comfortable node cards keep all carrier families readable without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await installKomariFixture(page, {
    carrierPingIpv6: true,
    carrierRouteEnabled: true,
    hideEarth: true,
    pingTaskOrdering: true,
  })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const probe = card.locator('[data-node-network-probe]')
  await expect(probe.locator('[data-carrier-ping]')).toHaveCount(3)
  await expect(probe.locator('[data-node-ping-family="ipv4"]')).toHaveCount(3)
  await expect(probe.locator('[data-node-ping-family="ipv6"]')).toHaveCount(3)
  await expect.poll(() => probe.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

  await card.getByRole('tab', { name: '回程' }).click()
  await expect(probe.locator('[data-carrier-route]')).toHaveCount(6)
  await expect(probe).toContainText('CMIN2->CMI')
  await expect.poll(() => probe.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
})

test('home dark mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installKomariFixture(page, { dark: true })
  await openStablePage(page)
  await expectNodeMetricIcons(page)
  await expect(page).toHaveScreenshot('home-dark-mobile.png', { fullPage: false })
})

test('home accessible list desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { colorVisionFriendly: true, viewMode: 'list', hideEarth: true })
  await openStablePage(page)
  await expect(page).toHaveScreenshot('home-accessible-list-desktop.png', { fullPage: false })
})

test('home cobe layout desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { earthRenderer: 'cobe' })
  await openStablePage(page)
  await expectNodeMetricIcons(page)
  await expect(page).toHaveScreenshot('home-cobe-desktop.png', { fullPage: false })
})

test('home tiled layout desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { earthRenderer: 'tiled' })
  await openStablePage(page)
  await expectNodeMetricIcons(page)
  await expect(page).toHaveScreenshot('home-tiled-desktop.png', { fullPage: false })
})

test('home tiled layout respects custom general cards and order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, {
    earthRenderer: 'tiled',
    generalCardKeys: ['currentTime', 'offlineNodes'],
  })
  await openStablePage(page)

  const cards = page.locator('[data-general-card-key]')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toHaveAttribute('data-general-card-key', 'currentTime')
  await expect(cards.nth(1)).toHaveAttribute('data-general-card-key', 'offlineNodes')
})

test('comfortable card metric icons remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installKomariFixture(page, { hideEarth: true })
  await openStablePage(page)

  const card = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  await expect(card.locator('[data-node-metric-icon="cpu"]')).toBeVisible()
  await expect(card.locator('[data-node-metric-icon="memory"]')).toBeVisible()
  await expect(card.locator('[data-node-metric-icon="traffic"]')).toBeVisible()
  await expect(card.getByRole('img', { name: 'CPU' })).toBeVisible()
  await expect(card.getByRole('img', { name: '内存' })).toBeVisible()
})

test('node card expiry uses red through 5 days and yellow through 10 days', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { expiryThresholds: true, hideEarth: true })
  await openStablePage(page)

  const criticalCard = page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' })
  const warningCard = page.getByRole('button', { name: '查看节点 香港边缘节点-超长名称布局测试 详情' })
  const criticalExpiry = criticalCard.getByText('剩余', { exact: true }).locator('..')
  const warningExpiry = warningCard.getByText('剩余', { exact: true }).locator('..')

  await expect(criticalExpiry).toContainText('剩余5天')
  await expect(criticalExpiry).toHaveClass(/text-destructive/)
  await expect(warningExpiry).toContainText('剩余10天')
  await expect(warningExpiry).toHaveClass(/text-warning/)
})

test('free node pricing stays semantic across home, finance, and detail', async ({ page }) => {
  const freeNodeName = '主控-洛杉矶'
  const freeNodeUuid = '00000000-0000-4000-8000-000000000001'
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { freePriceNode: true, hideEarth: true })
  await openStablePage(page)

  const nodeCard = page.getByRole('button', { name: `查看节点 ${freeNodeName} 详情` })
  await expect(nodeCard.getByText('免费', { exact: true })).toBeVisible()
  await expect(nodeCard.getByText('无', { exact: true })).toBeVisible()
  await expect(nodeCard.getByText('免费 / 年', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '查看剩余价值明细' }).click()
  const financeDialog = page.getByRole('dialog', { name: '价值与费用明细' })
  await expect(financeDialog.getByText(freeNodeName, { exact: true })).toHaveCount(0)
  await financeDialog.getByLabel('排除免费节点').uncheck()
  const freeNodeRow = financeDialog.getByRole('cell', { name: freeNodeName, exact: true }).locator('..')
  await expect(freeNodeRow).toBeVisible()
  await expect(freeNodeRow.getByText('免费', { exact: true })).toBeVisible()
  await expect(freeNodeRow.getByText('无', { exact: true })).toBeVisible()

  await page.goto(`/instance/${freeNodeUuid}`)
  await expect(page.getByText('硬件信息', { exact: true })).toBeVisible()
  await expect(page.getByText('节点价格', { exact: true })).toBeVisible()
  await expect(page.getByText('剩余价值', { exact: true })).toBeVisible()
  await expect(page.getByText('无', { exact: true })).toBeVisible()
  await expect(page.getByText('免费 / 月', { exact: true })).toHaveCount(0)
})

test('detail light desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page)
  await openStablePage(page, '/instance/00000000-0000-4000-8000-000000000001')
  await expect(page.getByText('硬件信息')).toBeVisible()
  await expect(page).toHaveScreenshot('detail-light-desktop.png', { fullPage: false })
})

test('detail dark mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installKomariFixture(page, { dark: true })
  await openStablePage(page, '/instance/00000000-0000-4000-8000-000000000002')
  await expect(page.getByText('硬件信息')).toBeVisible()
  await expect(page).toHaveScreenshot('detail-dark-mobile.png', { fullPage: false })
})

test('detail short history falls back when metric history omits CPU', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { missingCpuMetricHistory: true })
  await openStablePage(page, '/instance/00000000-0000-4000-8000-000000000001')

  const cpuValue = page.locator('[data-load-chart-card="cpu"] [data-latest-cpu]')
  const loadRange = page.locator('[data-load-chart-range]')
  for (const view of ['4 小时', '1 天']) {
    await loadRange.getByRole('tab', { name: view, exact: true }).click()
    await expect(cpuValue).toHaveText(/^\d+\.\d$/)
  }
})

test('detail history keeps cumulative traffic counters on their last value', async ({ page }) => {
  const historyCalls: Array<Record<string, unknown>> = []

  page.on('request', (request) => {
    if (!request.url().endsWith('/api/rpc2'))
      return

    const payload = request.postDataJSON() as { method?: string, params?: Record<string, unknown> } | null
    const metricKeys = Array.isArray(payload?.params?.metric_keys) ? payload.params.metric_keys : []
    if (payload?.method === 'public:queryMetrics' && metricKeys.includes('net.total.up'))
      historyCalls.push(payload.params ?? {})
  })

  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page)
  await openStablePage(page, '/instance/00000000-0000-4000-8000-000000000001')

  await page.locator('[data-load-chart-range]').getByRole('tab', { name: '1 天', exact: true }).click()
  await expect.poll(() => historyCalls.length).toBeGreaterThan(0)

  expect(historyCalls.at(-1)).toMatchObject({
    aggregation: 'avg',
    aggregation_by_metric: {
      'net.total.up': 'last',
      'net.total.down': 'last',
    },
  })
})

test('detail ping requests stay scoped to the current node', async ({ page }) => {
  const currentUuid = '00000000-0000-4000-8000-000000000001'
  const metricCalls: Array<{ method: string, params: Record<string, unknown> }> = []
  const isPingMetricCall = (call: { method: string, params: Record<string, unknown> }): boolean => {
    const metricKeys = Array.isArray(call.params.metric_keys) ? call.params.metric_keys : []
    return call.method === 'public:getPingMetricStats'
      || metricKeys.includes('ping.latency_ms')
      || metricKeys.includes('ping.loss')
  }

  page.on('request', (request) => {
    if (!request.url().endsWith('/api/rpc2'))
      return

    const payload = request.postDataJSON() as { method?: string, params?: Record<string, unknown> } | null
    if (payload?.method === 'public:queryMetrics' || payload?.method === 'public:getPingMetricStats') {
      metricCalls.push({ method: payload.method, params: payload.params ?? {} })
    }
  })

  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page)
  await openStablePage(page)

  await expect.poll(() => metricCalls.filter(isPingMetricCall).length).toBeGreaterThan(0)
  const homeSummaryCalls = metricCalls.filter(call => call.method === 'public:queryMetrics' && isPingMetricCall(call))
  expect(homeSummaryCalls.length).toBeGreaterThan(0)
  expect(homeSummaryCalls.every(call => call.params.max_points === 150)).toBe(true)

  metricCalls.length = 0
  await page.getByRole('button', { name: '查看节点 主控-洛杉矶 详情' }).click({ position: { x: 120, y: 24 } })
  await expect(page).toHaveURL(`/instance/${currentUuid}`)
  await expect(page.getByText('硬件信息')).toBeVisible()
  await page.waitForTimeout(2_000)

  const detailPingCalls = metricCalls.filter(isPingMetricCall)
  expect(detailPingCalls.length).toBeGreaterThan(0)
  expect(new Set(detailPingCalls.map(call => call.params.entity_id))).toEqual(new Set([currentUuid]))
})

test('detail ping tasks follow the backend task order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installKomariFixture(page, { pingTaskOrdering: true })
  await openStablePage(page, '/instance/00000000-0000-4000-8000-000000000001')

  const taskCards = page.locator('[data-ping-task-id]')
  await expect(taskCards).toHaveCount(3)
  await expect(taskCards.first()).toHaveAttribute('data-ping-task-id', '30')
  await expect(taskCards.nth(1)).toHaveAttribute('data-ping-task-id', '10')
  await expect(taskCards.nth(2)).toHaveAttribute('data-ping-task-id', '20')
  await expect(taskCards).toContainText(['浙江移动', '浙江联通', '浙江电信'])
})
