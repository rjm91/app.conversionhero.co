'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import * as tus from 'tus-js-client'
import { createClient } from '../../../../../lib/supabase-browser'

const supabase = createClient()

const BUCKET = 'client-assets'
const MAX_FILE_MB = 5000

async function tusUpload({ file, path, contentType, onProgress }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: contentType || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: err => reject(err),
      onProgress: (sent, total) => onProgress?.(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    })
    upload.findPreviousUploads().then(prev => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })
  })
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function generateVideoThumb(file) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    let done = false
    const finish = blob => { if (done) return; done = true; try { URL.revokeObjectURL(video.src) } catch {} resolve(blob) }
    const timer = setTimeout(() => finish(null), 8000)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = URL.createObjectURL(file)
    video.onloadeddata = () => { video.currentTime = Math.min(1, (video.duration || 2) / 2) }
    video.onseeked = () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 400 / (video.videoWidth || 400))
        canvas.width = (video.videoWidth || 400) * scale
        canvas.height = (video.videoHeight || 225) * scale
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.8)
      } catch { finish(null) }
    }
    video.onerror = () => { clearTimeout(timer); finish(null) }
  })
}

function generateImageThumb(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 400 / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => { URL.revokeObjectURL(img.src); resolve(blob) }, 'image/jpeg', 0.8)
    }
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Image decode failed')) }
  })
}

export default function AssetsPage() {
  const { clientId } = useParams()
  const [folders, setFolders] = useState([])
  const [assets, setAssets] = useState([])
  const [currentFolder, setCurrentFolder] = useState(null) // null = All
  const [loading, setLoading] = useState(true)
  const [uploads, setUploads] = useState([]) // [{id, name, progress, error}]
  const [dragOver, setDragOver] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [previewAsset, setPreviewAsset] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    const [fRes, aRes] = await Promise.all([
      supabase.from('client_folder').select('*').eq('client_id', clientId).order('name'),
      supabase.from('client_asset').select('*').eq('client_id', clientId).order('uploaded_at', { ascending: false }),
    ])
    setFolders(fRes.data || [])
    setAssets(aRes.data || [])
    setLoading(false)
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('client_folder')
      .insert({ client_id: clientId, name })
      .select()
      .single()
    if (error) { alert('Folder create failed: ' + error.message); return }
    setFolders(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewFolderName('')
    setNewFolderOpen(false)
  }

  async function deleteFolder(folder) {
    if (!confirm(`Delete folder "${folder.name}"? Assets inside will move to "All".`)) return
    const { error } = await supabase.from('client_folder').delete().eq('id', folder.id)
    if (error) { alert('Delete failed: ' + error.message); return }
    setFolders(prev => prev.filter(f => f.id !== folder.id))
    setAssets(prev => prev.map(a => a.folder_id === folder.id ? { ...a, folder_id: null } : a))
    if (currentFolder === folder.id) setCurrentFolder(null)
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList)
    for (const file of files) {
      const uploadId = crypto.randomUUID()
      setUploads(prev => [...prev, { id: uploadId, name: file.name, progress: 0 }])

      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, error: `Max ${MAX_FILE_MB}MB` } : u))
        continue
      }

      try {
        const isVideo = file.type.startsWith('video/')
        const isImage = file.type.startsWith('image/')
        if (!isVideo && !isImage) throw new Error('Only video or image files')

        const assetId = crypto.randomUUID()
        const ext = file.name.split('.').pop()
        const storagePath = `${clientId}/${assetId}.${ext}`
        const thumbPath = `${clientId}/thumbs/${assetId}.jpg`

        // Generate thumb
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 10 } : u))
        const thumbBlob = isVideo ? await generateVideoThumb(file) : await generateImageThumb(file)

        // Upload original via TUS (resumable, real progress)
        await tusUpload({
          file,
          path: storagePath,
          contentType: file.type,
          onProgress: pct => setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: pct } : u)),
        })

        // Upload thumb (small, single-shot is fine)
        let savedThumbPath = null
        if (thumbBlob) {
          const { error: thumbErr } = await supabase.storage.from(BUCKET).upload(thumbPath, thumbBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/jpeg',
          })
          if (!thumbErr) savedThumbPath = thumbPath
        }

        // Insert row
        const { data: row, error: rowErr } = await supabase.from('client_asset').insert({
          id: assetId,
          client_id: clientId,
          folder_id: currentFolder,
          storage_path: storagePath,
          thumb_path: savedThumbPath,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }).select().single()
        if (rowErr) throw rowErr

        setAssets(prev => [row, ...prev])
        setUploads(prev => prev.filter(u => u.id !== uploadId))
      } catch (e) {
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, error: e.message || 'Upload failed' } : u))
      }
    }
  }

  async function deleteAsset(asset) {
    if (!confirm(`Delete "${asset.filename}"?`)) return
    await supabase.storage.from(BUCKET).remove([asset.storage_path, asset.thumb_path].filter(Boolean))
    await supabase.from('client_asset').delete().eq('id', asset.id)
    setAssets(prev => prev.filter(a => a.id !== asset.id))
  }

  function publicUrl(path) {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  const filteredAssets = currentFolder === 'unfiled'
    ? assets.filter(a => !a.folder_id)
    : currentFolder
      ? assets.filter(a => a.folder_id === currentFolder)
      : assets

  function countIn(folderId) {
    if (folderId === 'unfiled') return assets.filter(a => !a.folder_id).length
    if (!folderId) return assets.length
    return assets.filter(a => a.folder_id === folderId).length
  }

  return (
    <div
      className="flex min-h-[calc(100vh-120px)]"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false)
        if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
      }}
    >
      {/* Folder sidebar */}
      <aside className="w-60 border-r border-gray-100 dark:border-white/5 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Folders</p>
          <button
            onClick={() => setNewFolderOpen(true)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >+ New</button>
        </div>

        <button
          onClick={() => setCurrentFolder(null)}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center justify-between ${
            currentFolder === null ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          <span>All assets</span>
          <span className="text-xs text-gray-400">{countIn(null)}</span>
        </button>

        <button
          onClick={() => setCurrentFolder('unfiled')}
          className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center justify-between ${
            currentFolder === 'unfiled' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          <span>Unfiled</span>
          <span className="text-xs text-gray-400">{countIn('unfiled')}</span>
        </button>

        <div className="mt-2 space-y-0.5">
          {folders.map(f => (
            <div key={f.id} className="group flex items-center">
              <button
                onClick={() => setCurrentFolder(f.id)}
                className={`flex-1 text-left text-sm px-3 py-2 rounded-lg flex items-center justify-between ${
                  currentFolder === f.id ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{countIn(f.id)}</span>
              </button>
              <button
                onClick={() => deleteFolder(f)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 px-1 transition"
                title="Delete folder"
              >×</button>
            </div>
          ))}
        </div>

        {newFolderOpen && (
          <div className="mt-3 space-y-2">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName('') } }}
              placeholder="Folder name"
              className="w-full text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 bg-white dark:bg-white/5 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button onClick={createFolder} className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg">Create</button>
              <button onClick={() => { setNewFolderOpen(false); setNewFolderName('') }} className="text-xs text-gray-500 hover:text-gray-700 px-2">Cancel</button>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentFolder === null ? 'All assets' : currentFolder === 'unfiled' ? 'Unfiled' : folders.find(f => f.id === currentFolder)?.name || ''}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{filteredAssets.length} {filteredAssets.length === 1 ? 'item' : 'items'}</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
          >Upload</button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*"
            className="hidden"
            onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {/* Uploads in progress */}
        {uploads.length > 0 && (
          <div className="mb-6 space-y-2">
            {uploads.map(u => (
              <div key={u.id} className="bg-white dark:bg-[#171B33] border border-gray-100 dark:border-white/5 rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">{u.name}</p>
                  {u.error ? (
                    <p className="text-xs text-red-500 mt-0.5">{u.error}</p>
                  ) : (
                    <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                </div>
                {u.error && (
                  <button onClick={() => setUploads(prev => prev.filter(x => x.id !== u.id))} className="text-gray-400 hover:text-gray-600">×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : filteredAssets.length === 0 ? (
          <div className="bg-white dark:bg-[#171B33] border border-dashed border-gray-200 dark:border-white/10 rounded-xl p-12 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No assets yet. Drag files here or click Upload.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredAssets.map(a => (
              <div key={a.id} className="group bg-white dark:bg-[#171B33] border border-gray-100 dark:border-white/5 rounded-xl overflow-hidden hover:shadow-md transition">
                <button onClick={() => setPreviewAsset(a)} className="block w-full aspect-video bg-gray-100 dark:bg-white/5 relative cursor-pointer">
                  {a.thumb_path ? (
                    <img src={publicUrl(a.thumb_path)} alt={a.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No preview</div>
                  )}
                  {a.mime_type?.startsWith('video/') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition">
                      <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <svg className="w-4 h-4 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    </div>
                  )}
                </button>
                <div className="p-3">
                  <p className="text-xs text-gray-900 dark:text-white truncate" title={a.filename}>{a.filename}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-400">{fmtSize(a.size_bytes)}</p>
                    <button
                      onClick={() => deleteAsset(a)}
                      className="text-xs text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                    >Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
          onClick={() => setPreviewAsset(null)}
        >
          <div className="relative max-w-5xl w-full max-h-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewAsset(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-sm"
            >Close ✕</button>
            <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center" style={{ maxHeight: '80vh' }}>
              {previewAsset.mime_type?.startsWith('video/') ? (
                <video
                  src={publicUrl(previewAsset.storage_path)}
                  controls
                  autoPlay
                  className="max-w-full max-h-[80vh]"
                  onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block' }}
                />
              ) : (
                <img src={publicUrl(previewAsset.storage_path)} alt={previewAsset.filename} className="max-w-full max-h-[80vh]" />
              )}
              {previewAsset.mime_type?.startsWith('video/') && (
                <div style={{ display: 'none' }} className="text-center text-white/70 p-12 text-sm">
                  Browser can't play this format (likely HEVC .MOV).{' '}
                  <a href={publicUrl(previewAsset.storage_path)} download className="underline text-blue-400">Download</a> to view.
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-white/80 text-sm">
              <span className="truncate">{previewAsset.filename}</span>
              <a
                href={publicUrl(previewAsset.storage_path)}
                download
                className="text-blue-400 hover:text-blue-300 ml-4 flex-shrink-0"
              >Download</a>
            </div>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-[#171B33] border-2 border-dashed border-blue-500 rounded-2xl px-12 py-10">
            <p className="text-lg font-semibold text-blue-600">Drop to upload</p>
          </div>
        </div>
      )}
    </div>
  )
}
