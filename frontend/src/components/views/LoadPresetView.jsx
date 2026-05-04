import React, { useState, useEffect, useRef } from 'react'
import { Play, Layers, X, Activity, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '../../utils/helpers'
import PayloadName from '../ui/PayloadName'
import Modal from '../ui/Modal'

const LoadPresetView = ({ onToast, onRedirect }) => {
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)
  const [status, setStatus] = useState(null)
  const pollRef = useRef(null)

  const fetchPresets = async () => {
    setLoading(true)
    try {
      const res = await fetch('/autoload_presets')
      const data = await res.json().catch(() => [])
      setPresets(Array.isArray(data) ? data : [])
    } catch (e) {
      setPresets([])
    }
    setLoading(false)
  }

  const fetchStatus = async () => {
    try {
      const res = await fetch('/run_preset_status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        return data
      }
    } catch (e) { }
    return null
  }

  useEffect(() => {
    fetchPresets()
    let cancelled = false
    const loop = async () => {
      const data = await fetchStatus()
      if (cancelled) return
      const keep = data && (data.active || data.state === 'delay' || data.state === 'launching')
      pollRef.current = setTimeout(loop, keep ? 500 : 4000)
    }
    loop()
    return () => {
      cancelled = true
      clearTimeout(pollRef.current)
    }
  }, [])

  const runPreset = async (preset) => {
    setConfirm(null)
    if (!preset || !preset.items || preset.items.length === 0) {
      onToast('Preset is empty', 'error')
      return
    }
    try {
      const res = await fetch('/run_preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: preset.items })
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        onToast(`Running "${preset.name}"`, 'success')
        fetchStatus()
      } else {
        onToast(data?.message || 'Failed to start', 'error')
      }
    } catch (e) {
      onToast('Failed to start', 'error')
    }
  }

  const abort = async () => {
    try {
      await fetch('/run_preset_abort', { method: 'POST' })
      onToast('Aborted', 'success')
      fetchStatus()
    } catch (e) {
      onToast('Abort failed', 'error')
    }
  }

  const isRunning = status && status.active
  const isFinished = status && !status.active && (status.state === 'done' || status.state === 'aborted')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Load <span className="text-ps-blue">Preset</span>
        </h2>
        {isRunning && (
          <button
            onClick={abort}
            className="px-4 py-2 rounded-xl font-bold uppercase tracking-tight text-xs bg-red-600/10 text-red-500 border border-red-500/30 hover:bg-red-600 hover:text-white flex items-center space-x-2"
          >
            <X className="w-4 h-4" />
            <span>Abort</span>
          </button>
        )}
      </div>
      <p className="text-zinc-500 text-sm md:text-base">
        Click a preset to immediately run its sequence. This does not modify the active autoload list and does not require a restart.
      </p>

      {isRunning && (
        <div className="glass-panel p-5 rounded-ps-3xl border border-ps-blue/30 flex flex-col gap-3">
          <div className="flex items-center gap-3 text-ps-blue uppercase tracking-widest text-xs font-black">
            {status.state === 'delay' ? <Clock className="w-4 h-4" /> : <Activity className="w-4 h-4 animate-pulse" />}
            <span>{status.state === 'delay' ? 'Waiting Delay' : 'Running Preset'}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <PayloadName path={status.current || ''} className="text-white text-lg" />
            <div className="text-zinc-400 text-sm font-bold">
              {status.done}/{status.total}
            </div>
          </div>
          {status.state === 'delay' && status.remaining_ms > 0 && (
            <div className="text-zinc-500 text-sm">
              Resuming in {(status.remaining_ms / 1000).toFixed(1)}s
            </div>
          )}
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-ps-blue transition-all"
              style={{ width: status.total > 0 ? `${(status.done / status.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {isFinished && status.state === 'done' && (
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30 text-emerald-400 text-sm font-bold uppercase tracking-widest">
          Last run completed
        </div>
      )}
      {isFinished && status.state === 'aborted' && (
        <div className="glass-panel p-4 rounded-2xl border border-amber-500/30 text-amber-400 text-sm font-bold uppercase tracking-widest flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Last run aborted
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 italic py-12 text-center">Loading presets...</div>
      ) : presets.length === 0 ? (
        <div className="py-20 border-2 border-dashed border-white/10 rounded-ps-xl flex flex-col items-center justify-center space-y-4 bg-white/[0.01]">
          <Layers className="w-16 h-16 text-white/10" />
          <p className="text-white font-extrabold tracking-tight text-2xl">No Presets Saved</p>
          <p className="text-zinc-500 font-medium">Create some in Autoload Presets first.</p>
          <button
            onClick={() => onRedirect && onRedirect('presets')}
            className="px-6 py-3 bg-ps-blue text-white rounded-xl font-bold uppercase tracking-tight"
          >
            Open Autoload Presets
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {presets.map(p => {
            const items = Array.isArray(p.items) ? p.items : []
            const payloadCount = items.filter(x => !x.startsWith('!')).length
            const disabled = isRunning || items.length === 0
            return (
              <button
                key={p.id}
                onClick={() => !disabled && setConfirm(p)}
                disabled={disabled}
                className={cn(
                  "glass-card text-left p-6 rounded-ps-xl border-white/10 flex flex-col gap-4 transition-all",
                  disabled ? "opacity-40 cursor-not-allowed" : "hover:border-ps-blue hover:bg-white/[0.06]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-widest text-ps-blue font-bold mb-1">Slot {p.id}</div>
                    <h3 className="text-2xl font-black text-white tracking-tight truncate">{p.name}</h3>
                    <div className="text-zinc-500 text-xs mt-1">{payloadCount} payload{payloadCount === 1 ? '' : 's'} · {items.length} entries</div>
                  </div>
                  <div className="shrink-0 p-3 rounded-2xl bg-ps-blue/10 text-ps-blue border border-ps-blue/30">
                    <Play className="w-6 h-6" />
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-hidden text-xs">
                  {items.length === 0 ? (
                    <span className="text-zinc-600 italic">Empty sequence</span>
                  ) : (
                    items.slice(0, 6).map((it, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-zinc-500 w-5 shrink-0">{i + 1}.</span>
                        <PayloadName path={it} className="text-zinc-300 text-sm" />
                      </div>
                    ))
                  )}
                  {items.length > 6 && <div className="text-zinc-600 text-xs pl-7">+{items.length - 6} more...</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Modal
        show={confirm !== null}
        title="Run Preset Now"
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="flex-1 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-tight">Cancel</button>
            <button onClick={() => runPreset(confirm)} className="flex-1 px-6 py-4 rounded-2xl bg-ps-blue hover:bg-ps-blue/80 text-white font-bold uppercase tracking-tight">Run Now</button>
          </>
        }
      >
        <div className="space-y-2">
          <p>About to immediately launch every payload in <strong>{confirm?.name}</strong>.</p>
          <p className="text-zinc-500 text-sm">This does not change your saved autoload list.</p>
        </div>
      </Modal>
    </div>
  )
}

export default LoadPresetView
