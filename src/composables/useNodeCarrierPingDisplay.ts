import type { MaybeRefOrGetter } from 'vue'
import type { ChinaCarrierKey, NodePingHistoryPoint } from '@/composables/useNodePingStats'
import type { CarrierRouteFamily } from '@/utils/rpc'
import { computed, toValue } from 'vue'
import { useNodeCarrierPingStats } from '@/composables/useNodePingStats'
import { PING_SUMMARY_MAX_COUNT } from '@/constants/load'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'

export interface CarrierPingBar {
  key: string
  className: string
  tooltip: string
}

export interface CarrierPingDisplay {
  key: ChinaCarrierKey
  label: string
  dotClass: string
  families: CarrierPingFamilyDisplay[]
  latencyTooltip: string
  lossTooltip: string
}

export interface CarrierPingFamilyDisplay {
  family: CarrierRouteFamily
  label: string
  latencyDisplay: string
  lossDisplay: string
  latencyBars: CarrierPingBar[]
  lossBars: CarrierPingBar[]
  latencyTooltip: string
  lossTooltip: string
  state: 'loading' | 'error' | 'unmonitored' | 'empty' | 'ready'
}

const EMPTY_PING_BAR_COUNT = 20
const CARRIER_DOT_CLASSES: Record<ChinaCarrierKey, string> = {
  unicom: 'bg-rose-500',
  telecom: 'bg-blue-500',
  mobile: 'bg-emerald-500',
  international: 'bg-amber-500',
}

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-signal-1'
  if (latency <= 100)
    return 'bg-signal-2'
  if (latency <= 160)
    return 'bg-signal-3 ping-signal-pattern-2'
  if (latency <= 200)
    return 'bg-signal-4 ping-signal-pattern-3'
  return 'bg-signal-5 ping-signal-pattern-4'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-signal-1'
  if (loss <= 3)
    return 'bg-signal-2'
  if (loss <= 6)
    return 'bg-signal-3 ping-signal-pattern-2'
  if (loss <= 9)
    return 'bg-signal-4 ping-signal-pattern-3'
  return 'bg-signal-5 ping-signal-pattern-4'
}

function buildHistoryBars(
  label: string,
  carrierKey: string,
  history: NodePingHistoryPoint[],
  metric: 'latency' | 'loss',
): CarrierPingBar[] {
  return history.map((point, index) => {
    const value = point[metric]
    const valueText = value === null
      ? '无采样数据'
      : metric === 'latency'
        ? `${Math.round(value)} ms`
        : `${value.toFixed(1)}%`
    return {
      key: `${carrierKey}-${metric}-${point.time}-${index}`,
      className: value === null
        ? 'bg-muted-foreground/15'
        : metric === 'latency' ? getLatencyToneClass(value) : getLossToneClass(value),
      tooltip: `${label}\n${formatDateTime(point.time, 'HH:mm:ss')}\n${valueText}`,
    }
  })
}

function buildEmptyBars(carrierKey: string, metric: 'latency' | 'loss', tooltip: string): CarrierPingBar[] {
  return Array.from({ length: EMPTY_PING_BAR_COUNT }, (_, index) => ({
    key: `${carrierKey}-${metric}-empty-${index}`,
    className: 'bg-muted-foreground/10',
    tooltip,
  }))
}

const FAMILY_LABELS: Record<CarrierRouteFamily, { zh: string, en: string }> = {
  ipv4: { zh: 'IPv4', en: 'IPv4' },
  ipv6: { zh: 'IPv6', en: 'IPv6' },
}

export function useNodeCarrierPingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {},
) {
  const appStore = useAppStore()
  const pingStatsEnabled = computed(() => {
    if (toValue(options.enabled) === false)
      return false
    if (appStore.publicSettings?.record_enabled === false)
      return false
    return appStore.publicSettings?.ping_record_preserve_time !== 0
  })
  const pingStatsHours = computed(() => {
    const preserveTime = appStore.publicSettings?.ping_record_preserve_time
    return typeof preserveTime === 'number' && preserveTime > 0 ? Math.min(preserveTime, 1) : 1
  })
  const carrierStats = useNodeCarrierPingStats(uuid, {
    hours: pingStatsHours,
    enabled: pingStatsEnabled,
    maxCount: PING_SUMMARY_MAX_COUNT,
    region: () => appStore.carrierDisplayRegion,
  })

  const carrierDisplays = computed<CarrierPingDisplay[]>(() => {
    const carrierStates = carrierStats.carriers.value
    const carriers: ChinaCarrierKey[] = ['telecom', 'unicom', 'mobile', 'international']
    return carriers.map((key) => {
      const states = carrierStates.filter(carrier => carrier.key === key)
      const firstState = states[0]
      const label = firstState
        ? appStore.lang === 'zh-CN' ? firstState.labelZh : firstState.labelEn
        : key
      const families = (['ipv4', 'ipv6'] as const).map((family) => {
        const carrier = states.find(item => item.family === family)
        const familyLabel = FAMILY_LABELS[family][appStore.lang === 'zh-CN' ? 'zh' : 'en']
        const scopedLabel = appStore.carrierDisplayRegion ? `${appStore.carrierDisplayRegion}${label}` : label
        const taskHint = carrier?.taskNames.length
          ? carrier.taskNames.join(' / ')
          : appStore.lang === 'zh-CN' ? `未匹配${scopedLabel} ${familyLabel} Ping 任务` : `No ${scopedLabel} ${familyLabel} ping task matched`
        const hasTask = Boolean(carrier?.taskNames.length)
        const state: CarrierPingFamilyDisplay['state'] = carrierStats.loading.value
          ? 'loading'
          : carrierStats.error.value
            ? 'error'
            : !hasTask
                ? 'unmonitored'
                : !carrier?.stats.hasData && !carrier?.hasLatency
                    ? 'empty'
                    : 'ready'
        const emptyReason = carrierStats.loading.value
          ? (appStore.lang === 'zh-CN' ? '加载中' : 'Loading')
          : carrierStats.error.value
            ? (appStore.lang === 'zh-CN' ? '加载失败' : 'Load failed')
            : !pingStatsEnabled.value
                ? (appStore.lang === 'zh-CN' ? '未启用 Ping 记录' : 'Ping records disabled')
                : taskHint
        const stats = carrier?.stats
        const latencyBars = stats?.history.length
          ? buildHistoryBars(`${label} ${familyLabel}`, key, stats.history, 'latency')
          : buildEmptyBars(`${key}-${family}`, 'latency', emptyReason)
        const lossBars = stats?.history.length
          ? buildHistoryBars(`${label} ${familyLabel}`, key, stats.history, 'loss')
          : buildEmptyBars(`${key}-${family}`, 'loss', emptyReason)
        const latencyDisplay = state === 'loading'
          ? (appStore.lang === 'zh-CN' ? '加载中' : 'Loading')
          : state === 'error'
            ? (appStore.lang === 'zh-CN' ? '加载失败' : 'Error')
            : state === 'unmonitored'
              ? (appStore.lang === 'zh-CN' ? '未监控' : 'Off')
              : state === 'empty'
                ? (appStore.lang === 'zh-CN' ? '暂无数据' : 'No data')
                : carrier?.hasLatency ? `${Math.round(stats?.avgLatency ?? 0)} ms` : '-'
        const lossDisplay = state === 'loading'
          ? (appStore.lang === 'zh-CN' ? '加载中' : 'Loading')
          : state === 'error'
            ? (appStore.lang === 'zh-CN' ? '加载失败' : 'Error')
            : state === 'unmonitored'
              ? (appStore.lang === 'zh-CN' ? '未监控' : 'Off')
              : state === 'empty'
                ? (appStore.lang === 'zh-CN' ? '暂无数据' : 'No data')
                : stats?.hasData ? `${stats.avgLoss.toFixed(1)}%` : '-'
        const latencyTooltip = carrier?.hasLatency
          ? `${taskHint}\n${appStore.lang === 'zh-CN' ? '平均延迟' : 'Average latency'} ${latencyDisplay}`
          : taskHint
        const volatility = stats && stats.avgVolatility > 0
          ? `，${appStore.lang === 'zh-CN' ? '平均波动' : 'volatility'} ${stats.avgVolatility.toFixed(2)}`
          : ''
        const lossTooltip = stats?.hasData
          ? `${taskHint}\n${appStore.lang === 'zh-CN' ? '平均丢包' : 'Average loss'} ${lossDisplay}${volatility}`
          : taskHint
        return { family, label: familyLabel, latencyDisplay, lossDisplay, latencyBars, lossBars, latencyTooltip, lossTooltip, state }
      })
      return {
        key,
        label,
        dotClass: CARRIER_DOT_CLASSES[key],
        families,
        latencyTooltip: families.map(family => family.latencyTooltip).filter(Boolean).join('\n'),
        lossTooltip: families.map(family => family.lossTooltip).filter(Boolean).join('\n'),
      }
    }).filter(display => display.key !== 'international' || carrierStates.some(state => state.key === 'international' && state.taskNames.length > 0))
  })

  return { carrierDisplays, loading: carrierStats.loading, error: carrierStats.error }
}
