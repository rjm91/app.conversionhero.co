'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../lib/supabase-browser'

const roleColors = {
  agency_admin:    'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  client_admin:    'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  client_standard: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
}

const roleLabels = {
  agency_admin:    'Agency Admin',
  client_admin:    'Admin',
  client_standard: 'Standard',
}

function Avatar({ name, email }) {
  const initial = (name || email || '?')[0].toUpperCase()
  return (
    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
      <span className="text-white text-xs font-bold">{initial}</span>
    </div>
  )
}

// ── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ clientId, onClose, onSuccess }) {
  const [form, setForm]       = useState({ full_name: '', email: '', password: '', role: 'client_standard' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) { setError('Email and password are required.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const res  = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, client_id: clientId }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to create user.'); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Add Team Member" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name">
          <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@client.com" />
        </Field>
        <Field label="Password" required>
          <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 6 characters" />
        </Field>
        <Field label="Role" required>
          <RoleSelect value={form.role} onChange={e => set('role', e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <ModalButtons onCancel={onClose} loading={loading} label="Create User" />
      </form>
    </Modal>
  )
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSuccess }) {
  const [form, setForm]       = useState({ full_name: user.full_name || '', role: user.role })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name || null, role: form.role })
      .eq('id', user.id)
    if (err) { setError(err.message); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Edit Team Member" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name">
          <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled className="opacity-50 cursor-not-allowed" />
        </Field>
        <Field label="Role" required>
          <RoleSelect value={form.role} onChange={e => set('role', e.target.value)} />
        </Field>
        {error && <ErrorBox>{error}</ErrorBox>}
        <ModalButtons onCancel={onClose} loading={loading} label="Save Changes" />
      </form>
    </Modal>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteUserModal({ user, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleDelete() {
    setLoading(true)
    const res  = await fetch('/api/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to delete user.'); setLoading(false); return }
    onSuccess()
  }

  return (
    <Modal title="Remove Team Member" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to remove <span className="font-semibold text-gray-900 dark:text-white">{user.full_name || user.email}</span>? This cannot be undone.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition">
            {loading ? 'Removing...' : 'Remove User'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared UI primitives ──────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#171B33] rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-white/10">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/10">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-300 dark:placeholder-white/20 ${className}`}
      {...props}
    />
  )
}

function RoleSelect({ value, onChange }) {
  return (
    <select value={value} onChange={onChange}
      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-[#1e2340] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
      <option value="client_standard">Standard — view only</option>
      <option value="client_admin">Admin — can manage users</option>
    </select>
  )
}

function ErrorBox({ children }) {
  return <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm rounded-lg px-4 py-2.5">{children}</div>
}

function ModalButtons({ onCancel, loading, label }) {
  return (
    <div className="flex gap-3 pt-1">
      <button type="button" onClick={onCancel}
        className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition">
        Cancel
      </button>
      <button type="submit" disabled={loading}
        className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition">
        {loading ? 'Saving...' : label}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CompanyPage() {
  const { clientId } = useParams()
  const [client, setClient]       = useState(null)
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [currentRole, setCurrentRole] = useState(null)
  const [modal, setModal]         = useState(null) // { type: 'add' | 'edit' | 'delete', user? }

  async function loadData() {
    const supabase = createClient()
    const [{ data: clientData }, { data: usersData }, { data: { user } }] = await Promise.all([
      supabase.from('client').select('*').eq('client_id', clientId).single(),
      supabase.from('profiles').select('*').eq('client_id', clientId),
      supabase.auth.getUser(),
    ])
    if (clientData) setClient(clientData)
    setUsers(usersData || [])
    setCurrentRole(user?.user_metadata?.role)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [clientId])

  const canDelete = currentRole === 'agency_admin' || currentRole === 'client_admin'

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading...</div>

  const infoRows = [
    { label: 'Company Name',  value: client?.client_name },
    { label: 'Legal Name',    value: client?.client_name_legal },
    { label: 'Industry',      value: client?.industry },
    { label: 'Status',        value: client?.status },
    { label: 'Website',       value: client?.website, isLink: true },
    { label: 'Address',       value: client?.address1 },
    { label: 'City',          value: client?.city },
    { label: 'State',         value: client?.state },
    { label: 'ZIP',           value: client?.zip },
    { label: 'Country',       value: client?.country },
    { label: 'Created', value: client?.created_at ? new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null },
    { label: 'Updated', value: client?.updated_at ? new Date(client.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null },
  ]

  return (
    <div className="p-8">
      {modal?.type === 'add'    && <AddUserModal    clientId={clientId} onClose={() => setModal(null)} onSuccess={() => { setModal(null); loadData() }} />}
      {modal?.type === 'edit'   && <EditUserModal   user={modal.user}   onClose={() => setModal(null)} onSuccess={() => { setModal(null); loadData() }} />}
      {modal?.type === 'delete' && <DeleteUserModal user={modal.user}   onClose={() => setModal(null)} onSuccess={() => { setModal(null); loadData() }} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Company</h1>
        <p className="text-sm text-gray-400 mt-0.5">Client details and team members</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* Company Info */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Company Info</h2>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-white/5">
              {infoRows.map(({ label, value, isLink }) => (
                <div key={label} className="flex items-start gap-4 px-6 py-3">
                  <span className="text-xs text-gray-400 w-28 pt-0.5 shrink-0">{label}</span>
                  {isLink && value ? (
                    <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline truncate">{value}</a>
                  ) : (
                    <span className="text-sm text-gray-900 dark:text-white">
                      {value || <span className="text-gray-300 dark:text-white/20">—</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-[#171B33] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Team Members</h2>
              {canDelete && (
                <button onClick={() => setModal({ type: 'add' })}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
                  + Add User
                </button>
              )}
            </div>

            {users.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-400">No team members yet.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5">
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">Role</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 transition group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.full_name} email={u.email} />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {u.full_name || <span className="text-gray-400">—</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[u.role] || roleColors.client_standard}`}>
                          {roleLabels[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition justify-end">
                          {/* Edit — agency_admin and client_admin */}
                          {canDelete && (
                            <button onClick={() => setModal({ type: 'edit', user: u })}
                              title="Edit"
                              className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                          {/* Delete — agency_admin and client_admin only */}
                          {canDelete && (
                            <button onClick={() => setModal({ type: 'delete', user: u })}
                              title="Remove"
                              className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
