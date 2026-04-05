import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, ChevronLeft, ChevronRight, Maximize, Minimize,
  Play, Pause, SkipBack, SkipForward,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { SlideThumbnail } from './SlideCard'
import type { Slide, SlideOverlay } from '../../types'

interface SlideshowProps {
  slides: Slide[]
  startIndex?: number
  onClose: () => void
  overlays?: Record<string, SlideOverlay[]>
}

export function Slideshow({ slides, startIndex = 0, onClose, overlays }: SlideshowProps) {
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, slides.length - 1)))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [autoplay, setAutoplay] = useState(false)
  const [autoplayInterval, setAutoplayIntervalMs] = useState(4000)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slide = slides[index]
  const hasPrev = index > 0
  const hasNext = index < slides.length - 1

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= slides.length - 1) {
        setAutoplay(false)
        return i
      }
      return i + 1
    })
  }, [slides.length])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev])

  // Fullscreen API
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Auto-hide controls on mouse idle
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  useEffect(() => {
    showControls()
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [])

  // Autoplay
  useEffect(() => {
    if (autoplayTimer.current) clearTimeout(autoplayTimer.current)
    if (!autoplay) return
    autoplayTimer.current = setTimeout(() => next(), autoplayInterval)
    return () => { if (autoplayTimer.current) clearTimeout(autoplayTimer.current) }
  }, [autoplay, index, autoplayInterval, next])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex flex-col select-none"
      onMouseMove={showControls}
      onClick={showControls}
    >
      {/* Top bar */}
      <div
        className={cn(
          'absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 py-4',
          'bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <p className="text-white text-sm font-medium truncate max-w-xl">
          {slide?.title || ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={isFullscreen ? 'Выйти из полноэкранного' : 'Полный экран (F)'}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-12">
        <div className="relative w-full" style={{ maxHeight: 'calc(100vh - 140px)', aspectRatio: '16/9', maxWidth: 'calc((100vh - 140px) * 16 / 9)' }}>
          {slide?.video_url ? (
            <video
              src={slide.video_url}
              controls
              className="w-full h-full rounded-lg"
              poster={slide.thumbnail_url || undefined}
            />
          ) : slide ? (
            <div className="w-full h-full rounded-lg overflow-hidden shadow-2xl">
              <SlideThumbnail slide={slide} />
            </div>
          ) : null}

          {/* Media overlays */}
          {slide && overlays && (overlays[String(slide.id)] || []).map((overlay) => (
            <div
              key={overlay.id}
              className="absolute pointer-events-none"
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                width: `${overlay.w}%`,
                height: `${overlay.h}%`,
              }}
            >
              {overlay.file_type === 'video' ? (
                <video
                  src={overlay.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <img src={overlay.url} alt="" className="w-full h-full object-contain" />
              )}
            </div>
          ))}

          {/* Side nav arrows */}
          {hasPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); prev() }}
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 w-11 h-11',
                'rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center',
                'transition-all duration-300',
                controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              )}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={(e) => { e.stopPropagation(); next() }}
              className={cn(
                'absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 w-11 h-11',
                'rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center',
                'transition-all duration-300',
                controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              )}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className={cn(
          'absolute bottom-0 inset-x-0 z-10',
          'bg-gradient-to-t from-black/70 to-transparent',
          'transition-opacity duration-300',
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                'rounded-full transition-all duration-200',
                i === index
                  ? 'w-4 h-2 bg-white'
                  : 'w-2 h-2 bg-white/40 hover:bg-white/70'
              )}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-6 pb-4">
          {/* Left: slide info */}
          <p className="text-white/60 text-sm">
            {index + 1} / {slides.length}
          </p>

          {/* Center: playback controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIndex(0)}
              disabled={index === 0}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
              title="В начало"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={prev}
              disabled={!hasPrev}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setAutoplay((v) => !v)}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                autoplay ? 'bg-white text-black hover:bg-white/80' : 'bg-white/20 text-white hover:bg-white/30'
              )}
              title={autoplay ? 'Пауза' : 'Авто-воспроизведение'}
            >
              {autoplay ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button
              onClick={next}
              disabled={!hasNext}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIndex(slides.length - 1)}
              disabled={index === slides.length - 1}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
              title="В конец"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Right: autoplay speed */}
          <div className="flex items-center gap-2">
            <span className="text-white/40 text-xs">Скорость:</span>
            {[3, 5, 8].map((s) => (
              <button
                key={s}
                onClick={() => setAutoplayIntervalMs(s * 1000)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded transition-colors',
                  autoplayInterval === s * 1000
                    ? 'bg-white/30 text-white'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {s}с
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
