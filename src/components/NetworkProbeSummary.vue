<script setup lang="ts">
import type { CarrierPingDisplay } from '@/composables/useNodeCarrierPingDisplay'
import type { CarrierRouteDisplay } from '@/composables/useNodeCarrierRouteDisplay'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodeCarrierPingDisplay } from '@/composables/useNodeCarrierPingDisplay'
import { useNodeCarrierRouteDisplay } from '@/composables/useNodeCarrierRouteDisplay'
import { useAppStore } from '@/stores/app'

const props = withDefaults(defineProps<{
  node: NodeData
  pingEnabled?: boolean
}>(), {
  pingEnabled: true,
})

const emit = defineEmits<{ pingClick: [] }>()
const appStore = useAppStore()
const { carrierDisplays } = useNodeCarrierPingDisplay(() => props.node.uuid, { enabled: () => props.pingEnabled })
const { displays: routeDisplays } = useNodeCarrierRouteDisplay(() => props.node.uuid)
const traceRoute = ref<CarrierRouteDisplay | null>(null)
const traceAnchor = ref<HTMLElement | null>(null)
const tracePanel = ref<HTMLElement | null>(null)
const tracePanelStyle = ref<Record<string, string>>({})

const displayRows = computed<CarrierPingDisplay[]>(() => {
  const rows = [...carrierDisplays.value]
  const seen = new Set(rows.map(row => row.carrier))
  for (const route of routeDisplays.value) {
    const key = route.carrier as CarrierPingDisplay['carrier']
    if (seen.has(key))
      continue
    seen.add(key)
    rows.push({
      key: `${route.carrier}-${route.region}`,
      carrier: route.carrier as CarrierPingDisplay['carrier'],
      region: route.region,
      label: route.carrierLabel,
      dotClass: 'bg-muted-foreground',
      families: (['ipv4', 'ipv6'] as const).map(family => ({
        family,
        label: family === 'ipv4' ? 'IPv4' : 'IPv6',
        latencyDisplay: '-',
        lossDisplay: '-',
        latencyBars: [],
        lossBars: [],
        latencyTooltip: `${route.region} ${route.carrierLabel}`,
        lossTooltip: `${route.region} ${route.carrierLabel}`,
        state: 'unmonitored' as const,
      })),
      latencyTooltip: `${route.region} ${route.carrierLabel}`,
      lossTooltip: `${route.region} ${route.carrierLabel}`,
    })
  }
  return rows
})

function routeFor(carrier: { carrier: string, region: string }, family: 'ipv4' | 'ipv6'): CarrierRouteDisplay | undefined {
  const region = carrier.region.trim().toLocaleLowerCase()
  const candidates = routeDisplays.value
    .filter(route => route.family === family && route.carrier === carrier.carrier)
  return candidates.find(route => region.split('/').map(item => item.trim()).includes(route.region.trim().toLocaleLowerCase()))
    ?? (!region ? candidates[0] : undefined)
}

const pingStateClass: Record<string, string> = {
  loading: 'text-muted-foreground',
  error: 'text-destructive',
  unmonitored: 'text-muted-foreground/70',
  empty: 'text-warning',
  ready: 'text-foreground',
}

const panelLabel = '三网延迟与回程监控'
const PREMIUM_ROUTE_PATTERN = /^(?:CN2GIA|CN2GT|CTGGIA|CMIN2|9929)(?:->|$)|^10099->/

function routeQualityClass(route: string): string {
  const normalized = route.trim().toUpperCase()
  if (PREMIUM_ROUTE_PATTERN.test(normalized) || normalized.includes('CMIN2->CMI')) {
    return 'border-amber-300/55 bg-gradient-to-br from-amber-100/90 via-yellow-50/80 to-orange-100/90 text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,.8),0_5px_14px_rgba(180,120,20,.2)] dark:border-amber-200/40 dark:from-amber-300/25 dark:via-yellow-200/15 dark:to-orange-300/20 dark:text-amber-100'
  }
  return 'border-current/15 bg-background/35'
}

function updateTracePanelPosition(): void {
  const anchor = traceAnchor.value
  if (!anchor || !traceRoute.value)
    return

  const anchorRect = anchor.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const edge = viewportWidth < 640 ? 8 : 16
  const gap = 10
  const width = Math.min(960, viewportWidth - edge * 2)
  const measuredHeight = tracePanel.value?.getBoundingClientRect().height ?? Math.min(560, viewportHeight - edge * 2)
  const left = Math.min(
    Math.max(edge, anchorRect.left + anchorRect.width / 2 - width / 2),
    viewportWidth - width - edge,
  )
  const roomBelow = viewportHeight - anchorRect.bottom - gap - edge
  const roomAbove = anchorRect.top - gap - edge
  const placeBelow = roomBelow >= Math.min(measuredHeight, 320) || roomBelow >= roomAbove
  const top = placeBelow
    ? Math.max(edge, anchorRect.bottom + gap)
    : Math.max(edge, anchorRect.top - gap - measuredHeight)
  const maxHeight = Math.max(220, placeBelow
    ? viewportHeight - top - edge
    : anchorRect.top - gap - edge)

  tracePanelStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
  }
}

async function openTrace(route: CarrierRouteDisplay, event: MouseEvent): Promise<void> {
  traceRoute.value = route
  traceAnchor.value = event.currentTarget as HTMLElement
  await nextTick()
  updateTracePanelPosition()
  await nextTick()
  updateTracePanelPosition()
}

function closeTrace(): void {
  traceRoute.value = null
  traceAnchor.value = null
}

onMounted(() => {
  window.addEventListener('resize', updateTracePanelPosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateTracePanelPosition)
})
</script>

<template>
  <section
    data-node-network-probe
    class="network-probe-summary relative flex h-[40rem] flex-col overflow-hidden rounded-md border border-border/50 bg-background/25"
    :class="!props.node.online ? 'blur-xs opacity-50' : ''"
    :title="appStore.carrierDisplayRegion || undefined"
    :aria-label="`${props.node.name} ${panelLabel}`"
    @click.stop
  >
    <header class="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-muted/15 px-3 text-xs leading-none">
      <span class="flex min-w-0 items-center gap-2 font-semibold text-muted-foreground">
        <Icon icon="tabler:activity-heartbeat" width="15" height="15" class="shrink-0" />
        <span class="whitespace-nowrap">三网监控</span>
        <span v-if="appStore.carrierDisplayRegion" class="min-w-0 rounded bg-muted/50 px-1.5 py-1 text-[10px] font-normal leading-none">{{ appStore.carrierDisplayRegion }}</span>
      </span>
      <span class="shrink-0 text-[10px] font-medium text-muted-foreground/70">延迟 + 回程</span>
    </header>

    <div data-node-carrier-route class="min-h-0 flex-1 overflow-hidden">
      <div data-node-carrier-latency class="flex h-full min-h-0 flex-col">
        <div class="flex h-8 shrink-0 items-center justify-between gap-2 px-3 text-[11px] font-semibold text-muted-foreground">
          <span class="flex items-center gap-1.5"><Icon icon="tabler:activity-heartbeat" width="14" height="14" />延迟、丢包与回程</span>
          <button type="button" class="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" :aria-label="`${props.node.name} 打开 Ping 详情`" @click.stop="emit('pingClick')">
            详情 <Icon icon="tabler:chevron-right" width="12" height="12" />
          </button>
        </div>
        <div
          role="button"
          tabindex="0"
          class="block min-h-0 w-full flex-1 overflow-y-auto px-3 pb-2 text-left"
          :aria-label="`${props.node.name} 打开 Ping 详情`"
          @click.stop="emit('pingClick')"
          @keydown.enter.prevent.stop="emit('pingClick')"
          @keydown.space.prevent.stop="emit('pingClick')"
        >
          <div data-node-ping-bars="latency" class="flex min-h-[3.5rem] flex-col divide-y divide-border/35">
            <div v-if="displayRows.length === 0" class="flex min-h-14 items-center justify-center px-3 py-4 text-center text-xs text-muted-foreground">
              <div class="w-full">
                <div>暂无已配置的三网监控</div>
                <div data-node-ping-empty class="mx-auto mt-2 h-1 max-w-48 rounded bg-muted-foreground/10" />
              </div>
            </div>
            <div v-for="carrier in displayRows" :key="carrier.key" :data-carrier-ping="carrier.carrier" class="grid grid-cols-1" :title="carrier.region ? `${carrier.region}${carrier.label}` : carrier.latencyTooltip">
              <div v-for="family in carrier.families" :key="`${carrier.key}-${family.family}`" :data-service-row="`${carrier.region}-${carrier.label}-${family.family}`" :data-node-ping-family="family.family" class="grid min-h-0 min-w-0 grid-cols-1 items-center gap-2.5 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(9rem,0.9fr)] sm:gap-3" :title="family.latencyTooltip">
                <span class="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight text-muted-foreground">
                  <span class="size-2 shrink-0 rounded-full" :class="carrier.dotClass" />
                  <span class="min-w-0 break-words">{{ carrier.region ? `${carrier.region} ${carrier.label}` : carrier.label }}<span class="mt-1 block text-[10px] font-medium text-muted-foreground/70">{{ family.label }}</span></span>
                </span>
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center justify-between gap-2 text-[10px] leading-tight text-muted-foreground/80">
                    <span class="shrink-0 font-semibold">延迟 / 丢包</span>
                    <span class="min-w-0 text-right tabular-nums font-semibold whitespace-nowrap" :class="pingStateClass[family.state]">
                      <template v-if="family.state === 'ready'">{{ family.latencyDisplay }}<span class="mx-0.5 opacity-40">/</span>{{ family.lossDisplay }}</template>
                      <template v-else>{{ family.latencyDisplay }}</template>
                    </span>
                  </div>
                  <div class="mt-1.5 grid h-1.5 gap-px opacity-80" :style="{ gridTemplateColumns: `repeat(${family.latencyBars.length}, minmax(0, 1fr))` }">
                    <DataTooltip v-for="bar in family.latencyBars" :key="bar.key" placement="top" :content="bar.tooltip" class="h-full w-full">
                      <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
                    </DataTooltip>
                  </div>
                  <div :data-node-ping-loss-bars="family.family" class="mt-1 grid h-1 gap-px opacity-50" :style="{ gridTemplateColumns: `repeat(${family.lossBars.length}, minmax(0, 1fr))` }">
                    <span v-for="bar in family.lossBars" :key="bar.key" class="block h-full w-full rounded-[1px]" :class="bar.className" :title="bar.tooltip" />
                  </div>
                </div>
                <div :data-carrier-route-family="family.family" class="min-w-0">
                  <button v-if="routeFor(carrier, family.family)" type="button" :data-carrier-route="routeFor(carrier, family.family)?.key" class="grid min-h-14 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-left text-[10px] leading-tight transition-colors hover:bg-muted/45" :title="routeFor(carrier, family.family)?.tooltip" @click.stop="openTrace(routeFor(carrier, family.family)!, $event)">
                    <span class="shrink-0 text-[10px] font-medium text-muted-foreground/70">回程线路</span>
                    <span data-carrier-route-label class="flex min-h-7 min-w-0 items-center break-all rounded border px-2 font-bold" :class="[routeQualityClass(routeFor(carrier, family.family)?.route || '-'), routeFor(carrier, family.family)?.monitored && (routeFor(carrier, family.family)?.status === '正常' || routeFor(carrier, family.family)?.status === 'OK') ? 'text-success' : routeFor(carrier, family.family)?.monitored ? 'text-warning' : 'text-muted-foreground/60']">{{ routeFor(carrier, family.family)?.route }}</span>
                  </button>
                  <span v-else class="mt-1 block truncate text-[9px] text-muted-foreground/50">回程未开启</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="traceRoute" data-carrier-trace-overlay class="fixed inset-0 z-[100] bg-black/25 backdrop-blur-[1px]" @click.stop="closeTrace">
        <div ref="tracePanel" data-carrier-trace-panel class="fixed flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-background p-4 shadow-2xl sm:p-5" :style="tracePanelStyle" @click.stop>
          <div class="mb-4 flex items-start justify-between gap-4 text-sm font-semibold sm:text-base">
            <span class="min-w-0 break-words">{{ traceRoute.familyLabel }} · {{ traceRoute.region }} · {{ traceRoute.carrierLabel }} · {{ traceRoute.route }}</span><button type="button" class="min-h-9 shrink-0 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted" @click="closeTrace">
              关闭
            </button>
          </div>
          <div v-if="traceRoute.trace.length" class="min-h-0 flex-1 overflow-y-auto text-xs sm:text-sm">
            <div class="mb-2 grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(5rem,auto)_minmax(5rem,auto)_minmax(4rem,auto)] gap-2 px-2 text-[10px] font-medium text-muted-foreground sm:text-xs">
              <span>#</span><span>地址（已脱敏）</span><span>线路</span><span>ASN</span><span>RTT</span>
            </div>
            <div v-for="hop in traceRoute.trace" :key="hop.hop" data-carrier-trace-hop class="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(5rem,auto)_minmax(5rem,auto)_minmax(4rem,auto)] items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2">
              <span class="tabular-nums text-muted-foreground">{{ hop.hop }}</span><span class="break-all font-mono">{{ hop.timed_out ? '*' : hop.address || '*' }}</span><span class="text-muted-foreground">{{ hop.network || '-' }}</span><span class="text-muted-foreground">{{ hop.asn || '-' }}</span><span class="tabular-nums text-muted-foreground">{{ typeof hop.rtt_ms === 'number' ? `${Math.round(hop.rtt_ms)} ms` : '-' }}</span>
            </div>
          </div>
          <div v-else class="py-5 text-center text-[9px] text-muted-foreground">
            暂无可显示的 Trace
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
