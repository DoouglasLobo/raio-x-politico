import { supabase } from '../lib/supabase'

export type OfficialResource<T> = {
  data: T[] | null
  error: string | null
}

export type ChamberDeputy = {
  id: number
  uri: string
  nomeCivil: string | null
  ultimoStatus: {
    nome: string
    nomeEleitoral: string | null
    siglaPartido: string | null
    siglaUf: string | null
    idLegislatura: number | null
    urlFoto: string | null
    email: string | null
    data: string | null
    situacao: string | null
    condicaoEleitoral: string | null
    gabinete: {
      nome: string | null
      predio: string | null
      sala: string | null
      andar: string | null
      telefone: string | null
      email: string | null
    } | null
  }
}

export type ChamberProposal = {
  id: number
  uri: string
  siglaTipo: string
  numero: number
  ano: number
  ementa: string | null
  dataApresentacao: string | null
}

export type ChamberCommittee = {
  idOrgao: number
  uriOrgao: string
  siglaOrgao: string
  nomeOrgao: string
  nomePublicacao: string
  titulo: string | null
  dataInicio: string | null
  dataFim: string | null
}

export type ChamberSpeech = {
  dataHoraInicio: string | null
  tipoDiscurso: string | null
  sumario: string | null
  urlTexto: string | null
  urlAudio: string | null
  urlVideo: string | null
}

export type ChamberExpense = {
  dataDocumento: string | null
  tipoDespesa: string | null
  nomeFornecedor: string | null
  valorDocumento: number | null
  valorLiquido: number | null
  numDocumento: string | null
  urlDocumento: string | null
}

export type ChamberDeputyProfile = {
  deputy: OfficialResource<ChamberDeputy>
  proposals: OfficialResource<ChamberProposal>
  committees: OfficialResource<ChamberCommittee>
  speeches: OfficialResource<ChamberSpeech>
  expenses: OfficialResource<ChamberExpense>
  expensesYear: number
}

export async function getChamberDeputyProfile(
  deputyId: number,
  expensesYear: number,
): Promise<ChamberDeputyProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado; os dados oficiais não podem ser consultados.')
  }

  const { data, error } = await supabase.functions.invoke<ChamberDeputyProfile>(
    'chamber-deputy-profile',
    { body: { deputyId, expensesYear } },
  )
  if (error) {
    throw new Error(`Não foi possível consultar os dados oficiais da Câmara: ${error.message}`)
  }
  if (!data) {
    throw new Error('A função de consulta da Câmara retornou uma resposta vazia.')
  }
  return data
}

export function isOfficialUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
