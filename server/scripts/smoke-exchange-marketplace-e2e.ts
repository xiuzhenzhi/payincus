type JsonObject = Record<string, unknown>

interface FetchResult {
  response: Response
  data: JsonObject
  text: string
}

const apiBaseUrl = trimSlash(
  process.env.SMOKE_API_BASE_URL ||
    process.env.SMOKE_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    process.env.BACKEND_URL ||
    'http://127.0.0.1:3001'
)

const allowDestructive = process.env.SMOKE_EXCHANGE_ALLOW_DESTRUCTIVE === '1'
const allowStopForListing = process.env.SMOKE_EXCHANGE_ALLOW_STOP_FOR_LISTING === '1'
const allowPurchase = process.env.SMOKE_EXCHANGE_ALLOW_PURCHASE === '1'
const waitDelivery = process.env.SMOKE_EXCHANGE_WAIT_DELIVERY === '1'
const cleanupListing = process.env.SMOKE_EXCHANGE_CLEANUP_LISTING === '1'
const expectVerificationGate = process.env.SMOKE_EXCHANGE_EXPECT_VERIFICATION_GATE === '1'
const sellerInstanceId = optionalPositiveInt(process.env.SMOKE_EXCHANGE_SELLER_INSTANCE_ID)
const listingPrice = Number(process.env.SMOKE_EXCHANGE_LISTING_PRICE || '1')
const pollTimeoutMs = optionalPositiveInt(process.env.SMOKE_EXCHANGE_POLL_TIMEOUT_MS) || 10 * 60 * 1000
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function optionalPositiveInt(value: string | undefined): number | null {
  if (!value) return null
  if (!/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function requirePositiveInt(value: number | null, label: string): number {
  if (!value) throw new Error(`${label} is required and must be a positive integer`)
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function idempotencyKey(scope: string): string {
  return `exchange-smoke:${scope}:${runId}`
}

async function fetchJson(path: string, options: RequestInit = {}): Promise<FetchResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'payincus-exchange-marketplace-smoke/1.0',
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  let data: JsonObject = {}
  try {
    data = text ? JSON.parse(text) as JsonObject : {}
  } catch {
    data = {}
  }
  return { response, data, text }
}

async function postJson(path: string, body: unknown, token?: string | null, headers: Record<string, string> = {}): Promise<FetchResult> {
  return fetchJson(path, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      ...headers
    },
    body: JSON.stringify(body)
  })
}

async function getJson(path: string, token?: string | null): Promise<FetchResult> {
  return fetchJson(path, {
    method: 'GET',
    headers: authHeaders(token)
  })
}

async function deleteJson(path: string, token?: string | null): Promise<FetchResult> {
  return fetchJson(path, {
    method: 'DELETE',
    headers: authHeaders(token)
  })
}

async function login(prefix: 'SELLER' | 'BUYER'): Promise<string | null> {
  const directToken = process.env[`SMOKE_EXCHANGE_${prefix}_TOKEN`]
  if (directToken) return directToken

  const username = process.env[`SMOKE_EXCHANGE_${prefix}_USERNAME`]
  const password = process.env[`SMOKE_EXCHANGE_${prefix}_PASSWORD`]
  if (!username || !password) return null

  const body: JsonObject = { username, password }
  if (process.env.SMOKE_TURNSTILE_TOKEN) {
    body.turnstileToken = process.env.SMOKE_TURNSTILE_TOKEN
  }
  const result = await postJson('/api/auth/login', body)
  assert(result.response.status === 200, `${prefix} login failed: ${result.response.status} ${result.text}`)
  assert(typeof result.data.token === 'string' && result.data.token, `${prefix} login response must include token`)
  return result.data.token as string
}

function assertNoIdentityLeak(value: unknown, label: string): void {
  const forbidden = new Set([
    'sellerUserId',
    'buyerUserId',
    'creatorUserId',
    'userId',
    'user_id',
    'username',
    'nickname',
    'email',
    'contact',
    'phone',
    'registeredAt',
    'createdBy',
    'user'
  ])

  function walk(item: unknown, path: string): void {
    if (!item || typeof item !== 'object') return
    if (Array.isArray(item)) {
      item.forEach((entry, index) => walk(entry, `${path}[${index}]`))
      return
    }
    for (const [key, child] of Object.entries(item as JsonObject)) {
      assert(!forbidden.has(key), `${label} leaked identity field ${path}.${key}`)
      walk(child, `${path}.${key}`)
    }
  }

  walk(value, label)
}

function numberField(value: unknown, label: string): number {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be a number`)
  return value
}

function objectField(value: unknown, label: string): JsonObject {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value as JsonObject
}

function itemsField(value: unknown, label: string): JsonObject[] {
  assert(Array.isArray(value), `${label} must be an array`)
  return value.map((item, index) => objectField(item, `${label}[${index}]`))
}

async function assertReadOnlyMarket(): Promise<void> {
  const [health, config, market] = await Promise.all([
    getJson('/api/health'),
    getJson('/api/exchange/config'),
    getJson('/api/exchange/market?page=1&pageSize=5')
  ])
  assert(health.response.status === 200, `health expected 200, got ${health.response.status}: ${health.text}`)
  assert(config.response.status === 200, `exchange config expected 200, got ${config.response.status}: ${config.text}`)
  assert(market.response.status === 200, `exchange market expected 200, got ${market.response.status}: ${market.text}`)
  assert(typeof config.data.enabled === 'boolean', 'exchange config must expose enabled boolean')
  const items = itemsField(market.data.items || [], 'exchange market items')
  for (const item of items) {
    assertNoIdentityLeak(item, 'public exchange market item')
    assert(item.privacyMode === 'anonymous', 'public listing must expose anonymous privacy marker')
    assert(item.deliveryMode === 'reinstall_required', 'public listing must expose reinstall-required delivery marker')
  }
}

async function createListing(sellerToken: string, instanceId: number): Promise<JsonObject> {
  const eligibility = await getJson(`/api/exchange/instances/${instanceId}/eligibility`, sellerToken)
  assert(eligibility.response.status === 200, `eligibility expected 200, got ${eligibility.response.status}: ${eligibility.text}`)

  if (eligibility.data.status === 'must_stop_first') {
    assert(allowStopForListing, 'instance needs stop-first flow; set SMOKE_EXCHANGE_ALLOW_STOP_FOR_LISTING=1 to queue the stop task')
    const stop = await postJson(`/api/exchange/instances/${instanceId}/stop-for-listing`, {}, sellerToken)
    assert([200, 202].includes(stop.response.status), `stop-for-listing expected 200/202, got ${stop.response.status}: ${stop.text}`)
    throw new Error('stop-for-listing task was queued; rerun this smoke after the instance status becomes stopped')
  }

  assert(eligibility.data.status === 'can_list' && eligibility.data.eligible === true, `instance is not eligible for listing: ${eligibility.text}`)

  const listing = await postJson('/api/exchange/listings', {
    instanceId,
    price: listingPrice,
    description: `PayIncus exchange smoke ${runId}`,
    autoDelistAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    idempotencyKey: idempotencyKey('listing')
  }, sellerToken)
  assert(listing.response.status === 201, `create listing expected 201, got ${listing.response.status}: ${listing.text}`)
  assert(typeof listing.data.id === 'number', 'create listing response must include id')
  assert(listing.data.privacyMode === 'anonymous', 'created listing must expose anonymous marker')
  assert(listing.data.deliveryMode === 'reinstall_required', 'created listing must expose reinstall-required marker')
  assertNoIdentityLeak(listing.data, 'created listing response')

  const detail = await getJson(`/api/exchange/market/${listing.data.id}`)
  assert(detail.response.status === 200, `public listing detail expected 200, got ${detail.response.status}: ${detail.text}`)
  assertNoIdentityLeak(detail.data, 'public listing detail')
  return listing.data
}

async function purchaseListing(buyerToken: string, listingId: number): Promise<JsonObject> {
  const purchase = await postJson(`/api/exchange/market/${listingId}/purchase`, {
    idempotencyKey: idempotencyKey('purchase')
  }, buyerToken, { 'Idempotency-Key': idempotencyKey('purchase') })

  if (purchase.response.status === 403 && purchase.data.code === 'EXCHANGE_OPERATION_VERIFICATION_REQUIRED') {
    if (expectVerificationGate) {
      console.log('[smoke-exchange-marketplace-e2e] purchase verification gate observed', {
        listingId,
        code: purchase.data.code
      })
      return { verificationRequired: true, listingId }
    }
    throw new Error('purchase requires completed sensitive-operation verification; complete verification for the buyer or set SMOKE_EXCHANGE_EXPECT_VERIFICATION_GATE=1 when only testing the gate')
  }

  assert(purchase.response.status === 200, `purchase expected 200, got ${purchase.response.status}: ${purchase.text}`)
  assert(typeof purchase.data.id === 'number', 'purchase response must include order id')
  assert(purchase.data.status === 'delivering' || purchase.data.status === 'confirming' || purchase.data.status === 'completed', `purchase response must enter delivery/confirmation state: ${purchase.text}`)
  assert(numberField(purchase.data.escrowAmount, 'purchase escrowAmount') >= listingPrice, 'purchase must put buyer funds into escrow')
  assertNoIdentityLeak(purchase.data, 'purchase response')
  return purchase.data
}

async function pollOrderUntilTerminal(buyerToken: string, orderId: number): Promise<JsonObject> {
  const started = Date.now()
  let lastOrder: JsonObject | null = null
  while (Date.now() - started < pollTimeoutMs) {
    const detail = await getJson(`/api/exchange/orders/${orderId}`, buyerToken)
    assert(detail.response.status === 200, `order detail expected 200, got ${detail.response.status}: ${detail.text}`)
    const order = objectField(detail.data.order, 'order detail order')
    assertNoIdentityLeak(order, 'buyer order detail')
    lastOrder = order
    if (['confirming', 'completed', 'manual_review', 'failed', 'refunded', 'cancelled'].includes(String(order.status))) {
      return order
    }
    await sleep(5000)
  }
  throw new Error(`delivery did not reach a terminal/confirmation state within ${pollTimeoutMs}ms; last order: ${JSON.stringify(lastOrder)}`)
}

async function maybeCleanupListing(sellerToken: string, listingId: number): Promise<void> {
  if (!cleanupListing) return
  const result = await deleteJson(`/api/exchange/listings/${listingId}`, sellerToken)
  assert([200, 404, 409].includes(result.response.status), `cleanup listing got unexpected status ${result.response.status}: ${result.text}`)
}

async function main(): Promise<void> {
  await assertReadOnlyMarket()

  if (!allowDestructive) {
    console.log('[smoke-exchange-marketplace-e2e] read-only checks passed', {
      apiBaseUrl,
      destructive: false
    })
    return
  }

  const instanceId = requirePositiveInt(sellerInstanceId, 'SMOKE_EXCHANGE_SELLER_INSTANCE_ID')
  assert(Number.isFinite(listingPrice) && listingPrice > 0, 'SMOKE_EXCHANGE_LISTING_PRICE must be greater than 0')

  const sellerToken = await login('SELLER')
  assert(sellerToken, 'seller auth is required: set SMOKE_EXCHANGE_SELLER_TOKEN or seller username/password')

  const listing = await createListing(sellerToken, instanceId)
  const listingId = numberField(listing.id, 'listing id')

  try {
    if (!allowPurchase) {
      console.log('[smoke-exchange-marketplace-e2e] listing checks passed without purchase', {
        apiBaseUrl,
        listingId,
        instanceId
      })
      return
    }

    const buyerToken = await login('BUYER')
    assert(buyerToken, 'buyer auth is required: set SMOKE_EXCHANGE_BUYER_TOKEN or buyer username/password')
    const order = await purchaseListing(buyerToken, listingId)
    if (order.verificationRequired) return

    const orderId = numberField(order.id, 'order id')
    if (waitDelivery) {
      const finalOrder = await pollOrderUntilTerminal(buyerToken, orderId)
      console.log('[smoke-exchange-marketplace-e2e] destructive purchase and delivery poll passed', {
        apiBaseUrl,
        listingId,
        orderId,
        status: finalOrder.status
      })
      return
    }

    console.log('[smoke-exchange-marketplace-e2e] destructive purchase reached delivery state', {
      apiBaseUrl,
      listingId,
      orderId,
      status: order.status
    })
  } finally {
    if (!allowPurchase) {
      await maybeCleanupListing(sellerToken, listingId)
    }
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
