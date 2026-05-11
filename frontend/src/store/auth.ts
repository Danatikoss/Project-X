import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "../types";

interface AuthState {
	user: AuthUser | null;
	accessToken: string | null;
	activeCompanyId: number | null; // for super-admin: which company they're acting as
	setAuth: (user: AuthUser, accessToken: string) => void;
	clearAuth: () => void;
	isAuthenticated: () => boolean;
	setActiveCompany: (companyId: number | null) => void;
	isSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set, get) => ({
			user: null,
			accessToken: null,
			activeCompanyId: null,

			setAuth: (user, accessToken) => {
				// For regular users/company-admins, active company = their own
				const activeCompanyId = user.company_id ?? get().activeCompanyId;
				set({ user, accessToken, activeCompanyId });
			},

			clearAuth: () => set({ user: null, accessToken: null, activeCompanyId: null }),

			isAuthenticated: () => !!get().accessToken,

			setActiveCompany: (companyId) => set({ activeCompanyId: companyId }),

			isSuperAdmin: () => {
				const u = get().user;
				return !!u?.is_admin && u.company_id === null;
			},
		}),
		{
			name: "slidex-auth",
			partialize: (state) => ({ user: state.user, activeCompanyId: state.activeCompanyId }),
		}
	)
);
