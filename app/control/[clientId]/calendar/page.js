'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-browser'
import CalendarView from '../../../../components/CalendarView'

export default function ClientCalendarPage() {
  const { clientId } = useParams()
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('client').select('client_name').eq('client_id', clientId).single()
      .then(({ data }) => { if (data) setClientName(data.client_name) })
  }, [clientId])

  return (
    <CalendarView
      clientId={clientId}
      title="Content Calendar"
      subtitle={clientName ? `Scheduled content for ${clientName}.` : ''}
    />
  )
}
