<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import NetworkProbeSummary from '@/components/NetworkProbeSummary.vue'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, getStatus, getUptimeDays } from '@/utils/helper'
import { getDiskPercentage, getMemoryPercentage, getTrafficUsed, getTrafficUsedPercentage, hasTrafficLimit } from '@/utils/nodeMetricsHelper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatCurrencyValue, formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getRemainingValue, isFreePrice, parseTags } from '@/utils/tagHelper'

const props = withDefaults(defineProps<{
  node: NodeData
  reduceMotion?: boolean
  pingEnabled?: boolean
}>(), {
  reduceMotion: false,
  pingEnabled: true,
})
const emit = defineEmits<{
  click: []
  pingClick: []
}>()
const appStore = useAppStore()
const isFavorite = computed(() => appStore.isFavoriteNode(props.node.uuid))

function toggleFavorite(): void {
  appStore.toggleFavoriteNode(props.node.uuid)
}

function handleKeyboardOpen(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  emit('click')
}

interface RemainingInfoTag {
  icon: string
  text?: string
  prefix?: string
  value?: string
  unit?: string
  className?: string
}

const NODE_METRIC_ICONS = {
  cpu: 'tabler:cpu',
  memory: 'icon-park-outline:memory',
  disk: 'tabler:server-2',
  traffic: 'tabler:arrows-transfer-up-down',
} as const

const nodeCardXSize = 'medium'
const nodeCardContentPaddingClass = 'p-0'
const nodeCardMetricBoxClass = 'px-3 py-2.5'

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => getMemoryPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))
const swapTooltip = computed(() => {
  const used = formatBytes(Math.max(0, props.node.swap ?? 0))
  const total = Math.max(0, props.node.swap_total ?? 0)
  return total > 0 ? `Swap 已用 ${used} / 总计 ${formatBytes(total)}` : `Swap 已用 ${used}`
})
const diskPercentage = computed(() => getDiskPercentage(props.node))
const diskStatus = computed(() => getStatus(diskPercentage.value))

const trafficUsedPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))
const nodeMessage = computed(() => props.node.message?.trim() ?? '')
const nodeMessageTooltip = computed(() => {
  const message = nodeMessage.value
  if (!message)
    return ''
  const updatedAt = props.node.status_updated_at ? `\n更新时间：${formatDateTime(props.node.status_updated_at)}` : ''
  return `${message}${updatedAt}`
})

// 流量状态颜色
const trafficStatus = computed(() => {
  if (!hasTrafficLimit(props.node))
    return 'success'
  if (trafficUsedPercentage.value >= 95)
    return 'error'
  if (trafficUsedPercentage.value >= 80)
    return 'warning'
  if (trafficUsedPercentage.value >= 60)
    return 'info'
  return 'success'
})

const trafficPercentageClass = computed(() => {
  if (!hasTrafficLimit(props.node))
    return 'text-muted-foreground'
  if (trafficUsedPercentage.value >= 95)
    return 'text-destructive'
  if (trafficUsedPercentage.value >= 80)
    return 'text-warning'
  if (trafficUsedPercentage.value >= 60)
    return 'text-warning'
  return 'text-success'
})

// 是否显示金额：未登录且开启「未登录隐藏价格」时不显示价格 / 剩余价值，
// 但在线天数、剩余天数等非金额信息仍然展示
const showPrice = computed(() => appStore.privateFeaturesAllowed || !appStore.hidePriceWhenLoggedOut)

const uptimeDaysText = computed(() => {
  const days = getUptimeDays(props.node.uptime)
  return appStore.lang === 'zh-CN' ? `在线 ${days} 天` : `${days} days online`
})

const priceText = computed(() => {
  const node = props.node
  if (node.price === 0 || !showPrice.value)
    return ''
  return formatPriceWithCycle(node.price, node.billing_cycle, node.currency, appStore.lang)
})

// 第三列：剩余天数（始终） + 剩余价值（仅在允许显示金额时），带图标与相邻列对齐
const remainingInfoTags = computed<RemainingInfoTag[]>(() => {
  const node = props.node
  if (node.price === 0)
    return []
  const lang = appStore.lang
  const days = getDaysUntilExpired(node.expired_at)
  const status = getExpireStatus(node.expired_at)
  const items: RemainingInfoTag[] = []
  const expiryClass = status === 'expired' || status === 'critical'
    ? 'text-destructive'
    : status === 'warning' ? 'text-warning' : 'text-muted-foreground'

  if (status === 'unknown') {
    items.push({ icon: 'tabler:calendar-stats', text: '-', className: expiryClass })
  }
  else if (status === 'expired') {
    items.push({ icon: 'tabler:calendar-stats', text: lang === 'zh-CN' ? '已过期' : 'Expired', className: expiryClass })
  }
  else if (status === 'long_term') {
    items.push({ icon: 'tabler:calendar-stats', text: lang === 'zh-CN' ? '长期' : 'Long-term', className: expiryClass })
  }
  else if (lang === 'zh-CN') {
    items.push({ icon: 'tabler:calendar-stats', prefix: '剩余', value: String(days), unit: '天', className: expiryClass })
  }
  else {
    items.push({ icon: 'tabler:calendar-stats', prefix: 'left', value: String(days), unit: 'days', className: expiryClass })
  }

  if (showPrice.value) {
    const text = isFreePrice(node.price)
      ? lang === 'zh-CN' ? '无' : 'N/A'
      : formatCurrencyValue(getRemainingValue(node.price, node.billing_cycle, node.expired_at), node.currency)
    items.push({ icon: 'tabler:coins', text })
  }
  return items
})

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

function getRegionAltText(region: string): string {
  return getRegionDisplayName(region) || getRegionCode(region)
}

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}
</script>

<template>
  <CardX
    hoverable
    :size="nodeCardXSize"
    :content-class="nodeCardContentPaddingClass"
    class="node-card w-full cursor-pointer border-none shadow-[0_0_0_3px] shadow-transparent transition-all duration-200 rounded-xl"
    :class="[!props.node.online && '!shadow-destructive/30']"
    role="button"
    tabindex="0"
    :aria-label="`查看节点 ${props.node.name} 详情`"
    @click="emit('click')"
    @keydown="handleKeyboardOpen"
  >
    <template #default>
      <div class="node-card-layout relative min-w-0">
        <!-- Identity column: stable width keeps the resource and probe columns aligned. -->
        <section class="node-card-identity flex min-w-0 flex-col gap-3 border-b border-border/50 p-4 lg:border-b-0 lg:border-r">
          <div class="flex items-start gap-3">
            <div class="relative mt-1 size-3 shrink-0">
              <span
                class="block size-3 rounded-full"
                :class="props.node.online ? 'bg-success' : 'bg-destructive'"
              />
              <span
                v-if="!props.reduceMotion"
                class="absolute inset-0 animate-ping rounded-full opacity-60"
                :class="props.node.online ? 'bg-success' : 'bg-destructive'"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-start gap-2">
                <h2 class="min-w-0 flex-1 break-words text-base font-bold leading-tight">
                  {{ props.node.name }}
                </h2>
                <DataTooltip
                  v-if="nodeMessage"
                  :content="nodeMessageTooltip"
                  placement="top"
                  as="span"
                  class="inline-flex shrink-0 text-amber-500"
                  content-class="w-56 whitespace-pre-line leading-snug text-left"
                >
                  <Icon icon="tabler:alert-triangle-filled" width="16" height="16" aria-label="节点消息" />
                </DataTooltip>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span class="inline-flex items-center gap-1">
                  <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
                  {{ getOSName(props.node.os) }}
                </span>
                <span v-if="hasRegion(props.node.region)" class="inline-flex min-w-0 items-center gap-1">
                  <img
                    :src="`/images/flags/${getRegionCode(props.node.region)}.svg`"
                    :alt="getRegionAltText(props.node.region)"
                    class="size-4 shrink-0"
                  >
                  <span class="break-words">{{ getRegionAltText(props.node.region) }}</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-500/10 hover:text-amber-500"
              :class="isFavorite && 'text-amber-500'"
              :aria-label="isFavorite ? `取消收藏 ${props.node.name}` : `收藏 ${props.node.name}`"
              :title="isFavorite ? '取消收藏' : '收藏节点'"
              @click.stop="toggleFavorite"
              @keydown.stop
            >
              <Icon :icon="isFavorite ? 'tabler:star-filled' : 'tabler:star'" width="18" height="18" />
            </button>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <span class="rounded-full bg-slate-500/10 px-2.5 py-1 text-xs text-muted-foreground">{{ uptimeDaysText }}</span>
            <span v-if="priceText" class="rounded-full bg-slate-500/10 px-2.5 py-1 text-xs text-muted-foreground">{{ priceText }}</span>
          </div>

          <div v-if="customTags.length" class="flex flex-wrap gap-1.5">
            <Badge
              v-for="(tag, i) in customTags" :key="i"
              variant="outline"
              class="!text-xs rounded-full text-muted-foreground border-muted-foreground/15 px-2.5 py-0.5"
            >
              {{ tag }}
            </Badge>
          </div>

          <div class="mt-auto space-y-1 text-xs text-muted-foreground">
            <div class="flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1"><Icon icon="tabler:upload" width="13" height="13" class="text-success" />上传</span>
              <span class="truncate tabular-nums">{{ formatBytesPerSecond(props.node.net_out ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1"><Icon icon="tabler:download" width="13" height="13" class="text-blue-600" />下载</span>
              <span class="truncate tabular-nums">{{ formatBytesPerSecond(props.node.net_in ?? 0) }}</span>
            </div>
          </div>
        </section>

        <!-- Resource column: the four primary health signals share one visual rhythm. -->
        <section class="node-card-resources min-w-0 p-4">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">
              资源状态
            </h3>
            <span class="text-[11px] text-muted-foreground">实时</span>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <!-- CPU -->
            <div class="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-500/5 p-3">
              <div class="flex justify-between text-xs">
                <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span role="img" aria-label="CPU" class="inline-flex shrink-0"><Icon :icon="NODE_METRIC_ICONS.cpu" data-node-metric-icon="cpu" width="13" height="13" class="text-sky-500" aria-hidden="true" /></span>
                  <span class="truncate">CPU</span>
                </span>
                <span class="tabular-nums font-medium">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" />
              <div class="truncate text-[11px] text-muted-foreground">
                {{ (props.node.load ?? 0).toFixed(2) }}, {{ (props.node.load5 ?? 0).toFixed(2) }}, {{ (props.node.load15 ?? 0).toFixed(2) }}
              </div>
            </div>

            <!-- 内存 -->
            <div class="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-500/5 p-3" :title="swapTooltip">
              <div class="flex justify-between text-xs">
                <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span role="img" aria-label="内存" class="inline-flex shrink-0"><Icon :icon="NODE_METRIC_ICONS.memory" data-node-metric-icon="memory" width="13" height="13" class="text-emerald-500" aria-hidden="true" /></span>
                  <span class="truncate">内存</span>
                </span>
                <span class="tabular-nums font-medium">{{ memPercentage.toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
              <div class="truncate text-[11px] text-muted-foreground">
                {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
              </div>
            </div>

            <!-- 硬盘 -->
            <div class="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-500/5 p-3">
              <div class="flex justify-between text-xs">
                <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span role="img" aria-label="硬盘" class="inline-flex shrink-0"><Icon :icon="NODE_METRIC_ICONS.disk" data-node-metric-icon="disk" width="13" height="13" class="text-orange-500" aria-hidden="true" /></span>
                  <span class="truncate">硬盘</span>
                </span>
                <span class="tabular-nums font-medium">{{ diskPercentage.toFixed(1) }}%</span>
              </div>
              <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" />
              <div class="truncate text-[11px] text-muted-foreground">
                {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
              </div>
            </div>

            <!-- 流量（分级颜色） -->
            <div class="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-500/5 p-3">
              <div class="flex justify-between text-xs">
                <span class="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span role="img" aria-label="流量" class="inline-flex shrink-0"><Icon :icon="NODE_METRIC_ICONS.traffic" data-node-metric-icon="traffic" width="13" height="13" class="text-violet-500" aria-hidden="true" /></span>
                  <span class="truncate">流量</span>
                </span>
                <span class="tabular-nums font-medium" :class="trafficPercentageClass">
                  {{ hasTrafficLimit(props.node) ? `${trafficUsedPercentage.toFixed(1)}%` : '∞' }}
                </span>
              </div>
              <ProgressThin :percentage="trafficUsedPercentage" :status="trafficStatus" :height="4" />
              <div class="truncate text-[11px]" :class="trafficUsedPercentage >= 95 ? 'text-destructive' : 'text-muted-foreground'">
                {{ formatBytes(trafficUsed) }}
                <template v-if="hasTrafficLimit(props.node)">
                  / {{ formatBytes(props.node.traffic_limit) }}
                </template>
                <template v-else>
                  / ∞
                </template>
              </div>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <!-- 总流量 -->
            <div class="flex min-w-0 flex-col gap-1 rounded-lg bg-slate-500/5" :class="nodeCardMetricBoxClass">
              <div class="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon icon="tabler:upload" width="11" height="11" />
                <span class="truncate min-w-0">总上传 {{ formatBytes(props.node.net_total_up ?? 0) }}</span>
              </div>
              <div class="text-[11px] text-muted-foreground flex items-center gap-1">
                <Icon icon="tabler:download" width="11" height="11" />
                <span class="truncate min-w-0">总下载 {{ formatBytes(props.node.net_total_down ?? 0) }}</span>
              </div>
            </div>

            <!-- 第三列：有价格显示剩余天数+价格，否则显示负载 -->
            <div class="flex min-w-0 flex-col gap-1 rounded-lg bg-slate-500/5" :class="nodeCardMetricBoxClass">
              <template v-if="remainingInfoTags.length">
                <div
                  v-for="(item, i) in remainingInfoTags" :key="i"
                  class="flex items-center gap-0.5 text-[11px]"
                  :class="item.className ?? 'text-muted-foreground'"
                >
                  <Icon :icon="item.icon" width="11" height="11" class="shrink-0" />
                  <span v-if="item.text" class="truncate min-w-0">{{ item.text }}</span>
                  <template v-else>
                    <span v-if="item.prefix" class="shrink-0">{{ item.prefix }}</span>
                    <span v-if="item.value" class="shrink-0 tabular-nums">{{ item.value }}</span>
                    <span v-if="item.unit" class="shrink-0">{{ item.unit }}</span>
                  </template>
                </div>
              </template>
              <template v-else>
                <div class="truncate text-[11px] text-muted-foreground">
                  {{ (props.node.load ?? 0).toFixed(2) }}
                </div>
                <div class="truncate text-[11px] text-muted-foreground">
                  {{ (props.node.load5 ?? 0).toFixed(2) }} / {{ (props.node.load15 ?? 0).toFixed(2) }}
                </div>
              </template>
            </div>
          </div>
        </section>

        <!-- 统一探测摘要：延迟、丢包与回程线路同屏展示，避免来回切换。 -->
        <section class="node-card-probes min-w-0 border-t border-border/50 lg:border-l lg:border-t-0">
          <NetworkProbeSummary
            v-if="props.pingEnabled"
            :node="props.node"
            :ping-enabled="props.pingEnabled"
            @ping-click="emit('pingClick')"
          />
        </section>

        <!-- 离线遮罩 -->
        <div
          v-if="!props.node.online"
          class="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-xl bg-white/20 dark:bg-black/20 backdrop-blur-[2px]"
        >
          <div class="text-sm font-semibold text-destructive">
            离线
          </div>
          <div class="text-[11px] text-muted-foreground mt-1">
            {{ offlineTime }}
          </div>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
}

.node-card-layout {
  display: grid;
  grid-template-columns: 1fr;
}

@media (min-width: 1200px) {
  .node-card-layout {
    grid-template-columns: minmax(15rem, 0.8fr) minmax(22rem, 1.15fr) minmax(32rem, 2fr);
  }
}

.node-card-probes :deep(.network-probe-summary) {
  height: 40rem;
  min-height: 40rem;
  border: 0;
  border-radius: 0;
  background: transparent;
}

@media (max-width: 1199px) {
  .node-card-probes :deep(.network-probe-summary) {
    height: 40rem;
    min-height: 40rem;
  }
}
</style>
