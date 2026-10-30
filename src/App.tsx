import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileText,
  Gavel,
  Landmark,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link, NavLink, Route, Routes, useParams } from 'react-router-dom'
import { supabase, supabaseConfigurationError } from './lib/supabase'
import { useRemoteData } from './hooks/useRemoteData'
import { PoliticianProfilePage } from './components/PoliticianProfilePage'
import {
  getHomeStatistics,
  listInstitutions,
  listPoliticians,
  type Institution,
  type PoliticalMandate,
  type Politician,
} from './services/politicalData'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)

const chartCurrencyFormatter = (value: string | number | ReadonlyArray<string | number> | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value
  return formatCurrency(Number(raw ?? 0))
}

const politicians = [
  {
    slug: 'lula',
    name: 'Luiz Inácio Lula da Silva',
    office: 'Presidente da República',
    party: 'PT',
    state: 'SP',
    term: '2023–2026',
    mandate: 'Ex-presidente e atual chefe do Executivo federal',
    avatar: 'L',
    status: 'Presente',
    compensation: 87000,
    attendance: 92,
    votes: 78,
    projects: 14,
    assets: 2020000,
  },
  {
    slug: 'simone-tebet',
    name: 'Simone Tebet',
    office: 'Senadora da República',
    party: 'MDB',
    state: 'MS',
    term: '2023–2027',
    mandate: 'Senadora por Mato Grosso do Sul',
    avatar: 'S',
    status: 'Em atividade',
    compensation: 42000,
    attendance: 89,
    votes: 74,
    projects: 7,
    assets: 1450000,
  },
  {
    slug: 'dino',
    name: 'Flávio Dino',
    office: 'Ministro do Supremo Tribunal Federal',
    party: 'Sem partido',
    state: 'MA',
    term: '2023–2029',
    mandate: 'Ministro do STF',
    avatar: 'F',
    status: 'Ativo',
    compensation: 56000,
    attendance: 96,
    votes: 84,
    projects: 3,
    assets: 1850000,
  },
  {
    slug: 'tarcisio',
    name: 'Tarcísio de Freitas',
    office: 'Governador de São Paulo',
    party: 'Republicanos',
    state: 'SP',
    term: '2023–2026',
    mandate: 'Gestão estadual',
    avatar: 'T',
    status: 'Em atividade',
    compensation: 47000,
    attendance: 88,
    votes: 71,
    projects: 10,
    assets: 1300000,
  },
]

const newsItems = [
  {
    title: 'Congresso discute calendário de votações de medidas de apoio ao orçamento federal',
    type: 'Fato confirmado',
    period: 'Hoje',
    publishedAt: '2026-10-29',
    source: 'Congresso Nacional',
    link: '#',
  },
  {
    title: 'Ministério do Planejamento publica atualização de dados de execução orçamentária',
    type: 'Declaração oficial',
    period: '7 dias',
    publishedAt: '2026-10-25',
    source: 'MP',
    link: '#',
  },
  {
    title: 'Comissões parlamentares revisam pareceres sobre regulação de transparência pública',
    type: 'Análise',
    period: '30 dias',
    publishedAt: '2026-10-12',
    source: 'Agência Câmara',
    link: '#',
  },
]

const events = [
  { title: 'Sessão deliberativa da Câmara', date: '2026-11-02', time: '14:00', location: 'Brasília' },
  { title: 'Comissão de Constituição e Justiça', date: '2026-11-04', time: '09:30', location: 'Senado' },
  { title: 'Audiência pública sobre gastos de infraestrutura', date: '2026-11-09', time: '11:00', location: 'Comissão Mista' },
]

const votes = [
  {
    proposal: 'PL 4.321/2026',
    title: 'Reforma de transparência orçamentária',
    topic: 'Transparência',
    result: 'Aprovado',
    status: 'Plenário',
    date: '2026-10-22',
    parties: 'PT, PSDB, PSD',
  },
  {
    proposal: 'PEC 52/2026',
    title: 'Limite de gastos para estados e municípios',
    topic: 'Fiscalização',
    result: 'Em análise',
    status: 'Comissão',
    date: '2026-10-18',
    parties: 'Todos',
  },
  {
    proposal: 'PL 3.101/2026',
    title: 'Regulamento de investimentos em saneamento',
    topic: 'Infraestrutura',
    result: 'Vetado',
    status: 'Presidência',
    date: '2026-10-12',
    parties: 'PSB, PP',
  },
]

const spending = [
  { category: 'Remuneração', value: 8900000, period: '2026/Q3', source: 'Câmara dos Deputados' },
  { category: 'Verbas de gabinete', value: 4200000, period: '2026/Q3', source: 'Senado Federal' },
  { category: 'Pessoal', value: 6400000, period: '2026/Q3', source: 'Presidência' },
  { category: 'Diárias e viagens', value: 1320000, period: '2026/Q3', source: 'Portal da Transparência' },
]

const justiceCases = [
  {
    title: 'Caso de denúncia recebida em STF',
    status: 'Denúncia recebida',
    court: 'Supremo Tribunal Federal',
    updated: '2026-10-21',
    summary: 'Processo em fase de instrução e análise preliminar; não houve condenação confirmada.',
  },
  {
    title: 'Recurso contra decisão em instância superior',
    status: 'Recurso pendente',
    court: 'STJ',
    updated: '2026-10-10',
    summary: 'A decisão de primeira instância foi mantida em parte, e o recurso segue em tramitação.',
  },
  {
    title: 'Arquivamento de investigação',
    status: 'Arquivamento',
    court: 'Tribunal Regional Federal',
    updated: '2026-09-29',
    summary: 'Investigação encerrada por ausência de elementos suficientes para prosseguimento.',
  },
]

const institutions = [
  { name: 'Presidência da República', role: 'Executivo federal', description: 'Coordena a administração pública federal e propõe agenda e prioridades do governo.' },
  { name: 'Congresso Nacional', role: 'Legislativo federal', description: 'Analisa projetos, vota leis e fiscaliza a execução do orçamento e de políticas públicas.' },
  { name: 'Supremo Tribunal Federal', role: 'Judiciário', description: 'Interpreta a Constituição, julga ações de maior relevância e decide conflitos institucionais.' },
  { name: 'Tribunal de Contas da União', role: 'Controle externo', description: 'Audita a execução orçamentária, financeira e patrimonial da União.' },
]

const calendarItems = [
  { when: '02 nov', title: 'Sessão ordinária da Câmara', kind: 'Legislativa' },
  { when: '04 nov', title: 'Comissão de Justiça e Cidadania', kind: 'Comissão' },
  { when: '09 nov', title: 'Audiência pública de orçamento', kind: 'Audiência' },
]

const comparisonData = [
  { name: 'Presença', lula: 92, tebet: 89, dino: 96, tarcisio: 88 },
  { name: 'Projeto', lula: 14, tebet: 7, dino: 3, tarcisio: 10 },
  { name: 'Votação', lula: 78, tebet: 74, dino: 84, tarcisio: 71 },
]

const methodNotes = [
  'Dados de aplicação exemplificativa e estruturada para protótipo, com foco em apresentação e navegação.',
  'Cada card contém categoria, valor, fonte, período e referência de atualização para facilitar checagem.',
  'O objetivo é apresentar transparência pública de forma responsável, sem inferir culpa ou produtividade a partir de ausência de dados.',
]

const navItems = [
  { to: '/', label: 'Início' },
  { to: '/politicos', label: 'Políticos' },
  { to: '/gastos', label: 'Gastos' },
  { to: '/votacoes', label: 'Votações' },
  { to: '/comparador', label: 'Comparador' },
  { to: '/noticias', label: 'Notícias' },
  { to: '/calendario', label: 'Agenda' },
  { to: '/justica', label: 'Justiça' },
  { to: '/instituicoes', label: 'Instituições' },
  { to: '/metodologia', label: 'Metodologia' },
  { to: '/admin', label: 'Admin' },
]

type DirectoryEntry = {
  slug: string
  name: string
  office: string
  party: string
  state: string
  term: string
  avatar: string
  attendance: number | null
  votes: number | null
}

function SectionTitle({ eyebrow, title, paragraph }: { eyebrow: string; title: string; paragraph: string }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">{eyebrow}</p>
      <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{paragraph}</p>
    </div>
  )
}

function DataMessage({ children, isError = false }: { children: ReactNode; isError?: boolean }) {
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`card col-span-full p-5 text-sm ${isError ? 'text-red-700' : 'text-slate-600'}`}
    >
      {children}
    </div>
  )
}

function mandatePeriod(mandate: PoliticalMandate) {
  const start = mandate.startDate?.split('-').reverse().join('/')
  const end = mandate.endDate?.split('-').reverse().join('/')

  if (start && end) return `${start}–${end}`
  if (start) return `${start}–em aberto`
  if (end) return `Até ${end}`
  return 'Período não informado'
}

function currentMandate(person: Politician) {
  return person.mandates.find((mandate) => mandate.status === 'current') ?? person.mandates[0]
}

function App() {
  const showDemoBanner = !supabase && !supabaseConfigurationError

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between gap-4 py-4">
          <Link to="/" className="flex items-center gap-3 text-lg font-bold tracking-tight text-slate-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-sm text-white shadow-soft">RX</span>
            Raio-X Político
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Link
            to="/politicos"
            className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
          >
            <Search className="h-4 w-4" />
            Buscar político
          </Link>
        </div>
      </header>

      {showDemoBanner && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          Demonstração: sem Supabase configurado, diretório, perfis e instituições usam exemplos ilustrativos; gastos,
          votações, notícias, agenda, Justiça, comparador, estatísticas e painel admin continuam demonstrativos. Conteúdo
          não verificado não deve ser tratado como informação política real.
        </div>
      )}

      <main className="pb-18">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/politicos" element={<DirectoryPage />} />
          <Route path="/politicos/:id" element={<OfficialProfileRoute />} />
          <Route path="/gastos" element={<SpendingPage />} />
          <Route path="/votacoes" element={<VotesPage />} />
          <Route path="/comparador" element={<ComparatorPage />} />
          <Route path="/noticias" element={<NewsPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/justica" element={<JusticePage />} />
          <Route path="/instituicoes" element={<InstitutionsPage />} />
          <Route path="/metodologia" element={<MethodologyPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="section-shell flex flex-col gap-3 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Raio-X Político • Informação pública, fontes verificáveis e política explicada sem complicação.</p>
          <p>Última atualização: 29/10/2026</p>
        </div>
      </footer>
    </div>
  )
}

function HomePage() {
  const [query, setQuery] = useState('')
  const remote = useRemoteData(listPoliticians)
  const statistics = useRemoteData(getHomeStatistics)

  const matches = remote.isConfigured
    ? remote.data.filter((person) =>
        `${person.name} ${person.partyAcronym ?? ''} ${person.mandates.map((mandate) => mandate.title).join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : politicians.filter((person) =>
        `${person.name} ${person.office} ${person.party}`.toLowerCase().includes(query.toLowerCase()),
      )

  return (
    <div className="section-shell space-y-10 py-10">
      <section className="card overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 p-6 text-white sm:p-8 lg:p-10">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">Transparência pública</p>
            <h1 className="max-w-xl text-4xl font-black tracking-tight sm:text-5xl">
              Entenda quem governa, o que faz e quanto custa.
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-200">
              Informação pública, fontes verificáveis e política explicada sem complicação.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-slate-600 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <Search className="h-5 w-5 text-sky-200" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar político, cargo, partido ou estado"
                  className="w-full border-0 bg-transparent text-sm text-white placeholder:text-slate-300 focus:outline-none"
                  aria-label="Buscar políticos"
                />
              </div>
              <Link
                to="/politicos"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-semibold text-slate-900 transition hover:bg-sky-100"
              >
                Ver diretório
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <p className="mt-3 text-xs text-sky-100">
              {remote.loading
                ? 'Carregando políticos do Supabase...'
                : remote.configurationError
                  ? remote.configurationError
                  : remote.error
                  ? `Não foi possível consultar os políticos: ${remote.error}`
                  : remote.isConfigured
                    ? `${matches.length} perfis correspondentes à busca atual.`
                    : `${matches.length} perfis demonstrativos correspondentes à busca atual.`}
            </p>

            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-200">
              {['Brasil', 'Dados públicos', 'Votações', 'Gastos', 'Justiça'].map((chip) => (
                <span key={chip} className="rounded-full border border-slate-500 bg-white/5 px-2.5 py-1">
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {statistics.isConfigured && !statistics.loading && !statistics.error && statistics.data.slice(0, 3).map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-700 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">{stat.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{stat.value.toLocaleString('pt-BR')}</p>
                <p className="mt-1 text-xs text-slate-300">{stat.note}</p>
              </div>
            ))}
            {statistics.loading && (
              <div className="rounded-2xl border border-slate-700 bg-white/5 p-4 text-sm text-slate-200" role="status">
                Carregando indicadores reais...
              </div>
            )}
            {statistics.configurationError && (
              <div className="rounded-2xl border border-amber-300/40 bg-amber-100/10 p-4 text-sm text-amber-100" role="alert">
                {statistics.configurationError}
              </div>
            )}
            {statistics.error && (
              <div className="rounded-2xl border border-red-300/40 bg-red-100/10 p-4 text-sm text-red-100" role="alert">
                {statistics.error}
              </div>
            )}
            {!statistics.isConfigured && !statistics.configurationError && (
              <div className="rounded-2xl border border-amber-300/40 bg-amber-100/10 p-4 text-sm text-amber-100" role="status">
                Configure o Supabase para carregar indicadores reais.
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Totais consultados diretamente no banco de dados.</p>
          {statistics.isConfigured && (
            <button
              type="button"
              onClick={statistics.refresh}
              disabled={statistics.loading}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
              aria-label="Atualizar indicadores"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statistics.loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          )}
        </div>
        {statistics.loading ? (
          <div className="card p-5 text-sm text-slate-600" role="status">Carregando indicadores reais...</div>
        ) : statistics.configurationError ? (
          <DataMessage isError>{statistics.configurationError}</DataMessage>
        ) : statistics.error ? (
          <DataMessage isError>Não foi possível carregar os indicadores: {statistics.error}</DataMessage>
        ) : !statistics.isConfigured ? (
          <DataMessage>Configure o Supabase para carregar indicadores reais.</DataMessage>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {statistics.data.map((stat) => (
              <div key={stat.label} className="stat-card">
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="mt-4 text-3xl font-bold text-slate-900">{stat.value.toLocaleString('pt-BR')}</p>
                <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-6">
          <SectionTitle
            eyebrow="Acontecimentos"
            title="Política em destaque"
            paragraph="Acompanhamento dos temas que movem a agenda pública e os debates institucionais do país."
          />

          <div className="space-y-4">
            {newsItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="pill">{item.type}</span>
                  <span className="text-xs text-slate-500">{item.period}</span>
                </div>
                <h3 className="text-base font-semibold text-slate-800">{item.title}</h3>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{item.source}</span>
                  <span>{item.publishedAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <SectionTitle
            eyebrow="Agenda"
            title="Próximos eventos"
            paragraph="Reuniões, sessões e audiências publicamente agendadas para os próximos dias."
          />

          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{event.location}</p>
                <h3 className="mt-2 text-base font-semibold text-slate-800">{event.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{event.date} • {event.time}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6">
          <SectionTitle
            eyebrow="Votações"
            title="Decisões relevantes"
            paragraph="Resumo das propostas em debate e de sua situação legislativa."
          />

          <div className="space-y-4">
            {votes.map((vote) => (
              <div key={vote.proposal} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{vote.proposal}</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-800">{vote.title}</h3>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {vote.result}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{vote.topic}</span>
                  <span>•</span>
                  <span>{vote.status}</span>
                  <span>•</span>
                  <span>{vote.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <SectionTitle
            eyebrow="Gastos"
            title="Dinheiro público"
            paragraph="Comparativo por categoria com fonte e período identificados."
          />

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spending}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `R$${value / 1000000}M`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={chartCurrencyFormatter} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            {spending.map((item) => (
              <div key={item.category} className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span>{item.category}</span>
                <span>{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <SectionTitle
          eyebrow="Comparador"
          title="Comparação rápida entre perfis"
          paragraph="Indicadores de presença, proposições e votações em um painel fácil de interpretar."
        />

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="lula" fill="#0f172a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="tebet" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="dino" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="tarcisio" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex justify-end">
          <Link to="/comparador" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
            Abrir comparador completo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}

function DirectoryPage() {
  const [search, setSearch] = useState('')
  const [party, setParty] = useState('Todos')
  const [state, setState] = useState('Todos')
  const remote = useRemoteData(listPoliticians)

  const people: DirectoryEntry[] = remote.isConfigured
    ? remote.data.map((person) => {
        const mandate = currentMandate(person)
        return {
          slug: person.slug,
          name: person.name,
          office: mandate?.title ?? 'Cargo não informado',
          party: person.partyAcronym ?? 'Partido não informado',
          state: person.state ?? 'UF não informada',
          term: mandate ? mandatePeriod(mandate) : 'Mandato não informado',
          avatar: person.name.slice(0, 1),
          attendance: null,
          votes: null,
        }
      })
    : politicians.map((person) => ({ ...person, attendance: person.attendance, votes: person.votes }))

  const filtered = useMemo(
    () =>
      people.filter((person) => {
        const matchesSearch = `${person.name} ${person.office} ${person.party}`
        .toLowerCase()
        .includes(search.toLowerCase())
        const matchesParty = party === 'Todos' || person.party === party
        const matchesState = state === 'Todos' || person.state === state
        return matchesSearch && matchesParty && matchesState
      }),
    [people, search, party, state],
  )

  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Diretório"
        title="Políticos e cargos em destaque"
        paragraph="Busca por nome, cargo, partido ou unidade federativa. Com Supabase configurado, este diretório lê os registros e suas fontes cadastradas."
      />

      {!remote.isConfigured && !remote.configurationError && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Modo demonstração: estes perfis e indicadores são ilustrativos e não foram verificados como dados reais.
        </p>
      )}

      <div className="card mb-6 p-4">
        <div className="grid gap-3 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar político"
              className="w-full border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none"
            />
          </label>
          <select value={party} onChange={(event) => setParty(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <option value="Todos">Todos os partidos</option>
            {Array.from(new Set(people.map((person) => person.party))).map((partyOption) => (
              <option key={partyOption} value={partyOption}>{partyOption}</option>
            ))}
          </select>
          <select value={state} onChange={(event) => setState(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <option value="Todos">Todos os estados</option>
            {Array.from(new Set(people.map((person) => person.state))).map((stateOption) => (
              <option key={stateOption} value={stateOption}>{stateOption}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {remote.loading ? (
          <DataMessage>Carregando políticos do Supabase...</DataMessage>
        ) : remote.configurationError ? (
          <DataMessage isError>{remote.configurationError}</DataMessage>
        ) : remote.error ? (
          <DataMessage isError>Falha ao carregar políticos: {remote.error}</DataMessage>
        ) : filtered.length === 0 ? (
          <DataMessage>
            {people.length === 0
              ? 'Ainda não há políticos cadastrados no banco de dados.'
              : 'Nenhum resultado encontrado para a busca atual.'}
          </DataMessage>
        ) : (
          filtered.map((person) => (
            <Link to={`/politicos/${person.slug}`} key={person.slug} className="card p-5 transition hover:-translate-y-0.5 hover:border-sky-300">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-slate-900 text-lg font-bold text-white">
                  {person.avatar}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{person.name}</h3>
                  <p className="text-sm text-slate-600">{person.office}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="pill">{person.party}</span>
                <span className="pill">{person.state}</span>
                <span className="pill">{person.term}</span>
              </div>
              {person.attendance !== null && person.votes !== null && (
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Presença demonstrativa</p>
                    <p className="mt-1 font-semibold text-slate-900">{person.attendance}%</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Votações demonstrativas</p>
                    <p className="mt-1 font-semibold text-slate-900">{person.votes}%</p>
                  </div>
                </div>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function OfficialProfileRoute() {
  const { id } = useParams()
  if (!id) return <ProfilePage />
  return <PoliticianProfilePage key={id} slug={id} />
}

function ProfilePage() {
  const { id } = useParams()
  const remote = useRemoteData(listPoliticians)
  const demoPerson = politicians.find((item) => item.slug === id)

  if (remote.isConfigured && remote.loading) {
    return <div className="section-shell py-10"><DataMessage>Carregando perfil do Supabase...</DataMessage></div>
  }
  if (remote.configurationError) {
    return <div className="section-shell py-10"><DataMessage isError>{remote.configurationError}</DataMessage></div>
  }
  if (remote.isConfigured && remote.error) {
    return <div className="section-shell py-10"><DataMessage isError>Falha ao carregar perfil: {remote.error}</DataMessage></div>
  }
  if (remote.isConfigured) {
    const person = remote.data.find((item) => item.slug === id)
    if (!person) {
      return <div className="section-shell py-10"><DataMessage>Político não encontrado no banco de dados.</DataMessage></div>
    }

    const mandate = currentMandate(person)
    return (
      <div className="section-shell py-10">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-sky-700 via-sky-600 to-slate-900 p-6 text-white sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-sky-100">{person.partyAcronym ?? 'Partido não informado'}</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">{person.name}</h1>
            <p className="mt-1 text-sky-100">{mandate?.title ?? 'Cargo não informado'} · {person.state ?? 'UF não informada'}</p>
          </div>
          <div className="space-y-5 p-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mandatos cadastrados</h2>
              {person.mandates.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">Nenhum mandato cadastrado.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {person.mandates.map((item, index) => (
                    <li key={`${item.title}-${item.startDate ?? 'sem-data'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {[item.institutionName, item.district, mandatePeriod(item)].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Situação: {item.status} · Origem: {item.origin} · Última atualização: {item.lastUpdatedAt ?? 'não informada'}
                      </p>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-sky-700">
                        Consultar fonte
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-slate-200 pt-4 text-sm text-slate-600">
              <p>Origem do registro: {person.origin}</p>
              <p className="mt-1">Última atualização: {person.lastUpdatedAt ?? 'não informada'}</p>
              <a href={person.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-sky-700">
                Consultar fonte do perfil
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!demoPerson) {
    return <div className="section-shell py-10"><DataMessage>Perfil demonstrativo não encontrado.</DataMessage></div>
  }
  const person = demoPerson

  const miniMetrics = [
    { label: 'Remuneração', value: formatCurrency(person.compensation) },
    { label: 'Presença', value: `${person.attendance}%` },
    { label: 'Patrimônio', value: formatCurrency(person.assets) },
    { label: 'Projetos', value: String(person.projects) },
  ]

  return (
    <div className="section-shell py-10">
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Modo demonstração: este perfil e seus indicadores são ilustrativos e não foram verificados como dados reais.
      </p>
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-sky-700 via-sky-600 to-slate-900 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 text-2xl font-bold text-white">
                {person.avatar}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-sky-100">{person.party}</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight">{person.name}</h1>
                <p className="mt-1 text-sky-100">{person.office}</p>
              </div>
            </div>
            <div className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm font-medium text-sky-100">
              {person.status}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-4">
          {miniMetrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{metric.label}</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="card p-6">
            <SectionTitle
              eyebrow="Histórico"
              title="Cargos e mandato"
              paragraph="Registro resumido de atuação institucional e mandato atual conforme dados públicos e cronologia disponível."
            />
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Cargo atual: {person.office}</li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Mandato: {person.term}</li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Estado/UF: {person.state}</li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Contexto: {person.mandate}</li>
            </ul>
          </div>

          <div className="card p-6">
            <SectionTitle
              eyebrow="Votações"
              title="Votações nominais"
              paragraph="Acompanhamento da posição e dos resultados em projetos relevantes."
            />
            <div className="space-y-3">
              {votes.map((vote) => (
                <div key={vote.proposal} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">{vote.title}</p>
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">{vote.result}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{vote.proposal} • {vote.date}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <SectionTitle
              eyebrow="Gastos"
              title="Remuneração e despesas"
              paragraph="A discriminação dos montantes contempla o período base e a categoria econômica da despesa."
            />
            <div className="space-y-3">
              {spending.map((item) => (
                <div key={item.category} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <span className="text-sm text-slate-600">{item.category}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <SectionTitle
              eyebrow="Processos"
              title="Justiça e decisões"
              paragraph="As situações jurídicas devem ser tratadas como estados concretos, com evidência documental e atualização formal."
            />
            <div className="space-y-3">
              {justiceCases.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-slate-800">{item.title}</h3>
                    <span className="pill">{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                  <p className="mt-2 text-xs text-slate-500">{item.court} • {item.updated}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpendingPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Gastos públicos"
        title="Orçamento, remuneração e despesas discriminadas"
        paragraph="A separação entre remuneração, despesas de funcionamento, gastos institucionais, valores empenhados e pagos é essencial para leitura responsável do orçamento."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6">
          <h3 className="text-lg font-bold text-slate-900">Desembolso por categoria</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spending}>
                <defs>
                  <linearGradient id="colorValue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `R$${value / 1000000}M`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={chartCurrencyFormatter} />
                <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="url(#colorValue)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold text-slate-900">Detalhamento de categorias</h3>
          <div className="mt-4 space-y-3">
            {spending.map((item) => (
              <div key={item.category} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-700">{item.category}</span>
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.value)}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{item.period} • {item.source}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function VotesPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Votações"
        title="Atividade legislativa e resultados oficiais"
        paragraph="Cada projeto é exibido com autoria, tema, data, situação legislativa e resultado, sem inventar votos ou conclusões."
      />

      <div className="card overflow-hidden">
        <div className="p-4 sm:p-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {['Todos', 'Transparência', 'Infraestrutura', 'Fiscalização'].map((filter) => (
              <button key={filter} type="button" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
                {filter}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-3 font-semibold">Proposta</th>
                  <th className="px-3 py-3 font-semibold">Tema</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Resultado</th>
                  <th className="px-3 py-3 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((vote) => (
                  <tr key={vote.proposal} className="border-b border-slate-200 align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-800">{vote.proposal}</p>
                      <p className="mt-1 text-xs text-slate-500">{vote.title}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{vote.topic}</td>
                    <td className="px-3 py-3 text-slate-600">{vote.status}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                        {vote.result}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{vote.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComparatorPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Comparador"
        title="Compare políticos por critérios transparentes"
        paragraph="Os indicadores são organizados em categorias equivalentes para evitar comparações distorcidas entre cargos e mandatos."
      />

      <div className="card p-6">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="lula" fill="#0f172a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="tebet" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              <Bar dataKey="dino" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="tarcisio" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function NewsPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Notícias"
        title="Agenda política em tempo real"
        paragraph="As notícias são segmentadas por período e diferenciadas entre fato confirmado, declaração, alegação, análise e opinião."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {newsItems.map((item) => (
          <div key={item.title} className="card p-5">
            <span className="pill">{item.type}</span>
            <h3 className="mt-4 text-lg font-bold text-slate-900">{item.title}</h3>
            <p className="mt-2 text-xs text-slate-500">{item.source}</p>
            <p className="mt-2 text-xs text-slate-500">{item.publishedAt}</p>
            <Link to="/noticias" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
              Ver fonte <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Calendário"
        title="Sessões, audiências e eventos institucionais"
        paragraph="Lista de eventos públicos oficialmente agendados, incluindo data, horário e instituição responsável."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {calendarItems.map((item) => (
          <div key={item.title} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{item.kind}</p>
            <h3 className="mt-3 text-xl font-bold text-slate-900">{item.title}</h3>
            <p className="mt-3 text-sm text-slate-600">{item.when}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function JusticePage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Justiça"
        title="Processos, condenações e decisões documentadas"
        paragraph="Categorias jurídicas são tratadas com rigor analítico, evitando misturar denúncia, investigação e condenação definitiva."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {justiceCases.map((item) => (
          <div key={item.title} className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="pill">{item.status}</span>
              <Gavel className="h-4 w-4 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
            <p className="mt-4 text-xs text-slate-500">{item.court} • {item.updated}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function InstitutionsPage() {
  const remote = useRemoteData(listInstitutions)
  const items: Institution[] = remote.isConfigured
    ? remote.data
    : institutions.map((institution, index) => ({
        id: `demo-${index}`,
        name: institution.name,
        slug: institution.name.toLowerCase().replaceAll(' ', '-'),
        branch: institution.role,
        description: institution.description,
        origin: 'Demonstração',
        sourceUrl: '#',
        lastUpdatedAt: null,
      }))

  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Instituições"
        title="Como funcionam as estruturas do Estado"
        paragraph="Com Supabase configurado, esta lista é carregada do banco e cada registro exibe sua origem e fonte."
      />

      {!remote.isConfigured && !remote.configurationError && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Modo demonstração: descrições abaixo são ilustrativas e não estão vinculadas a fontes cadastradas.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {remote.loading ? (
          <DataMessage>Carregando instituições do Supabase...</DataMessage>
        ) : remote.configurationError ? (
          <DataMessage isError>{remote.configurationError}</DataMessage>
        ) : remote.error ? (
          <DataMessage isError>Falha ao carregar instituições: {remote.error}</DataMessage>
        ) : items.length === 0 ? (
          <DataMessage>Ainda não há instituições cadastradas no banco de dados.</DataMessage>
        ) : items.map((institution) => (
          <div key={institution.name} className="card p-5">
            <div className="mb-3 flex items-center gap-3 text-sky-700">
              <Landmark className="h-5 w-5" />
              <h3 className="text-lg font-bold text-slate-900">{institution.name}</h3>
            </div>
            <p className="text-sm font-semibold text-slate-700">{institution.branch ?? 'Ramo não informado'}</p>
            {institution.description && <p className="mt-3 text-sm text-slate-600">{institution.description}</p>}
            <p className="mt-3 text-xs text-slate-500">
              Origem: {institution.origin} · Última atualização: {institution.lastUpdatedAt ?? 'não informada'}
            </p>
            {institution.sourceUrl !== '#' && (
              <a href={institution.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-sky-700">
                Consultar fonte
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MethodologyPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Metodologia"
        title="Fontes, critérios e transparência metodológica"
        paragraph="A plataforma prioriza clareza, rastreabilidade e honestidade sobre o que foi e não foi possível confirmar."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="card p-6">
          <h3 className="text-lg font-bold text-slate-900">Critérios de cálculo</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {methodNotes.map((note) => (
              <li key={note} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold text-slate-900">Fontes</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Portal da Transparência, portal do Congresso, STF, STJ e outros órgãos públicos.</p>
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Registros oficiais de agenda, sessões, decisões e orçamentos da União.</p>
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Cadernos e relatórios de transparência pública para cruzamento de dados e atualização.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminPage() {
  return (
    <div className="section-shell py-10">
      <SectionTitle
        eyebrow="Painel administrativo"
        title="Operação e supervisão de conteúdo"
        paragraph="Ambiente rastreado para curadoria editorial, alertas e revisão de fontes."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card">
          <Users className="h-5 w-5 text-sky-700" />
          <p className="mt-4 text-sm text-slate-500">Curadoria</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">142</p>
        </div>
        <div className="stat-card">
          <FileText className="h-5 w-5 text-sky-700" />
          <p className="mt-4 text-sm text-slate-500">Fontes revisadas</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">89</p>
        </div>
        <div className="stat-card">
          <ShieldCheck className="h-5 w-5 text-sky-700" />
          <p className="mt-4 text-sm text-slate-500">Conferências</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">27</p>
        </div>
        <div className="stat-card">
          <BarChart3 className="h-5 w-5 text-sky-700" />
          <p className="mt-4 text-sm text-slate-500">Ações monitoradas</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">310</p>
        </div>
      </div>
    </div>
  )
}

export default App
