<script setup lang="ts">
import type { CarrierRouteDisplay } from '@/composables/useNodeCarrierRouteDisplay'
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
const traceRoute = ref<CarrierRouteDisplay | null>(null)

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
    return `更新 ${formatDateTime(lastCheckedAt.value, 'MM-DD HH:mm')}`
  return routeError.value ? '后端未提供结果' : '暂无结果'
})

const routeAvailable = computed(() => routeLoading.value || routeEnabled.value === true || routeDisplays.value.length > 0)
const panelLabel = computed(() => mode.value === 'latency' ? '三网延迟监控' : '三网回程线路')
const summaryHeightClass = computed(() => {
  if (appStore.nodeCardSize === 'mini')
    return 'h-28'
  if (appStore.nodeCardSize === 'large')
    return 'h-36'
  if (appStore.nodeCardSize === 'comfortable')
    return 'h-34'
  return 'h-32'
})

watch(routeAvailable, (available) => {
  if (!available && mode.value === 'route')
    mode.value = 'latency'
})
</script>

<template>
  <section
    data-node-network-probe
    class="network-probe-summary relative flex flex-col overflow-hidden rounded-md border border-border/50 bg-background/25"
    :class="[summaryHeightClass, !props.node.online ? 'blur-xs opacity-50' : '']"
    :title="appStore.carrierDisplayRegion || undefined"
    :aria-label="`${props.node.name} ${panelLabel}`"
    @click.stop
  >
    <header class="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-muted/15 px-2 text-[10px] leading-none">
      <span class="flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground">
        <Icon icon="tabler:activity-heartbeat" width="12" height="12" />
        <span class="truncate">三网监控</span>
        <span v-if="appStore.carrierDisplayRegion" class="max-w-16 truncate rounded bg-muted/50 px-1 py-0.5 text-[8px] font-normal">{{ appStore.carrierDisplayRegion }}</span>
      </span>
      <div v-if="routeAvailable" class="inline-grid h-6 shrink-0 grid-cols-2 rounded bg-muted/40 p-0.5" role="tablist" aria-label="探测类型">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'latency'"
          class="min-w-10 rounded-sm px-2 text-[9px] font-medium transition-colors"
          :class="mode === 'latency' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'"
          @click.stop="mode = 'latency'"
        >
          延迟
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'route'"
          class="min-w-10 rounded-sm px-2 text-[9px] font-medium transition-colors"
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
      class="block min-h-0 w-full flex-1 overflow-hidden px-2 py-1 text-left"
      :aria-label="`${props.node.name} 打开 Ping 详情`"
      @click.stop="emit('pingClick')"
    >
      <div data-node-ping-bars="latency" class="grid h-full grid-rows-3 divide-y divide-border/35">
        <div v-for="carrier in carrierDisplays" :key="carrier.key" :data-carrier-ping="carrier.key" class="grid min-h-0 min-w-0 grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 py-1" :title="carrier.latencyTooltip">
          <span class="flex min-w-0 items-center gap-1 text-[9px] font-medium leading-none text-muted-foreground">
            <span class="size-1.5 shrink-0 rounded-full" :class="carrier.dotClass" />
            <span class="truncate">{{ carrier.label }}</span>
          </span>
          <div v-for="family in carrier.families" :key="`${carrier.key}-${family.family}`" :data-node-ping-family="family.family" class="min-w-0 overflow-hidden" :title="family.latencyTooltip">
            <div class="flex min-w-0 items-center justify-between gap-1 text-[8px] leading-none text-muted-foreground/80">
              <span class="shrink-0">{{ family.label }}</span>
              <span class="min-w-0 truncate text-right tabular-nums font-medium" :class="pingStateClass[family.state]">
                <template v-if="family.state === 'ready'">{{ family.latencyDisplay }}<span class="mx-0.5 opacity-40">/</span>{{ family.lossDisplay }}</template>
                <template v-else>{{ family.latencyDisplay }}</template>
              </span>
            </div>
            <div class="mt-1 grid h-1 gap-px opacity-80" :style="{ gridTemplateColumns: `repeat(${family.latencyBars.length}, minmax(0, 1fr))` }">
              <DataTooltip v-for="bar in family.latencyBars" :key="bar.key" placement="top" :content="bar.tooltip" class="h-full w-full">
                <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
              </DataTooltip>
            </div>
            <div :data-node-ping-loss-bars="family.family" class="mt-0.5 grid h-0.5 gap-px opacity-50" :style="{ gridTemplateColumns: `repeat(${family.lossBars.length}, minmax(0, 1fr))` }">
              <span v-for="bar in family.lossBars" :key="bar.key" class="block h-full w-full rounded-[1px]" :class="bar.className" :title="bar.tooltip" />
            </div>
          </div>
        </div>
      </div>
    </button>

    <div v-else data-node-carrier-route class="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border/40 overflow-hidden">
      <div v-for="family in families" :key="family.family" :data-carrier-route-family="family.family" class="flex min-h-0 min-w-0 flex-col px-2 py-1.5">
        <div class="mb-1 flex min-w-0 items-center justify-between gap-1 text-[9px] font-medium text-muted-foreground">
          <span>{{ family.label }}</span><span class="min-w-0 truncate text-right text-[8px] font-normal text-muted-foreground/70">{{ routeUpdatedLabel }}</span>
        </div>
        <div v-if="family.routes.length" class="grid min-h-0 flex-1 gap-0.5 overflow-y-auto pr-0.5">
          <button v-for="route in family.routes" :key="route.key" type="button" :data-carrier-route="route.key" class="grid min-h-6 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-sm px-1 text-left text-[9px] leading-tight transition-colors hover:bg-muted/45" :title="route.tooltip" @click.stop="traceRoute = route">
            <span class="flex min-w-0 items-center gap-1 text-muted-foreground">
              <span class="min-w-0 truncate" :title="route.taskName || route.region">{{ route.taskName || route.region }}</span>
              <span class="shrink-0 text-[8px]">{{ route.carrierLabel }}</span>
            </span>
            <span class="max-w-20 truncate rounded border border-current/15 bg-background/35 px-1 py-0.5 text-right font-semibold" :class="route.monitored && (route.status === '正常' || route.status === 'OK') ? 'text-success' : route.monitored ? 'text-warning' : 'text-muted-foreground/60'">{{ route.route }}</span>
          </button>
        </div>
        <div v-else class="text-[8px] text-muted-foreground/70">
          未配置该协议族的回程目标
        </div>
      </div>
    </div>
    <div v-if="traceRoute" class="absolute inset-0 z-30 flex items-center justify-center bg-background/85 p-2 backdrop-blur-sm" @click.stop="traceRoute = null">
      <div class="flex max-h-full w-full min-w-0 flex-col rounded-lg border border-border bg-background p-2 shadow-lg" @click.stop>
        <div class="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium">
          <span class="truncate">{{ traceRoute.familyLabel }} · {{ traceRoute.region }} · {{ traceRoute.carrierLabel }} · {{ traceRoute.route }}</span><button type="button" class="min-h-7 rounded px-2 text-muted-foreground hover:bg-muted" @click="traceRoute = null">
            关闭
          </button>
        </div>
        <div v-if="traceRoute.trace.length" class="min-h-0 flex-1 overflow-y-auto text-[9px]">
          <div class="mb-1 grid grid-cols-[2rem_minmax(0,1fr)_auto_auto_auto] gap-1 px-1.5 text-[8px] text-muted-foreground">
            <span>#</span><span>地址（已脱敏）</span><span>线路</span><span>ASN</span><span>RTT</span>
          </div>
          <div v-for="hop in traceRoute.trace" :key="hop.hop" class="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto_auto] items-center gap-1 rounded bg-muted/40 px-1.5 py-1">
            <span class="tabular-nums text-muted-foreground">{{ hop.hop }}</span><span class="truncate font-mono">{{ hop.timed_out ? '*' : hop.address || '*' }}</span><span class="text-muted-foreground">{{ hop.network || '' }}</span><span class="text-muted-foreground">{{ hop.asn || '' }}</span><span class="tabular-nums text-muted-foreground">{{ typeof hop.rtt_ms === 'number' ? `${Math.round(hop.rtt_ms)} ms` : '' }}</span>
          </div>
        </div>
        <div v-else class="py-5 text-center text-[9px] text-muted-foreground">
          暂无可显示的 Trace
        </div>
      </div>
    </div>
  </section>
</template>
