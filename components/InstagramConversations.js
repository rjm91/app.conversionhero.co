'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function jsonFetch(url, options) {
  return fetch(url, { cache: 'no-store', ...options }).then(async response => {
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(body.error || 'Request failed.')
      error.status = response.status
      error.body = body
      throw error
    }
    return body
  })
}

function initials(conversation) {
  const value = conversation?.display_name || conversation?.username || 'Instagram'
  return value.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
}

function displayName(conversation) {
  return conversation?.display_name || (conversation?.username ? `@${conversation.username}` : 'Instagram user')
}

function relativeTime(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function messageTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sourceLabel(conversation) {
  return conversation?.source_label || (
    conversation?.source_type
      ? conversation.source_type[0].toUpperCase() + conversation.source_type.slice(1)
      : null
  )
}

function Avatar({ conversation, large = false }) {
  return conversation?.profile_picture_url
    ? <img className={`ig-avatar ${large ? 'large' : ''}`} src={conversation.profile_picture_url} alt="" referrerPolicy="no-referrer" />
    : <span className={`ig-avatar ig-initials ${large ? 'large' : ''}`}>{initials(conversation)}</span>
}

function InboxState({ icon, title, children, action }) {
  return (
    <div className="ig-state">
      <span className="ig-state-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}

function SourceDetails({ conversation }) {
  const label = sourceLabel(conversation)
  if (!label) return null
  return (
    <div className="ig-source-details">
      <span className={`ig-source ${conversation.source_type || ''}`}>{label}</span>
      {conversation.meta_ad_id && <span title={conversation.meta_ad_id}>ad {conversation.meta_ad_id}</span>}
      {conversation.source_ref && <span title={conversation.source_ref}>referral</span>}
    </div>
  )
}

function MessageAttachment({ attachment }) {
  if (!attachment?.url) return <span className="ig-attachment">Instagram attachment</span>
  const image = /image|photo|sticker/i.test(attachment.type || '')
  if (image) {
    return (
      <a className="ig-image-link" href={attachment.url} target="_blank" rel="noreferrer">
        <img src={attachment.url} alt={attachment.title || 'Instagram attachment'} referrerPolicy="no-referrer" />
      </a>
    )
  }
  return <a className="ig-attachment" href={attachment.url} target="_blank" rel="noreferrer">{attachment.title || `Open ${attachment.type || 'attachment'}`}</a>
}

export default function InstagramConversations({ clientId }) {
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [connection, setConnection] = useState(null)
  const [conversations, setConversations] = useState([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [thread, setThread] = useState(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendWarning, setSendWarning] = useState('')
  const [mobileThread, setMobileThread] = useState(false)
  const threadEndRef = useRef(null)
  const selectedRef = useRef(null)

  useEffect(() => { selectedRef.current = selectedId }, [selectedId])

  const loadList = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const result = await jsonFetch(`/api/instagram/conversations?client_id=${encodeURIComponent(clientId)}`)
      setConnection(result.connection)
      setConversations(result.conversations || [])
      setListError('')
    } catch (error) {
      if (!silent) setListError(error.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [clientId])

  const loadThread = useCallback(async (conversationId, { silent = false } = {}) => {
    if (!conversationId) return
    if (!silent) {
      setThreadLoading(true)
      setThreadError('')
    }
    try {
      const result = await jsonFetch(`/api/instagram/conversations/${encodeURIComponent(conversationId)}?client_id=${encodeURIComponent(clientId)}`)
      if (selectedRef.current !== conversationId) return
      setThread(result)
      setThreadError('')
      setConversations(rows => rows.map(row => row.id === conversationId ? { ...row, unread_count: 0, ...result.conversation } : row))
      jsonFetch(`/api/instagram/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      }).catch(() => {})
    } catch (error) {
      if (!silent) setThreadError(error.message)
    } finally {
      if (!silent) setThreadLoading(false)
    }
  }, [clientId])

  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadList({ silent: true })
      if (selectedRef.current) loadThread(selectedRef.current, { silent: true })
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [loadList, loadThread])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messages?.length, selectedId])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter(conversation => [
      conversation.display_name,
      conversation.username,
      conversation.last_message_preview,
      sourceLabel(conversation),
    ].some(value => String(value || '').toLowerCase().includes(needle)))
  }, [conversations, query])

  const openThread = useCallback((conversationId) => {
    selectedRef.current = conversationId
    setSelectedId(conversationId)
    setThread(null)
    setDraft('')
    setSendError('')
    setSendWarning('')
    setMobileThread(true)
    loadThread(conversationId)
  }, [loadThread])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setSendError('')
    setSendWarning('')
    try {
      const result = await jsonFetch('/api/instagram/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, conversation_id: selectedId, text }),
      })
      setDraft('')
      setSendWarning(result.warning || '')
      setThread(current => current ? {
        ...current,
        messages: [...current.messages, {
          ...result.message,
          id: result.message.instagram_message_id,
        }],
      } : current)
      await loadList({ silent: true })
    } catch (error) {
      setSendError(error.message)
      if (error.body?.reply_policy) {
        setThread(current => current ? {
          ...current,
          conversation: { ...current.conversation, reply_policy: error.body.reply_policy },
        } : current)
      }
    } finally {
      setSending(false)
    }
  }, [clientId, draft, loadList, selectedId, sending])

  if (loading) {
    return (
      <div className="ig-workspace">
        <div className="ig-list-skeleton">
          <div className="ig-search skeleton" />
          {[1, 2, 3, 4, 5].map(value => <div key={value} className="ig-row-skeleton skeleton" />)}
        </div>
        <div className="ig-panel-skeleton"><span className="ig-spinner" />Loading Instagram conversations…</div>
        <style jsx global>{styles}</style>
      </div>
    )
  }

  if (listError) {
    return (
      <div className="ig-workspace single">
        <InboxState
          icon="!"
          title="Inbox unavailable"
          action={<button className="ig-state-button" onClick={() => loadList()}>Try again</button>}
        >
          {listError}
        </InboxState>
        <style jsx global>{styles}</style>
      </div>
    )
  }

  if (!connection?.connected) {
    return (
      <div className="ig-workspace single">
        <InboxState icon="◎" title="Connect Instagram Messaging">
          This inbox is ready for real Direct messages, but Contour’s Instagram professional account is not connected yet. Add the account token and subscribe the Meta webhook; no demo conversations are shown here.
        </InboxState>
        <style jsx global>{styles}</style>
      </div>
    )
  }

  return (
    <div className={`ig-workspace ${mobileThread ? 'mobile-thread' : ''}`}>
      <aside className="ig-sidebar" aria-label="Instagram conversations">
        <div className="ig-list-head">
          <div>
            <h2>Instagram</h2>
            <span>{connection.username ? `@${connection.username}` : connection.display_name || 'Direct messages'}</span>
          </div>
          <span className="ig-live"><i /> connected</span>
        </div>
        <label className="ig-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search conversations…" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </label>

        <div className="ig-list">
          {!conversations.length && (
            <InboxState icon="◇" title="No conversations yet">
              New Instagram DMs will appear here after the webhook subscription is live. Send a real message to Contour’s Instagram account to verify the connection.
            </InboxState>
          )}
          {!!conversations.length && !filtered.length && (
            <InboxState icon="⌕" title="No search results">
              No profiles or messages match “{query}”.
            </InboxState>
          )}
          {filtered.map(conversation => (
            <button
              key={conversation.id}
              className={`ig-conversation ${selectedId === conversation.id ? 'selected' : ''}`}
              onClick={() => openThread(conversation.id)}
            >
              <Avatar conversation={conversation} />
              <span className="ig-row-body">
                <span className="ig-row-top">
                  <strong>{displayName(conversation)}</strong>
                  <time>{relativeTime(conversation.last_message_at)}</time>
                </span>
                {conversation.display_name && conversation.username && <span className="ig-handle">@{conversation.username}</span>}
                <span className="ig-row-bottom">
                  <span className="ig-preview">{conversation.last_message_direction === 'outbound' ? 'You: ' : ''}{conversation.last_message_preview || 'Attachment'}</span>
                  {sourceLabel(conversation) && <span className={`ig-source ${conversation.source_type || ''}`}>{sourceLabel(conversation)}</span>}
                  {conversation.unread_count > 0 && <span className="ig-unread">{conversation.unread_count > 9 ? '9+' : conversation.unread_count}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="ig-thread">
        {!selectedId && (
          <InboxState icon="↗" title="Select a conversation">
            Choose a profile from the left to read the thread and reply from Contour’s Instagram account.
          </InboxState>
        )}

        {selectedId && threadLoading && (
          <div className="ig-panel-skeleton"><span className="ig-spinner" />Loading conversation…</div>
        )}

        {selectedId && threadError && (
          <InboxState
            icon="!"
            title="Conversation unavailable"
            action={<button className="ig-state-button" onClick={() => loadThread(selectedId)}>Try again</button>}
          >
            {threadError}
          </InboxState>
        )}

        {selectedId && thread && !threadLoading && !threadError && (
          <>
            <header className="ig-thread-head">
              <button className="ig-back" onClick={() => setMobileThread(false)} aria-label="Back to conversations">←</button>
              <Avatar conversation={thread.conversation} large />
              <div className="ig-profile">
                <strong>{displayName(thread.conversation)}</strong>
                {thread.conversation.username && <span>@{thread.conversation.username}</span>}
              </div>
              <SourceDetails conversation={thread.conversation} />
            </header>

            <div className="ig-messages" aria-live="polite">
              <div className="ig-thread-start">
                Conversation started {messageTime(thread.conversation.first_message_at)}
              </div>
              {thread.messages.map(message => (
                <div key={message.id || message.instagram_message_id} className={`ig-message-wrap ${message.direction}`}>
                  <div className={`ig-bubble ${message.status === 'deleted' ? 'deleted' : ''}`}>
                    {message.status === 'deleted'
                      ? <em>Message deleted on Instagram</em>
                      : message.status === 'unsupported'
                        ? <em>This Instagram message type is not supported.</em>
                        : <>
                            {message.message_text && <span className="ig-message-text">{message.message_text}</span>}
                            {(message.attachments || []).map((attachment, index) => <MessageAttachment key={index} attachment={attachment} />)}
                          </>}
                  </div>
                  <time>{messageTime(message.sent_at)}{message.direction === 'outbound' && message.is_read ? ' · Seen' : ''}</time>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            <div className="ig-composer">
              {sendError && <div className="ig-send-alert error"><span>!</span>{sendError}</div>}
              {sendWarning && <div className="ig-send-alert warning"><span>i</span>{sendWarning}</div>}
              {!thread.conversation.reply_policy?.can_reply && (
                <div className="ig-window-closed">
                  {thread.conversation.reply_policy?.reason || 'This conversation is outside Meta’s permitted reply window.'}
                </div>
              )}
              {thread.conversation.reply_policy?.mode === 'human_agent' && (
                <div className="ig-human-note">Human-agent reply window · use only for customer support</div>
              )}
              <div className="ig-compose-row">
                <textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value.slice(0, 1000))}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      send()
                    }
                  }}
                  disabled={!thread.conversation.reply_policy?.can_reply || sending}
                  placeholder={thread.conversation.reply_policy?.can_reply ? 'Reply on Instagram…' : 'Reply unavailable'}
                  rows={1}
                />
                <button
                  className="ig-send"
                  onClick={send}
                  disabled={!draft.trim() || !thread.conversation.reply_policy?.can_reply || sending}
                >
                  {sending ? <span className="ig-spinner small" /> : 'Send'}
                </button>
              </div>
              <div className="ig-compose-meta">
                <span>Enter to send · Shift+Enter for a new line</span>
                <span>{draft.length}/1000</span>
              </div>
            </div>
          </>
        )}
      </main>
      <style jsx global>{styles}</style>
    </div>
  )
}

const styles = `
  .ig-workspace{height:100%;min-height:480px;display:grid;grid-template-columns:minmax(290px,340px) minmax(0,1fr);background:var(--bg);color:var(--txt);overflow:hidden}
  .ig-workspace.single{display:flex;align-items:center;justify-content:center}
  .ig-sidebar{min-width:0;border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;overflow:hidden}
  .ig-list-head{height:68px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px;border-bottom:1px solid var(--line)}
  .ig-list-head h2{font-size:13px;margin:0 0 3px;font-weight:800;letter-spacing:.03em}
  .ig-list-head>div>span{display:block;color:var(--faint);font-size:10.5px}
  .ig-live{display:flex;align-items:center;gap:5px;color:var(--faint);font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
  .ig-live i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 12%,transparent)}
  .ig-search{margin:10px 12px;display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:7px 9px;flex-shrink:0}
  .ig-search:focus-within{border-color:color-mix(in srgb,var(--blue) 55%,var(--line))}
  .ig-search svg{width:15px;height:15px;fill:none;stroke:var(--faint);stroke-width:1.8}
  .ig-search input{min-width:0;flex:1;background:none;border:none;outline:none;color:var(--txt);font:inherit;font-size:11.5px}
  .ig-search input::placeholder{color:var(--faint)}
  .ig-search button{border:0;background:none;color:var(--faint);font:inherit;cursor:pointer;padding:0 2px}
  .ig-list{overflow-y:auto;min-height:0;flex:1}
  .ig-conversation{width:100%;display:flex;gap:10px;align-items:flex-start;background:none;border:0;border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent);color:inherit;font:inherit;text-align:left;padding:12px;cursor:pointer}
  .ig-conversation:hover{background:rgba(255,255,255,.025)}
  .ig-conversation.selected{background:color-mix(in srgb,var(--blue) 9%,transparent);box-shadow:inset 2px 0 0 var(--blue)}
  .ig-avatar{width:38px;height:38px;object-fit:cover;border-radius:50%;border:1px solid rgba(255,255,255,.09);flex-shrink:0;background:var(--panel2)}
  .ig-avatar.large{width:42px;height:42px}
  .ig-initials{display:flex;align-items:center;justify-content:center;color:var(--blue);font-size:11px;font-weight:800;background:color-mix(in srgb,var(--blue) 11%,var(--panel2))}
  .ig-row-body{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
  .ig-row-top,.ig-row-bottom{display:flex;align-items:center;gap:7px;min-width:0}
  .ig-row-top strong{font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  .ig-row-top time{font-size:9.5px;color:var(--faint);font-variant-numeric:tabular-nums}
  .ig-handle{font-size:9.5px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ig-preview{font-size:10.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  .ig-source{font-size:8.5px;line-height:17px;height:17px;padding:0 6px;border:1px solid color-mix(in srgb,var(--blue) 30%,var(--line));border-radius:99px;color:var(--blue);white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
  .ig-source.ads{color:var(--blue);border-color:color-mix(in srgb,var(--blue) 35%,var(--line));background:color-mix(in srgb,var(--blue) 7%,transparent)}
  .ig-unread{min-width:16px;height:16px;border-radius:8px;background:var(--blue);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:900;padding:0 4px}
  .ig-thread{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg);position:relative}
  .ig-thread-head{height:68px;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid var(--line);background:var(--panel);flex-shrink:0}
  .ig-profile{display:flex;flex-direction:column;gap:2px;min-width:0}
  .ig-profile strong{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ig-profile span{color:var(--faint);font-size:10.5px}
  .ig-source-details{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:7px;min-width:0}
  .ig-source-details>span:not(.ig-source){color:var(--faint);font-size:9.5px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ig-back{display:none;border:0;background:none;color:var(--txt);font:inherit;font-size:20px;padding:4px;cursor:pointer}
  .ig-messages{flex:1;min-height:0;overflow-y:auto;padding:22px clamp(18px,4vw,54px);display:flex;flex-direction:column;gap:5px}
  .ig-thread-start{align-self:center;color:var(--faint);font-size:9.5px;margin:2px 0 15px}
  .ig-message-wrap{display:flex;flex-direction:column;max-width:min(72%,620px);margin:3px 0}
  .ig-message-wrap.inbound{align-self:flex-start;align-items:flex-start}
  .ig-message-wrap.outbound{align-self:flex-end;align-items:flex-end}
  .ig-bubble{border:1px solid var(--line);border-radius:5px 14px 14px 14px;background:var(--panel2);padding:8px 11px;color:var(--txt);font-size:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}
  .outbound .ig-bubble{background:color-mix(in srgb,var(--blue) 16%,var(--panel2));border-color:color-mix(in srgb,var(--blue) 30%,var(--line));border-radius:14px 5px 14px 14px}
  .ig-bubble.deleted{color:var(--faint);font-size:10.5px}
  .ig-message-wrap time{font-size:8.5px;color:var(--faint);margin:4px 3px 0}
  .ig-message-text{display:block}
  .ig-attachment{display:inline-block;color:var(--blue);text-decoration:none;border:1px solid color-mix(in srgb,var(--blue) 30%,var(--line));border-radius:6px;padding:6px 8px;margin-top:5px}
  .ig-image-link{display:block;margin-top:5px}
  .ig-image-link img{display:block;max-width:min(320px,100%);max-height:320px;border-radius:8px;object-fit:cover}
  .ig-composer{padding:10px 16px 8px;border-top:1px solid var(--line);background:var(--panel);flex-shrink:0}
  .ig-compose-row{display:flex;gap:8px;align-items:flex-end}
  .ig-compose-row textarea{min-height:38px;max-height:120px;resize:vertical;flex:1;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--txt);font:inherit;font-size:12px;line-height:1.45;padding:9px 11px;outline:none}
  .ig-compose-row textarea:focus{border-color:color-mix(in srgb,var(--blue) 55%,var(--line))}
  .ig-compose-row textarea:disabled{opacity:.55;cursor:not-allowed}
  .ig-send{height:38px;min-width:68px;border:1px solid var(--blue);border-radius:7px;background:var(--blue);color:var(--bg);font:inherit;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .ig-send:disabled{opacity:.38;cursor:not-allowed}
  .ig-compose-meta{display:flex;justify-content:space-between;color:var(--faint);font-size:8.5px;padding:5px 2px 0}
  .ig-send-alert,.ig-window-closed,.ig-human-note{margin-bottom:8px;border-radius:6px;padding:7px 9px;font-size:10.5px;line-height:1.4}
  .ig-send-alert{display:flex;gap:7px;align-items:flex-start}
  .ig-send-alert span{font-weight:900}
  .ig-send-alert.error{color:var(--red);background:color-mix(in srgb,var(--red) 9%,transparent);border:1px solid color-mix(in srgb,var(--red) 25%,var(--line))}
  .ig-send-alert.warning,.ig-human-note{color:var(--amber);background:color-mix(in srgb,var(--amber) 8%,transparent);border:1px solid color-mix(in srgb,var(--amber) 22%,var(--line))}
  .ig-window-closed{color:var(--dim);background:var(--bg);border:1px solid var(--line)}
  .ig-state{margin:auto;max-width:440px;padding:34px;text-align:center;display:flex;align-items:center;flex-direction:column}
  .ig-state-icon{width:42px;height:42px;border:1px solid color-mix(in srgb,var(--blue) 35%,var(--line));background:color-mix(in srgb,var(--blue) 8%,transparent);color:var(--blue);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:19px;margin-bottom:14px}
  .ig-state h3{margin:0 0 7px;font-size:13px}
  .ig-state p{margin:0;color:var(--dim);font-size:11px;line-height:1.6}
  .ig-state-button{margin-top:14px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--txt);font:inherit;font-size:10.5px;padding:6px 12px;cursor:pointer}
  .ig-state-button:hover{border-color:var(--blue)}
  .ig-panel-skeleton{height:100%;display:flex;align-items:center;justify-content:center;gap:9px;color:var(--faint);font-size:11px}
  .ig-list-skeleton{border-right:1px solid var(--line);padding:9px;background:var(--panel)}
  .skeleton{background:linear-gradient(90deg,var(--panel2),rgba(255,255,255,.055),var(--panel2));background-size:220% 100%;animation:ig-shimmer 1.5s linear infinite}
  .ig-list-skeleton .ig-search{height:34px;margin:4px 3px 12px}
  .ig-row-skeleton{height:58px;margin:1px 3px;border-radius:6px}
  .ig-spinner{width:13px;height:13px;border-radius:50%;border:2px solid var(--blue);border-top-color:transparent;display:inline-block;animation:ig-spin .65s linear infinite}
  .ig-spinner.small{width:11px;height:11px}
  @keyframes ig-spin{to{transform:rotate(360deg)}}
  @keyframes ig-shimmer{to{background-position:-220% 0}}
  @media(max-width:720px){
    .ig-workspace{display:block;min-height:420px}
    .ig-sidebar,.ig-thread{height:100%}
    .ig-thread{display:none}
    .ig-workspace.mobile-thread .ig-sidebar{display:none}
    .ig-workspace.mobile-thread .ig-thread{display:flex}
    .ig-back{display:block}
    .ig-message-wrap{max-width:86%}
    .ig-source-details>span:not(.ig-source){display:none}
  }
`
