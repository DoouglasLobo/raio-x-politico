import { useEffect, useState } from 'react'
import {
  getChamberDeputyProfile,
  type ChamberDeputyProfile,
} from '../services/chamberOfficialData'

type RequestState = {
  key: string
  data: ChamberDeputyProfile | null
  error: string | null
}

export function useChamberDeputyProfile(deputyId: number | null, expensesYear: number) {
  const requestKey = deputyId === null ? '' : `${deputyId}:${expensesYear}`
  const [state, setState] = useState<RequestState>({
    key: '',
    data: null,
    error: null,
  })

  useEffect(() => {
    if (deputyId === null) return

    let active = true
    void getChamberDeputyProfile(deputyId, expensesYear)
      .then((data) => {
        if (active) setState({ key: requestKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          key: requestKey,
          data: null,
          error: error instanceof Error ? error.message : 'Falha inesperada na API oficial da Câmara.',
        })
      })

    return () => {
      active = false
    }
  }, [deputyId, expensesYear, requestKey])

  return {
    data: state.key === requestKey ? state.data : null,
    error: state.key === requestKey ? state.error : null,
    loading: deputyId !== null && state.key !== requestKey,
  }
}
