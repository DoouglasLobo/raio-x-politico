type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      sources: Table<{
        id: string
        external_key: string | null
        name: string
        organization: string | null
        url: string
        description: string | null
        created_at: string
      }>
      parties: Table<{
        id: string
        camara_id: number | null
        acronym: string
        name: string
        source_id: string | null
        origin: string
        source_url: string
        last_updated_at: string | null
        created_at: string
      }>
      institutions: Table<{
        id: string
        external_key: string | null
        name: string
        slug: string
        branch: string | null
        description: string | null
        source_id: string | null
        origin: string
        source_url: string
        last_updated_at: string | null
        created_at: string
      }>
      politicians: Table<{
        id: string
        camara_id: number | null
        full_name: string
        slug: string
        state: string | null
        party_id: string | null
        source_id: string | null
        origin: string
        source_url: string
        last_updated_at: string | null
        created_at: string
      }>
      mandates: Table<{
        id: string
        camara_deputy_id: number | null
        camara_legislature_id: number | null
        politician_id: string
        institution_id: string | null
        party_id: string | null
        title: string
        district: string | null
        start_date: string | null
        end_date: string | null
        status: 'current' | 'ended' | 'unknown'
        source_id: string | null
        origin: string
        source_url: string
        last_updated_at: string | null
        created_at: string
      }>
      update_records: Table<{
        id: string
        entity_type: 'politician' | 'party' | 'institution' | 'mandate'
        politician_id: string | null
        party_id: string | null
        institution_id: string | null
        mandate_id: string | null
        source_id: string | null
        origin: string
        source_url: string
        summary: string | null
        recorded_at: string
        created_at: string
      }>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
