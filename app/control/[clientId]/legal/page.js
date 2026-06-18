'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import LegalCenter from '../../../../components/LegalCenter'

export default function LegalPage() {
  const { clientId } = useParams()
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    supabase.from('client').select('client_name').eq('client_id', clientId).single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  return <LegalCenter clientName={clientName} />
}
