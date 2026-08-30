import type { MaybeRefOrGetter } from 'vue'
import type { CarrierRouteFamily, CarrierRouteResult, CarrierRouteSelection } from '@/utils/rpc'
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import { abortCarrierRouteStats, loadCarrierRouteStats } from '@/services/carrier-route.service'

export function useNodeCarrierRouteStats(
  uuid: MaybeRefOrGetter<string>,
  options: {
    enabled?: MaybeRefOrGetter<boolean>
  } = {},
) {
  const results = ref<CarrierRouteResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastCheckedAt = ref<string | null>(null)
  const enabled = ref<boolean | undefined>(undefined)
  const selections = ref<CarrierRouteSelection[]>([])
  const selectionsKnown = ref(false)
  const intervalMinutes = ref(60)
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let requestKey: { uuid: string, families: CarrierRouteFamily[], region?: string, maxAgeSeconds?: number } | null = null

  const resolved = computed(() => ({
    uuid: toValue(uuid).trim(),
    enabled: toValue(options.enabled) !== false,
  }))

  function stopTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function scheduleRefresh(): void {
    stopTimer()
    if (disposed || !resolved.value.enabled || !resolved.value.uuid)
      return
    timer = setTimeout(() => {
      void refresh().finally(scheduleRefresh)
    }, intervalMinutes.value * 60_000)
  }

  async function refresh(): Promise<void> {
    const next = resolved.value
    if (!next.enabled || !next.uuid) {
      results.value = []
      loading.value = false
      error.value = null
      lastCheckedAt.value = null
      enabled.value = undefined
      selections.value = []
      selectionsKnown.value = false
      return
    }
    loading.value = results.value.length === 0
    error.value = null
    requestKey = { uuid: next.uuid, families: ['ipv4', 'ipv6'] }
    try {
      const snapshot = await loadCarrierRouteStats(requestKey)
      results.value = snapshot.results
      enabled.value = snapshot.enabled
      selections.value = snapshot.selections
      selectionsKnown.value = snapshot.selectionsKnown
      if (typeof snapshot.intervalSeconds === 'number')
        intervalMinutes.value = Math.min(1440, Math.max(15, Math.ceil(snapshot.intervalSeconds / 60)))
      lastCheckedAt.value = snapshot.results.reduce<string | null>((latest, item) => {
        if (!latest || new Date(item.checked_at).getTime() > new Date(latest).getTime())
          return item.checked_at
        return latest
      }, snapshot.checkedAt || null)
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : '获取三网回程线路失败'
    }
    finally {
      loading.value = false
    }
  }

  watch(resolved, () => {
    stopTimer()
    void refresh().finally(scheduleRefresh)
  }, { immediate: true })

  onScopeDispose(() => {
    disposed = true
    stopTimer()
    if (requestKey)
      abortCarrierRouteStats(requestKey)
  })

  return { results, loading, error, lastCheckedAt, enabled, selections, selectionsKnown, refresh }
}
