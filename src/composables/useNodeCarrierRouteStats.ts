import type { MaybeRefOrGetter } from 'vue'
import type { CarrierRouteFamily, CarrierRouteResult } from '@/utils/rpc'
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import { abortCarrierRouteStats, loadCarrierRouteStats } from '@/services/carrier-route.service'

export function useNodeCarrierRouteStats(
  uuid: MaybeRefOrGetter<string>,
  options: {
    enabled?: MaybeRefOrGetter<boolean>
    intervalMinutes?: MaybeRefOrGetter<number>
    region?: MaybeRefOrGetter<string | undefined>
  } = {},
) {
  const results = ref<CarrierRouteResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastCheckedAt = ref<string | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null
  let requestKey: { uuid: string, families: CarrierRouteFamily[], region?: string, maxAgeSeconds?: number } | null = null

  const resolved = computed(() => ({
    uuid: toValue(uuid).trim(),
    enabled: toValue(options.enabled) !== false,
    intervalMinutes: Math.min(1440, Math.max(1, Math.floor(toValue(options.intervalMinutes) ?? 30))),
    region: toValue(options.region)?.trim() || undefined,
  }))

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function refresh(): Promise<void> {
    const next = resolved.value
    if (!next.enabled || !next.uuid) {
      results.value = []
      loading.value = false
      error.value = null
      lastCheckedAt.value = null
      return
    }
    loading.value = results.value.length === 0
    error.value = null
    requestKey = { uuid: next.uuid, families: ['ipv4', 'ipv6'], region: next.region, maxAgeSeconds: next.intervalMinutes * 60 * 2 }
    try {
      const data = await loadCarrierRouteStats(requestKey)
      results.value = data
      lastCheckedAt.value = data.reduce<string | null>((latest, item) => {
        if (!latest || new Date(item.checked_at).getTime() > new Date(latest).getTime())
          return item.checked_at
        return latest
      }, null)
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
    void refresh()
    if (resolved.value.enabled && resolved.value.uuid) {
      timer = setInterval(() => void refresh(), resolved.value.intervalMinutes * 60_000)
    }
  }, { immediate: true })

  onScopeDispose(() => {
    stopTimer()
    if (requestKey)
      abortCarrierRouteStats(requestKey)
  })

  return { results, loading, error, lastCheckedAt, refresh }
}
