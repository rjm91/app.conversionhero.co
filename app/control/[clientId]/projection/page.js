'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import ProjectionCenter from '../../../../components/projection/ProjectionCenter'

export default function ProjectionPage() {
  const { clientId } = useParams()
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    supabase.from('client').select('client_name').eq('client_id', clientId).single()
      .then(({ data }) => { if (data?.client_name) setClientName(data.client_name) })
  }, [clientId])

  return <ProjectionCenter clientId={clientId} clientName={clientName} />
}
