import { create } from "zustand";
import type { Assembly, Slide } from "../types";

interface AppState {
	// Currently edited assembly
	currentAssembly: Assembly | null;
	setCurrentAssembly: (a: Assembly | null) => void;
	updateAssemblySlides: (slides: Slide[]) => void;
	updateAssemblyTitle: (title: string) => void;

	// Selected slide in the preview panel
	selectedSlideIndex: number;
	setSelectedSlideIndex: (i: number) => void;

	// Search query (shared between library and assemble page)
	searchQuery: string;
	setSearchQuery: (q: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
	currentAssembly: null,
	setCurrentAssembly: (a) => set({ currentAssembly: a, selectedSlideIndex: 0 }),
	updateAssemblySlides: (slides) =>
		set((state) =>
			state.currentAssembly ? { currentAssembly: { ...state.currentAssembly, slides } } : {}
		),
	updateAssemblyTitle: (title) =>
		set((state) =>
			state.currentAssembly ? { currentAssembly: { ...state.currentAssembly, title } } : {}
		),

	selectedSlideIndex: 0,
	setSelectedSlideIndex: (i) => set({ selectedSlideIndex: i }),

	searchQuery: "",
	setSearchQuery: (q) => set({ searchQuery: q }),
}));
