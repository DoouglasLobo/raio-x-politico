import { useCallback, useState } from 'react'
import { ArrowLeft, ExternalLink, Landmark, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useChamberDeputyProfile } from '../hooks/useChamberDeputyProfile'
import { useRemoteData } from '../hooks/useRemoteData'
import {
  getPoliticianBySlug,
  type PoliticalMandate,
} from '../services/politicalData'
import {
  isOfficialUrl,
  type ChamberCommittee,
  type ChamberExpense,
  type ChamberProposal,
  type ChamberSpeech,
} from '../services/chamberOfficialData'

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Data não informada'
  const date = value.slice(0, 10)
  const parts = date.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}

const formatStatus = (status: PoliticalMandate['status']) => {
  if (status === 'current') return 'Registrado como atual no Supabase'
  if (status === 'ended') return 'Encerrado'
  return 'Situação não determinada'
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  )
}

function SectionState({
  loading,
  error,
  empty,
}: {
  loading: boolean
  error: string | null
  empty: boolean
}) {
  if (loading) return <p className="text-sm text-slate-600" role="status">Consultando a fonte oficial...</p>
  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
        Não foi possível consultar esta informação: {error}
      </p>
    )
  }
  if (empty) return <p className="text-sm text-slate-600">A API oficial não retornou registros para esta consulta.</p>
  return null
}

function MandateCard({ mandate }: { mandate: PoliticalMandate }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{mandate.title}</h3>
        <span className="pill">{formatStatus(mandate.status)}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {[mandate.institutionName, mandate.district].filter(Boolean).join(' · ') || 'Instituição e distrito não informados'}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Período: {formatDate(mandate.startDate)} – {mandate.endDate ? formatDate(mandate.endDate) : 'não informado'}
      </p>
      {mandate.partyAcronym && (
        <p className="mt-1 text-sm text-slate-600">
          Partido associado a este registro no Supabase: {mandate.partyAcronym}
          {mandate.partyName ? ` — ${mandate.partyName}` : ''}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Origem: {mandate.origin} · Atualização: {mandate.lastUpdatedAt ?? 'não informada'}
      </p>
      {isOfficialUrl(mandate.sourceUrl) && (
        <a
          href={mandate.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:text-sky-900"
        >
          Fonte do mandato <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  )
}

function ProposalCard({ proposal }: { proposal: ChamberProposal }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {proposal.siglaTipo} {proposal.numero}/{proposal.ano}
      </p>
      <p className="mt-2 text-sm text-slate-800">{proposal.ementa || 'Ementa não informada pela API.'}</p>
      <p className="mt-2 text-xs text-slate-500">Apresentação: {formatDate(proposal.dataApresentacao)}</p>
      {isOfficialUrl(proposal.uri) && (
        <a href={proposal.uri} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
          Consultar proposição <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  )
}

function CommitteeCard({ committee }: { committee: ChamberCommittee }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{committee.nomePublicacao || committee.nomeOrgao}</h3>
        {committee.siglaOrgao && <span className="pill">{committee.siglaOrgao}</span>}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Participação: {committee.titulo || 'não informada'} · Início: {formatDate(committee.dataInicio)}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {committee.dataFim
          ? `Fim informado pela Câmara: ${formatDate(committee.dataFim)}`
          : 'Sem data de encerramento informada pela API.'}
      </p>
      {isOfficialUrl(committee.uriOrgao) && (
        <a href={committee.uriOrgao} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
          Consultar órgão <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  )
}

function SpeechCard({ speech }: { speech: ChamberSpeech }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {speech.tipoDiscurso || 'Atividade parlamentar'}
      </p>
      <p className="mt-2 text-sm text-slate-800">{speech.sumario || 'Resumo não disponibilizado pela API.'}</p>
      <p className="mt-2 text-xs text-slate-500">{formatDate(speech.dataHoraInicio)}</p>
      {isOfficialUrl(speech.urlTexto) && (
        <a href={speech.urlTexto} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
          Consultar texto oficial <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  )
}

const formatCurrency = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return 'Não informado'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function ExpenseCard({ expense }: { expense: ChamberExpense }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{expense.tipoDespesa || 'Categoria não informada'}</h3>
        <span className="font-semibold text-slate-900">{formatCurrency(expense.valorDocumento)}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">Data do documento: {formatDate(expense.dataDocumento)}</p>
      <p className="mt-1 text-sm text-slate-600">Fornecedor: {expense.nomeFornecedor || 'Não informado'}</p>
      {expense.numDocumento && <p className="mt-1 text-xs text-slate-500">Documento: {expense.numDocumento}</p>}
      {expense.valorLiquido !== null && (
        <p className="mt-1 text-xs text-slate-500">Valor líquido informado pela API: {formatCurrency(expense.valorLiquido)}</p>
      )}
      {isOfficialUrl(expense.urlDocumento) && (
        <a href={expense.urlDocumento} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
          Abrir comprovante <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  )
}

export function PoliticianProfilePage({ slug }: { slug: string }) {
  const loadPolitician = useCallback(() => getPoliticianBySlug(slug), [slug])
  const remote = useRemoteData(loadPolitician)
  const [currentYear] = useState(() => new Date().getFullYear())
  const [expensesYear, setExpensesYear] = useState(currentYear)
  const politician = remote.data[0]
  const official = useChamberDeputyProfile(politician?.camaraId ?? null, expensesYear)
  const officialDeputy = official.data?.deputy.data?.[0]
  const status = officialDeputy?.ultimoStatus
  const displayName = status?.nomeEleitoral || status?.nome || politician?.name
  const photoUrl = status?.urlFoto
  const years = Array.from({ length: 5 }, (_, index) => currentYear - index)

  if (remote.loading) {
    return <div className="section-shell py-10"><div className="card p-5 text-sm text-slate-600" role="status">Carregando perfil do Supabase...</div></div>
  }
  if (remote.configurationError) {
    return <div className="section-shell py-10"><div className="card p-5 text-sm text-red-700" role="alert">{remote.configurationError}</div></div>
  }
  if (remote.error) {
    return <div className="section-shell py-10"><div className="card p-5 text-sm text-red-700" role="alert">Falha ao carregar o perfil: {remote.error}</div></div>
  }
  if (!politician) {
    return (
      <div className="section-shell space-y-4 py-10">
        <Link to="/politicos" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
          <ArrowLeft className="h-4 w-4" /> Voltar à listagem
        </Link>
        <div className="card p-5 text-sm text-slate-600" role="status">Político não encontrado no banco de dados.</div>
      </div>
    )
  }

  const currentParty = status?.siglaPartido || politician.partyAcronym
  const office = politician.mandates.find((mandate) => mandate.status === 'current') ?? politician.mandates[0]

  return (
    <div className="section-shell space-y-6 py-8 sm:py-10">
      <Link to="/politicos" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900">
        <ArrowLeft className="h-4 w-4" /> Voltar à listagem
      </Link>

      <header className="card overflow-hidden">
        <div className="bg-gradient-to-r from-sky-700 via-sky-600 to-slate-900 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/10 text-3xl font-bold">
              {photoUrl ? (
                <img src={photoUrl} alt={`Fotografia oficial de ${displayName}`} className="h-full w-full object-cover" />
              ) : (
                displayName?.slice(0, 1) ?? '?'
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
                {currentParty || 'Partido atual não informado'} · {status?.siglaUf || politician.state || 'UF não informada'}
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{displayName}</h1>
              {officialDeputy?.nomeCivil && officialDeputy.nomeCivil !== displayName && (
                <p className="mt-1 text-sm text-sky-100">Nome completo: {officialDeputy.nomeCivil}</p>
              )}
              <p className="mt-2 text-sm text-sky-100">{office?.title ?? 'Cargo não informado no Supabase'}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {status?.situacao && <span className="rounded-full border border-white/25 px-2.5 py-1">Situação atual: {status.situacao}</span>}
                {status?.condicaoEleitoral && <span className="rounded-full border border-white/25 px-2.5 py-1">Condição: {status.condicaoEleitoral}</span>}
                {politician.camaraId !== null && <span className="rounded-full border border-white/25 px-2.5 py-1">ID Câmara: {politician.camaraId}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Partido</p>
            <p className="mt-1 font-semibold text-slate-900">{currentParty || 'Não informado'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {status ? 'Filiação atual consultada na API da Câmara' : 'Filiação associada no registro do Supabase'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mandato</p>
            <p className="mt-1 font-semibold text-slate-900">{office?.title ?? 'Não informado'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {status?.idLegislatura ? `Legislatura ${status.idLegislatura}` : 'Período disponível abaixo'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Origem</p>
            <p className="mt-1 font-semibold text-slate-900">{status ? 'API oficial da Câmara + Supabase' : politician.origin}</p>
            <p className="mt-1 text-xs text-slate-500">
              Atualização no Supabase: {politician.lastUpdatedAt ?? 'não informada'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-slate-200 px-5 py-4 text-sm">
          {isOfficialUrl(officialDeputy?.uri) && (
            <a href={officialDeputy.uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700">
              Perfil oficial da Câmara <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {isOfficialUrl(politician.sourceUrl) && (
            <a href={politician.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700">
              Fonte cadastrada no Supabase <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </header>

      {politician.camaraId !== null && official.loading && (
        <div className="card p-4 text-sm text-slate-600" role="status">Consultando informações parlamentares oficiais...</div>
      )}
      {politician.camaraId !== null && official.error && (
        <div className="card p-4 text-sm text-red-700" role="alert">{official.error}</div>
      )}
      {politician.camaraId !== null && official.data?.deputy.error && (
        <div className="card p-4 text-sm text-amber-800" role="status">
          A consulta de detalhes à Câmara falhou: {official.data.deputy.error}. As informações cadastradas no Supabase continuam identificadas como tal.
        </div>
      )}
      {politician.camaraId === null && (
        <div className="card p-4 text-sm text-amber-800" role="status">
          Este registro não possui identificador da Câmara; os dados específicos da API oficial não podem ser associados com segurança.
        </div>
      )}

      <nav aria-label="Seções do perfil" className="card flex gap-2 overflow-x-auto p-3 text-sm">
        {[
          ['mandatos', 'Mandatos'],
          ['atuacao', 'Atuação'],
          ['votacoes', 'Votações'],
          ['despesas', 'Despesas'],
          ['fontes', 'Fontes'],
        ].map(([target, label]) => (
          <a key={target} href={`#${target}`} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 font-medium text-slate-700 hover:bg-sky-100">
            {label}
          </a>
        ))}
      </nav>

      <section id="mandatos" className="card scroll-mt-24 p-5 sm:p-6">
        <SectionHeading
          title="Mandatos cadastrados"
          description="Registros disponíveis no Supabase. O partido exibido em cada item é o partido associado àquele registro, não uma afirmação sobre a legenda pela qual foi eleito."
        />
        {politician.mandates.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhum mandato cadastrado.</p>
        ) : (
          <ul className="space-y-3">{politician.mandates.map((mandate) => <MandateCard key={mandate.id} mandate={mandate} />)}</ul>
        )}
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          A base contém apenas os mandatos que foram importados. Não há histórico confiável de filiações partidárias anteriores, e períodos sem datas permanecem sem inferência.
        </p>
      </section>

      <section id="atuacao" className="card scroll-mt-24 p-5 sm:p-6">
        <SectionHeading
          title="Atuação parlamentar"
          description="Proposições, vínculos com órgãos e discursos retornados pela API Dados Abertos da Câmara. As listas mostram até 10 itens por consulta."
        />
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Landmark className="h-4 w-4 text-sky-700" /> Proposições de autoria</h3>
            <SectionState
              loading={official.loading}
              error={official.data?.proposals.error ?? null}
              empty={!official.loading && !official.error && (official.data?.proposals.data?.length ?? 0) === 0}
            />
            {!!official.data?.proposals.data?.length && (
              <ul className="space-y-3">{official.data.proposals.data.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}</ul>
            )}
          </div>
          <div>
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-sky-700" /> Comissões e órgãos</h3>
            <SectionState
              loading={official.loading}
              error={official.data?.committees.error ?? null}
              empty={!official.loading && !official.error && (official.data?.committees.data?.length ?? 0) === 0}
            />
            {!!official.data?.committees.data?.length && (
              <ul className="space-y-3">{official.data.committees.data.map((committee, index) => <CommitteeCard key={`${committee.idOrgao}-${committee.dataInicio}-${index}`} committee={committee} />)}</ul>
            )}
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-slate-900">Discursos e atividades registradas</h3>
            <SectionState
              loading={official.loading}
              error={official.data?.speeches.error ?? null}
              empty={!official.loading && !official.error && (official.data?.speeches.data?.length ?? 0) === 0}
            />
            {!!official.data?.speeches.data?.length && (
              <ul className="space-y-3">{official.data.speeches.data.map((speech, index) => <SpeechCard key={`${speech.dataHoraInicio}-${index}`} speech={speech} />)}</ul>
            )}
          </div>
        </div>
      </section>

      <section id="votacoes" className="card scroll-mt-24 p-5 sm:p-6">
        <SectionHeading
          title="Votações nominais"
          description="Nenhum posicionamento individual é inferido a partir de ausência ou de resultados gerais."
        />
        <p className="text-sm text-slate-600">
          A consulta oficial por deputado não disponibilizou, nesta integração, registros individuais de voto que possam ser relacionados com segurança. Por isso, não são exibidos votos “sim”, “não”, abstenção, obstrução ou ausência. Consulte as votações diretamente na API oficial.
        </p>
        <a href="https://dadosabertos.camara.leg.br/swagger/api.html" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
          Documentação da API da Câmara <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </section>

      <section id="despesas" className="card scroll-mt-24 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="Despesas da cota parlamentar"
            description="Lançamentos individuais consultados diretamente na API. Valores não são somados a salários nem a outras categorias."
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Ano
            <select
              value={expensesYear}
              onChange={(event) => setExpensesYear(Number(event.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800"
              aria-label="Ano das despesas"
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>
        <SectionState
          loading={official.loading}
          error={official.data?.expenses.error ?? null}
          empty={!official.loading && !official.error && (official.data?.expenses.data?.length ?? 0) === 0}
        />
        {!official.loading && !official.data?.expenses.error && official.data?.expenses.data?.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">A ausência de resultados nesta consulta anual não significa que não existam despesas em outros anos ou categorias.</p>
        )}
        {!!official.data?.expenses.data?.length && (
          <ul className="space-y-3">{official.data.expenses.data.map((expense, index) => <ExpenseCard key={`${expense.numDocumento}-${expense.dataDocumento}-${index}`} expense={expense} />)}</ul>
        )}
      </section>

      <section id="fontes" className="card scroll-mt-24 p-5 sm:p-6">
        <SectionHeading
          title="Fontes e atualização"
          description="Os dados oficiais são consultados ao abrir o perfil; as informações de mandato são registros persistidos no Supabase."
        />
        <ul className="space-y-2 text-sm text-slate-600">
          <li>Dados armazenados: Supabase · origem do registro: {politician.origin}.</li>
          <li>Atualização registrada no banco: {politician.lastUpdatedAt ?? 'não informada'}.</li>
          {status?.data && <li>Status consultado diretamente na API da Câmara: {formatDate(status.data)}.</li>}
          {isOfficialUrl(officialDeputy?.uri) && (
            <li><a href={officialDeputy.uri} target="_blank" rel="noreferrer" className="font-semibold text-sky-700">Registro oficial do parlamentar</a></li>
          )}
          <li><a href="https://dadosabertos.camara.leg.br/swagger/api.html" target="_blank" rel="noreferrer" className="font-semibold text-sky-700">Documentação Dados Abertos da Câmara</a></li>
        </ul>
      </section>
    </div>
  )
}
