'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import ManufacturingCenter from '../../../../components/ManufacturingCenter'

export default function ManufacturingPage() {
  const { clientId } = useParams()
  const [client, setClient] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('client').select('client_name, account_type').eq('client_id', clientId).single()
      .then(({ data }) => { setClient(data); setLoaded(true) })
  }, [clientId])

  if (!loaded) return <p className="p-8 text-sm text-gray-400">Loading…</p>

  // Manufacturing is for physical-product (ecom) accounts.
  if (client?.account_type !== 'ecom') {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Manufacturing</h1>
        <p className="text-sm text-gray-500 mt-2">This account isn't set up for manufacturing. It's available for physical-product (ecom) accounts.</p>
      </div>
    )
  }

  return <ManufacturingCenter clientName={client?.client_name} />
}
