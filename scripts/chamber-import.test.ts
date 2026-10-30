import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPreview,
  CHAMBER_API_BASE_URL,
  parseReferenceSnapshot,
  type FetchLike,
} from './chamber-import.ts'

// Synthetic test fixtures only; these are not current real Câmara records.
const AS_OF = '2026-10-29'
const GENERATED_AT = '2026-10-29T12:00:00.000Z'

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

function page<T>(dados: T[], next?: string) {
  return {
    dados,
    links: next ? [{ rel: 'next', href: next }] : [],
  }
}

function legislature(id = 57) {
  return { id, dataInicio: '2023-02-01', dataFim: '2027-01-31' }
}

function party(id = 900001, acronym = 'TST') {
  return {
    id,
    sigla: acronym,
    nome: 'Partido de teste',
    uri: `${CHAMBER_API_BASE_URL}/partidos/${id}`,
  }
}

function deputy(id = 900101, acronym = 'TST', state = 'DF') {
  return {
    id,
    uri: `${CHAMBER_API_BASE_URL}/deputados/${id}`,
    nome: 'Pessoa de teste',
    siglaPartido: acronym,
    uriPartido: `${CHAMBER_API_BASE_URL}/partidos/900001`,
    siglaUf: state,
    idLegislatura: 57,
  }
}

function detail(
  id = 900101,
  overrides: Record<string, unknown> = {},
) {
  return {
    dados: {
      ultimoStatus: {
        id,
        nome: 'Pessoa de teste',
        siglaPartido: 'TST',
        siglaUf: 'DF',
        idLegislatura: 57,
        situacao: 'Exercício',
        data: '2026-02-01',
        ...overrides,
      },
    },
  }
}

type FixtureOptions = {
  deputyRows?: unknown[]
  deputyPages?: Record<string, unknown>
  parties?: unknown[]
  details?: Record<string, unknown>
  statusByPath?: Record<string, number[]>
  invalidBodyByPath?: Set<string>
}

function fixtureFetch(options: FixtureOptions = {}) {
  const requests: string[] = []
  const attempts = new Map<string, number>()
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(String(input))
    const path = `${url.pathname}${url.search}`
    requests.push(path)
    const count = (attempts.get(path) ?? 0) + 1
    attempts.set(path, count)
    const statuses = options.statusByPath?.[path] ?? []
    const status = statuses[count - 1]
    if (status) return jsonResponse({ error: 'test fixture HTTP failure' }, status)
    if (options.invalidBodyByPath?.has(path)) {
      return new Response('{not-json', { status: 200 })
    }

    if (url.pathname.endsWith('/legislaturas')) {
      return jsonResponse(page([legislature()]))
    }
    if (url.pathname.endsWith('/partidos')) {
      return jsonResponse(page(options.parties ?? [party()]))
    }
    if (url.pathname.endsWith('/deputados')) {
      const pageNumber = Number(url.searchParams.get('pagina') ?? '1')
      if (options.deputyPages?.[String(pageNumber)]) {
        return jsonResponse(options.deputyPages[String(pageNumber)])
      }
      return jsonResponse(page(options.deputyRows ?? [deputy()]))
    }
    const detailId = Number(url.pathname.split('/').at(-1))
    return jsonResponse(options.details?.[String(detailId)] ?? detail(detailId))
  }
  return { fetchImpl, requests, attempts }
}

function buildWithFixture(fetchImpl: FetchLike, extra: Parameters<typeof buildPreview>[0] = {}) {
  return buildPreview({
    fetchImpl,
    asOf: AS_OF,
    generatedAt: GENERATED_AT,
    maxRetries: 0,
    retryBaseDelayMs: 0,
    ...extra,
  })
}

test('percorre páginas, deduplica deputado e usa a filiação do detalhe atual', async () => {
  const secondDeputyUrl = `${CHAMBER_API_BASE_URL}/deputados?pagina=2`
  const result = fixtureFetch({
    parties: [party(900001, 'VELHO'), party(900002, 'ATUAL')],
    deputyPages: {
      '1': page([deputy(900101, 'VELHO'), deputy(900101, 'ATUAL')], secondDeputyUrl),
      '2': page([deputy(900102, 'ATUAL')]),
    },
    details: {
      '900101': detail(900101, { siglaPartido: 'ATUAL' }),
      '900102': detail(900102, { siglaPartido: 'ATUAL' }),
    },
  })

  const report = await buildWithFixture(result.fetchImpl)

  assert.equal(report.collection.deputyPages, 2)
  assert.equal(report.collection.listedRows, 3)
  assert.equal(report.collection.uniqueDeputyIds, 2)
  assert.equal(report.collection.duplicateRows, 1)
  assert.equal(result.requests.filter((path) => path.endsWith('/deputados/900101')).length, 1)
  assert.equal(report.records.politicians.find((row) => row.camaraId === 900101)?.partyAcronym, 'ATUAL')
  assert.deepEqual(report.records.parties.map((row) => row.acronym), ['ATUAL'])
})

test('marca UF ausente e situação ambígua para revisão, sem incluir esses deputados', async () => {
  const result = fixtureFetch({
    deputyRows: [deputy(900101), deputy(900102)],
    details: {
      '900101': detail(900101, { siglaUf: null }),
      '900102': detail(900102, { situacao: null }),
    },
  })
  const report = await buildWithFixture(result.fetchImpl)

  assert.equal(report.records.politicians.length, 0)
  assert.equal(report.manualReview.length, 2)
  assert.ok(report.missingData.some((entry) => entry.key === '900101' && entry.fields.includes('UF')))
  assert.ok(report.manualReview.some((entry) => entry.key === '900102' && entry.reason.includes('situação atual')))
})

test('ignora status não ativo sem converter mandato em encerrado', async () => {
  const result = fixtureFetch({
    details: { '900101': detail(900101, { situacao: 'Licença' }) },
  })
  const report = await buildWithFixture(result.fetchImpl)

  assert.equal(report.records.mandates.length, 0)
  assert.match(report.ignored[0]?.reason ?? '', /Licença/)
  assert.equal(report.records.politicians.length, 0)
})

test('reporta erro para página com envelope inválido', async () => {
  const result = fixtureFetch()
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/legislaturas')) return jsonResponse({ resultado: [] })
    return result.fetchImpl(input, init)
  }
  const report = await buildWithFixture(fetchImpl)

  assert.equal(report.status, 'failed')
  assert.match(report.errors[0]?.message ?? '', /arrays em "dados" e "links"/)
})

test('registra falhas HTTP e tenta novamente em 429 e 5xx', async () => {
  const path = '/api/v2/legislaturas?pagina=1&ordem=DESC&ordenarPor=id&itens=100'
  const retrying = fixtureFetch({ statusByPath: { [path]: [429, 503] } })
  const retriedReport = await buildWithFixture(retrying.fetchImpl, {
    maxRetries: 2,
    retryBaseDelayMs: 0,
  })
  assert.notEqual(retriedReport.status, 'failed')
  assert.equal(retrying.attempts.get(path), 3)

  const failing = fixtureFetch({ statusByPath: { [path]: [404] } })
  const failedReport = await buildWithFixture(failing.fetchImpl)
  assert.equal(failedReport.status, 'failed')
  assert.match(failedReport.errors[0]?.message ?? '', /HTTP 404/)
})

test('reporta JSON inválido e falha individual do detalhe sem fabricar registros', async () => {
  const invalidPath = '/api/v2/legislaturas?pagina=1&ordem=DESC&ordenarPor=id&itens=100'
  const invalid = fixtureFetch({ invalidBodyByPath: new Set([invalidPath]) })
  const invalidReport = await buildWithFixture(invalid.fetchImpl)
  assert.equal(invalidReport.status, 'failed')
  assert.match(invalidReport.errors[0]?.message ?? '', /JSON inválida/)

  const failedDetailPath = '/api/v2/deputados/900101'
  const failingDetail = fixtureFetch({ statusByPath: { [failedDetailPath]: [500] } })
  const partialReport = await buildWithFixture(failingDetail.fetchImpl)
  assert.equal(partialReport.status, 'partial')
  assert.equal(partialReport.collection.failedDetailRequests, 1)
  assert.equal(partialReport.records.politicians.length, 0)
})

test('repete após falha de rede e rejeita datas oficiais inválidas', async () => {
  let requests = 0
  const recoveringFetch: FetchLike = async (input, init) => {
    if (new URL(String(input)).pathname.endsWith('/legislaturas') && requests++ === 0) {
      throw new Error('test-only temporary network outage')
    }
    return fixtureFetch().fetchImpl(input, init)
  }
  const recovered = await buildWithFixture(recoveringFetch, {
    maxRetries: 1,
    retryBaseDelayMs: 0,
  })
  assert.equal(recovered.status, 'completed')
  assert.equal(requests, 2)

  const invalidDateFetch: FetchLike = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/legislaturas')) {
      return jsonResponse(page([{ ...legislature(), dataInicio: '2023-02-30' }]))
    }
    return fixtureFetch().fetchImpl(input, init)
  }
  const invalidDateReport = await buildWithFixture(invalidDateFetch)
  assert.equal(invalidDateReport.status, 'failed')
  assert.match(invalidDateReport.errors[0]?.message ?? '', /Nenhuma legislatura oficial/)
  assert.equal(invalidDateReport.errors[0]?.scope, 'legislaturas')
})

test('a mesma prévia comparada com seu snapshot não propõe duplicatas', async () => {
  const initial = await buildWithFixture(fixtureFetch().fetchImpl)
  const reference = parseReferenceSnapshot({
    schemaVersion: 1,
    records: initial.records,
  })
  const repeated = await buildWithFixture(fixtureFetch().fetchImpl, { reference })

  for (const group of ['institutions', 'parties', 'politicians', 'mandates'] as const) {
    assert.equal(repeated.totals.proposals[group].insert, 0)
    assert.equal(repeated.totals.proposals[group].update, 0)
    assert.equal(repeated.totals.proposals[group].ignore, initial.records[group].length)
  }
})

test('marca registros legados sem IDs externos como possíveis duplicatas', async () => {
  const initial = await buildWithFixture(fixtureFetch().fetchImpl)
  const reference = parseReferenceSnapshot({
    schemaVersion: 1,
    records: {
      sources: [],
      institutions: [],
      parties: [],
      politicians: [],
      mandates: [],
    },
    unkeyed: {
      parties: [{ acronym: 'TST', name: 'Nome legado' }],
      politicians: [{ fullName: 'Pessoa de teste', state: 'DF' }],
    },
  })
  const repeated = await buildWithFixture(fixtureFetch().fetchImpl, { reference })

  assert.equal(repeated.totals.proposals.parties.review, 1)
  assert.equal(repeated.totals.proposals.politicians.review, 1)
  assert.equal(repeated.totals.proposals.parties.insert, 0)
  assert.equal(repeated.totals.proposals.politicians.insert, 0)
  assert.ok(initial.records.politicians.length > 0)
})

test('identifica atualização possível quando a filiação no snapshot difere', async () => {
  const initial = await buildWithFixture(fixtureFetch().fetchImpl)
  const reference = parseReferenceSnapshot({
    schemaVersion: 1,
    records: {
      ...initial.records,
      politicians: initial.records.politicians.map((person) => ({
        ...person,
        partyAcronym: 'ANTIGO',
      })),
    },
  })
  const repeated = await buildWithFixture(fixtureFetch().fetchImpl, { reference })

  assert.equal(repeated.totals.proposals.politicians.update, 1)
  assert.deepEqual(
    repeated.proposals.politicians[0]?.changedFields,
    ['partyAcronym'],
  )
})

test('marca como revisão sigla partidária sem correspondência única oficial', async () => {
  const result = fixtureFetch({
    parties: [party(900001, 'TST'), party(900002, 'TST')],
  })
  const report = await buildWithFixture(result.fetchImpl)

  assert.equal(report.records.politicians.length, 0)
  assert.ok(report.manualReview.some((entry) => entry.reason.includes('mais de um ID oficial')))
})
