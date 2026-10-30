import { supabase } from '../lib/supabase'

export type PoliticalMandate = {
  id: string
  title: string
  district: string | null
  startDate: string | null
  endDate: string | null
  status: 'current' | 'ended' | 'unknown'
  partyAcronym: string | null
  partyName: string | null
  institutionName: string | null
  sourceUrl: string
  origin: string
  lastUpdatedAt: string | null
}

export type Politician = {
  id: string
  camaraId: number | null
  name: string
  slug: string
  state: string | null
  partyAcronym: string | null
  origin: string
  sourceUrl: string
  lastUpdatedAt: string | null
  mandates: PoliticalMandate[]
}

export type Institution = {
  id: string
  name: string
  slug: string
  branch: string | null
  description: string | null
  origin: string
  sourceUrl: string
  lastUpdatedAt: string | null
}

export type HomeStatistic = {
  label: string
  value: number
  note: string
}

function getClient() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha as variáveis em .env.local e reinicie o Vite.')
  }

  return supabase
}

export async function getHomeStatistics(): Promise<HomeStatistic[]> {
  const client = getClient()
  const [politicians, parties, mandates, institutions, sources] = await Promise.all([
    client.from('politicians').select('id', { count: 'exact', head: true }),
    client.from('parties').select('id', { count: 'exact', head: true }),
    client.from('mandates').select('id', { count: 'exact', head: true }),
    client.from('institutions').select('id', { count: 'exact', head: true }),
    client.from('sources').select('id', { count: 'exact', head: true }),
  ])

  if (politicians.error) {
    throw new Error(`Não foi possível contar políticos: ${politicians.error.message}`)
  }
  if (parties.error) {
    throw new Error(`Não foi possível contar partidos: ${parties.error.message}`)
  }
  if (mandates.error) {
    throw new Error(`Não foi possível contar mandatos: ${mandates.error.message}`)
  }
  if (institutions.error) {
    throw new Error(`Não foi possível contar instituições: ${institutions.error.message}`)
  }
  if (sources.error) {
    throw new Error(`Não foi possível contar fontes: ${sources.error.message}`)
  }

  return [
    { label: 'Políticos cadastrados', value: politicians.count ?? 0, note: 'Total de registros na base' },
    { label: 'Partidos cadastrados', value: parties.count ?? 0, note: 'Total de registros na base' },
    { label: 'Mandatos cadastrados', value: mandates.count ?? 0, note: 'Inclui todos os status' },
    { label: 'Instituições cadastradas', value: institutions.count ?? 0, note: 'Total de registros na base' },
    { label: 'Fontes cadastradas', value: sources.count ?? 0, note: 'Total de registros na base' },
  ]
}

export async function listPoliticians(): Promise<Politician[]> {
  const client = getClient()
  const [politiciansResult, partiesResult, mandatesResult, institutionsResult] = await Promise.all([
    client
      .from('politicians')
      .select('id, camara_id, full_name, slug, state, party_id, origin, source_url, last_updated_at')
      .order('full_name'),
    client.from('parties').select('id, acronym, name'),
    client
      .from('mandates')
      .select(
        'id, politician_id, institution_id, party_id, title, district, start_date, end_date, status, origin, source_url, last_updated_at',
      )
      .order('start_date', { ascending: false }),
    client.from('institutions').select('id, name'),
  ])

  if (politiciansResult.error) {
    throw new Error(`Não foi possível carregar políticos: ${politiciansResult.error.message}`)
  }
  if (partiesResult.error) {
    throw new Error(`Não foi possível carregar partidos: ${partiesResult.error.message}`)
  }
  if (mandatesResult.error) {
    throw new Error(`Não foi possível carregar mandatos: ${mandatesResult.error.message}`)
  }
  if (institutionsResult.error) {
    throw new Error(`Não foi possível carregar instituições dos mandatos: ${institutionsResult.error.message}`)
  }

  const partiesById = new Map(partiesResult.data.map((party) => [party.id, party]))
  const institutionsById = new Map(institutionsResult.data.map((institution) => [institution.id, institution.name]))

  return politiciansResult.data.map((politician) => ({
    id: politician.id,
    camaraId: politician.camara_id,
    name: politician.full_name,
    slug: politician.slug,
    state: politician.state,
    partyAcronym: politician.party_id ? partiesById.get(politician.party_id)?.acronym ?? null : null,
    origin: politician.origin,
    sourceUrl: politician.source_url,
    lastUpdatedAt: politician.last_updated_at,
    mandates: mandatesResult.data
      .filter((mandate) => mandate.politician_id === politician.id)
      .map((mandate) => ({
        id: mandate.id,
        title: mandate.title,
        district: mandate.district,
        startDate: mandate.start_date,
        endDate: mandate.end_date,
        status: mandate.status,
        partyAcronym: mandate.party_id ? partiesById.get(mandate.party_id)?.acronym ?? null : null,
        partyName: mandate.party_id ? partiesById.get(mandate.party_id)?.name ?? null : null,
        institutionName: mandate.institution_id
          ? institutionsById.get(mandate.institution_id) ?? null
          : null,
        sourceUrl: mandate.source_url,
        origin: mandate.origin,
        lastUpdatedAt: mandate.last_updated_at,
      })),
  }))
}

export async function getPoliticianBySlug(slug: string): Promise<Politician[]> {
  const client = getClient()
  const { data: politician, error: politicianError } = await client
    .from('politicians')
    .select('id, camara_id, full_name, slug, state, party_id, origin, source_url, last_updated_at')
    .eq('slug', slug)
    .maybeSingle()

  if (politicianError) {
    throw new Error(`Não foi possível carregar o político: ${politicianError.message}`)
  }
  if (!politician) return []

  const { data: mandates, error: mandatesError } = await client
    .from('mandates')
    .select('id, politician_id, institution_id, party_id, title, district, start_date, end_date, status, origin, source_url, last_updated_at')
    .eq('politician_id', politician.id)
    .order('start_date', { ascending: false, nullsFirst: false })

  if (mandatesError) {
    throw new Error(`Não foi possível carregar os mandatos: ${mandatesError.message}`)
  }

  const partyIds = [...new Set([politician.party_id, ...mandates.map((mandate) => mandate.party_id)].filter(
    (id): id is string => id !== null,
  ))]
  const institutionIds = [...new Set(mandates.map((mandate) => mandate.institution_id).filter(
    (id): id is string => id !== null,
  ))]
  const [partiesResult, institutionsResult] = await Promise.all([
    partyIds.length > 0
      ? client.from('parties').select('id, acronym, name').in('id', partyIds)
      : Promise.resolve({ data: [], error: null }),
    institutionIds.length > 0
      ? client.from('institutions').select('id, name').in('id', institutionIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (partiesResult.error) {
    throw new Error(`Não foi possível carregar os partidos do perfil: ${partiesResult.error.message}`)
  }
  if (institutionsResult.error) {
    throw new Error(`Não foi possível carregar as instituições dos mandatos: ${institutionsResult.error.message}`)
  }

  const partiesById = new Map(partiesResult.data.map((party) => [party.id, party]))
  const institutionsById = new Map(institutionsResult.data.map((institution) => [institution.id, institution.name]))
  return [{
    id: politician.id,
    camaraId: politician.camara_id,
    name: politician.full_name,
    slug: politician.slug,
    state: politician.state,
    partyAcronym: politician.party_id ? partiesById.get(politician.party_id)?.acronym ?? null : null,
    origin: politician.origin,
    sourceUrl: politician.source_url,
    lastUpdatedAt: politician.last_updated_at,
    mandates: mandates.map((mandate) => {
      const party = mandate.party_id ? partiesById.get(mandate.party_id) : null
      return {
        id: mandate.id,
        title: mandate.title,
        district: mandate.district,
        startDate: mandate.start_date,
        endDate: mandate.end_date,
        status: mandate.status,
        partyAcronym: party?.acronym ?? null,
        partyName: party?.name ?? null,
        institutionName: mandate.institution_id
          ? institutionsById.get(mandate.institution_id) ?? null
          : null,
        sourceUrl: mandate.source_url,
        origin: mandate.origin,
        lastUpdatedAt: mandate.last_updated_at,
      }
    }),
  }]
}

export async function listInstitutions(): Promise<Institution[]> {
  const { data, error } = await getClient()
    .from('institutions')
    .select('id, name, slug, branch, description, origin, source_url, last_updated_at')
    .order('name')

  if (error) {
    throw new Error(`Não foi possível carregar instituições: ${error.message}`)
  }

  return data.map((institution) => ({
    id: institution.id,
    name: institution.name,
    slug: institution.slug,
    branch: institution.branch,
    description: institution.description,
    origin: institution.origin,
    sourceUrl: institution.source_url,
    lastUpdatedAt: institution.last_updated_at,
  }))
}
