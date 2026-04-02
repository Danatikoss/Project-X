import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Layers, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { assemblyApi } from '../api/client'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { Slide } from '../types'

export default function SharedAssembly() {
  const { token } = useParams<{ token: string }>()
  const [current, setCurrent] = useState(0)

  const { data: assembly, isLoading, isError } = useQuery({
    queryKey: ['shared-assembly', token],
    queryFn: () => assemblyApi.getPublic(token!),
    enabled: !!token,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <Spinner />
      </div>
    )
  }

  if (isError || !assembly) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 gap-4 text-gray-400">
        <AlertCircle className="w-10 h-10" />
        <p className="text-lg font-medium text-white">Презентация не найдена</p>
        <p className="text-sm">Ссылка устарела или была отозвана</p>
      </div>
    )
  }

  const slides = assembly.slides
  const slide: Slide | undefined = slides[current]

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/10 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0">
          <Layers className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-sm truncate">{assembly.title}</span>
        <span className="ml-auto text-xs text-gray-500">
          {current + 1} / {slides.length}
        </span>
      </div>

      {/* Main view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slide strip */}
        <div className="w-32 shrink-0 border-r border-white/10 overflow-y-auto flex flex-col gap-1 p-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrent(i)}
              className={cn(
                'rounded-lg overflow-hidden border-2 transition-all',
                i === current ? 'border-brand-500' : 'border-transparent opacity-50 hover:opacity-80'
              )}
            >
              <img
                src={s.thumbnail_url}
                alt={s.title || `Слайд ${i + 1}`}
                className="w-full aspect-video object-cover"
              />
            </button>
          ))}
        </div>

        {/* Current slide */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          {slide ? (
            <>
              <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src={slide.thumbnail_url}
                  alt={slide.title || ''}
                  className="w-full aspect-video object-cover"
                />
              </div>
              {slide.title && (
                <p className="text-lg font-semibold text-center">{slide.title}</p>
              )}
            </>
          ) : (
            <p className="text-gray-500">Нет слайдов</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 py-4 border-t border-white/10 shrink-0">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                i === current ? 'bg-brand-400 w-4' : 'bg-white/30 hover:bg-white/50'
              )}
            />
          ))}
        </div>
        <button
          onClick={() => setCurrent((c) => Math.min(slides.length - 1, c + 1))}
          disabled={current === slides.length - 1}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
