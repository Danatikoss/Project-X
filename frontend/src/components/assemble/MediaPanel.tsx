import { useQuery } from "@tanstack/react-query";
import { Plus, Play, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { mediaApi } from "../../api/client";
import { Spinner } from "../common/Spinner";
import type { MediaAsset, MediaFolder } from "../../types";
import { cn } from "../../utils/cn";

const MEDIA_TYPE_TABS = [
	{ value: "all" as const, label: "Все" },
	{ value: "gif" as const, label: "GIF" },
	{ value: "video" as const, label: "Видео" },
	{ value: "image" as const, label: "Фото" },
];

export function MediaPanel({
	onAdd,
	onUploadFiles,
	isUploading,
}: {
	onAdd: (asset: MediaAsset) => void;
	onUploadFiles: (files: FileList) => void;
	isUploading: boolean;
}) {
	const [selectedFolder, setSelectedFolder] = useState<number | "all" | "unfoldered">("all");
	const [typeTab, setTypeTab] = useState<"all" | "gif" | "video" | "image">("all");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: folders = [] } = useQuery<MediaFolder[]>({
		queryKey: ["media-folders"],
		queryFn: mediaApi.listFolders,
	});
	const { data: assets = [], isLoading } = useQuery({
		queryKey: ["media-assets", selectedFolder, typeTab],
		queryFn: () => {
			const params: { folder_id?: number; unfoldered?: boolean; file_type?: string } = {};
			if (selectedFolder === "unfoldered") params.unfoldered = true;
			else if (typeof selectedFolder === "number") params.folder_id = selectedFolder;
			if (typeTab !== "all") params.file_type = typeTab;
			return mediaApi.listAssets(params);
		},
	});

	if (isLoading)
		return (
			<div className="flex justify-center py-8">
				<Spinner />
			</div>
		);

	return (
		<div className="flex flex-col h-full">
			<input
				ref={fileInputRef}
				type="file"
				accept="video/*,image/gif,image/*"
				multiple
				className="hidden"
				onChange={(e) => e.target.files && onUploadFiles(e.target.files)}
			/>

			{/* Type tabs + upload button */}
			<div className="px-2 pt-2 pb-1 flex gap-1 items-center">
				{MEDIA_TYPE_TABS.map(({ value, label }) => (
					<button
						key={value}
						onClick={() => setTypeTab(value)}
						className={cn(
							"flex-1 text-[10px] font-semibold py-1 rounded-lg border transition-colors",
							typeTab === value
								? "bg-brand-600 text-white border-brand-600"
								: "border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600"
						)}
					>
						{label}
					</button>
				))}
				<button
					onClick={() => fileInputRef.current?.click()}
					disabled={isUploading}
					className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-50"
					title="Загрузить файл"
				>
					{isUploading ? <Spinner className="w-3 h-3" /> : <Upload className="w-3.5 h-3.5" />}
				</button>
			</div>

			{/* Folder chips */}
			{folders.length > 0 && (
				<div className="px-2 pb-1 border-b border-gray-100 flex flex-wrap gap-1">
					{(["all", "unfoldered"] as const).map((v) => (
						<button
							key={v}
							onClick={() => setSelectedFolder(v)}
							className={cn(
								"text-[10px] px-2 py-0.5 rounded-full border transition-colors",
								selectedFolder === v
									? "bg-brand-50 text-brand-600 border-brand-300"
									: "border-gray-200 text-gray-500 hover:border-brand-400"
							)}
						>
							{v === "all" ? "Все папки" : "Без папки"}
						</button>
					))}
					{folders.map((f) => (
						<button
							key={f.id}
							onClick={() => setSelectedFolder(f.id)}
							className={cn(
								"flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[90px]",
								selectedFolder === f.id
									? "bg-brand-50 text-brand-600 border-brand-300"
									: "border-gray-200 text-gray-500 hover:border-brand-400"
							)}
						>
							<span className="truncate">{f.name}</span>
							{f.asset_count > 0 && <span className="shrink-0 text-gray-400">{f.asset_count}</span>}
						</button>
					))}
				</div>
			)}

			{assets.length === 0 ? (
				<div
					className="flex flex-col items-center justify-center flex-1 gap-2 p-4 border-2 border-dashed m-2 rounded-xl text-gray-400 border-gray-200 cursor-pointer hover:border-brand-400 hover:text-brand-500 transition-colors"
					onClick={() => fileInputRef.current?.click()}
				>
					<Upload className="w-7 h-7 opacity-20" />
					<p className="text-xs text-center font-medium">Перетащите или нажмите</p>
					<p className="text-[10px] text-center opacity-70">Видео, GIF, фото</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto p-2">
					<p className="text-[10px] text-gray-400 px-1 pb-2">Нажмите — добавить на слайд</p>
					<div className="grid grid-cols-2 gap-2">
						{assets.map((asset) => (
							<button
								key={asset.id}
								onClick={() => onAdd(asset)}
								className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-brand-400 transition-all bg-gray-50 hover:shadow-md"
								style={{ aspectRatio: "16/9" }}
								title={asset.name}
							>
								{asset.file_type === "video" ? (
									<div className="w-full h-full bg-slate-900 flex items-center justify-center">
										<Play className="w-6 h-6 text-white/60" />
									</div>
								) : (
									<img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
								)}
								<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
									<Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg" />
								</div>
								<span
									className={cn(
										"absolute top-1 left-1 text-[8px] px-1 py-0.5 rounded font-bold uppercase",
										asset.file_type === "gif"
											? "bg-pink-500/90 text-white"
											: asset.file_type === "video"
												? "bg-violet-500/90 text-white"
												: "bg-black/60 text-white"
									)}
								>
									{asset.file_type === "video" ? "MP4" : asset.file_type.toUpperCase()}
								</span>
								<p className="absolute bottom-0 left-0 right-0 text-[9px] text-white bg-black/50 px-1.5 py-0.5 truncate">
									{asset.name}
								</p>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
