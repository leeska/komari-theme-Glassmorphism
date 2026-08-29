import type { MaybeRefOrGetter } from 'vue'
import type { CarrierRouteCarrier, CarrierRouteFamily } from '@/utils/rpc'
import { computed } from 'vue'
import { useNodeCarrierRouteStats } from '@/composables/useNodeCarrierRouteStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'

export interface CarrierRouteDisplay {
  key: string
  family: CarrierRouteFamily
  familyLabel: string
  carrier: CarrierRouteCarrier | string
  carrierLabel: string
  route: string
  latency: string
  loss: string
  status: string
  checkedAt: string
  tooltip: string
}

const FAMILIES: CarrierRouteFamily[] = ['ipv4', 'ipv6']
const CARRIERS: Array<{ key: CarrierRouteCarrier, zh: string, en: string }> = [
  { key: 'telecom', zh: '电信', en: 'Telecom' },
  { key: 'unicom', zh: '联通', en: 'Unicom' },
  { key: 'mobile', zh: '移动', en: 'Mobile' },
]

function statusLabel(status: string, lang: string): string {
  if (status === 'ok')
    return lang === 'zh-CN' ? '正常' : 'OK'
  if (status === 'timeout')
    return lang === 'zh-CN' ? '超时' : 'Timeout'
  if (status === 'unsupported')
    return lang === 'zh-CN' ? '不支持' : 'Unsupported'
  return lang === 'zh-CN' ? '失败' : 'Failed'
}

export function useNodeCarrierRouteDisplay(uuid: MaybeRefOrGetter<string>) {
  const appStore = useAppStore()
  const routeStats = useNodeCarrierRouteStats(uuid, {
    enabled: () => appStore.carrierRouteEnabled,
    intervalMinutes: () => appStore.carrierRouteIntervalMinutes,
    region: () => appStore.carrierPingRegion,
  })

  const displays = computed<CarrierRouteDisplay[]>(() => {
    const lang = appStore.lang
    const results = routeStats.results.value
    return FAMILIES.flatMap(family => CARRIERS.map((definition) => {
      const result = results.find(item => item.family === family && item.carrier === definition.key)
      const familyLabel = family === 'ipv4' ? 'IPv4' : 'IPv6'
      const carrierText = lang === 'zh-CN' ? definition.zh : definition.en
      const latency = typeof result?.latency_ms === 'number' ? `${Math.round(result.latency_ms)} ms` : '-'
      const loss = typeof result?.loss_percent === 'number' ? `${result.loss_percent.toFixed(1)}%` : '-'
      const route = result?.route?.trim() || '-'
      const status = statusLabel(result?.status ?? 'failed', lang)
      const checkedAt = result?.checked_at ? formatDateTime(result.checked_at, 'MM-dd HH:mm') : '-'
      const tooltip = result
        ? `${familyLabel} ${carrierText}\n${route}\n${status}\n${checkedAt}`
        : lang === 'zh-CN' ? `${familyLabel} ${carrierText}暂无回程结果` : `No ${familyLabel} ${carrierText} route result`
      return {
        key: `${family}-${definition.key}`,
        family,
        familyLabel,
        carrier: result?.carrier ?? definition.key,
        carrierLabel: carrierText,
        route,
        latency,
        loss,
        status,
        checkedAt,
        tooltip,
      }
    }))
  })

  return {
    displays,
    loading: routeStats.loading,
    error: routeStats.error,
    lastCheckedAt: routeStats.lastCheckedAt,
    refresh: routeStats.refresh,
  }
}
