const API_BASE_URL = 'https://dadosabertos.camara.leg.br/api/v2'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

type ApiEnvelope<T> = {
  dados?: T | T[]
  detail?: string
  title?: string
}

type OfficialResource<T> = {
  data: T[] | null
  error: string | null
}

async function requestApi<T>(path: string): Promise<OfficialResource<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    const body = await response.json() as ApiEnvelope<T>
    if (!response.ok) {
      throw new Error(body.detail ?? body.title ?? `HTTP ${response.status}`)
    }
    if (body.dados === undefined) {
      throw new Error('A resposta da API não contém o campo esperado.')
    }
    return {
      data: Array.isArray(body.dados) ? body.dados : [body.dados],
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Falha inesperada ao consultar a API da Câmara.',
    }
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405)
  }

  let body: { deputyId?: unknown; expensesYear?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400)
  }

  const deputyId = body.deputyId
  const expensesYear = body.expensesYear
  if (
    typeof deputyId !== 'number'
    || !Number.isSafeInteger(deputyId)
    || deputyId < 1
    || deputyId > 1_000_000_000
  ) {
    return jsonResponse({ error: 'ID oficial do deputado inválido.' }, 400)
  }
  if (
    typeof expensesYear !== 'number'
    || !Number.isInteger(expensesYear)
    || expensesYear < 2000
    || expensesYear > 2100
  ) {
    return jsonResponse({ error: 'Ano de despesas inválido.' }, 400)
  }

  const deputyPath = `/deputados/${deputyId}`
  const [deputy, proposals, committees, speeches, expenses] = await Promise.all([
    requestApi(`${deputyPath}`),
    requestApi(
      `/proposicoes?idDeputadoAutor=${deputyId}&ordem=DESC&ordenarPor=id&itens=10`,
    ),
    requestApi(`${deputyPath}/orgaos?ordem=DESC&ordenarPor=dataInicio&itens=10`),
    requestApi(`${deputyPath}/discursos?ordem=DESC&ordenarPor=dataHoraInicio&itens=10`),
    requestApi(
      `${deputyPath}/despesas?ano=${expensesYear}&ordem=DESC&ordenarPor=dataDocumento&itens=10`,
    ),
  ])

  return jsonResponse({ deputy, proposals, committees, speeches, expenses, expensesYear })
})
