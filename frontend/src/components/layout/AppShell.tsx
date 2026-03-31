import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, BookImage, Upload, User, Layers, Palette } from 'lucide-react'
import { cn } from '../../utils/cn'
import { IndexingBell } from './IndexingBell'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Главная' },
  { to: '/library', icon: BookImage, label: 'Библиотека' },
  { to: '/library/upload', icon: Upload, label: 'Загрузить' },
  { to: '/brand', icon: Palette, label: 'Бренд' },
  { to: '/profile', icon: User, label: 'Профиль' },
]

export function AppShell() {
  const location = useLocation()
  const isAssemblePage = location.pathname.startsWith('/assemble/')

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-[72px] border-r border-gray-200 flex-col items-center py-4 gap-1 bg-white z-10 shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 bg-brand-900 rounded-xl flex items-center justify-center mb-4">
          <Layers className="w-5 h-5 text-white" />
        </div>

        <IndexingBell />

        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors',
                'text-gray-400 hover:text-brand-900 hover:bg-brand-50',
                isActive && 'text-brand-900 bg-brand-50'
              )
            }
            title={label}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">{label}</span>
          </NavLink>
        ))}
      </aside>

      {/* Main content */}
      <main className={cn(
        'flex-1 overflow-auto pb-16 md:pb-0',
        isAssemblePage ? 'overflow-hidden pb-0' : ''
      )}>
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex items-center">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors',
                isActive ? 'text-brand-900' : 'text-gray-400'
              )
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
