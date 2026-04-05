import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookImage, Upload, User, Layers, Palette, Film,
  FileText, Wand2, ShieldCheck, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { IndexingBell } from './IndexingBell'
import { useAuthStore } from '../../store/auth'

const BASE_NAV = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Главная' },
  { to: '/generate',       icon: Wand2,           label: 'Генератор' },
  { to: '/library',        icon: BookImage,        label: 'Библиотека' },
  { to: '/library/upload', icon: Upload,           label: 'Загрузить' },
  { to: '/theses',         icon: FileText,         label: 'Тезисы' },
  { to: '/media',          icon: Film,             label: 'Медиа' },
  { to: '/brand',          icon: Palette,          label: 'Бренд' },
  { to: '/profile',        icon: User,             label: 'Профиль' },
]

const ADMIN_NAV = [
  { to: '/brand/guidelines', icon: ShieldCheck, label: 'Гайдлайны' },
]

export function AppShell() {
  const location = useLocation()
  const isAssemblePage = location.pathname.startsWith('/assemble/')
  const user = useAuthStore((s) => s.user)

  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('nav-collapsed') === 'true'
  )

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('nav-collapsed', String(next))
  }

  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?'

  const navItems = [
    ...BASE_NAV,
    ...(user?.is_admin ? ADMIN_NAV : []),
  ]

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-sidebar shrink-0 border-r border-white/5 shadow-sidebar transition-all duration-200',
          collapsed ? 'w-[60px]' : 'w-56'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center border-b border-white/5 shrink-0',
          collapsed ? 'px-3 py-5 justify-center' : 'gap-2.5 px-4 py-5'
        )}>
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0 shadow-md">
            <Layers className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <>
              <span className="text-white font-bold text-base tracking-tight">SLIDEX</span>
              <div className="ml-auto">
                <IndexingBell />
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-xl text-sm font-medium transition-all duration-150',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-brand-600/20 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-brand-400' : '')} />
                  {!collapsed && (
                    <>
                      {label}
                      {isActive && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
                      )}
                    </>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + collapse toggle */}
        <div className="px-2 py-3 border-t border-white/5 flex flex-col gap-1">
          {!collapsed && (
            <NavLink
              to="/profile"
              className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-semibold">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-xs font-medium truncate group-hover:text-white transition-colors">
                  {user?.name || user?.email || 'Профиль'}
                </p>
                {user?.email && user?.name && (
                  <p className="text-slate-500 text-[10px] truncate">{user.email}</p>
                )}
              </div>
            </NavLink>
          )}
          {collapsed && (
            <NavLink
              to="/profile"
              title="Профиль"
              className="flex items-center justify-center py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center justify-center">
                <span className="text-white text-xs font-semibold">{initials}</span>
              </div>
            </NavLink>
          )}

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className={cn(
              'flex items-center rounded-xl py-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all',
              collapsed ? 'justify-center px-2' : 'gap-2 px-2'
            )}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-xs">Свернуть</span>
                </>
              )
            }
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={cn(
        'flex-1 overflow-auto pb-16 md:pb-0',
        isAssemblePage ? 'overflow-hidden pb-0' : ''
      )}>
        <Outlet />
      </main>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-white/10 flex items-center px-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg transition-colors',
                isActive ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'
              )
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
