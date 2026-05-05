import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, FolderOpen, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { libraryApi, projectsApi, searchApi } from "../../api/client";
import { SlideCard } from "../common/SlideCard";
import { Spinner } from "../common/Spinner";
import type { Project, Slide } from "../../types";
import { cn } from "../../utils/cn";
import { useDebounce } from "../../hooks/useDebounce";

const PAGE_SIZE = 20;

export function LibraryPanel({
	existingIds,
	onAdd,
	onAddMultiple,
}: {
	existingIds: Set<number>;
	onAdd: (slide: Slide) => void;
	onAddMultiple: (slides: Slide[]) => void;
}) {
	const [query, setQuery] = useState("");
	const [projectId, setProjectId] = useState<number | undefined>();
	const [page, setPage] = useState(1);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Map<number, Slide>>(new Map());
	const debouncedQuery = useDebounce(query, 350);

	const { data: projects = [] } = useQuery<Project[]>({
		queryKey: ["projects"],
		queryFn: projectsApi.list,
	});
	const { data: searchResults, isFetching: searchFetching } = useQuery({
		queryKey: ["assemble-search", debouncedQuery],
		queryFn: () => searchApi.search(debouncedQuery, 40),
		enabled: debouncedQuery.length > 0,
	});
	const { data: libraryData, isFetching: libraryFetching } = useQuery({
		queryKey: ["assemble-library", projectId, page],
		queryFn: () => libraryApi.listSlides({ project_id: projectId, page, page_size: PAGE_SIZE }),
		enabled: debouncedQuery.length === 0,
	});

	const isSearching = debouncedQuery.length > 0;
	const slides: Slide[] = isSearching ? searchResults?.items || [] : libraryData?.items || [];
	const total = isSearching ? searchResults?.total || 0 : libraryData?.total || 0;
	const isFetching = isSearching ? searchFetching : libraryFetching;
	const totalPages = Math.ceil(total / PAGE_SIZE);

	useEffect(() => { setPage(1); }, []);
	useEffect(() => { if (!selectMode) setSelected(new Map()); }, [selectMode]);

	const toggleSelect = (slide: Slide) => {
		setSelected((prev) => {
			const next = new Map(prev);
			if (next.has(slide.id)) next.delete(slide.id);
			else if (!existingIds.has(slide.id)) next.set(slide.id, slide);
			return next;
		});
	};

	return (
		<div className="flex flex-col h-full">
			<div className="p-3 border-b border-gray-200 space-y-2">
				<div className="flex items-center gap-1.5">
					<div className="relative flex-1">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
						<input
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Поиск слайдов..."
							className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
						/>
						{query && (
							<button
								onClick={() => setQuery("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
					<button
						onClick={() => setSelectMode((v) => !v)}
						className={cn(
							"text-[10px] px-2 py-1.5 rounded-lg border transition-colors whitespace-nowrap shrink-0",
							selectMode
								? "bg-brand-600 text-white border-brand-600"
								: "border-gray-200 text-gray-500 hover:border-brand-500 hover:text-gray-900"
						)}
					>
						{selectMode ? "Отмена" : "Выбрать"}
					</button>
				</div>

				{projects.length > 0 && (
					<div className="flex flex-wrap gap-1">
						<button
							onClick={() => setProjectId(undefined)}
							className={cn(
								"text-[10px] px-2 py-0.5 rounded-full border transition-colors",
								projectId === undefined
									? "bg-brand-50 text-brand-600 border-brand-300"
									: "border-gray-200 text-gray-400 hover:border-gray-300"
							)}
						>
							Все
						</button>
						{projects.map((p) => (
							<button
								key={p.id}
								onClick={() => setProjectId(projectId === p.id ? undefined : p.id)}
								className={cn(
									"flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[100px]",
									projectId === p.id
										? "bg-brand-50 text-brand-600 border-brand-300"
										: "border-gray-200 text-gray-400 hover:border-gray-300"
								)}
							>
								<FolderOpen className="w-2.5 h-2.5 shrink-0" style={{ color: p.color }} />
								<span className="truncate">{p.name}</span>
							</button>
						))}
					</div>
				)}
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				{isFetching && !slides.length ? (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				) : slides.length === 0 ? (
					<div className="text-center py-8">
						<Search className="w-8 h-8 mx-auto mb-2 text-gray-200" />
						<p className="text-xs text-gray-400">Ничего не найдено</p>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-2">
						{slides.map((slide) => {
							const added = existingIds.has(slide.id);
							const isSelected = selected.has(slide.id);
							return (
								<div key={slide.id} className="relative group">
									<SlideCard
										slide={slide}
										compact
										onClick={() => {
											if (selectMode) { if (!added) toggleSelect(slide); }
											else if (!added) onAdd(slide);
										}}
										className={cn(added && !selectMode && "opacity-40 cursor-not-allowed")}
									/>
									<p className="text-[10px] text-gray-400 mt-1 leading-tight line-clamp-1 px-0.5">
										{slide.title || "(без названия)"}
									</p>
									{selectMode && !added && (
										<div
											className={cn(
												"absolute inset-0 rounded-lg border-2 transition-all cursor-pointer",
												isSelected ? "border-brand-500 bg-brand-50" : "border-transparent hover:border-brand-300"
											)}
											onClick={() => toggleSelect(slide)}
										>
											<div
												className={cn(
													"absolute top-1.5 left-1.5 w-4 h-4 rounded border-2 flex items-center justify-center",
													isSelected ? "bg-brand-600 border-brand-600" : "bg-white border-gray-300"
												)}
											>
												{isSelected && <Check className="w-2.5 h-2.5 text-white" />}
											</div>
										</div>
									)}
									{!selectMode &&
										(added ? (
											<div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
												<div className="flex items-center gap-1 bg-brand-600/90 text-white text-[10px] px-2 py-0.5 rounded-full">
													<Check className="w-2.5 h-2.5" /> Добавлен
												</div>
											</div>
										) : (
											<button
												onClick={() => onAdd(slide)}
												className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-brand-500 transition-all"
											>
												<Plus className="w-3 h-3" />
											</button>
										))}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{selectMode && selected.size > 0 && (
				<div className="px-3 py-2 border-t border-gray-200 bg-brand-50">
					<button
						onClick={() => {
							onAddMultiple(Array.from(selected.values()));
							setSelected(new Map());
							setSelectMode(false);
						}}
						className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-500 transition-colors"
					>
						<Plus className="w-3.5 h-3.5" />
						Добавить {selected.size}{" "}
						{selected.size === 1 ? "слайд" : selected.size < 5 ? "слайда" : "слайдов"}
					</button>
				</div>
			)}

			{!isSearching && totalPages > 1 && (
				<div className="py-2 border-t border-gray-200 flex items-center justify-center gap-4">
					<button
						disabled={page <= 1}
						onClick={() => setPage((p) => p - 1)}
						className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
					>
						<ChevronLeft className="w-4 h-4 text-gray-400" />
					</button>
					<span className="text-[10px] text-gray-400">{page} / {totalPages}</span>
					<button
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
						className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
					>
						<ChevronRight className="w-4 h-4 text-gray-400" />
					</button>
				</div>
			)}
			{!isSearching && (
				<div className="pb-2 text-center">
					<span className="text-[10px] text-gray-400">{total} слайдов в библиотеке</span>
				</div>
			)}
		</div>
	);
}
