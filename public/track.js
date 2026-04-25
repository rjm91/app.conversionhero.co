(function () {
  var slug = (document.currentScript && document.currentScript.getAttribute('data-slug')) ||
    location.pathname.replace(/^\/p\//, '').replace(/\/$/, '')
  if (!slug) return

  var sessionId = sessionStorage.getItem('agency_funnel_sid')
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('agency_funnel_sid', sessionId)
  }

  function send(event_type, meta) {
    try {
      var body = JSON.stringify({ slug: slug, event_type: event_type, session_id: sessionId, meta: meta || null })
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/agency-funnels/track', new Blob([body], { type: 'application/json' }))
      } else {
        fetch('/api/agency-funnels/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true })
      }
    } catch (e) {}
  }

  // page view (one per session per page)
  var viewKey = 'agency_funnel_view_' + slug
  if (!sessionStorage.getItem(viewKey)) {
    sessionStorage.setItem(viewKey, '1')
    send('page_view')
  }

  // expose for manual conversion calls from the page (e.g. on form submit)
  window.AgencyFunnelTrack = {
    optIn: function (meta) { send('lead_submit', meta) },
    event: function (type, meta) { send(type, meta) },
  }

  // auto-track any element marked with data-track="opt-in"
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track="opt-in"]')
    if (el) send('lead_submit', { label: el.textContent.trim().slice(0, 80) })
  })
})()
