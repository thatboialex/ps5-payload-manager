import React, { useState, useEffect, useRef } from 'react'
import {
  Layers,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Save,
  Download,
  Upload,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Zap,
  Check,
  X
} from 'lucide-react'
import { cn, isPS5, isSystemPayload } from '../../utils/helpers'
import PayloadName from '../ui/PayloadName'
import Modal from '../ui/Modal'

const MAX_PRESETS = 5

const emptyPreset = (id, name) => ({ id, name: name || `Preset ${id}`, items: [] })

const validatePresetArray = (arr) => {
  if (!Array.isArray(arr)) return []
  const usedIds = new Set()
  const out = []
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue
    let id = parseInt(p.id)
    if (!(id >= 1 && id <= MAX_PRESETS)) {
      // assign next free id
      for (let i = 1; i <= MAX_PRESETS; i++) {
        if (!usedIds.has(i)) { id = i; break }
      }
    }
    if (!id || usedIds.has(id)) continue
    usedIds.add(id)
    const name = typeof p.name === 'string' ? p.name : `Preset ${id}`
    const items = Array.isArray(p.items) ? p.items.filter(x => typeof x === 'string') : []
    out.push({ id, name, items })
    if (out.length >= MAX_PRESETS) break
  }
  return out
}

const findFreeSlot = (presets) => {
  const used = new Set(presets.map(p => p.id))
  for (let i = 1; i <= MAX_PRESETS; i++) if (!used.has(i)) return i
  return null
}

const AutoloadPresetsView = ({ payloads, config, onToast }) => {
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [showDelayModal, setShowDelayModal] = useState(false)
  const [customDelay, setCustomDelay] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmReset, setConfirmReset] = useState(null)
  const [saveCurrentName, setSaveCurrentName] = useState('')
  const [showSaveCurrent, setShowSaveCurrent] = useState(false)
  const [subView, setSubView] = useState('list') // mobile: 'list' | 'add'
  const [savingNow, setSavingNow] = useState(false)
  const fileInputRef = useRef(null)

  const editingPreset = presets.find(p => p.id === editingId)

  const fetchPresets = async () => {
    setLoading(true)
    try {
      const res = await fetch('/autoload_presets')
      const data = await res.json().catch(() => [])
      setPresets(validatePresetArray(data))
    } catch (e) {
      setPresets([])
    }
    setLoading(false)
  }

  const persist = async (next) => {
    setSavingNow(true)
    try {
      const res = await fetch('/autoload_presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      })
      if (!res.ok) throw new Error('Save failed')
      onToast('Presets saved', 'success')
    } catch (e) {
      onToast('Save failed', 'error')
    }
    setSavingNow(false)
  }

  const updatePresets = async (next) => {
    setPresets(next)
    await persist(next)
  }

  useEffect(() => { fetchPresets() }, [])

  const internalPayloads = payloads
    .filter(p => !p.includes('/mnt/usb') && !isSystemPayload(p))
    .map(p => p.split('/').pop())

  const handleCreate = async () => {
    if (presets.length >= MAX_PRESETS) {
      onToast(`Max ${MAX_PRESETS} presets`, 'error')
      return
    }
    const id = findFreeSlot(presets)
    const np = emptyPreset(id)
    const next = [...presets, np].sort((a, b) => a.id - b.id)
    await updatePresets(next)
    setEditingId(id)
    setSubView('list')
  }

  const handleDelete = async (id) => {
    setConfirmDelete(null)
    const next = presets.filter(p => p.id !== id)
    if (editingId === id) setEditingId(null)
    await updatePresets(next)
  }

  const handleResetSlot = async (id) => {
    setConfirmReset(null)
    const next = presets.map(p => p.id === id ? { ...p, items: [] } : p)
    await updatePresets(next)
  }

  const handleDuplicate = async (id) => {
    if (presets.length >= MAX_PRESETS) {
      onToast(`Max ${MAX_PRESETS} presets`, 'error')
      return
    }
    const src = presets.find(p => p.id === id)
    if (!src) return
    const newId = findFreeSlot(presets)
    const dup = { id: newId, name: `${src.name} (Copy)`, items: [...src.items] }
    const next = [...presets, dup].sort((a, b) => a.id - b.id)
    await updatePresets(next)
  }

  const startRename = (p) => {
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  const commitRename = async () => {
    const v = renameValue.trim()
    if (!v) { setRenamingId(null); return }
    const next = presets.map(p => p.id === renamingId ? { ...p, name: v } : p)
    setRenamingId(null)
    setRenameValue('')
    await updatePresets(next)
  }

  const updateItems = async (id, items) => {
    const next = presets.map(p => p.id === id ? { ...p, items } : p)
    await updatePresets(next)
  }

  const addPayloadToEdit = (filename) => {
    if (!editingPreset) return
    const items = [...editingPreset.items, filename]
    updateItems(editingPreset.id, items)
    setSubView('list')
  }

  const addDelay = (ms) => {
    if (!editingPreset) return
    const items = [...editingPreset.items, `!${ms}`]
    setShowDelayModal(false)
    setCustomDelay('')
    updateItems(editingPreset.id, items)
    setSubView('list')
  }

  const moveItem = (idx, dir) => {
    if (!editingPreset) return
    const items = [...editingPreset.items]
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    ;[items[idx], items[j]] = [items[j], items[idx]]
    updateItems(editingPreset.id, items)
  }

  const removeItem = (idx) => {
    if (!editingPreset) return
    const items = editingPreset.items.filter((_, i) => i !== idx)
    updateItems(editingPreset.id, items)
  }

  const handleSaveCurrentAutoload = async () => {
    if (presets.length >= MAX_PRESETS) {
      onToast(`Max ${MAX_PRESETS} presets`, 'error')
      return
    }
    const list = (config?.AUTOLOAD_LIST || '').split(',').filter(x => x)
    if (list.length === 0) {
      onToast('Current autoload is empty', 'error')
      return
    }
    const id = findFreeSlot(presets)
    const name = saveCurrentName.trim() || `Autoload Snapshot ${id}`
    const np = { id, name, items: list }
    const next = [...presets, np].sort((a, b) => a.id - b.id)
    setShowSaveCurrent(false)
    setSaveCurrentName('')
    await updatePresets(next)
  }

  const handleExport = () => {
    const data = JSON.stringify(presets, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'autoload_presets.json'
    a.click()
    URL.revokeObjectURL(url)
    onToast('Exported presets', 'success')
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const cleaned = validatePresetArray(parsed)
      if (cleaned.length === 0) {
        onToast('No valid presets in file', 'error')
        return
      }
      await updatePresets(cleaned)
      onToast(`Imported ${cleaned.length} preset(s)`, 'success')
    } catch (err) {
      onToast('Import failed: invalid JSON', 'error')
    }
  }

  const renderPresetList = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Autoload <span className="text-ps-blue">Presets</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreate}
              disabled={presets.length >= MAX_PRESETS}
              className={cn(
                "px-4 py-2 rounded-xl font-bold uppercase tracking-tight text-xs flex items-center space-x-2 transition-all border",
                presets.length >= MAX_PRESETS
                  ? "bg-white/5 text-zinc-600 border-white/5 cursor-not-allowed"
                  : "bg-ps-blue text-white border-ps-blue hover:bg-ps-blue/80"
              )}
            >
              <Plus className="w-4 h-4" />
              <span>New Preset</span>
            </button>
            <button
              onClick={() => setShowSaveCurrent(true)}
              disabled={presets.length >= MAX_PRESETS}
              className={cn(
                "px-4 py-2 rounded-xl font-bold uppercase tracking-tight text-xs flex items-center space-x-2 border transition-all",
                presets.length >= MAX_PRESETS
                  ? "bg-white/5 text-zinc-600 border-white/5 cursor-not-allowed"
                  : "bg-white/5 text-white border-white/10 hover:border-ps-blue"
              )}
            >
              <Save className="w-4 h-4" />
              <span>Save Current Autoload</span>
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-xl font-bold uppercase tracking-tight text-xs flex items-center space-x-2 bg-white/5 text-white border border-white/10 hover:border-ps-blue transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={handleImportClick}
              className="px-4 py-2 rounded-xl font-bold uppercase tracking-tight text-xs flex items-center space-x-2 bg-white/5 text-white border border-white/10 hover:border-ps-blue transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
          </div>
        </div>
        <p className="text-zinc-500 text-sm">
          Build up to {MAX_PRESETS} reusable payload chains. Use "Load Preset" in the sidebar to run one immediately.
        </p>
      </div>

      {loading ? (
        <div className="text-zinc-500 italic py-12 text-center">Loading presets...</div>
      ) : presets.length === 0 ? (
        <div className="py-20 border-2 border-dashed border-white/10 rounded-ps-xl flex flex-col items-center justify-center space-y-4 bg-white/[0.01]">
          <Layers className="w-16 h-16 text-white/10" />
          <p className="text-white font-extrabold tracking-tight text-2xl">No Presets Yet</p>
          <p className="text-zinc-500 font-medium">Click "New Preset" to create your first chain.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {presets.map(p => {
            const payloadCount = p.items.filter(x => !x.startsWith('!')).length
            const isRenaming = renamingId === p.id
            return (
              <div key={p.id} className="glass-card p-5 rounded-ps-xl border-white/10 flex flex-col space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-widest text-ps-blue font-bold mb-1">Slot {p.id}</div>
                    {isRenaming ? (
                      <div className="flex gap-2 items-center">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:border-ps-blue outline-none"
                        />
                        <button onClick={commitRename} className="p-2 rounded-xl bg-ps-blue text-white"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setRenamingId(null)} className="p-2 rounded-xl bg-white/5 text-white"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <h3 className="text-xl md:text-2xl font-black text-white tracking-tight truncate">{p.name}</h3>
                    )}
                    <div className="text-zinc-500 text-xs mt-1">{payloadCount} payload{payloadCount === 1 ? '' : 's'} · {p.items.length} total entries</div>
                  </div>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {p.items.length === 0 ? (
                    <div className="text-zinc-600 text-sm italic">Empty sequence</div>
                  ) : (
                    p.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-500 w-5 shrink-0">{i + 1}.</span>
                        <PayloadName path={it} className="text-zinc-300 text-sm" />
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => { setEditingId(p.id); setSubView('list') }}
                    className="flex-1 min-w-[100px] px-3 py-2 rounded-xl bg-ps-blue/10 text-ps-blue border border-ps-blue/30 hover:bg-ps-blue hover:text-white font-bold uppercase tracking-tight text-xs flex items-center justify-center space-x-2"
                  >
                    <Edit3 className="w-4 h-4" /><span>Edit</span>
                  </button>
                  <button
                    onClick={() => startRename(p)}
                    className="px-3 py-2 rounded-xl bg-white/5 text-white border border-white/10 hover:border-ps-blue font-bold uppercase tracking-tight text-xs"
                    title="Rename"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDuplicate(p.id)}
                    disabled={presets.length >= MAX_PRESETS}
                    className={cn(
                      "px-3 py-2 rounded-xl border font-bold uppercase tracking-tight text-xs flex items-center space-x-2",
                      presets.length >= MAX_PRESETS
                        ? "bg-white/5 text-zinc-600 border-white/5 cursor-not-allowed"
                        : "bg-white/5 text-white border-white/10 hover:border-ps-blue"
                    )}
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmReset(p.id)}
                    className="px-3 py-2 rounded-xl bg-white/5 text-white border border-white/10 hover:border-amber-500 font-bold uppercase tracking-tight text-xs"
                    title="Reset (clear items)"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setConfirmDelete(p.id)}
                    className="px-3 py-2 rounded-xl bg-white/5 text-white border border-white/10 hover:bg-red-600 hover:border-red-500 font-bold uppercase tracking-tight text-xs flex items-center space-x-2"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const availablePayloads = editingPreset
    ? internalPayloads.filter(p => !editingPreset.items.includes(p))
    : []

  const renderEditor = () => {
    if (!editingPreset) return null
    const renderAvailable = () => (
      <div className="space-y-6 flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <button onClick={() => setSubView('list')} className="p-2 bg-white/5 rounded-xl border border-white/10 lg:hidden">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="label-caps !text-white !opacity-100 text-xl tracking-widest">Available Payloads</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0 pb-6">
          <div className="grid grid-cols-1 gap-4">
            {availablePayloads.map(p => (
              <button
                key={p}
                onClick={() => addPayloadToEdit(p)}
                className="flex items-start justify-between p-5 glass-card rounded-2xl border-white/20 transition-all text-left bg-white/[0.03] hover:border-ps-blue group"
              >
                <PayloadName path={p} className="text-lg text-white" stacked />
                <ArrowRight className="w-6 h-6 text-zinc-500 group-hover:text-ps-blue group-hover:translate-x-2 transition-all shrink-0 mt-1" />
              </button>
            ))}
            <div className="pt-4 border-t border-white/10 mt-4">
              <button
                onClick={() => setShowDelayModal(true)}
                className="w-full flex items-center justify-between p-5 bg-white/[0.03] rounded-2xl border border-dashed border-white/20 hover:border-ps-blue group transition-all"
              >
                <div className="flex items-center space-x-4">
                  <Zap className="w-6 h-6 text-ps-blue" />
                  <span className="font-bold text-white uppercase tracking-tight text-lg">Add Delay</span>
                </div>
                <ArrowRight className="w-6 h-6 text-zinc-500 group-hover:text-ps-blue group-hover:translate-x-2 transition-all" />
              </button>
            </div>
          </div>
        </div>
      </div>
    )

    const renderSequence = () => (
      <div className="space-y-6 flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setEditingId(null)} className="p-2 rounded-xl bg-white/5 border border-white/10">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest text-ps-blue font-bold">Slot {editingPreset.id} · Sequence</div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate">{editingPreset.name}</h2>
            </div>
          </div>
          {savingNow && <span className="text-ps-blue text-xs font-bold uppercase tracking-widest shrink-0">Saving...</span>}
        </div>

        <div className="glass-panel p-5 rounded-ps-3xl border-white/10 flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-4">
            {editingPreset.items.length === 0 && (
              <div className="opacity-30 italic py-12 text-center">
                <p className="text-xl font-bold">Sequence is empty</p>
                <p className="text-sm">Add payloads or delays from the right panel.</p>
              </div>
            )}
            {editingPreset.items.map((it, i) => (
              <div key={`${it}-${i}`} className="relative flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/10">
                <div className="absolute top-0 left-0 w-6 h-6 rounded-full bg-dark flex items-center justify-center z-20">
                  <span className="text-gray-500 text-[12px] font-black">{i + 1}</span>
                </div>
                <div className="flex items-center min-w-0 pl-2">
                  <PayloadName path={it} className="text-white" stacked />
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="p-2 bg-white/10 text-zinc-400 hover:bg-ps-blue hover:text-white rounded-xl disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => moveItem(i, 1)} disabled={i === editingPreset.items.length - 1} className="p-2 bg-white/10 text-zinc-400 hover:bg-ps-blue hover:text-white rounded-xl disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                  <button onClick={() => removeItem(i)} className="p-2 bg-white/10 text-zinc-400 hover:bg-red-600 hover:text-white rounded-xl"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <div className={cn("pt-4 mt-2", isPS5 ? "hidden" : "lg:hidden")}>
              <button
                onClick={() => setSubView('add')}
                className="w-full flex items-center justify-center space-x-3 p-5 bg-ps-blue/10 hover:bg-ps-blue text-ps-blue hover:text-white rounded-2xl border border-dashed border-ps-blue/30 transition-all font-black italic uppercase tracking-tighter"
              >
                <Plus className="w-5 h-5" /> <span>Add Item</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )

    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className={cn(
            "gap-10 h-full min-h-0",
            isPS5 ? "grid grid-cols-2" : "hidden lg:grid lg:grid-cols-2"
          )}>
            {renderSequence()}
            {renderAvailable()}
          </div>
          <div className={cn(
            "h-full flex flex-col min-h-0",
            isPS5 ? "hidden" : "lg:hidden"
          )}>
            {subView === 'list' ? renderSequence() : renderAvailable()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {editingId === null ? renderPresetList() : renderEditor()}

      <Modal
        show={showDelayModal}
        title="Configure Delay"
        onClose={() => setShowDelayModal(false)}
        footer={
          <button
            onClick={() => setShowDelayModal(false)}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold uppercase tracking-tight"
          >
            Cancel
          </button>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[1, 3, 5].map(s => (
              <button
                key={s}
                onClick={() => addDelay(s * 1000)}
                className="py-4 bg-ps-blue/20 hover:bg-ps-blue border border-ps-blue/30 text-white rounded-2xl font-black text-xl"
              >
                {s}s
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <p className="label-caps !text-zinc-500 text-sm">Custom Delay (ms)</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="number"
                placeholder="e.g. 2500"
                value={customDelay}
                onChange={(e) => setCustomDelay(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-mono text-xl focus:border-ps-blue outline-none"
              />
              <button
                onClick={() => customDelay && addDelay(parseInt(customDelay))}
                className="py-4 sm:py-0 px-8 bg-ps-blue text-white rounded-2xl font-black uppercase italic tracking-tighter text-lg shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        show={confirmDelete !== null}
        title="Delete Preset"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <button onClick={() => setConfirmDelete(null)} className="flex-1 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-tight">Cancel</button>
            <button onClick={() => handleDelete(confirmDelete)} className="flex-1 px-6 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-tight">Delete</button>
          </>
        }
      >
        Permanently remove this preset? This does not affect the active autoload sequence.
      </Modal>

      <Modal
        show={confirmReset !== null}
        title="Clear Preset Items"
        onClose={() => setConfirmReset(null)}
        footer={
          <>
            <button onClick={() => setConfirmReset(null)} className="flex-1 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-tight">Cancel</button>
            <button onClick={() => handleResetSlot(confirmReset)} className="flex-1 px-6 py-4 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase tracking-tight">Clear Items</button>
          </>
        }
      >
        Empty this preset's items list? The slot and name will be kept.
      </Modal>

      <Modal
        show={showSaveCurrent}
        title="Save Current Autoload"
        onClose={() => setShowSaveCurrent(false)}
        footer={
          <>
            <button onClick={() => setShowSaveCurrent(false)} className="flex-1 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-tight">Cancel</button>
            <button onClick={handleSaveCurrentAutoload} className="flex-1 px-6 py-4 rounded-2xl bg-ps-blue hover:bg-ps-blue/80 text-white font-bold uppercase tracking-tight">Save</button>
          </>
        }
      >
        <div className="space-y-4">
          <p>Capture the current AUTOLOAD_LIST into a new preset slot.</p>
          <input
            value={saveCurrentName}
            onChange={e => setSaveCurrentName(e.target.value)}
            placeholder="Preset name"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-ps-blue outline-none"
          />
        </div>
      </Modal>
    </>
  )
}

export default AutoloadPresetsView
