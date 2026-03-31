import { useRef } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { Slide } from '../../types'

interface SortableSlideProps {
  slide: Slide
  index: number
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
}

function SortableSlide({ slide, index, isSelected, onSelect, onRemove }: SortableSlideProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-2 p-1.5 rounded-lg cursor-pointer transition-colors',
        isSelected ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50 border border-transparent'
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <button
        className="mt-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-gray-400"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Slide number */}
      <span className="text-[11px] font-mono text-gray-400 mt-1 w-4 shrink-0 text-right">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <div className="relative flex-1 rounded overflow-hidden bg-gray-100" style={{ paddingTop: '56.25%', position: 'relative' }}>
        <div className="absolute inset-0">
          {slide.thumbnail_url ? (
            <img
              src={slide.thumbnail_url}
              alt={slide.title || 'Слайд'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
              <span className="text-[10px] text-gray-400">Нет фото</span>
            </div>
          )}
        </div>
      </div>

      {/* Remove */}
      <button
        className="mt-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-red-500 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onRemove() }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

interface FilmStripProps {
  slides: Slide[]
  selectedIndex: number
  onSelect: (i: number) => void
  onReorder: (slides: Slide[]) => void
  onRemove: (id: number) => void
}

export function FilmStrip({ slides, selectedIndex, onSelect, onReorder, onRemove }: FilmStripProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = slides.findIndex((s) => s.id === active.id)
      const newIndex = slides.findIndex((s) => s.id === over.id)
      onReorder(arrayMove(slides, oldIndex, newIndex))
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1 p-2">
          {slides.map((slide, i) => (
            <SortableSlide
              key={slide.id}
              slide={slide}
              index={i}
              isSelected={i === selectedIndex}
              onSelect={() => onSelect(i)}
              onRemove={() => onRemove(slide.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
