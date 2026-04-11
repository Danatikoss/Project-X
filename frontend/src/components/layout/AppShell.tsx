import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookImage, Upload, User, Layers, Palette, Film,
  Wand2, ShieldCheck,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { IndexingBell } from './IndexingBell'
import { useAuthStore } from '../../store/auth'

const BASE_NAV = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Главная' },
  { to: '/generate',       icon: Wand2,           label: 'Генератор' },
  { to: '/library',        icon: BookImage,        label: 'Библиотека' },
  { to: '/library/upload', icon: Upload,           label: 'Загрузить' },
  { to: '/media',          icon: Film,             label: 'Медиа' },
  { to: '/brand',          icon: Palette,          label: 'Бренд' },
]

const ADMIN_NAV = [
  { to: '/brand/guidelines', icon: ShieldCheck, label: 'Гайдлайны' },
]

export function AppShell() {
  const location = useLocation()
  const isAssemblePage = location.pathname.startsWith('/assemble/')
  const user = useAuthStore((s) => s.user)

  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?'

  const navItems = [
    ...BASE_NAV,
    ...(user?.is_admin ? ADMIN_NAV : []),
  ]

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden">
      {/* ── Top header ── */}
      <header className="hidden md:flex items-center shrink-0 h-12 px-4 bg-white border-b border-gray-200 shadow-sm gap-4 z-20">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-gray-100">
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-sm">
            <Layers className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-gray-900 leading-none">SLIDEX</span>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-0.5 flex-1 min-w-0">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-brand-600' : '')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right: bell + user */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <IndexingBell />
          <NavLink
            to="/profile"
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors group"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-brand flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">{initials}</span>
            </div>
            <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 hidden lg:block max-w-[120px] truncate">
              {user?.name || user?.email || 'Профиль'}
            </span>
          </NavLink>
        </div>
      </header>

      {/* ── Main ── */}
      <main className={cn(
        'flex-1 overflow-auto pb-14 md:pb-0 min-h-0',
        isAssemblePage ? 'overflow-hidden pb-0' : ''
      )}>
        <Outlet />
      </main>

      {/* ── Bottom nav — mobile ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center px-1 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg transition-colors',
                isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
              )
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-medium">{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg transition-colors',
              isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
            )
          }
        >
          <User className="w-5 h-5" />
          <span className="text-[9px] font-medium">Профиль</span>
        </NavLink>
      </nav>
    </div>
  )
}
