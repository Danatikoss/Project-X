import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import Assemble from "./pages/Assemble";
import Dashboard from "./pages/Dashboard";
import Generate from "./pages/Generate";
import Library from "./pages/Library";
import Login from "./pages/Login";
import Media from "./pages/Media";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import CollabAssemble from "./pages/CollabAssemble";
import SharedAssembly from "./pages/SharedAssembly";
import TemplateEditor from "./pages/TemplateEditor";
import Upload from "./pages/Upload";
import { useAuthStore } from "./store/auth";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: false, // не ретраить 401
		},
	},
});

// Защищённый роут: если не залогинен — на /login
function PrivateRoute({ children }: { children: React.ReactNode }) {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
	return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Публичный роут: если уже залогинен — на /dashboard
function PublicRoute({ children }: { children: React.ReactNode }) {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
	return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
				<Routes>
					{/* Публичные страницы */}
					<Route
						path="/login"
						element={
							<PublicRoute>
								<Login />
							</PublicRoute>
						}
					/>
					<Route
						path="/register"
						element={
							<PublicRoute>
								<Register />
							</PublicRoute>
						}
					/>
					<Route path="/share/:token" element={<SharedAssembly />} />
					<Route path="/edit/:editToken" element={<CollabAssemble />} />

					{/* Защищённые страницы */}
					<Route
						element={
							<PrivateRoute>
								<AppShell />
							</PrivateRoute>
						}
					>
						<Route path="/" element={<Navigate to="/dashboard" replace />} />
						<Route
							path="/dashboard"
							element={
								<ErrorBoundary>
									<Dashboard />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/library"
							element={
								<ErrorBoundary>
									<Library />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/library/upload"
							element={
								<ErrorBoundary>
									<Upload />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/assemble/:id"
							element={
								<ErrorBoundary>
									<Assemble />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/profile"
							element={
								<ErrorBoundary>
									<Profile />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/media"
							element={
								<ErrorBoundary>
									<Media />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/generate"
							element={
								<ErrorBoundary>
									<Generate />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/templates/new"
							element={
								<ErrorBoundary>
									<TemplateEditor />
								</ErrorBoundary>
							}
						/>
						<Route
							path="/templates/:id/edit"
							element={
								<ErrorBoundary>
									<TemplateEditor />
								</ErrorBoundary>
							}
						/>
					</Route>
				</Routes>
			</BrowserRouter>
			<Toaster richColors position="top-right" />
		</QueryClientProvider>
	);
}
