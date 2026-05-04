import { cn } from "../../utils/cn";

interface SpinnerProps {
	className?: string;
	size?: "sm" | "md" | "lg";
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
	const sizeClass = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" }[size];
	return (
		<div
			className={cn(
				"border-2 border-brand-200 border-t-brand-700 rounded-full animate-spin",
				sizeClass,
				className
			)}
		/>
	);
}
