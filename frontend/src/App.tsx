import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { useAuthStore } from './store/auth'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import Upload from './pages/Upload'
import Assemble from './pages/Assemble'
import Profile from './pages/Profile'
import Brand from './pages/Brand'
import Media from './pages/Media'
import TemplateEditor from './pages/TemplateEditor'
import ThesesList from './pages/ThesesList'
import Theses from './pages/Theses'
import SharedAssembly from './pages/SharedAssembly'
import Login from './pages/Login'
import Register from './pages/Register'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false, // не ретраить 401
    },
  },
})

// Защищённый роут: если не залогинен — на /login
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

// Публичный роут: если уже залогинен — на /dashboard
function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Публичные страницы */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/share/:token" element={<SharedAssembly />} />

          {/* Защищённые страницы */}
          <Route element={<PrivateRoute><AppShell /></PrivateRoute>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="/library" element={<ErrorBoundary><Library /></ErrorBoundary>} />
            <Route path="/library/upload" element={<ErrorBoundary><Upload /></ErrorBoundary>} />
            <Route path="/assemble/:id" element={<ErrorBoundary><Assemble /></ErrorBoundary>} />
            <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
            <Route path="/brand" element={<ErrorBoundary><Brand /></ErrorBoundary>} />
            <Route path="/media" element={<ErrorBoundary><Media /></ErrorBoundary>} />
            <Route path="/templates/new" element={<ErrorBoundary><TemplateEditor /></ErrorBoundary>} />
            <Route path="/templates/:id/edit" element={<ErrorBoundary><TemplateEditor /></ErrorBoundary>} />
            <Route path="/theses" element={<ErrorBoundary><ThesesList /></ErrorBoundary>} />
            <Route path="/theses/:id" element={<ErrorBoundary><Theses /></ErrorBoundary>} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}
