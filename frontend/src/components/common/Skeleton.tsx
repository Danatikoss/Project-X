import { cn } from "../../utils/cn";

export function Skeleton({ className }: { className?: string }) {
	return (
		<div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />
	);
}

export function SlideCardSkeleton() {
	return (
		<div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
			<Skeleton className="w-full h-36 rounded-none" />
			<div className="p-3 space-y-2">
				<Skeleton className="h-3.5 w-3/4" />
				<Skeleton className="h-3 w-1/2" />
				<div className="flex gap-1.5 pt-1">
					<Skeleton className="h-5 w-12 rounded-full" />
					<Skeleton className="h-5 w-10 rounded-full" />
				</div>
			</div>
		</div>
	);
}

export function TemplateCardSkeleton() {
	return (
		<div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
			<Skeleton className="w-full h-36 rounded-none" />
			<div className="px-4 pt-3 pb-4 space-y-2">
				<Skeleton className="h-4 w-2/3" />
				<Skeleton className="h-3 w-1/3" />
			</div>
		</div>
	);
}
