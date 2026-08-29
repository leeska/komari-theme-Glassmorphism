import type { CarrierRouteCarrier, CarrierRouteFamily, CarrierRouteResult } from '@/utils/rpc'
import { requestManager } from '@/services/request.service'
import { getSharedRpc, RpcError } from '@/utils/rpc'

const FAMILY_VALUE_SANITIZE_REGEX = /[^a-z0-9]/g
const TELECOM_CARRIER_REGEX = /电信|telecom|ctcc|chinanet|cn2/i
const UNICOM_CARRIER_REGEX = /联通|unicom|cucc|4837|9929/i
const MOBILE_CARRIER_REGEX = /移动|mobile|cmcc|cmi/i

export interface CarrierRouteQuery {
  uuid: string
  families?: CarrierRouteFamily[]
  region?: string
  maxAgeSeconds?: number
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
  return {
    node_uuid: typeof item.node_uuid === 'string' ? item.node_uuid : uuid,
    family,
    carrier,
    region: typeof item.region === 'string' ? item.region : undefined,
    target: typeof item.target === 'string' ? item.target : typeof item.host === 'string' ? item.host : undefined,
    route: typeof item.route === 'string' ? item.route : typeof item.label === 'string' ? item.label : undefined,
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

export async function loadCarrierRouteStats(query: CarrierRouteQuery): Promise<CarrierRouteResult[]> {
  const uuid = query.uuid.trim()
  if (!uuid)
    return []
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
        : typeof nestedPayload?.checked_at === 'string' ? nestedPayload.checked_at : new Date().toISOString()
      const rawResults = Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(nestedPayload?.results)
          ? nestedPayload.results
          : Array.isArray(payload.data) ? payload.data : Array.isArray(response) ? response : []
      return rawResults
        .map(item => normalizeResult(item, checkedAt, uuid))
        .filter((item): item is CarrierRouteResult => Boolean(item))
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
