import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Upload, Trash2, ShieldCheck, Users, Save,
  Image, Type, Palette, Sliders, AlertCircle, Move,
} from 'lucide-react'
import { toast } from 'sonner'
import { brandApi, adminApi } from '../api/client'
import { useAuthStore } from '../store/auth'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { BrandTemplate, AdminUser } from '../types'

// ─── Zone position type ───────────────────────────────────────────────────────

interface ZonePos { x: number; y: number; w: number; h: number }

// ─── Live slide preview with optional draggable zones ────────────────────────

interface SlidePreviewProps {
  tmpl: Partial<BrandTemplate> & { background_image_url?: string | null }
  titleZone?: ZonePos
  bodyZone?: ZonePos
  onTitleZoneChange?: (z: ZonePos) => void
  onBodyZoneChange?: (z: ZonePos) => void
  editZones?: boolean
}

function SlidePreview({ tmpl, titleZone, bodyZone, onTitleZoneChange, onBodyZoneChange, editZones }: SlidePreviewProps) {
  const shapeColor = `#${tmpl.shape_color ?? '1E3A8A'}`
  const titleColor = `#${tmpl.title_font_color ?? 'FFFFFF'}`
  const bodyColor  = `#${tmpl.body_font_color ?? '1E293B'}`
  const opacity    = (tmpl.shape_opacity ?? 100) / 100
  const font       = tmpl.font_family ?? 'Montserrat'
  const titleSize  = Math.round((tmpl.title_font_size ?? 30) * 0.42)
  const bodySize   = Math.round((tmpl.body_font_size ?? 18) * 0.42)
  const hasBg      = !!tmpl.background_image_url

  const bgStyle: React.CSSProperties = hasBg
    ? { backgroundImage: `url(${tmpl.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: '#FFFFFF' }

  const containerRef = useRef<HTMLDivElement>(null)

  // Default zones matching backend defaults
  const tz = titleZone ?? { x: 0.038, y: 0.00,  w: 0.924, h: 0.193 }
  const bz = bodyZone  ?? { x: 0.038, y: 0.220, w: 0.924, h: 0.760 }

  // Dragging state: which zone + which handle
  // handle: 'move' | 'se' | 'sw' | 'ne' | 'nw'
  const drag = useRef<{
    zone: 'title' | 'body'
    handle: string
    startMouse: { x: number; y: number }
    startZone: ZonePos
  } | null>(null)

  const startDrag = useCallback((
    e: React.MouseEvent,
    zone: 'title' | 'body',
    handle: string,
  ) => {
    if (!editZones) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = {
      zone, handle,
      startMouse: { x: e.clientX, y: e.clientY },
      startZone: zone === 'title' ? { ...tz } : { ...bz },
    }

    const onMove = (ev: MouseEvent) => {
      if (!drag.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dx = (ev.clientX - drag.current.startMouse.x) / rect.width
      const dy = (ev.clientY - drag.current.startMouse.y) / rect.height
      const sz = drag.current.startZone
      let z = { ...sz }

      if (drag.current.handle === 'move') {
        z.x = Math.max(0, Math.min(1 - sz.w, sz.x + dx))
        z.y = Math.max(0, Math.min(1 - sz.h, sz.y + dy))
      } else {
        if (drag.current.handle.includes('e')) z.w = Math.max(0.05, Math.min(1 - sz.x, sz.w + dx))
        if (drag.current.handle.includes('s')) z.h = Math.max(0.03, Math.min(1 - sz.y, sz.h + dy))
        if (drag.current.handle.includes('w')) {
          const newX = Math.max(0, Math.min(sz.x + sz.w - 0.05, sz.x + dx))
          z.w = sz.x + sz.w - newX; z.x = newX
        }
        if (drag.current.handle.includes('n')) {
          const newY = Math.max(0, Math.min(sz.y + sz.h - 0.03, sz.y + dy))
          z.h = sz.y + sz.h - newY; z.y = newY
        }
      }

      if (drag.current.zone === 'title') onTitleZoneChange?.(z)
      else onBodyZoneChange?.(z)
    }

    const onUp = () => {
      drag.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [editZones, tz, bz, onTitleZoneChange, onBodyZoneChange])

  const ZoneBox = ({ zone, zonePos, color, label, onStart }: {
    zone: 'title' | 'body'
    zonePos: ZonePos
    color: string
    label: string
    onStart: (e: React.MouseEvent, h: string) => void
  }) => (
    <div
      className="absolute"
      style={{
        left:   `${zonePos.x * 100}%`,
        top:    `${zonePos.y * 100}%`,
        width:  `${zonePos.w * 100}%`,
        height: `${zonePos.h * 100}%`,
        border: `2px dashed ${color}`,
        backgroundColor: `${color}22`,
        cursor: 'move',
        zIndex: 10,
      }}
      onMouseDown={(e) => onStart(e, 'move')}
    >
      {/* Label */}
      <span
        className="absolute top-0.5 left-1 text-[9px] font-bold select-none"
        style={{ color }}
      >{label}</span>
      {/* SE resize handle */}
      <div
        className="absolute w-3 h-3 rounded-sm"
        style={{ right: -4, bottom: -4, backgroundColor: color, cursor: 'se-resize' }}
        onMouseDown={(e) => { e.stopPropagation(); onStart(e, 'se') }}
      />
      {/* SW resize handle */}
      <div
        className="absolute w-3 h-3 rounded-sm"
        style={{ left: -4, bottom: -4, backgroundColor: color, cursor: 'sw-resize' }}
        onMouseDown={(e) => { e.stopPropagation(); onStart(e, 'sw') }}
      />
      {/* NE resize handle */}
      <div
        className="absolute w-3 h-3 rounded-sm"
        style={{ right: -4, top: -4, backgroundColor: color, cursor: 'ne-resize' }}
        onMouseDown={(e) => { e.stopPropagation(); onStart(e, 'ne') }}
      />
      {/* NW resize handle */}
      <div
        className="absolute w-3 h-3 rounded-sm"
        style={{ left: -4, top: -4, backgroundColor: color, cursor: 'nw-resize' }}
        onMouseDown={(e) => { e.stopPropagation(); onStart(e, 'nw') }}
      />
    </div>
  )

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-slate-200 shadow-lg select-none"
      style={{ aspectRatio: '16/9', ...bgStyle }}
    >
      {/* Header bar (only when no bg image) */}
      {!hasBg && (
        <div
          className="absolute inset-x-0 top-0"
          style={{ height: '28%', backgroundColor: shapeColor, opacity }}
        />
      )}
      {!hasBg && (
        <div
          className="absolute inset-x-0"
          style={{ top: '28%', height: '2.5%', backgroundColor: shapeColor, opacity: opacity * 0.7 }}
        />
      )}

      {/* Title text — positioned by zone */}
      {!editZones && (
        <div
          className="absolute flex items-center"
          style={{
            left:   `${tz.x * 100}%`,
            top:    `${tz.y * 100}%`,
            width:  `${tz.w * 100}%`,
            height: `${tz.h * 100}%`,
            zIndex: 1,
          }}
        >
          <span className="font-bold leading-tight" style={{ fontFamily: font, fontSize: titleSize, color: titleColor }}>
            Заголовок слайда
          </span>
        </div>
      )}

      {/* Body content — positioned by zone */}
      {!editZones && (
        <div
          className="absolute space-y-1.5"
          style={{
            left:    `${bz.x * 100}%`,
            top:     `${bz.y * 100}%`,
            width:   `${bz.w * 100}%`,
            height:  `${bz.h * 100}%`,
            fontFamily: font,
            paddingTop: '2%',
          }}
        >
          {['Первый пункт с данными', 'Второй пункт с деталями', 'Третий пункт для примера'].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: hasBg ? titleColor : shapeColor, opacity }} />
              <span style={{ fontSize: bodySize, color: hasBg ? titleColor : bodyColor }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Decorative circle (only when no bg) */}
      {!hasBg && !editZones && (
        <div className="absolute rounded-full"
          style={{ width: '30%', aspectRatio: '1', right: '-8%', bottom: '-15%',
            backgroundColor: shapeColor, opacity: opacity * 0.2 }} />
      )}

      {/* Draggable zone boxes (only in edit mode) */}
      {editZones && (
        <>
          <ZoneBox zone="title" zonePos={tz} color="#3B82F6" label="Заголовок"
            onStart={(e, h) => startDrag(e, 'title', h)} />
          <ZoneBox zone="body" zonePos={bz} color="#10B981" label="Контент"
            onStart={(e, h) => startDrag(e, 'body', h)} />
        </>
      )}
    </div>
  )
}

// ─── Color picker row ─────────────────────────────────────────────────────────

function ColorRow({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const hex = value.startsWith('#') ? value : `#${value}`
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-slate-600 w-36 shrink-0">{label}</label>
      <div className="flex items-center gap-2 flex-1">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value.replace('#', ''))}
          className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
        />
        <input
          type="text"
          value={hex.toUpperCase()}
          onChange={(e) => onChange(e.target.value.replace('#', '').slice(0, 6))}
          className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400"
          maxLength={7}
          placeholder="#FFFFFF"
        />
      </div>
    </div>
  )
}

// ─── Template guidelines editor ──────────────────────────────────────────────

function GuidelinesEditor({ tmpl, onClose }: { tmpl: BrandTemplate; onClose: () => void }) {
  const qc      = useQueryClient()
  const bgRef   = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState({
    font_family:      tmpl.font_family      ?? 'Montserrat',
    title_font_color: tmpl.title_font_color ?? 'FFFFFF',
    title_font_size:  tmpl.title_font_size  ?? 30,
    body_font_color:  tmpl.body_font_color  ?? '1E293B',
    body_font_size:   tmpl.body_font_size   ?? 18,
    shape_color:      tmpl.shape_color      ?? '1E3A8A',
    shape_opacity:    tmpl.shape_opacity    ?? 100,
  })

  const [titleZone, setTitleZone] = useState<ZonePos>({
    x: tmpl.title_x ?? 0.038, y: tmpl.title_y ?? 0.00,
    w: tmpl.title_w ?? 0.924, h: tmpl.title_h ?? 0.193,
  })
  const [bodyZone, setBodyZone] = useState<ZonePos>({
    x: tmpl.body_x ?? 0.038, y: tmpl.body_y ?? 0.220,
    w: tmpl.body_w ?? 0.924, h: tmpl.body_h ?? 0.760,
  })
  const [editZones, setEditZones] = useState(false)

  const [bgUrl, setBgUrl]           = useState<string | null>(tmpl.background_image_url ?? null)
  const [bgPreview, setBgPreview]   = useState<string | null>(tmpl.background_image_url ?? null)

  const saveMutation = useMutation({
    mutationFn: () => brandApi.updateGuidelines(tmpl.id, {
      ...draft,
      title_x: titleZone.x, title_y: titleZone.y,
      title_w: titleZone.w, title_h: titleZone.h,
      body_x: bodyZone.x,   body_y: bodyZone.y,
      body_w: bodyZone.w,   body_h: bodyZone.h,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-templates'] })
      toast.success('Brand guidelines сохранены')
      onClose()
    },
    onError: () => toast.error('Ошибка сохранения'),
  })

  const bgMutation = useMutation({
    mutationFn: (file: File) => brandApi.uploadBackground(tmpl.id, file),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['brand-templates'] })
      setBgUrl(updated.background_image_url)
      setBgPreview(updated.background_image_url)
      toast.success('Фон загружен')
    },
    onError: () => toast.error('Ошибка загрузки фона'),
  })

  const removeBgMutation = useMutation({
    mutationFn: () => brandApi.removeBackground(tmpl.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-templates'] })
      setBgUrl(null)
      setBgPreview(null)
      toast.success('Фон удалён')
    },
    onError: () => toast.error('Ошибка удаления фона'),
  })

  const handleBgFile = (file: File) => {
    // Local preview
    const reader = new FileReader()
    reader.onload = (e) => setBgPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    bgMutation.mutate(file)
  }

  const FONT_OPTIONS = [
    'Montserrat', 'Inter', 'Roboto', 'Open Sans', 'Lato',
    'Poppins', 'Raleway', 'Source Sans Pro', 'Nunito', 'PT Sans',
    'Arial', 'Calibri', 'Georgia', 'Times New Roman',
  ]

  const previewData = {
    ...draft,
    background_image_url: bgPreview,
    title_x: titleZone.x, title_y: titleZone.y,
    title_w: titleZone.w, title_h: titleZone.h,
    body_x: bodyZone.x,   body_y: bodyZone.y,
    body_w: bodyZone.w,   body_h: bodyZone.h,
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ── Left: Settings ── */}
      <div className="space-y-5">

        {/* Background */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Image className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-700">Фон слайда</h3>
          </div>

          {bgPreview ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 mb-3">
              <img src={bgPreview} alt="bg" className="w-full h-28 object-cover" />
              <button
                onClick={() => removeBgMutation.mutate()}
                disabled={removeBgMutation.isPending}
                className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}

          <input
            ref={bgRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBgFile(f) }}
          />
          <button
            onClick={() => bgRef.current?.click()}
            disabled={bgMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/50 transition-all"
          >
            {bgMutation.isPending ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
            {bgPreview ? 'Заменить изображение' : 'Загрузить фон (PNG/JPG/WebP)'}
          </button>
        </section>

        {/* Typography */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-700">Типографика</h3>
          </div>

          <div className="space-y-4">
            {/* Font family */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 w-36 shrink-0">Шрифт</label>
              <select
                value={draft.font_family}
                onChange={(e) => setDraft({ ...draft, font_family: e.target.value })}
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white"
                style={{ fontFamily: draft.font_family }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Заголовок</p>
              <ColorRow
                label="Цвет заголовка"
                value={draft.title_font_color}
                onChange={(v) => setDraft({ ...draft, title_font_color: v })}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-600 w-36 shrink-0">Размер (pt)</label>
                <input
                  type="number"
                  min={14} max={72}
                  value={draft.title_font_size}
                  onChange={(e) => setDraft({ ...draft, title_font_size: Number(e.target.value) })}
                  className="w-20 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 text-center"
                />
              </div>
            </div>

            {/* Body */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Текст тела</p>
              <ColorRow
                label="Цвет текста"
                value={draft.body_font_color}
                onChange={(v) => setDraft({ ...draft, body_font_color: v })}
              />
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-600 w-36 shrink-0">Размер (pt)</label>
                <input
                  type="number"
                  min={10} max={36}
                  value={draft.body_font_size}
                  onChange={(e) => setDraft({ ...draft, body_font_size: Number(e.target.value) })}
                  className="w-20 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 text-center"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Shapes */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-700">Фигуры и акценты</h3>
          </div>
          <div className="space-y-4">
            <ColorRow
              label="Цвет фигур"
              value={draft.shape_color}
              onChange={(v) => setDraft({ ...draft, shape_color: v })}
            />
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 w-36 shrink-0">
                Прозрачность ({draft.shape_opacity}%)
              </label>
              <input
                type="range"
                min={10} max={100}
                value={draft.shape_opacity}
                onChange={(e) => setDraft({ ...draft, shape_opacity: Number(e.target.value) })}
                className="flex-1 accent-brand-600"
              />
            </div>
          </div>
        </section>

        {/* Layout zones */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-slate-700">Расположение зон</h3>
            </div>
            <button
              onClick={() => setEditZones((v) => !v)}
              className={cn(
                'text-xs font-semibold px-3 py-1 rounded-lg transition-colors',
                editZones
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700'
              )}
            >
              {editZones ? 'Режим редактирования ON' : 'Редактировать зоны'}
            </button>
          </div>

          {editZones && (
            <p className="text-xs text-slate-400 mb-3">
              Перетащите синюю рамку (Заголовок) и зелёную (Контент) на превью справа. Уголки — для изменения размера.
            </p>
          )}

          {/* Numeric inputs for precision */}
          <div className="space-y-3 text-xs">
            {/* Title zone */}
            <div>
              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1.5">
                ■ Заголовок (синяя зона)
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(['x','y','w','h'] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-slate-400 uppercase">{k}</span>
                    <input
                      type="number" step="0.01" min="0" max="1"
                      value={Math.round(titleZone[k] * 1000) / 1000}
                      onChange={(e) => setTitleZone({ ...titleZone, [k]: Math.max(0, Math.min(1, Number(e.target.value))) })}
                      className="w-full px-2 py-1 border border-slate-200 rounded-lg text-center focus:outline-none focus:border-blue-400"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Body zone */}
            <div>
              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1.5">
                ■ Контент (зелёная зона)
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(['x','y','w','h'] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-slate-400 uppercase">{k}</span>
                    <input
                      type="number" step="0.01" min="0" max="1"
                      value={Math.round(bodyZone[k] * 1000) / 1000}
                      onChange={(e) => setBodyZone({ ...bodyZone, [k]: Math.max(0, Math.min(1, Number(e.target.value))) })}
                      className="w-full px-2 py-1 border border-slate-200 rounded-lg text-center focus:outline-none focus:border-emerald-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Save */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60"
          >
            {saveMutation.isPending ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </div>

      {/* ── Right: Live preview ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-700">Live Preview</h3>
          <span className="text-xs text-slate-400">обновляется мгновенно</span>
        </div>
        <SlidePreview
          tmpl={previewData}
          titleZone={titleZone}
          bodyZone={bodyZone}
          onTitleZoneChange={setTitleZone}
          onBodyZoneChange={setBodyZone}
          editZones={editZones}
        />
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-600">Применится ко всем макетам:</p>
          <p>• Заголовок: <strong style={{ fontFamily: draft.font_family, color: `#${draft.title_font_color}` === '#FFFFFF' ? '#666' : `#${draft.title_font_color}` }}>{draft.font_family}</strong>, {draft.title_font_size}pt</p>
          <p>• Тело: {draft.body_font_size}pt, opacity фигур: {draft.shape_opacity}%</p>
        </div>
      </div>
    </div>
  )
}

// ─── Admin Users panel ────────────────────────────────────────────────────────

function AdminUsersPanel() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: adminApi.listUsers,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_admin }: { id: number; is_admin: boolean }) =>
      adminApi.toggleAdmin(id, is_admin),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Ошибка')
    },
  })

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-slate-700">Управление пользователями</h3>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors">
              <div>
                <p className="text-sm font-medium text-slate-800">{u.name || u.email}</p>
                {u.name && <p className="text-xs text-slate-400">{u.email}</p>}
              </div>
              <button
                onClick={() => toggleMutation.mutate({ id: u.id, is_admin: !u.is_admin })}
                disabled={toggleMutation.isPending}
                className={cn(
                  'text-xs font-semibold px-3 py-1 rounded-lg transition-colors',
                  u.is_admin
                    ? 'bg-brand-100 text-brand-700 hover:bg-red-50 hover:text-red-600'
                    : 'bg-slate-100 text-slate-500 hover:bg-brand-50 hover:text-brand-700'
                )}
              >
                {u.id === currentUser?.id ? (
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Вы (admin)
                  </span>
                ) : u.is_admin ? 'Снять admin' : 'Сделать admin'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandGuidelines() {
  const navigate = useNavigate()
  const user          = useAuthStore((s) => s.user)
  const setAuth       = useAuthStore((s) => s.setAuth)
  const accessToken   = useAuthStore((s) => s.accessToken)
  const refreshToken  = useAuthStore((s) => s.refreshToken)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: templates = [], isLoading } = useQuery<BrandTemplate[]>({
    queryKey: ['brand-templates'],
    queryFn:  brandApi.listTemplates,
  })

  const bootstrapMutation = useMutation({
    mutationFn: adminApi.bootstrap,
    onSuccess: (adminUser) => {
      if (user && accessToken && refreshToken) {
        setAuth({ ...user, is_admin: adminUser.is_admin }, accessToken, refreshToken)
      }
      toast.success('Вы стали администратором')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Ошибка')
    },
  })

  if (!user?.is_admin) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-slate-800 mb-2">Нет доступа</h1>
        <p className="text-sm text-slate-500 mb-4">Эта страница доступна только администраторам</p>
        <button
          onClick={() => bootstrapMutation.mutate()}
          disabled={bootstrapMutation.isPending}
          className="mb-3 flex items-center gap-2 mx-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-60"
        >
          {bootstrapMutation.isPending ? <Spinner size="sm" /> : <ShieldCheck className="w-4 h-4" />}
          Стать администратором (первый вход)
        </button>
        <p className="text-xs text-slate-400 mb-4">Работает только если в системе ещё нет ни одного администратора</p>
        <button
          onClick={() => navigate('/brand')}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Вернуться к шаблонам
        </button>
      </div>
    )
  }

  const editingTemplate = templates.find((t) => t.id === editingId)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => editingId ? setEditingId(null) : navigate('/brand')}
          className="p-2 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 transition-all text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600" />
            Brand Guidelines
            {editingTemplate && (
              <span className="text-slate-400 font-normal text-base">/ {editingTemplate.name}</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {editingId
              ? 'Настройте шрифт, цвета, фон и прозрачность фигур'
              : 'Выберите шаблон для настройки строгих brand guidelines'}
          </p>
        </div>
      </div>

      {editingTemplate ? (
        <GuidelinesEditor tmpl={editingTemplate} onClose={() => setEditingId(null)} />
      ) : (
        <div className="space-y-6">
          {/* Template selector */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Шаблоны</h2>
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : templates.length === 0 ? (
              <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-slate-400">
                <p className="text-sm">Нет шаблонов. Сначала загрузите PPTX на странице Бренд.</p>
                <button
                  onClick={() => navigate('/brand')}
                  className="mt-3 text-xs text-brand-600 hover:underline"
                >
                  Перейти к шаблонам →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all cursor-pointer group"
                    onClick={() => setEditingId(t.id)}
                  >
                    <SlidePreview tmpl={t} />
                    <div className="p-3">
                      <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {[t.shape_color, t.title_font_color, t.body_font_color].map((hex, i) => (
                          <span
                            key={i}
                            className="w-3.5 h-3.5 rounded-full border border-white shadow-sm"
                            style={{ backgroundColor: `#${hex}` }}
                          />
                        ))}
                        <span className="text-xs text-slate-400 ml-1">{t.font_family}</span>
                      </div>
                      <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-brand-600 font-semibold">Редактировать →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin users panel */}
          <AdminUsersPanel />
        </div>
      )}
    </div>
  )
}
