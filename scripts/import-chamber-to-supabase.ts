import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type {
  InstitutionRecord,
  MandateRecord,
  PartyRecord,
  PoliticianRecord,
  PreviewRecords,
  SourceRecord,
} from './chamber-import.js'
import type { Database } from '../src/types/database.js'

const ROOT = process.cwd()
const DEFAULT_PREVIEW_DIR = resolve(ROOT, 'data/import-previews')
const DEFAULT_PREVIEW_FILE = resolve(
  DEFAULT_PREVIEW_DIR,
  'chamber-preview-2026-10-30T00-24-56-071Z.json',
)
const ENV_FILE = resolve(ROOT, '.env.import.local')
const BATCH_SIZE = 100
const REVIEW_REASON = 'A listagem contém nome ou UF divergentes para o mesmo ID oficial.'
const EXPECTED_REVIEW_IDS = new Set([
  '226708', '220577', '220614', '220659', '221339',
  '220570', '220686', '220712', '160517', '154700',
  '233594', '220613', '233598', '220552', '220660',
])
const EXPECTED_COUNTS = {
  sources: 1,
  institutions: 1,
  parties: 21,
  politicians: 504,
  mandates: 504,
} satisfies Record<keyof PreviewRecords, number>

type TableName = keyof PreviewRecords
type Count = { inserted: number; updated: number; ignored: number; errors: number }
type CountKey = keyof Count
type ImportReport = {
  mode: 'preview' | 'apply'
  input: string
  counts: Record<TableName, Count>
  totals: Count
  manualReview: Array<{ key: string; reason: string }>
  errors: Array<{ table: TableName | 'configuration' | 'preflight'; key: string; message: string }>
}
type StoredRow = { id: string }
type SyncOptions<T, Row extends StoredRow, WritePayload extends object> = {
  table: TableName
  records: T[]
  rows: Row[]
  recordKey: (record: T) => string
  rowKey: (row: Row) => string
  payload: (record: T, isApply: boolean) => Promise<WritePayload>
  insert: (payloads: WritePayload[]) => Promise<Row[]>
  update: (id: string, payload: WritePayload) => Promise<void>
  preserveNullOnUpdate?: readonly string[]
}

function emptyCount(): Count {
  return { inserted: 0, updated: 0, ignored: 0, errors: 0 }
}

function createReport(mode: ImportReport['mode'], input: string): ImportReport {
  const counts = {
    sources: emptyCount(),
    institutions: emptyCount(),
    parties: emptyCount(),
    politicians: emptyCount(),
    mandates: emptyCount(),
  }
  return {
    mode,
    input,
    counts,
    totals: emptyCount(),
    manualReview: [],
    errors: [],
  }
}

function addCount(report: ImportReport, table: TableName, key: CountKey, amount = 1) {
  report.counts[table][key] += amount
  report.totals[key] += amount
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed.replace(/\s+#.*$/, '').trim()
}

async function loadLocalEnvironment() {
  let contents: string
  try {
    contents = await readFile(ENV_FILE, 'utf8')
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') {
      throw new Error(
        'Arquivo .env.import.local ausente. Copie .env.import.example para .env.import.local e preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      )
    }
    throw error
  }

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) throw new Error(`Linha inválida em .env.import.local:${index + 1}.`)
    const [, name, rawValue] = match
    if (!(name in process.env)) process.env[name] = parseEnvValue(rawValue ?? '')
  }

  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias em .env.import.local.')
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('SUPABASE_URL não é uma URL válida.')
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('SUPABASE_URL deve usar HTTP ou HTTPS.')
  }
  if (serviceRoleKey.startsWith('sb_publishable_')) {
    throw new Error('Use a chave service_role, nunca a publishable key, neste arquivo local.')
  }
  return { url, serviceRoleKey }
}

function parseArguments(args: string[]) {
  let apply = false
  let inputPath: string | null = null
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      return { help: true as const }
    }
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--input') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--input requer o caminho de um JSON.')
      inputPath = resolve(ROOT, value)
      index += 1
      continue
    }
    throw new Error(`Argumento desconhecido: ${arg}`)
  }
  return { help: false as const, apply, inputPath }
}

async function findPreview(inputPath: string | null) {
  return inputPath ?? DEFAULT_PREVIEW_FILE
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatePreview(value: unknown): asserts value is {
  schemaVersion: 1
  status: 'completed' | 'completed_with_review'
  records: PreviewRecords
  manualReview: Array<{ key: string; reason: string }>
  errors: Array<{ scope: string; message: string }>
} {
  if (!isObject(value) || value.schemaVersion !== 1) {
    throw new Error('Prévia inválida: esperado schemaVersion 1.')
  }
  if (value.status !== 'completed' && value.status !== 'completed_with_review') {
    throw new Error(`Prévia com status não importável: ${String(value.status)}.`)
  }
  if (
    !isObject(value.records)
    || !Array.isArray(value.records.sources)
    || !Array.isArray(value.records.institutions)
    || !Array.isArray(value.records.parties)
    || !Array.isArray(value.records.politicians)
    || !Array.isArray(value.records.mandates)
    || !Array.isArray(value.manualReview)
    || !Array.isArray(value.errors)
  ) {
    throw new Error('Prévia inválida: faltam grupos de registros, revisões ou erros.')
  }
  const records = value.records as unknown as PreviewRecords
  for (const table of Object.keys(EXPECTED_COUNTS) as TableName[]) {
    if (records[table].length !== EXPECTED_COUNTS[table]) {
      throw new Error(
        `Prévia inválida para esta carga: ${table} tem ${records[table].length} registros; esperado ${EXPECTED_COUNTS[table]}.`,
      )
    }
  }
  if (value.errors.length > 0) {
    throw new Error(`Prévia contém ${value.errors.length} erro(s); interrompendo antes de consultar ou gravar.`)
  }
  if (
    !value.manualReview.every(
      (item) => isObject(item) && typeof item.key === 'string' && typeof item.reason === 'string',
    )
  ) {
    throw new Error('Prévia inválida: formato de manualReview não reconhecido.')
  }
}

function assertUniqueKeys<T>(records: T[], keyOf: (record: T) => string, table: TableName) {
  const seen = new Set<string>()
  for (const record of records) {
    const key = keyOf(record)
    if (!key || seen.has(key)) throw new Error(`Prévia inválida: chave vazia ou duplicada em ${table}: ${key}.`)
    seen.add(key)
  }
}

function rowValue(row: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(row, key)?.value
}

function isSamePayload(existing: object, payload: object, preserveNull: Set<string>) {
  return Object.entries(payload).every(([key, value]) => {
    if (value === null && preserveNull.has(key)) return true
    return Object.is(rowValue(existing, key), value)
  })
}

function withoutPreservedNulls<T extends object>(payload: T, preserveNull: Set<string>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !(value === null && preserveNull.has(key))),
  ) as T
}

async function syncRecords<T, Row extends StoredRow, WritePayload extends object>(
  options: SyncOptions<T, Row, WritePayload>,
  report: ImportReport,
  apply: boolean,
) {
  const existingByKey = new Map(options.rows.map((row) => [options.rowKey(row), row]))
  const newRecords: Array<{ key: string; payload: WritePayload }> = []
  const preserveNull = new Set<string>(options.preserveNullOnUpdate ?? [])

  for (const record of options.records) {
    const key = options.recordKey(record)
    const existing = existingByKey.get(key)
    let payload: WritePayload
    try {
      payload = await options.payload(record, apply)
    } catch (error) {
      report.errors.push({
        table: options.table,
        key,
        message: error instanceof Error ? error.message : 'Falha ao preparar o registro.',
      })
      addCount(report, options.table, 'errors')
      continue
    }

    if (!existing) {
      if (!apply) addCount(report, options.table, 'inserted')
      newRecords.push({ key, payload })
      continue
    }

    const updatePayload = withoutPreservedNulls(payload, preserveNull)
    if (isSamePayload(existing, payload, preserveNull)) {
      addCount(report, options.table, 'ignored')
      continue
    }
    if (!apply) {
      addCount(report, options.table, 'updated')
      continue
    }

    try {
      await options.update(existing.id, updatePayload)
      addCount(report, options.table, 'updated')
    } catch (error) {
      report.errors.push({
        table: options.table,
        key,
        message: error instanceof Error ? error.message : 'Falha ao atualizar o registro.',
      })
      addCount(report, options.table, 'errors')
    }
  }

  if (!apply) return existingByKey

  for (let offset = 0; offset < newRecords.length; offset += BATCH_SIZE) {
    const batch = newRecords.slice(offset, offset + BATCH_SIZE)
    try {
      const insertedRows = await options.insert(batch.map(({ payload }) => payload))
      for (const row of insertedRows) existingByKey.set(options.rowKey(row), row)
      if (insertedRows.length !== batch.length) {
        const insertedKeys = new Set(insertedRows.map(options.rowKey))
        for (const item of batch) {
          if (!insertedKeys.has(item.key)) {
            report.errors.push({
              table: options.table,
              key: item.key,
              message: 'A resposta do Supabase não confirmou a inserção deste registro.',
            })
            addCount(report, options.table, 'errors')
          } else {
            addCount(report, options.table, 'inserted')
          }
        }
      } else {
        addCount(report, options.table, 'inserted', insertedRows.length)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao inserir o lote.'
      for (const item of batch) {
        report.errors.push({ table: options.table, key: item.key, message })
      }
      addCount(report, options.table, 'errors', batch.length)
    }
  }
  return existingByKey
}

function collectReviewIds(
  reviews: Array<{ key: string; reason: string }>,
  records: PreviewRecords,
) {
  const reviewIds = new Set(
    reviews
      .filter((item) => item.reason === REVIEW_REASON && /^\d+$/.test(item.key))
      .map((item) => item.key),
  )
  if (
    reviewIds.size !== EXPECTED_REVIEW_IDS.size
    || [...EXPECTED_REVIEW_IDS].some((id) => !reviewIds.has(id))
  ) {
    throw new Error('Os IDs em revisão não correspondem à lista validada para esta prévia.')
  }
  const politicians = records.politicians.filter((item) => !reviewIds.has(String(item.camaraId)))
  const mandates = records.mandates.filter((item) => !reviewIds.has(String(item.camaraDeputyId)))
  return {
    reviewIds,
    records: { ...records, politicians, mandates },
  }
}

async function fetchRows<T>(
  values: Array<string | number>,
  fetchChunk: (chunk: Array<string | number>) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = []
  for (let offset = 0; offset < values.length; offset += BATCH_SIZE) {
    const { data, error } = await fetchChunk(values.slice(offset, offset + BATCH_SIZE))
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
  }
  return rows
}

function buildKeyMap<Row>(rows: Row[], keyOf: (row: Row) => string, label: string) {
  const map = new Map<string, Row>()
  for (const row of rows) {
    const key = keyOf(row)
    if (map.has(key)) throw new Error(`Mais de um registro existente corresponde à chave ${label}:${key}.`)
    map.set(key, row)
  }
  return map
}

function requireId<Row extends StoredRow>(
  rows: Map<string, Row>,
  key: string,
  description: string,
  isApply: boolean,
) {
  const row = rows.get(key)
  if (row) return row.id
  if (!isApply) return `pending:${key}`
  throw new Error(`Dependência não resolvida (${description}: ${key}); nenhum registro dependente será gravado.`)
}

async function run() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    console.log(`Uso: npm run import:chamber [--input caminho.json] [--apply]

Sem --apply, apenas consulta o Supabase e mostra o plano. Nenhum dado é gravado.
--apply exige confirmação explícita para inserir ou atualizar os registros.`)
    return
  }

  const inputPath = await findPreview(args.inputPath)
  const previewText = await readFile(inputPath, 'utf8')
  const previewValue: unknown = JSON.parse(previewText)
  validatePreview(previewValue)
  const preview = previewValue
  const report = createReport(args.apply ? 'apply' : 'preview', inputPath)
  const review = collectReviewIds(preview.manualReview, preview.records)
  report.manualReview = preview.manualReview

  assertUniqueKeys(preview.records.sources, (item) => item.externalKey, 'sources')
  assertUniqueKeys(preview.records.institutions, (item) => item.externalKey, 'institutions')
  assertUniqueKeys(preview.records.parties, (item) => String(item.camaraId), 'parties')
  assertUniqueKeys(preview.records.politicians, (item) => String(item.camaraId), 'politicians')
  assertUniqueKeys(preview.records.mandates, (item) => `${item.camaraDeputyId}:${item.camaraLegislatureId}`, 'mandates')
  if (review.reviewIds.size !== preview.manualReview.length) {
    throw new Error('A lista de revisão contém motivos não reconhecidos; valide-a manualmente antes da carga.')
  }

  const { url, serviceRoleKey } = await loadLocalEnvironment()
  const client = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const records = review.records
  const [sourceRows, institutionRows, partyRows, politicianRows, mandateRows] = await Promise.all([
    fetchRows(
      records.sources.map((row) => row.externalKey),
      async (chunk) => client.from('sources').select('id, external_key, name, organization, url, description')
        .in('external_key', chunk as string[]),
    ),
    fetchRows(
      records.institutions.map((row) => row.externalKey),
      async (chunk) => client.from('institutions').select('id, external_key, name, slug, branch, description, source_id, origin, source_url')
        .in('external_key', chunk as string[]),
    ),
    fetchRows(
      records.parties.map((row) => row.camaraId),
      async (chunk) => client.from('parties').select('id, camara_id, acronym, name, source_id, origin, source_url, last_updated_at')
        .in('camara_id', chunk as number[]),
    ),
    fetchRows(
      records.politicians.map((row) => row.camaraId),
      async (chunk) => client.from('politicians').select('id, camara_id, full_name, slug, state, party_id, source_id, origin, source_url, last_updated_at')
        .in('camara_id', chunk as number[]),
    ),
    fetchRows(
      records.mandates.map((row) => row.camaraDeputyId),
      async (chunk) => client.from('mandates').select('id, camara_deputy_id, camara_legislature_id, politician_id, institution_id, party_id, title, district, start_date, end_date, status, source_id, origin, source_url, last_updated_at')
        .in('camara_deputy_id', chunk as number[]),
    ),
  ])
  buildKeyMap(sourceRows, (row) => row.external_key ?? '', 'sources.external_key')
  buildKeyMap(institutionRows, (row) => row.external_key ?? '', 'institutions.external_key')
  buildKeyMap(partyRows, (row) => String(row.camara_id), 'parties.camara_id')
  buildKeyMap(politicianRows, (row) => String(row.camara_id), 'politicians.camara_id')
  buildKeyMap(
    mandateRows.filter((row) => row.camara_legislature_id !== null),
    (row) => `${row.camara_deputy_id}:${row.camara_legislature_id}`,
    'mandates.camara deputy/legislature',
  )

  const makeInsertUpdate = <T, Row extends StoredRow, WritePayload extends object>(
    table: TableName,
    recordRows: T[],
    existing: Row[],
    keyOfRecord: (record: T) => string,
    keyOfRow: (row: Row) => string,
    payloadOf: (record: T, isApply: boolean) => Promise<WritePayload>,
    insert: (rows: WritePayload[]) => Promise<Row[]>,
    update: (id: string, row: WritePayload) => Promise<void>,
    preserveNullOnUpdate?: readonly string[],
  ) => syncRecords(
    { table, records: recordRows, rows: existing, recordKey: keyOfRecord, rowKey: keyOfRow, payload: payloadOf, insert, update, preserveNullOnUpdate },
    report,
    args.apply,
  )

  const sourceMap = await makeInsertUpdate<SourceRecord, typeof sourceRows[number], Database['public']['Tables']['sources']['Insert']>(
    'sources', records.sources, sourceRows, (row) => row.externalKey, (row) => row.external_key ?? '',
    async (row) => ({
      external_key: row.externalKey, name: row.name, organization: row.organization,
      url: row.url, description: row.description,
    }),
    async (rows) => {
      const { data, error } = await client.from('sources').insert(rows).select('id, external_key, name, organization, url, description')
      if (error) throw new Error(error.message)
      return data
    },
    async (id, row) => {
      const { error } = await client.from('sources').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    },
    ['description'],
  )

  const institutionMap = await makeInsertUpdate<InstitutionRecord, typeof institutionRows[number], Database['public']['Tables']['institutions']['Insert']>(
    'institutions', records.institutions, institutionRows, (row) => row.externalKey, (row) => row.external_key ?? '',
    async (row, isApply) => ({
      external_key: row.externalKey, name: row.name, slug: row.slug, branch: row.branch,
      description: row.description, source_id: requireId(sourceMap, row.sourceKey, 'source', isApply),
      origin: row.origin, source_url: row.sourceUrl,
    }),
    async (rows) => {
      const { data, error } = await client.from('institutions').insert(rows).select('id, external_key, name, slug, branch, description, source_id, origin, source_url')
      if (error) throw new Error(error.message)
      return data
    },
    async (id, row) => {
      const { error } = await client.from('institutions').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    },
    ['description'],
  )

  const partyMap = await makeInsertUpdate<PartyRecord, typeof partyRows[number], Database['public']['Tables']['parties']['Insert']>(
    'parties', records.parties, partyRows, (row) => String(row.camaraId), (row) => String(row.camara_id),
    async (row, isApply) => ({
      camara_id: row.camaraId, acronym: row.acronym, name: row.name,
      source_id: requireId(sourceMap, row.sourceKey, 'source', isApply),
      origin: row.origin, source_url: row.sourceUrl, last_updated_at: row.lastUpdatedAt,
    }),
    async (rows) => {
      const { data, error } = await client.from('parties').insert(rows).select('id, camara_id, acronym, name, source_id, origin, source_url, last_updated_at')
      if (error) throw new Error(error.message)
      return data
    },
    async (id, row) => {
      const { error } = await client.from('parties').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    },
    ['last_updated_at'],
  )

  const politicianMap = await makeInsertUpdate<PoliticianRecord, typeof politicianRows[number], Database['public']['Tables']['politicians']['Insert']>(
    'politicians', records.politicians, politicianRows, (row) => String(row.camaraId), (row) => String(row.camara_id),
    async (row, isApply) => ({
      camara_id: row.camaraId, full_name: row.fullName, slug: row.slug, state: row.state,
      party_id: requireId(partyMap, String(row.partyCamaraId), 'party', isApply),
      source_id: requireId(sourceMap, row.sourceKey, 'source', isApply),
      origin: row.origin, source_url: row.sourceUrl, last_updated_at: row.lastUpdatedAt,
    }),
    async (rows) => {
      const { data, error } = await client.from('politicians').insert(rows).select('id, camara_id, full_name, slug, state, party_id, source_id, origin, source_url, last_updated_at')
      if (error) throw new Error(error.message)
      return data
    },
    async (id, row) => {
      const { error } = await client.from('politicians').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    },
    ['last_updated_at'],
  )

  await makeInsertUpdate<MandateRecord, typeof mandateRows[number], Database['public']['Tables']['mandates']['Insert']>(
    'mandates',
    records.mandates,
    mandateRows.filter((row) => row.camara_legislature_id !== null),
    (row) => `${row.camaraDeputyId}:${row.camaraLegislatureId}`,
    (row) => `${row.camara_deputy_id}:${row.camara_legislature_id}`,
    async (row, isApply) => ({
      camara_deputy_id: row.camaraDeputyId, camara_legislature_id: row.camaraLegislatureId,
      politician_id: requireId(politicianMap, String(row.camaraDeputyId), 'politician', isApply),
      institution_id: requireId(institutionMap, row.institutionKey, 'institution', isApply),
      party_id: requireId(partyMap, String(row.partyCamaraId), 'party', isApply),
      title: row.title, district: row.district, start_date: row.startDate, end_date: row.endDate,
      status: row.status, source_id: requireId(sourceMap, row.sourceKey, 'source', isApply),
      origin: row.origin, source_url: row.sourceUrl, last_updated_at: null,
    }),
    async (rows) => {
      const { data, error } = await client.from('mandates').insert(rows).select('id, camara_deputy_id, camara_legislature_id, politician_id, institution_id, party_id, title, district, start_date, end_date, status, source_id, origin, source_url, last_updated_at')
      if (error) throw new Error(error.message)
      return data
    },
    async (id, row) => {
      const { error } = await client.from('mandates').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    },
    ['start_date', 'end_date', 'last_updated_at'],
  )

  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length > 0) process.exitCode = 1
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Falha inesperada na importação.'
  console.error(JSON.stringify({
    mode: process.argv.includes('--apply') ? 'apply' : 'preview',
    totals: { inserted: 0, updated: 0, ignored: 0, errors: 1 },
    errors: [{ table: 'preflight', key: 'run', message }],
  }, null, 2))
  process.exitCode = 1
})
