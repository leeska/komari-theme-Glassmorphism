import type { CarrierRouteCarrier, CarrierRouteFamily, CarrierRouteResult, CarrierRouteSelection, CarrierRouteTraceHop } from '@/utils/rpc'
import { requestManager } from '@/services/request.service'
import { getSharedRpc, RpcError } from '@/utils/rpc'

const FAMILY_VALUE_SANITIZE_REGEX = /[^a-z0-9]/g
const TELECOM_CARRIER_REGEX = /电信|telecom|ctcc|chinanet|cn2/i
const UNICOM_CARRIER_REGEX = /联通|unicom|cucc|4837|9929/i
const MOBILE_CARRIER_REGEX = /移动|mobile|cmcc|cmi/i
const INTERNATIONAL_CARRIER_REGEX = /international|国际|bgp|leaseweb|linode/i

export interface CarrierRouteQuery {
  uuid: string
  families?: CarrierRouteFamily[]
  region?: string
  maxAgeSeconds?: number
}

export interface CarrierRouteStatsSnapshot {
  results: CarrierRouteResult[]
  checkedAt: string
  intervalSeconds?: number
  enabled?: boolean
  selections: CarrierRouteSelection[]
  selectionsKnown: boolean
  sourceVersion?: string
}

function normalizeFamily(value: unknown): CarrierRouteFamily | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(FAMILY_VALUE_SANITIZE_REGEX, '')
  if (normalized === '4' || normalized === 'v4' || normalized === 'ipv4' || normalized === 'tcp4')
    return 'ipv4'
  if (normalized === '6' || normalized === 'v6' || normalized === 'ipv6' || normalized === 'tcp6')
    return 'ipv6'
  return null
}

function normalizeCarrier(value: unknown): CarrierRouteCarrier | string {
  const text = String(value ?? '').trim()
  if (TELECOM_CARRIER_REGEX.test(text))
    return 'telecom'
  if (UNICOM_CARRIER_REGEX.test(text))
    return 'unicom'
  if (MOBILE_CARRIER_REGEX.test(text))
    return 'mobile'
  if (INTERNATIONAL_CARRIER_REGEX.test(text))
    return 'international'
  return text || 'unknown'
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStatus(value: unknown): string {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'ok' || status === 'success' || status === 'available')
    return 'ok'
  if (status === 'timeout' || status === 'timed_out')
    return 'timeout'
  if (status === 'unsupported' || status === 'not_supported')
    return 'unsupported'
  return status || 'failed'
}

function normalizeResult(raw: unknown, fallbackCheckedAt: string, uuid: string): CarrierRouteResult | null {
  if (!raw || typeof raw !== 'object')
    return null
  const item = raw as Record<string, unknown>
  const family = normalizeFamily(item.family ?? item.ip_version ?? item.ipVersion ?? item.protocol)
  const checkedAt = typeof item.checked_at === 'string' ? item.checked_at : fallbackCheckedAt
  if (!family || !checkedAt)
    return null
  const carrier = normalizeCarrier(item.carrier ?? item.isp ?? item.operator ?? item.network)
  const latency = finiteOrNull(item.latency_ms ?? item.latency ?? item.avg_latency)
  const loss = finiteOrNull(item.loss_percent ?? item.loss ?? item.packet_loss)
  const routePath = Array.isArray(item.route_path)
    ? item.route_path.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim())
    : undefined
  const trace = Array.isArray(item.trace)
    ? item.trace.map((hop): CarrierRouteTraceHop | null => {
        if (!hop || typeof hop !== 'object')
          return null
        const value = hop as Record<string, unknown>
        const number = typeof value.hop === 'number' && Number.isFinite(value.hop) ? value.hop : 0
        if (!number)
          return null
        return {
          hop: number,
          address: typeof value.address === 'string' ? value.address : undefined,
          asn: typeof value.asn === 'string' ? value.asn : undefined,
          network: typeof value.network === 'string' ? value.network : undefined,
          rtt_ms: finiteOrNull(value.rtt_ms),
          timed_out: value.timed_out === true,
        }
      }).filter((value): value is CarrierRouteTraceHop => Boolean(value))
    : undefined
  return {
    node_uuid: typeof item.node_uuid === 'string' ? item.node_uuid : uuid,
    target_id: typeof item.target_id === 'string' ? item.target_id : undefined,
    family,
    carrier,
    region: typeof item.region === 'string' ? item.region : undefined,
    target: typeof item.target === 'string' ? item.target : typeof item.host === 'string' ? item.host : undefined,
    route: typeof item.route === 'string' ? item.route : typeof item.label === 'string' ? item.label : undefined,
    route_path: routePath,
    trace,
    status: normalizeStatus(item.status),
    latency_ms: latency,
    loss_percent: loss,
    sent: typeof item.sent === 'number' && Number.isFinite(item.sent) ? item.sent : undefined,
    received: typeof item.received === 'number' && Number.isFinite(item.received) ? item.received : undefined,
    checked_at: checkedAt,
    error: typeof item.error === 'string' ? item.error : undefined,
  }
}

function getRequestKey(query: CarrierRouteQuery): string {
  const families = [...new Set(query.families ?? [])].sort().join(',') || 'all'
  return `carrier-route:${query.uuid}:${families}:${query.region?.trim() || 'all'}:${query.maxAgeSeconds ?? 'all'}`
}

function shouldRetry(error: unknown): boolean {
  return !(error instanceof RpcError && [401, 403, -32601].includes(error.code))
}

export async function loadCarrierRouteStats(query: CarrierRouteQuery): Promise<CarrierRouteStatsSnapshot> {
  const uuid = query.uuid.trim()
  if (!uuid)
    return { results: [], checkedAt: '', selections: [], selectionsKnown: false }
  const families = [...new Set(query.families ?? [])]
  const region = query.region?.trim() || undefined
  const maxAgeSeconds = typeof query.maxAgeSeconds === 'number' && Number.isFinite(query.maxAgeSeconds)
    ? Math.max(0, Math.floor(query.maxAgeSeconds))
    : undefined
  return requestManager.run(
    getRequestKey({ uuid, families, region, maxAgeSeconds }),
    async (signal) => {
      const response = await getSharedRpc().getPublicCarrierRouteStats({ uuid, families: families.length ? families : undefined, region, max_age_seconds: maxAgeSeconds }, signal)
      const payload = response as unknown as Record<string, unknown>
      const nestedPayload = payload.data && typeof payload.data === 'object'
        ? payload.data as Record<string, unknown>
        : null
      const checkedAt = typeof payload.checked_at === 'string'
        ? payload.checked_at
        : typeof nestedPayload?.checked_at === 'string' ? nestedPayload.checked_at : ''
      const rawResults = Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(nestedPayload?.results)
          ? nestedPayload.results
          : Array.isArray(payload.data) ? payload.data : Array.isArray(response) ? response : []
      const results = rawResults
        .map(item => normalizeResult(item, checkedAt, uuid))
        .filter((item): item is CarrierRouteResult => Boolean(item))
      const rawSelections = Array.isArray(payload.selections)
        ? payload.selections
        : Array.isArray(nestedPayload?.selections) ? nestedPayload.selections : undefined
      const selections = (rawSelections ?? [])
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => {
          const selection = item as Record<string, unknown>
          const family = normalizeFamily(selection.family ?? selection.ip_version ?? selection.ipVersion)
          const carrier = normalizeCarrier(selection.carrier ?? selection.isp ?? selection.operator)
          const region = typeof selection.region === 'string' ? selection.region.trim() : ''
          const taskId = typeof selection.task_id === 'string' ? selection.task_id.trim() : undefined
          const taskName = typeof selection.task_name === 'string' ? selection.task_name.trim() : undefined
          if (!family || !carrier || !region)
            return null
          const normalized: CarrierRouteSelection = { region, carrier, family }
          if (taskId)
            normalized.task_id = taskId
          if (taskName)
            normalized.task_name = taskName
          return normalized
        })
        .filter((item): item is CarrierRouteSelection => Boolean(item))
      return {
        results,
        checkedAt,
        intervalSeconds: finiteOrNull(payload.interval_seconds ?? nestedPayload?.interval_seconds) ?? undefined,
        enabled: typeof payload.enabled === 'boolean'
          ? payload.enabled
          : typeof nestedPayload?.enabled === 'boolean' ? nestedPayload.enabled : undefined,
        selections,
        selectionsKnown: Array.isArray(payload.selections) || Array.isArray(nestedPayload?.selections),
        sourceVersion: typeof payload.source_version === 'string'
          ? payload.source_version
          : typeof nestedPayload?.source_version === 'string' ? nestedPayload.source_version : undefined,
      }
    },
    { shouldRetry },
  )
}

export function getCarrierRouteStatsRequestKey(query: CarrierRouteQuery): string {
  return getRequestKey(query)
}

export function abortCarrierRouteStats(query: CarrierRouteQuery): void {
  requestManager.abort(getRequestKey(query))
}
