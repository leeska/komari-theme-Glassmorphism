import type { MaybeRefOrGetter } from 'vue'
import type { CarrierRouteCarrier, CarrierRouteFamily, CarrierRouteTraceHop } from '@/utils/rpc'
import { computed } from 'vue'
import { useNodeCarrierRouteStats } from '@/composables/useNodeCarrierRouteStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'

export interface CarrierRouteDisplay {
  key: string
  family: CarrierRouteFamily
  familyLabel: string
  region: string
  taskName?: string
  carrier: CarrierRouteCarrier | string
  carrierLabel: string
  route: string
  latency: string
  loss: string
  status: string
  monitored: boolean
  checkedAt: string
  tooltip: string
  trace: CarrierRouteTraceHop[]
}

const FAMILIES: CarrierRouteFamily[] = ['ipv4', 'ipv6']
const UNKNOWN_ROUTE_REGEX = /^(?:hidden|unknown)$/i
const CARRIERS: Array<{ key: CarrierRouteCarrier, zh: string, en: string }> = [
  { key: 'telecom', zh: '电信', en: 'Telecom' },
  { key: 'unicom', zh: '联通', en: 'Unicom' },
  { key: 'mobile', zh: '移动', en: 'Mobile' },
]

function selectionKey(family: CarrierRouteFamily, carrier: string, region: string, taskId?: string): string {
  return `${family}:${carrier}:${region.trim().toLocaleLowerCase()}:${taskId || 'default'}`
}

function routeSort(left: CarrierRouteDisplay, right: CarrierRouteDisplay): number {
  const familyOrder = FAMILIES.indexOf(left.family) - FAMILIES.indexOf(right.family)
  if (familyOrder)
    return familyOrder
  const carrierOrder = CARRIERS.findIndex(item => item.key === left.carrier) - CARRIERS.findIndex(item => item.key === right.carrier)
  if (carrierOrder)
    return carrierOrder
  return left.region.localeCompare(right.region, 'zh-CN')
}

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
  const routeStats = useNodeCarrierRouteStats(uuid)

  const displays = computed<CarrierRouteDisplay[]>(() => {
    const lang = appStore.lang
    const results = routeStats.results.value
    const selections = routeStats.selections.value
      .filter(selection => FAMILIES.includes(selection.family) && CARRIERS.some(item => item.key === selection.carrier))
    const targets = routeStats.selectionsKnown.value
      ? selections
      : results.map(result => ({ region: result.region || '全国', carrier: result.carrier, family: result.family }))
    const seen = new Set<string>()
    return targets.reduce<CarrierRouteDisplay[]>((items, target) => {
      const family = target.family
      const definition = CARRIERS.find(item => item.key === target.carrier)
      if (!definition)
        return items
      const region = target.region?.trim() || '全国'
      const taskName = 'task_name' in target && typeof target.task_name === 'string' ? target.task_name : undefined
      const taskId = 'task_id' in target && typeof target.task_id === 'string' ? target.task_id : undefined
      const key = selectionKey(family, definition.key, region, taskId)
      if (seen.has(key))
        return items
      seen.add(key)
      const result = results
        .filter(item => item.family === family && item.carrier === definition.key && (item.region || '全国').trim().toLocaleLowerCase() === region.toLocaleLowerCase() && (!taskId || item.target_id === taskId))
        .sort((left, right) => new Date(right.checked_at).getTime() - new Date(left.checked_at).getTime())[0]
      const monitored = routeStats.selectionsKnown.value
        ? routeStats.enabled.value !== false
        : Boolean(result)
      const familyLabel = family === 'ipv4' ? 'IPv4' : 'IPv6'
      const carrierText = lang === 'zh-CN' ? definition.zh : definition.en
      const latency = monitored && typeof result?.latency_ms === 'number' ? `${Math.round(result.latency_ms)} ms` : '-'
      const loss = monitored && typeof result?.loss_percent === 'number' ? `${result.loss_percent.toFixed(1)}%` : '-'
      const rawRoute = result?.route_path?.length ? result.route_path.join(' -> ') : result?.route?.trim() || '-'
      const route = monitored
        ? (UNKNOWN_ROUTE_REGEX.test(rawRoute) && lang === 'zh-CN' ? '未知' : rawRoute)
        : '-'
      const status = monitored
        ? result
          ? statusLabel(result.status, lang)
          : lang === 'zh-CN' ? '暂无结果' : 'No result'
        : lang === 'zh-CN' ? '未监控' : 'Not monitored'
      const checkedAt = result?.checked_at ? formatDateTime(result.checked_at, 'MM-dd HH:mm') : '-'
      const tooltip = result
        ? `${familyLabel} ${region} ${carrierText}\n${route}\n${status}\n${checkedAt}`
        : monitored
          ? lang === 'zh-CN' ? `${familyLabel} ${region} ${carrierText}暂无回程结果` : `No ${familyLabel} ${region} ${carrierText} route result`
          : lang === 'zh-CN' ? `${familyLabel} ${region} ${carrierText}未加入监控` : `${familyLabel} ${region} ${carrierText} is not monitored`
      items.push({
        key: `${family}-${definition.key}-${region}-${taskId || 'default'}`,
        family,
        familyLabel,
        region,
        taskName,
        carrier: result?.carrier ?? definition.key,
        carrierLabel: carrierText,
        route,
        latency,
        loss,
        status,
        monitored,
        checkedAt,
        tooltip,
        trace: result?.trace ?? [],
      })
      return items
    }, []).sort(routeSort)
  })

  return {
    displays,
    loading: routeStats.loading,
    error: routeStats.error,
    lastCheckedAt: routeStats.lastCheckedAt,
    enabled: routeStats.enabled,
    selectionsKnown: routeStats.selectionsKnown,
    refresh: routeStats.refresh,
  }
}
