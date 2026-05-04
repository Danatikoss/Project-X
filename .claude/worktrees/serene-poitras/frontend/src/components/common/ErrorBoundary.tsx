import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}
interface State {
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	render() {
		if (this.state.error) {
			return (
				<div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 p-8">
					<AlertTriangle className="w-10 h-10 text-red-400" />
					<p className="font-medium text-gray-700">Что-то пошло не так</p>
					<p className="text-sm text-center max-w-sm">{this.state.error.message}</p>
					<button
						onClick={() => this.setState({ error: null })}
						className="px-4 py-2 bg-brand-900 text-white rounded-lg text-sm hover:bg-brand-800 transition-colors"
					>
						Попробовать снова
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
