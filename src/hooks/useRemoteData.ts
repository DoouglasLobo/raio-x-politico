import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigurationError } from '../lib/supabase'

type RemoteDataState<T> = {
  data: T[]
  loading: boolean
  error: string | null
}

export function useRemoteData<T>(load: () => Promise<T[]>) {
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [state, setState] = useState<RemoteDataState<T>>({
    data: [],
    loading: Boolean(supabase),
    error: null,
  })

  useEffect(() => {
    if (!supabase) return

    let active = true

    void load()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Erro inesperado ao consultar o Supabase.'
        setState({ data: [], loading: false, error: message })
      })

    return () => {
      active = false
    }
  }, [load, refreshVersion])

  const refresh = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true, error: null }))
    setRefreshVersion((version) => version + 1)
  }, [])

  return {
    ...state,
    refresh,
    isConfigured: Boolean(supabase),
    configurationError: supabaseConfigurationError,
  }
}
