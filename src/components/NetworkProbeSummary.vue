<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodeCarrierPingDisplay } from '@/composables/useNodeCarrierPingDisplay'
import { useNodeCarrierRouteDisplay } from '@/composables/useNodeCarrierRouteDisplay'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'

const props = withDefaults(defineProps<{
  node: NodeData
  pingEnabled?: boolean
}>(), {
  pingEnabled: true,
})

const emit = defineEmits<{ pingClick: [] }>()
const appStore = useAppStore()
const mode = ref<'latency' | 'route'>('latency')
const { carrierDisplays } = useNodeCarrierPingDisplay(() => props.node.uuid, { enabled: () => props.pingEnabled })
const { displays: routeDisplays, loading: routeLoading, error: routeError, lastCheckedAt, enabled: routeEnabled } = useNodeCarrierRouteDisplay(() => props.node.uuid)

const families = computed(() => (['ipv4', 'ipv6'] as const).map(family => ({
  family,
  label: family === 'ipv4' ? 'IPv4' : 'IPv6',
  routes: routeDisplays.value.filter(route => route.family === family),
})))

const pingStateClass: Record<string, string> = {
  loading: 'text-muted-foreground',
  error: 'text-destructive',
  unmonitored: 'text-muted-foreground/70',
  empty: 'text-warning',
  ready: 'text-foreground',
}

const routeUpdatedLabel = computed(() => {
  if (routeLoading.value)
    return '检测中'
  if (lastCheckedAt.value)
    return `更新 ${formatDateTime(lastCheckedAt.value, 'MM-dd HH:mm')}`
  return routeError.value ? '后端未提供结果' : '暂无结果'
})

const routeAvailable = computed(() => routeLoading.value || routeEnabled.value === true || routeDisplays.value.length > 0)
const panelLabel = computed(() => mode.value === 'latency' ? '三网延迟监控' : '三网回程线路')
const summaryHeightClass = computed(() => {
  if (appStore.nodeCardSize === 'mini')
    return 'h-24'
  if (appStore.nodeCardSize === 'large')
    return 'h-32'
  if (appStore.nodeCardSize === 'comfortable')
    return 'h-30'
  return 'h-28'
})

watch(routeAvailable, (available) => {
  if (!available && mode.value === 'route')
    mode.value = 'latency'
})
</script>

<template>
  <section
    data-node-network-probe
    class="network-probe-summary relative flex flex-col overflow-hidden rounded-lg bg-slate-500/5 p-1.5"
    :class="[summaryHeightClass, !props.node.online ? 'blur-xs opacity-50' : '']"
    :title="appStore.carrierDisplayRegion || undefined"
    :aria-label="`${props.node.name} ${panelLabel}`"
  >
    <header class="mb-1 flex items-center justify-between gap-2 text-[10px] leading-none">
      <span class="flex min-w-0 items-center gap-1 text-muted-foreground">
        <Icon :icon="mode === 'latency' ? 'tabler:activity-heartbeat' : 'tabler:route'" width="11" height="11" />
        <span class="truncate">{{ panelLabel }}</span>
      </span>
      <div v-if="routeAvailable" class="inline-flex shrink-0 rounded-md bg-slate-500/10 p-0.5" role="tablist" aria-label="探测类型">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'latency'"
          class="rounded px-1.5 py-0.5 text-[9px] transition-colors"
          :class="mode === 'latency' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
          @click.stop="mode = 'latency'"
        >
          延迟
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'route'"
          class="rounded px-1.5 py-0.5 text-[9px] transition-colors"
          :class="mode === 'route' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
          @click.stop="mode = 'route'"
        >
          回程
        </button>
      </div>
    </header>

    <button
      v-if="mode === 'latency'"
      type="button"
      class="block min-h-0 w-full flex-1 overflow-hidden text-left"
      :aria-label="`${props.node.name} 打开 Ping 详情`"
      @click.stop="emit('pingClick')"
    >
      <div data-node-ping-bars="latency" class="grid h-full grid-rows-3 gap-1">
        <div v-for="carrier in carrierDisplays" :key="carrier.key" :data-carrier-ping="carrier.key" class="min-h-0 min-w-0 rounded-md bg-slate-500/5 p-1" :title="carrier.latencyTooltip">
          <div class="mb-0.5 flex items-center justify-between gap-1 text-[9px] leading-none">
            <span class="flex min-w-0 items-center gap-1 text-muted-foreground"><span class="size-1.5 shrink-0 rounded-full" :class="carrier.dotClass" /><span class="truncate">{{ carrier.label }}</span></span><span v-if="appStore.carrierDisplayRegion && carrier.key === 'telecom'" class="max-w-16 truncate text-[8px] text-muted-foreground/70">{{ appStore.carrierDisplayRegion }}</span>
          </div>
          <div class="grid grid-cols-2 gap-1">
            <div v-for="family in carrier.families" :key="`${carrier.key}-${family.family}`" :data-node-ping-family="family.family" class="min-w-0" :title="family.latencyTooltip">
              <div class="flex items-center justify-between text-[8px] leading-none text-muted-foreground/80">
                <span>{{ family.label }}</span><span class="tabular-nums font-medium" :class="pingStateClass[family.state]">{{ family.latencyDisplay }}<span class="mx-0.5 opacity-40">/</span>{{ family.lossDisplay }}</span>
              </div><div class="mt-0.5 grid h-1 gap-px opacity-80" :style="{ gridTemplateColumns: `repeat(${family.latencyBars.length}, minmax(0, 1fr))` }">
                <DataTooltip v-for="bar in family.latencyBars" :key="bar.key" placement="top" :content="bar.tooltip" class="h-full w-full">
                  <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
                </DataTooltip>
              </div><div :data-node-ping-loss-bars="family.family" class="mt-0.5 grid h-0.5 gap-px opacity-50" :style="{ gridTemplateColumns: `repeat(${family.lossBars.length}, minmax(0, 1fr))` }">
                <span v-for="bar in family.lossBars" :key="bar.key" class="block h-full w-full rounded-[1px]" :class="bar.className" :title="bar.tooltip" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>

    <div v-else data-node-carrier-route class="grid min-h-0 flex-1 grid-cols-2 gap-1.5 overflow-hidden">
      <div v-for="family in families" :key="family.family" :data-carrier-route-family="family.family" class="flex min-h-0 min-w-0 flex-col rounded-md bg-slate-500/5 p-1">
        <div class="mb-1 flex items-center justify-between text-[9px] font-medium text-muted-foreground">
          <span>{{ family.label }}</span><span class="text-[8px] font-normal text-muted-foreground/70">{{ routeUpdatedLabel }}</span>
        </div>
        <div v-if="family.routes.length" class="grid min-h-0 flex-1 gap-0.5 overflow-y-auto pr-0.5">
          <div v-for="route in family.routes" :key="route.key" :data-carrier-route="route.key" class="flex min-w-0 items-center gap-1 text-[9px] leading-tight" :title="route.tooltip">
            <span class="max-w-12 shrink-0 truncate text-muted-foreground" :title="route.region">{{ route.region }}</span>
            <span class="w-6 shrink-0 text-muted-foreground">{{ route.carrierLabel }}</span>
            <span class="min-w-0 flex-1 truncate" :class="route.monitored && (route.status === '正常' || route.status === 'OK') ? 'text-success' : route.monitored ? 'text-warning' : 'text-muted-foreground/60'">{{ route.route }}</span>
            <span class="shrink-0 tabular-nums text-muted-foreground">{{ route.latency }} / {{ route.loss }}</span>
          </div>
        </div>
        <div v-else class="text-[8px] text-muted-foreground/70">
          未配置该协议族的回程目标
        </div>
      </div>
    </div>
  </section>
</template>
