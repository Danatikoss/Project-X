import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Check, User, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { profileApi, searchApi, libraryApi } from '../api/client'
import { SlideCard } from '../components/common/SlideCard'
import { Spinner } from '../components/common/Spinner'
import { useAuthStore } from '../store/auth'
import { cn } from '../utils/cn'
import type { Slide } from '../types'

export default function Profile() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const handleLogout = () => {
    clearAuth()
    queryClient.clear()
    navigate('/login')
  }

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
  })

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [contactSlide, setContactSlide] = useState<Slide | null>(null)
  const [slideSearch, setSlideSearch] = useState('')
  const [showSlidePicker, setShowSlidePicker] = useState(false)

  useEffect(() => {
    if (profile) {
      setName(profile.name || '')
      setCompany(profile.company || '')
    }
  }, [profile])

  const { data: contactSlideData } = useQuery({
    queryKey: ['slide', profile?.contact_slide_id],
    queryFn: () => libraryApi.getSlide(profile!.contact_slide_id!),
    enabled: !!profile?.contact_slide_id,
  })

  useEffect(() => {
    if (contactSlideData) setContactSlide(contactSlideData)
  }, [contactSlideData])

  const { data: slideSearchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['profile-search', slideSearch],
    queryFn: () =>
      slideSearch
        ? searchApi.search(slideSearch, 20)
        : libraryApi.listSlides({ page_size: 20 }).then((r) => ({
            items: r.items,
            total: r.total,
            query: '',
          })),
    enabled: showSlidePicker,
  })

  const updateMutation = useMutation({
    mutationFn: profileApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Профиль сохранён')
    },
    onError: () => toast.error('Не удалось сохранить'),
  })

  const handleSave = () => {
    updateMutation.mutate({ name, company })
  }

  const handleSelectContactSlide = (slide: Slide) => {
    setContactSlide(slide)
    setShowSlidePicker(false)
    updateMutation.mutate({ contact_slide_id: slide.id })
    toast.success('Контактный слайд обновлён')
  }

  const handleRemoveContactSlide = () => {
    setContactSlide(null)
    updateMutation.mutate({ contact_slide_id: undefined })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center">
          <User className="w-6 h-6 text-brand-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Профиль</h1>
          <p className="text-sm text-gray-500">Настройки пользователя</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Основная информация</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Организация</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Название организации"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-900 text-white rounded-xl text-sm font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? <Spinner size="sm" className="border-white border-t-transparent" /> : <Check className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </div>

      {/* Logout */}
      <div className="mb-6">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Выйти из аккаунта
        </button>
      </div>

      {/* Contact slide */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Контактный слайд</h2>
        <p className="text-xs text-gray-500 mb-4">
          Этот слайд будет автоматически добавляться в конец презентации при экспорте, если запрос содержит «мои контакты».
        </p>

        {contactSlide ? (
          <div className="relative">
            <SlideCard slide={contactSlide} />
            <button
              onClick={handleRemoveContactSlide}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSlidePicker(true)}
            className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-brand-300 hover:text-brand-700 transition-colors"
          >
            + Выбрать контактный слайд
          </button>
        )}

        {showSlidePicker && (
          <div className="mt-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={slideSearch}
                onChange={(e) => setSlideSearch(e.target.value)}
                placeholder="Поиск слайда..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            {searchFetching ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {slideSearchResults?.items.map((slide) => (
                  <SlideCard
                    key={slide.id}
                    slide={slide}
                    onClick={() => handleSelectContactSlide(slide)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
