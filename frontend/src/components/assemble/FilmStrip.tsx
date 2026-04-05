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
  dark?: boolean
}

function SortableSlide({ slide, index, isSelected, onSelect, onRemove, dark }: SortableSlideProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all',
        dark
          ? isSelected
            ? 'bg-brand-600/20 border border-brand-500/50'
            : 'border border-transparent hover:bg-white/5 hover:border-white/10'
          : isSelected
            ? 'bg-brand-50 border border-brand-200'
            : 'border border-transparent hover:bg-gray-50'
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <button
        className={cn(
          'mt-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing shrink-0',
          dark ? 'text-white/40' : 'text-gray-400'
        )}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </button>

      {/* Slide number */}
      <span className={cn(
        'text-[10px] font-mono mt-1 w-4 shrink-0 text-right leading-none',
        dark
          ? isSelected ? 'text-brand-400' : 'text-white/30'
          : isSelected ? 'text-brand-600' : 'text-gray-400'
      )}>
        {index + 1}
      </span>

      {/* Thumbnail */}
      <div
        className={cn(
          'relative flex-1 rounded overflow-hidden',
          dark ? 'ring-1 ring-white/10' : 'ring-1 ring-gray-200',
          isSelected && (dark ? 'ring-1 ring-brand-400/60' : 'ring-1 ring-brand-400')
        )}
        style={{ paddingTop: '56.25%' }}
      >
        <div className="absolute inset-0">
          {slide.thumbnail_url ? (
            <img
              src={slide.thumbnail_url}
              alt={slide.title || 'Слайд'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className={cn('w-full h-full flex items-center justify-center', dark ? 'bg-white/5' : 'bg-gray-100')}>
              <span className={cn('text-[9px]', dark ? 'text-white/30' : 'text-gray-400')}>—</span>
            </div>
          )}
        </div>
      </div>

      {/* Remove */}
      <button
        className={cn(
          'mt-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0',
          dark ? 'text-white/40 hover:!text-red-400' : 'text-gray-400 hover:!text-red-500'
        )}
        onClick={(e) => { e.stopPropagation(); onRemove() }}
      >
        <X className="w-3 h-3" />
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
  dark?: boolean
}

export function FilmStrip({ slides, selectedIndex, onSelect, onReorder, onRemove, dark }: FilmStripProps) {
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
        <div className="flex flex-col gap-0.5 p-2">
          {slides.map((slide, i) => (
            <SortableSlide
              key={slide.id}
              slide={slide}
              index={i}
              isSelected={i === selectedIndex}
              onSelect={() => onSelect(i)}
              onRemove={() => onRemove(slide.id)}
              dark={dark}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
