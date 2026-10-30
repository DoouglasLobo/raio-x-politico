import { supabase } from '../lib/supabase'

export type PoliticalMandate = {
  title: string
  district: string | null
  startDate: string | null
  endDate: string | null
  status: 'current' | 'ended' | 'unknown'
  institutionName: string | null
  sourceUrl: string
  origin: string
  lastUpdatedAt: string | null
}

export type Politician = {
  id: string
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

function getClient() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha as variáveis em .env.local e reinicie o Vite.')
  }

  return supabase
}

export async function listPoliticians(): Promise<Politician[]> {
  const client = getClient()
  const [politiciansResult, partiesResult, mandatesResult, institutionsResult] = await Promise.all([
    client
      .from('politicians')
      .select('id, full_name, slug, state, party_id, origin, source_url, last_updated_at')
      .order('full_name'),
    client.from('parties').select('id, acronym'),
    client
      .from('mandates')
      .select(
        'politician_id, institution_id, title, district, start_date, end_date, status, origin, source_url, last_updated_at',
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

  const partiesById = new Map(partiesResult.data.map((party) => [party.id, party.acronym]))
  const institutionsById = new Map(institutionsResult.data.map((institution) => [institution.id, institution.name]))

  return politiciansResult.data.map((politician) => ({
    id: politician.id,
    name: politician.full_name,
    slug: politician.slug,
    state: politician.state,
    partyAcronym: politician.party_id ? partiesById.get(politician.party_id) ?? null : null,
    origin: politician.origin,
    sourceUrl: politician.source_url,
    lastUpdatedAt: politician.last_updated_at,
    mandates: mandatesResult.data
      .filter((mandate) => mandate.politician_id === politician.id)
      .map((mandate) => ({
        title: mandate.title,
        district: mandate.district,
        startDate: mandate.start_date,
        endDate: mandate.end_date,
        status: mandate.status,
        institutionName: mandate.institution_id
          ? institutionsById.get(mandate.institution_id) ?? null
          : null,
        sourceUrl: mandate.source_url,
        origin: mandate.origin,
        lastUpdatedAt: mandate.last_updated_at,
      })),
  }))
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
