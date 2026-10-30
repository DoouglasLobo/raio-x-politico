import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CHAMBER_API_BASE_URL = 'https://dadosabertos.camara.leg.br/api/v2'
export const CHAMBER_SOURCE_URL = 'https://dadosabertos.camara.leg.br/swagger/api.html'
export const CHAMBER_ORIGIN = 'Câmara dos Deputados — Dados Abertos'
export const CHAMBER_SOURCE_KEY = 'camara:fonte:dados-abertos-api-v2'
export const CHAMBER_INSTITUTION_KEY = 'camara:instituicao:deputados'

const PAGE_SIZE = 100
const MAX_PAGES = 1_000
const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_RETRIES = 3
const MAX_RETRY_DELAY_MS = 30_000
const UF_CODES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO',
])

export type FetchLike = typeof fetch

export type PartyRecord = {
  camaraId: number
  sourceKey: string
  origin: string
  acronym: string
  name: string
  sourceUrl: string
  lastUpdatedAt: null
}

export type SourceRecord = {
  externalKey: string
  name: string
  organization: string
  url: string
  description: null
}

export type PoliticianRecord = {
  camaraId: number
  sourceKey: string
  origin: string
  slug: string
  fullName: string
  state: string
  partyCamaraId: number
  partyAcronym: string
  sourceUrl: string
  lastUpdatedAt: string | null
}

export type MandateRecord = {
  camaraDeputyId: number
  camaraLegislatureId: number
  sourceKey: string
  institutionKey: string
  origin: string
  title: string
  district: string
  startDate: string | null
  endDate: string | null
  status: 'current'
  partyCamaraId: number
  sourceUrl: string
}

export type InstitutionRecord = {
  externalKey: string
  sourceKey: string
  origin: string
  name: string
  slug: string
  branch: string
  description: null
  sourceUrl: string
}

export type PreviewRecords = {
  sources: SourceRecord[]
  institutions: InstitutionRecord[]
  parties: PartyRecord[]
  politicians: PoliticianRecord[]
  mandates: MandateRecord[]
}

export type ReferenceSnapshot = {
  schemaVersion: 1
  records: PreviewRecords
  unkeyed?: {
    sources?: Array<Pick<SourceRecord, 'name' | 'url'>>
    institutions?: Array<Pick<InstitutionRecord, 'name' | 'slug'>>
    parties?: Array<Pick<PartyRecord, 'acronym' | 'name'>>
    politicians?: Array<Pick<PoliticianRecord, 'fullName' | 'state'>>
    mandates?: Array<{ title: string; district: string | null }>
  }
}

export type PreviewAction<T> = {
  action: 'insert' | 'update' | 'ignore' | 'review'
  key: string
  reason: string
  changedFields: string[]
  record: T
}

export type PreviewReport = {
  schemaVersion: 1
  status: 'completed' | 'completed_with_review' | 'partial' | 'failed'
  generatedAt: string
  asOf: string
  source: {
    name: string
    organization: string
    documentationUrl: string
    apiBaseUrl: string
    legislatureId: number | null
  }
  collection: {
    legislaturePages: number
    partyPages: number
    deputyPages: number
    listedRows: number
    uniqueDeputyIds: number
    duplicateRows: number
    detailRequests: number
    failedDetailRequests: number
    usedReferenceSnapshot: boolean
  }
  records: PreviewRecords
  proposals: {
    sources: PreviewAction<SourceRecord>[]
    institutions: PreviewAction<InstitutionRecord>[]
    parties: PreviewAction<PartyRecord>[]
    politicians: PreviewAction<PoliticianRecord>[]
    mandates: PreviewAction<MandateRecord>[]
  }
  ignored: Array<{ key: string; reason: string }>
  missingData: Array<{ key: string; fields: string[]; reason: string }>
  manualReview: Array<{ key: string; reason: string }>
  errors: Array<{ scope: string; key?: string; message: string }>
  totals: {
    records: Record<keyof PreviewRecords, number>
    proposals: Record<keyof PreviewRecords, Record<PreviewAction<unknown>['action'], number>>
    ignored: number
    missingData: number
    manualReview: number
    errors: number
  }
}

type PreviewOptions = {
  fetchImpl?: FetchLike
  apiBaseUrl?: string
  asOf?: string
  generatedAt?: string
  reference?: ReferenceSnapshot
  concurrency?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  requestTimeoutMs?: number
}

type PageResult = {
  records: unknown[]
  pages: number
}

type Legislature = {
  id: number
  dataInicio: string
  dataFim: string | null
}

type PartyListItem = {
  id: number
  sigla: string
  nome: string
  uri: string
}

type DeputyListItem = {
  id: number
  uri: string
  nome: string
  siglaUf: string
  idLegislatura: number
}

type CollectionContext = {
  fetchImpl: FetchLike
  apiBaseUrl: string
  maxRetries: number
  retryBaseDelayMs: number
  requestTimeoutMs: number
}

class CollectionError extends Error {
  readonly scope: string

  constructor(
    message: string,
    scope: string,
  ) {
    super(message)
    this.name = 'CollectionError'
    this.scope = scope
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null
}

function officialUrl(value: unknown, resource: 'deputados' | 'partidos', id: number): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'dadosabertos.camara.leg.br'
      && url.pathname === `/api/v2/${resource}/${id}`
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function parseEnvelope(value: unknown, scope: string): unknown[] {
  if (!isObject(value) || !Array.isArray(value.dados) || !Array.isArray(value.links)) {
    throw new CollectionError(
      `Resposta inválida em ${scope}: esperados arrays em "dados" e "links".`,
      scope,
    )
  }
  return value.dados
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS)
  }
  const date = Date.parse(value)
  return Number.isNaN(date)
    ? null
    : Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_DELAY_MS)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

async function fetchJson(
  url: URL,
  context: CollectionContext,
  scope: string,
): Promise<unknown> {
  for (let attempt = 0; attempt <= context.maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), context.requestTimeoutMs)
    let response: Response
    try {
      response = await context.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timeout)
      if (attempt < context.maxRetries) {
        await wait(context.retryBaseDelayMs * 2 ** attempt)
        continue
      }
      const detail = error instanceof Error ? error.message : 'erro de rede desconhecido'
      throw new CollectionError(`Falha de rede em ${url.pathname}: ${detail}`, scope)
    }

    if (!response.ok) {
      clearTimeout(timeout)
      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < context.maxRetries) {
        const delay = parseRetryAfter(response.headers.get('retry-after'))
          ?? context.retryBaseDelayMs * 2 ** attempt
        await wait(delay)
        continue
      }
      throw new CollectionError(
        `API da Câmara respondeu HTTP ${response.status} em ${url.pathname}.`,
        scope,
      )
    }

    try {
      return await response.json() as unknown
    } catch {
      throw new CollectionError(`Resposta JSON inválida em ${url.pathname}.`, scope)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new CollectionError(`Tentativas esgotadas em ${url.pathname}.`, scope)
}

async function fetchAllPages(
  firstUrl: URL,
  context: CollectionContext,
  scope: string,
): Promise<PageResult> {
  const records: unknown[] = []
  const visited = new Set<string>()
  let url: URL | null = firstUrl
  let pages = 0

  while (url) {
    if (pages >= MAX_PAGES) {
      throw new CollectionError(`Limite de ${MAX_PAGES} páginas excedido em ${scope}.`, scope)
    }
    if (visited.has(url.toString())) {
      throw new CollectionError(`Ciclo de paginação detectado em ${scope}.`, scope)
    }
    const apiBase = new URL(context.apiBaseUrl)
    if (url.origin !== apiBase.origin
      || !url.pathname.startsWith(`${apiBase.pathname.replace(/\/+$/, '')}/`)) {
      throw new CollectionError(`Link de paginação fora da API oficial em ${scope}.`, scope)
    }
    visited.add(url.toString())

    const response = await fetchJson(url, context, scope)
    records.push(...parseEnvelope(response, scope))
    pages += 1

    const links = isObject(response) && Array.isArray(response.links) ? response.links : []
    const next = links.find((link) => isObject(link) && link.rel === 'next')
    if (!next) {
      url = null
      continue
    }
    if (!isObject(next) || typeof next.href !== 'string') {
      throw new CollectionError(`Link "next" inválido em ${scope}.`, scope)
    }
    try {
      url = new URL(next.href, url)
    } catch {
      throw new CollectionError(`URL de próxima página inválida em ${scope}.`, scope)
    }
  }

  return { records, pages }
}

function parseLegislature(value: unknown): Legislature | null {
  if (!isObject(value) || !positiveInteger(value.id)) return null
  const start = parseIsoDate(value.dataInicio)
  const end = value.dataFim === null ? null : parseIsoDate(value.dataFim)
  if (!start || (value.dataFim !== null && !end) || (end && end < start)) return null
  return { id: value.id, dataInicio: start, dataFim: end }
}

function parseParty(value: unknown): PartyListItem | null {
  if (!isObject(value) || !positiveInteger(value.id)
    || !nonEmptyString(value.sigla) || !nonEmptyString(value.nome)) {
    return null
  }
  const uri = officialUrl(value.uri, 'partidos', value.id)
  return uri ? { id: value.id, sigla: value.sigla.trim(), nome: value.nome.trim(), uri } : null
}

function parseDeputy(value: unknown, legislatureId: number): DeputyListItem | null {
  if (!isObject(value) || !positiveInteger(value.id)
    || !nonEmptyString(value.nome) || !nonEmptyString(value.siglaUf)
    || value.idLegislatura !== legislatureId) {
    return null
  }
  const uri = officialUrl(value.uri, 'deputados', value.id)
  return uri
    ? {
        id: value.id,
        uri,
        nome: value.nome.trim(),
        siglaUf: value.siglaUf.trim().toUpperCase(),
        idLegislatura: legislatureId,
      }
    : null
}

function makeReport(
  asOf: string,
  generatedAt: string,
  reference: ReferenceSnapshot | undefined,
): PreviewReport {
  return {
    schemaVersion: 1,
    status: 'failed',
    generatedAt,
    asOf,
    source: {
      name: 'API de Dados Abertos da Câmara dos Deputados',
      organization: 'Câmara dos Deputados',
      documentationUrl: CHAMBER_SOURCE_URL,
      apiBaseUrl: CHAMBER_API_BASE_URL,
      legislatureId: null,
    },
    collection: {
      legislaturePages: 0,
      partyPages: 0,
      deputyPages: 0,
      listedRows: 0,
      uniqueDeputyIds: 0,
      duplicateRows: 0,
      detailRequests: 0,
      failedDetailRequests: 0,
      usedReferenceSnapshot: Boolean(reference),
    },
    records: {
      sources: [{
        externalKey: CHAMBER_SOURCE_KEY,
        name: 'API de Dados Abertos da Câmara dos Deputados',
        organization: 'Câmara dos Deputados',
        url: CHAMBER_SOURCE_URL,
        description: null,
      }],
      institutions: [],
      parties: [],
      politicians: [],
      mandates: [],
    },
    proposals: { sources: [], institutions: [], parties: [], politicians: [], mandates: [] },
    ignored: [],
    missingData: [],
    manualReview: [],
    errors: [],
    totals: {
      records: { sources: 0, institutions: 0, parties: 0, politicians: 0, mandates: 0 },
      proposals: {
        sources: { insert: 0, update: 0, ignore: 0, review: 0 },
        institutions: { insert: 0, update: 0, ignore: 0, review: 0 },
        parties: { insert: 0, update: 0, ignore: 0, review: 0 },
        politicians: { insert: 0, update: 0, ignore: 0, review: 0 },
        mandates: { insert: 0, update: 0, ignore: 0, review: 0 },
      },
      ignored: 0,
      missingData: 0,
      manualReview: 0,
      errors: 0,
    },
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

function sameFields<T extends object>(left: T, right: T, keys: (keyof T)[]): string[] {
  return keys.filter((key) => left[key] !== right[key]).map(String)
}

function planActions<T extends object>(
  candidates: T[],
  existing: T[] | undefined,
  keyOf: (record: T) => string,
  compareKeys: (keyof T)[],
  possibleLegacyMatch?: (record: T) => boolean,
): PreviewAction<T>[] {
  const existingByKey = new Map<string, T[]>()
  for (const record of existing ?? []) {
    const key = keyOf(record)
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), record])
  }

  return candidates.map((record) => {
    const key = keyOf(record)
    if (!existing) {
      return {
        action: 'insert',
        key,
        reason: 'Candidato a inclusão; sem snapshot local não é possível excluir duplicatas existentes.',
        changedFields: [],
        record,
      }
    }
    const matches = existingByKey.get(key) ?? []
    if (matches.length > 1) {
      return {
        action: 'review',
        key,
        reason: 'O snapshot contém mais de um registro com a mesma chave externa.',
        changedFields: [],
        record,
      }
    }
    const previous = matches[0]
    if (!previous) {
      if (possibleLegacyMatch?.(record)) {
        return {
          action: 'review',
          key,
          reason: 'Há registro legado sem chave externa que pode corresponder; não reconciliar automaticamente.',
          changedFields: [],
          record,
        }
      }
      return {
        action: 'insert',
        key,
        reason: 'Chave externa ausente no snapshot local.',
        changedFields: [],
        record,
      }
    }
    const changedFields = sameFields(record, previous, compareKeys)
    return changedFields.length === 0
      ? {
          action: 'ignore',
          key,
          reason: 'Registro idêntico ao snapshot local.',
          changedFields,
          record,
        }
      : {
          action: 'update',
          key,
          reason: 'Há diferenças em campos mapeados; revisar antes de qualquer gravação.',
          changedFields,
          record,
        }
  })
}

function fillTotals(report: PreviewReport): void {
  const groups = ['sources', 'institutions', 'parties', 'politicians', 'mandates'] as const
  for (const group of groups) {
    report.totals.records[group] = report.records[group].length
    for (const action of ['insert', 'update', 'ignore', 'review'] as const) {
      report.totals.proposals[group][action] = report.proposals[group]
        .filter((proposal) => proposal.action === action).length
    }
  }
  report.totals.ignored = report.ignored.length
  report.totals.missingData = report.missingData.length
  report.totals.manualReview = report.manualReview.length
  report.totals.errors = report.errors.length
}

function validateReference(value: unknown): ReferenceSnapshot {
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.records)) {
    throw new Error('Snapshot inválido: esperado schemaVersion 1 e objeto "records".')
  }
  const groups = ['sources', 'institutions', 'parties', 'politicians', 'mandates'] as const
  for (const group of groups) {
    if (!Array.isArray(value.records[group])) {
      throw new Error(`Snapshot inválido: "records.${group}" deve ser um array.`)
    }
    for (const [index, record] of value.records[group].entries()) {
      if (!isObject(record)) {
        throw new Error(`Snapshot inválido: records.${group}[${index}] deve ser um objeto.`)
      }
      if (group === 'sources' || group === 'institutions') {
        if (!nonEmptyString(record.externalKey)) {
          throw new Error(`Snapshot inválido: records.${group}[${index}] não tem externalKey.`)
        }
      } else if (group === 'parties' || group === 'politicians') {
        if (!positiveInteger(record.camaraId)) {
          throw new Error(`Snapshot inválido: records.${group}[${index}] não tem camaraId válido.`)
        }
      } else if (!positiveInteger(record.camaraDeputyId)
        || !positiveInteger(record.camaraLegislatureId)) {
        throw new Error(`Snapshot inválido: records.mandates[${index}] não tem chave deputado/legislatura válida.`)
      }
    }
  }
  if (value.unkeyed !== undefined) {
    if (!isObject(value.unkeyed)) throw new Error('Snapshot inválido: "unkeyed" deve ser um objeto.')
    for (const group of groups) {
      const entries = value.unkeyed[group]
      if (entries !== undefined && (!Array.isArray(entries) || !entries.every(isObject))) {
        throw new Error(`Snapshot inválido: "unkeyed.${group}" deve ser um array de objetos.`)
      }
      if (!Array.isArray(entries)) continue
      for (const [index, entry] of entries.entries()) {
        const valid = group === 'sources'
          ? nonEmptyString(entry.name) && nonEmptyString(entry.url)
          : group === 'institutions'
            ? nonEmptyString(entry.name) && nonEmptyString(entry.slug)
            : group === 'parties'
              ? nonEmptyString(entry.acronym) && nonEmptyString(entry.name)
              : group === 'politicians'
                ? nonEmptyString(entry.fullName) && nonEmptyString(entry.state)
                : nonEmptyString(entry.title)
                  && (entry.district === null || typeof entry.district === 'string')
        if (!valid) {
          throw new Error(`Snapshot inválido: unkeyed.${group}[${index}] tem campos ausentes ou inválidos.`)
        }
      }
    }
  }
  return value as unknown as ReferenceSnapshot
}

export function parseReferenceSnapshot(value: unknown): ReferenceSnapshot {
  return validateReference(value)
}

function buildActions(report: PreviewReport, reference: ReferenceSnapshot | undefined): void {
  const existing = reference?.records
  const legacy = reference?.unkeyed
  report.proposals.sources = planActions(
    report.records.sources,
    existing?.sources,
    (record) => record.externalKey,
    ['name', 'organization', 'url', 'description'],
    (record) => Boolean(legacy?.sources?.some((item) => item.url === record.url)),
  )
  report.proposals.institutions = planActions(
    report.records.institutions,
    existing?.institutions,
    (record) => record.externalKey,
    ['name', 'slug', 'branch', 'description', 'sourceUrl', 'origin', 'sourceKey'],
    (record) => Boolean(legacy?.institutions?.some(
      (item) => item.slug === record.slug || normalizeText(item.name) === normalizeText(record.name),
    )),
  )
  report.proposals.parties = planActions(
    report.records.parties,
    existing?.parties,
    (record) => String(record.camaraId),
    ['acronym', 'name', 'sourceUrl', 'origin', 'sourceKey'],
    (record) => Boolean(legacy?.parties?.some(
      (item) => nonEmptyString(item.acronym)
        && item.acronym.trim().toLocaleUpperCase('pt-BR') === record.acronym,
    )),
  )
  report.proposals.politicians = planActions(
    report.records.politicians,
    existing?.politicians,
    (record) => String(record.camaraId),
    ['fullName', 'state', 'partyCamaraId', 'partyAcronym', 'sourceUrl', 'lastUpdatedAt', 'origin', 'sourceKey'],
    (record) => Boolean(legacy?.politicians?.some(
      (item) => normalizeText(item.fullName) === normalizeText(record.fullName)
        && item.state === record.state,
    )),
  )
  report.proposals.mandates = planActions(
    report.records.mandates,
    existing?.mandates,
    (record) => `${record.camaraDeputyId}:${record.camaraLegislatureId}`,
    ['title', 'district', 'startDate', 'endDate', 'status', 'partyCamaraId', 'sourceUrl', 'origin', 'sourceKey', 'institutionKey'],
    () => Boolean(legacy?.mandates?.length),
  )
}

function addProposalReviews(report: PreviewReport): void {
  for (const group of ['sources', 'institutions', 'parties', 'politicians', 'mandates'] as const) {
    for (const proposal of report.proposals[group]) {
      if (proposal.action === 'review') {
        report.manualReview.push({
          key: `${group}:${proposal.key}`,
          reason: proposal.reason,
        })
      }
    }
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= values.length) return
      results[index] = await mapper(values[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

function endpoint(apiBaseUrl: string, pathname: string, parameters: Record<string, string>): URL {
  const url = new URL(pathname, `${apiBaseUrl.replace(/\/+$/, '')}/`)
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  return url
}

function listingRowsAreConsistent(rows: DeputyListItem[]): boolean {
  const names = new Set(rows.map((row) => normalizeText(row.nome)))
  const states = new Set(rows.map((row) => row.siglaUf))
  return names.size === 1 && states.size === 1
}

export async function buildPreview(options: PreviewOptions = {}): Promise<PreviewReport> {
  const asOf = options.asOf
    ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  if (!parseIsoDate(asOf)) throw new Error('"asOf" deve estar no formato de data YYYY-MM-DD.')
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error('"generatedAt" deve ser uma data/hora ISO válida.')

  const apiBaseUrl = (options.apiBaseUrl ?? CHAMBER_API_BASE_URL).replace(/\/+$/, '')
  const context: CollectionContext = {
    fetchImpl: options.fetchImpl ?? fetch,
    apiBaseUrl,
    maxRetries: options.maxRetries ?? DEFAULT_RETRIES,
    retryBaseDelayMs: options.retryBaseDelayMs ?? 250,
    requestTimeoutMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
  }
  const concurrency = options.concurrency ?? 4
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error('concurrency deve ser um inteiro entre 1 e 20.')
  }
  if (!Number.isInteger(context.maxRetries) || context.maxRetries < 0 || context.maxRetries > 10) {
    throw new Error('maxRetries deve ser um inteiro entre 0 e 10.')
  }

  const report = makeReport(asOf, generatedAt, options.reference)
  try {
    const legislatures = await fetchAllPages(
      endpoint(apiBaseUrl, 'legislaturas', {
        pagina: '1',
        ordem: 'DESC',
        ordenarPor: 'id',
        itens: String(PAGE_SIZE),
      }),
      context,
      'legislaturas',
    )
    report.collection.legislaturePages = legislatures.pages
    const parsedLegislatures = legislatures.records.map(parseLegislature).filter(
      (legislature): legislature is Legislature => legislature !== null,
    )
    const currentLegislature = parsedLegislatures.find(
      (legislature) => legislature.dataInicio <= asOf
        && (legislature.dataFim === null || legislature.dataFim >= asOf),
    )
    if (!currentLegislature) {
      throw new CollectionError(`Nenhuma legislatura oficial cobre a data ${asOf}.`, 'legislaturas')
    }
    report.source.legislatureId = currentLegislature.id

    const [partyPage, deputyPage] = await Promise.all([
      fetchAllPages(
        endpoint(apiBaseUrl, 'partidos', {
          pagina: '1',
          ordem: 'ASC',
          ordenarPor: 'sigla',
          itens: String(PAGE_SIZE),
        }),
        context,
        'partidos',
      ),
      fetchAllPages(
        endpoint(apiBaseUrl, 'deputados', {
          pagina: '1',
          idLegislatura: String(currentLegislature.id),
          ordem: 'ASC',
          ordenarPor: 'nome',
          itens: String(PAGE_SIZE),
        }),
        context,
        'deputados',
      ),
    ])
    report.collection.partyPages = partyPage.pages
    report.collection.deputyPages = deputyPage.pages
    report.collection.listedRows = deputyPage.records.length

    const partiesByAcronym = new Map<string, PartyListItem[]>()
    for (const [index, rawParty] of partyPage.records.entries()) {
      const party = parseParty(rawParty)
      if (!party) {
        report.errors.push({
          scope: 'partidos',
          key: String(index),
          message: 'Registro de partido inválido ou sem URI oficial verificável.',
        })
        continue
      }
      const acronym = party.sigla.toLocaleUpperCase('pt-BR')
      partiesByAcronym.set(acronym, [...(partiesByAcronym.get(acronym) ?? []), party])
    }

    const deputiesById = new Map<number, DeputyListItem[]>()
    let validDeputyRows = 0
    for (const [index, rawDeputy] of deputyPage.records.entries()) {
      const deputy = parseDeputy(rawDeputy, currentLegislature.id)
      if (!deputy) {
        report.errors.push({
          scope: 'deputados',
          key: String(index),
          message: 'Registro de deputado inválido, com ID de legislatura incompatível ou URI não oficial.',
        })
        continue
      }
      validDeputyRows += 1
      deputiesById.set(deputy.id, [...(deputiesById.get(deputy.id) ?? []), deputy])
    }

    report.collection.uniqueDeputyIds = deputiesById.size
    report.collection.duplicateRows = validDeputyRows - deputiesById.size
    report.collection.detailRequests = deputiesById.size

    const detailResults = await mapConcurrent(
      [...deputiesById.entries()],
      concurrency,
      async ([id, rows]) => {
        const key = String(id)
        if (!listingRowsAreConsistent(rows)) {
          report.manualReview.push({
            key,
            reason: 'A listagem contém nome ou UF divergentes para o mesmo ID oficial.',
          })
          return null
        }

        try {
          const response = await fetchJson(
            endpoint(apiBaseUrl, `deputados/${id}`, {}),
            context,
            `deputado:${id}`,
          )
          if (!isObject(response) || !isObject(response.dados)) {
            throw new CollectionError(
              'Detalhe inválido: esperado dados.ultimoStatus.',
              `deputado:${id}`,
            )
          }
          const detail = response.dados
          const status = detail.ultimoStatus
          if (!isObject(status)) {
            throw new CollectionError(
              'Detalhe inválido: esperado dados.ultimoStatus.',
              `deputado:${id}`,
            )
          }
          if (status.id !== id) {
            report.manualReview.push({ key, reason: 'O ID do detalhe diverge do ID listado.' })
            return null
          }
          if (status.situacao !== 'Exercício') {
            if (nonEmptyString(status.situacao)) {
              report.ignored.push({
                key,
                reason: `Status oficial atual não é "Exercício": ${status.situacao}.`,
              })
            } else {
              report.manualReview.push({
                key,
                reason: 'A situação atual está ausente; não é possível confirmar exercício.',
              })
            }
            return null
          }
          if (status.idLegislatura !== currentLegislature.id) {
            report.manualReview.push({
              key,
              reason: 'O detalhe informa legislatura diferente da legislatura vigente selecionada.',
            })
            return null
          }
          const fullName = nonEmptyString(status.nome) ? status.nome.trim() : ''
          const state = nonEmptyString(status.siglaUf) ? status.siglaUf.trim().toUpperCase() : ''
          const missing: string[] = []
          if (!fullName) missing.push('nome')
          if (!state) missing.push('UF')
          if (!nonEmptyString(status.siglaPartido)) missing.push('partido')
          if (missing.length > 0) {
            report.manualReview.push({
              key,
              reason: `Campos necessários ausentes no status atual: ${missing.join(', ')}.`,
            })
            report.missingData.push({
              key,
              fields: missing,
              reason: 'Não criar uma relação partidária ou um registro pessoal por inferência.',
            })
            return null
          }
          if (!UF_CODES.has(state)) {
            report.manualReview.push({ key, reason: `UF inválida ou não reconhecida: ${state}.` })
            report.missingData.push({
              key,
              fields: ['UF válida'],
              reason: 'A UF informada não corresponde a uma sigla estadual brasileira conhecida.',
            })
            return null
          }

          const currentPartyAcronym = status.siglaPartido
          if (!nonEmptyString(currentPartyAcronym)) {
            report.manualReview.push({ key, reason: 'A filiação partidária atual está ausente.' })
            return null
          }
          const acronym = currentPartyAcronym.trim().toLocaleUpperCase('pt-BR')
          const matchingParties = partiesByAcronym.get(acronym) ?? []
          if (matchingParties.length !== 1) {
            report.manualReview.push({
              key,
              reason: matchingParties.length === 0
                ? `A filiação atual "${acronym}" não corresponde a partido único na lista oficial.`
                : `A sigla partidária atual "${acronym}" corresponde a mais de um ID oficial.`,
            })
            report.missingData.push({
              key,
              fields: ['relação com partido oficial'],
              reason: 'A filiação atual não pôde ser resolvida sem ambiguidade.',
            })
            return null
          }

          const party = matchingParties[0]!
          const sourceUrl = officialUrl(status.uri, 'deputados', id)
            ?? officialUrl(rows[0]!.uri, 'deputados', id)
          if (!sourceUrl) {
            report.manualReview.push({ key, reason: 'Não há URI oficial verificável para o deputado.' })
            return null
          }
          const hasStatusDate = status.data !== null && status.data !== undefined
          const lastUpdatedAt = !hasStatusDate
            ? null
            : parseIsoDate(status.data)
          if (hasStatusDate && !lastUpdatedAt) {
            report.missingData.push({
              key,
              fields: ['data do status'],
              reason: 'O valor de data oficial não é uma data ISO válida e foi omitido.',
            })
          }
          if (!hasStatusDate) {
            report.missingData.push({
              key,
              fields: ['data do status'],
              reason: 'A API não informou a data do status atual.',
            })
          }

          return {
            party,
            politician: {
              camaraId: id,
              sourceKey: CHAMBER_SOURCE_KEY,
              origin: CHAMBER_ORIGIN,
              slug: `camara-deputado-${id}`,
              fullName,
              state,
              partyCamaraId: party.id,
              partyAcronym: party.sigla,
              sourceUrl,
              lastUpdatedAt,
            } satisfies PoliticianRecord,
            mandate: {
              camaraDeputyId: id,
              camaraLegislatureId: currentLegislature.id,
              sourceKey: CHAMBER_SOURCE_KEY,
              institutionKey: CHAMBER_INSTITUTION_KEY,
              origin: CHAMBER_ORIGIN,
              title: `Deputado federal — legislatura ${currentLegislature.id}`,
              district: state,
              startDate: null,
              endDate: null,
              status: 'current',
              partyCamaraId: party.id,
              sourceUrl,
            } satisfies MandateRecord,
          }
        } catch (error) {
          report.collection.failedDetailRequests += 1
          report.errors.push({
            scope: `deputado:${id}`,
            key,
            message: error instanceof Error ? error.message : 'Falha inesperada ao consultar o detalhe.',
          })
          return null
        }
      },
    )

    const parties = new Map<number, PartyRecord>()
    const politicians = new Map<number, PoliticianRecord>()
    const mandates = new Map<string, MandateRecord>()
    for (const result of detailResults) {
      if (!result) continue
      parties.set(result.party.id, {
        camaraId: result.party.id,
        sourceKey: CHAMBER_SOURCE_KEY,
        origin: CHAMBER_ORIGIN,
        acronym: result.party.sigla,
        name: result.party.nome,
        sourceUrl: result.party.uri,
        lastUpdatedAt: null,
      })
      politicians.set(result.politician.camaraId, result.politician)
      mandates.set(
        `${result.mandate.camaraDeputyId}:${result.mandate.camaraLegislatureId}`,
        result.mandate,
      )
      report.missingData.push({
        key: `${result.mandate.camaraDeputyId}:${result.mandate.camaraLegislatureId}`,
        fields: ['startDate'],
        reason: 'A listagem e o detalhe confirmam exercício, mas não determinam uma data de início segura; ela não foi inferida.',
      })
    }

    report.records.institutions = [{
      externalKey: CHAMBER_INSTITUTION_KEY,
      sourceKey: CHAMBER_SOURCE_KEY,
      origin: CHAMBER_ORIGIN,
      name: 'Câmara dos Deputados',
      slug: 'camara-dos-deputados',
      branch: 'Legislativo federal',
      description: null,
      sourceUrl: CHAMBER_SOURCE_URL,
    }]
    report.records.parties = [...parties.values()].sort((a, b) => a.camaraId - b.camaraId)
    report.records.politicians = [...politicians.values()].sort((a, b) => a.camaraId - b.camaraId)
    report.records.mandates = [...mandates.values()].sort(
      (a, b) => a.camaraDeputyId - b.camaraDeputyId,
    )
    buildActions(report, options.reference)
    addProposalReviews(report)
    report.status = report.errors.length > 0
      ? 'partial'
      : report.manualReview.length > 0
        ? 'completed_with_review'
        : 'completed'
  } catch (error) {
    report.errors.push({
      scope: error instanceof CollectionError ? error.scope : 'collection',
      message: error instanceof Error ? error.message : 'Falha inesperada na coleta.',
    })
    report.status = 'failed'
    buildActions(report, options.reference)
    addProposalReviews(report)
  }

  fillTotals(report)
  return report
}

function parseArguments(args: string[]): {
  output: string
  reference: string | null
  asOf: string | undefined
} {
  let output: string | undefined
  let reference: string | null = null
  let asOf: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${flag}.`)
    if (flag === '--output') output = value
    else if (flag === '--reference') reference = value
    else if (flag === '--as-of') asOf = value
    else throw new Error(`Opção desconhecida: ${flag}.`)
    index += 1
  }
  return {
    output: resolve(output ?? `data/import-previews/chamber-preview-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`),
    reference,
    asOf,
  }
}

export async function runCli(args: string[]): Promise<number> {
  let argumentsParsed: ReturnType<typeof parseArguments>
  try {
    argumentsParsed = parseArguments(args)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Argumentos inválidos.')
    return 1
  }

  let reference: ReferenceSnapshot | undefined
  if (argumentsParsed.reference) {
    try {
      const text = await readFile(resolve(argumentsParsed.reference), 'utf8')
      reference = parseReferenceSnapshot(JSON.parse(text) as unknown)
    } catch (error) {
      console.error(`Não foi possível ler o snapshot de referência: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
      return 1
    }
  }

  let report: PreviewReport
  try {
    report = await buildPreview({ asOf: argumentsParsed.asOf, reference })
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao criar a prévia.')
    return 1
  }

  try {
    await mkdir(dirname(argumentsParsed.output), { recursive: true })
    await writeFile(argumentsParsed.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    console.error(`Não foi possível gravar o arquivo local da prévia: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
    return 1
  }

  console.log(`Status: ${report.status}`)
  console.log(`Prévia local: ${argumentsParsed.output}`)
  console.log(`Registros: ${JSON.stringify(report.totals.records)}`)
  console.log(`Propostas: ${JSON.stringify(report.totals.proposals)}`)
  console.log(`Revisão manual: ${report.totals.manualReview}; erros: ${report.totals.errors}`)
  return report.status === 'failed' ? 2 : 0
}

const entryPoint = process.argv[1]
if (entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  process.exitCode = await runCli(process.argv.slice(2))
}
