import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "../types";

interface AuthState {
	user: AuthUser | null;
	accessToken: string | null;
	setAuth: (user: AuthUser, accessToken: string) => void;
	clearAuth: () => void;
	isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set, get) => ({
			user: null,
			accessToken: null,

			setAuth: (user, accessToken) => set({ user, accessToken }),

			clearAuth: () => set({ user: null, accessToken: null }),

			isAuthenticated: () => !!get().accessToken,
		}),
		{
			name: "slidex-auth",
			// Only persist user profile — access token stays in memory only
			partialize: (state) => ({ user: state.user }),
		}
	)
);
