import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FolderOpen, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { libraryApi, projectsApi } from "../../api/client";
import type { Project } from "../../types";
import { cn } from "../../utils/cn";

export interface Filters {
	layout_type?: string;
	language?: string;
	is_outdated?: boolean;
	project_ids?: number[];
	label?: string;
}

interface FilterPanelProps {
	filters: Filters;
	onChange: (f: Filters) => void;
}

const VISIBLE_COUNT = 5;

const LAYOUT_TYPES = [
	{ value: "title", label: "Заголовок" },
	{ value: "content", label: "Контент" },
	{ value: "chart", label: "График" },
	{ value: "image", label: "Изображение" },
	{ value: "table", label: "Таблица" },
	{ value: "section", label: "Секция" },
];

const LANGUAGES = [
	{ value: "ru", label: "Русский" },
	{ value: "kk", label: "Қазақша" },
	{ value: "en", label: "English" },
];

function CollapseToggle({
	expanded,
	total,
	visible,
	onToggle,
}: {
	expanded: boolean;
	total: number;
	visible: number;
	onToggle: () => void;
}) {
	if (total <= VISIBLE_COUNT) return null;
	return (
		<button
			onClick={onToggle}
			className="mt-1 flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-800 transition-colors px-2"
		>
			{expanded ? (
				<>
					<ChevronUp className="w-3 h-3" /> Свернуть
				</>
			) : (
				<>
					<ChevronDown className="w-3 h-3" /> Ещё {total - visible}
				</>
			)}
		</button>
	);
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
	const queryClient = useQueryClient();
	const hasFilters = Object.values(filters).some(
		(v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
	);
	const [newProjectName, setNewProjectName] = useState("");
	const [showNewProject, setShowNewProject] = useState(false);
	const [projectsExpanded, setProjectsExpanded] = useState(false);
	const [labelsExpanded, setLabelsExpanded] = useState(false);

	const { data: projects = [] } = useQuery<Project[]>({
		queryKey: ["projects"],
		queryFn: projectsApi.list,
	});

	const { data: allLabels = [] } = useQuery<string[]>({
		queryKey: ["labels"],
		queryFn: libraryApi.getLabels,
	});

	const createProjectMutation = useMutation({
		mutationFn: (name: string) => projectsApi.create(name),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			setNewProjectName("");
			setShowNewProject(false);
			toast.success("Папка создана");
		},
		onError: (err: any) => toast.error(err.response?.data?.detail ?? "Ошибка"),
	});

	const deleteProjectMutation = useMutation({
		mutationFn: projectsApi.delete,
		onSuccess: (_, deletedId) => {
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			queryClient.invalidateQueries({ queryKey: ["slides"] });
			const remaining = (filters.project_ids || []).filter((id) => id !== deletedId);
			onChange({ ...filters, project_ids: remaining.length ? remaining : undefined });
			toast.success("Папка удалена");
		},
	});

	const toggleProjectId = (id: number) => {
		const current = filters.project_ids || [];
		const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
		onChange({ ...filters, project_ids: next.length ? next : undefined });
	};

	const visibleProjects = projectsExpanded ? projects : projects.slice(0, VISIBLE_COUNT);
	const visibleLabels = labelsExpanded ? allLabels : allLabels.slice(0, VISIBLE_COUNT);

	return (
		<aside className="w-[220px] shrink-0 border-r border-gray-200 bg-surface p-4 flex flex-col gap-5 overflow-y-auto">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-gray-700">Фильтры</h3>
				{hasFilters && (
					<button
						onClick={() => onChange({})}
						className="text-xs text-brand-700 hover:underline flex items-center gap-0.5"
					>
						<X className="w-3 h-3" /> Сбросить
					</button>
				)}
			</div>

			{/* Projects / Folders */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Папки</p>
					<button
						onClick={() => setShowNewProject((v) => !v)}
						className="text-gray-400 hover:text-brand-700 transition-colors"
						title="Создать папку"
					>
						<Plus className="w-3.5 h-3.5" />
					</button>
				</div>

				{showNewProject && (
					<div className="flex gap-1 mb-2">
						<input
							value={newProjectName}
							onChange={(e) => setNewProjectName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && newProjectName.trim())
									createProjectMutation.mutate(newProjectName.trim());
								if (e.key === "Escape") setShowNewProject(false);
							}}
							placeholder="Название папки"
							className="flex-1 text-xs px-2 py-1 rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-300"
						/>
						<button
							disabled={!newProjectName.trim()}
							onClick={() => createProjectMutation.mutate(newProjectName.trim())}
							className="text-xs px-2 py-1 bg-brand-900 text-white rounded disabled:opacity-40"
						>
							ОК
						</button>
					</div>
				)}

				<div className="flex flex-col gap-1">
					{visibleProjects.map((p) => {
						const isChecked = (filters.project_ids || []).includes(p.id);
						return (
							<div key={p.id} className="group flex items-center gap-1">
								<button
									onClick={() => toggleProjectId(p.id)}
									className={cn(
										"flex-1 flex items-center gap-1.5 text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate",
										isChecked
											? "bg-brand-100 text-brand-800 font-medium"
											: "text-gray-600 hover:bg-gray-100"
									)}
								>
									<div
										className={cn(
											"w-3 h-3 rounded border shrink-0 flex items-center justify-center transition-colors",
											isChecked ? "bg-brand-600 border-brand-600" : "border-gray-300"
										)}
									>
										{isChecked && (
											<svg className="w-2 h-2 text-white" viewBox="0 0 8 8">
												<path
													d="M1 4l2 2 4-4"
													stroke="currentColor"
													strokeWidth="1.5"
													fill="none"
													strokeLinecap="round"
												/>
											</svg>
										)}
									</div>
									<FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: p.color }} />
									<span className="truncate">{p.name}</span>
									<span className="ml-auto text-gray-400 font-normal">{p.slide_count}</span>
								</button>
								<button
									onClick={() => {
										if (!confirm(`Удалить папку "${p.name}"?`)) return;
										deleteProjectMutation.mutate(p.id);
									}}
									className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
								>
									<Trash2 className="w-3 h-3" />
								</button>
							</div>
						);
					})}
					{projects.length === 0 && <p className="text-xs text-gray-400 italic px-2">Папок нет</p>}
				</div>
				<CollapseToggle
					expanded={projectsExpanded}
					total={projects.length}
					visible={visibleProjects.length}
					onToggle={() => setProjectsExpanded((v) => !v)}
				/>
			</div>

			{/* Labels */}
			{allLabels.length > 0 && (
				<div>
					<p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Метки</p>
					<div className="flex flex-col gap-1">
						{visibleLabels.map((lbl) => (
							<button
								key={lbl}
								onClick={() =>
									onChange({ ...filters, label: filters.label === lbl ? undefined : lbl })
								}
								className={cn(
									"text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate",
									filters.label === lbl
										? "bg-teal-100 text-teal-800 font-medium"
										: "text-gray-600 hover:bg-gray-100"
								)}
							>
								{lbl}
							</button>
						))}
					</div>
					<CollapseToggle
						expanded={labelsExpanded}
						total={allLabels.length}
						visible={visibleLabels.length}
						onToggle={() => setLabelsExpanded((v) => !v)}
					/>
				</div>
			)}

			{/* Layout type */}
			<div>
				<p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Тип слайда</p>
				<div className="flex flex-col gap-1">
					{LAYOUT_TYPES.map(({ value, label }) => (
						<button
							key={value}
							onClick={() =>
								onChange({
									...filters,
									layout_type: filters.layout_type === value ? undefined : value,
								})
							}
							className={cn(
								"text-left text-xs px-2 py-1.5 rounded-md transition-colors",
								filters.layout_type === value
									? "bg-brand-100 text-brand-800 font-medium"
									: "text-gray-600 hover:bg-gray-100"
							)}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* Language */}
			<div>
				<p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Язык</p>
				<div className="flex gap-1 flex-wrap">
					{LANGUAGES.map(({ value, label }) => (
						<button
							key={value}
							onClick={() =>
								onChange({ ...filters, language: filters.language === value ? undefined : value })
							}
							className={cn(
								"text-xs px-2 py-1 rounded-full border transition-colors",
								filters.language === value
									? "bg-brand-900 text-white border-brand-900"
									: "border-gray-300 text-gray-600 hover:border-brand-400"
							)}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* Outdated toggle */}
			<div>
				<label className="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						checked={filters.is_outdated === true}
						onChange={(e) =>
							onChange({ ...filters, is_outdated: e.target.checked ? true : undefined })
						}
						className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
					/>
					<span className="text-xs text-gray-600">Только устаревшие</span>
				</label>
			</div>
		</aside>
	);
}
