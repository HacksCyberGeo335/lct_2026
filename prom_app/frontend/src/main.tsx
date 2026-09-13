import './styles/fonts.css';
import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import App from './App';
import { readConfig } from './shared/config';
import './styles/reference.css';
import './styles/app.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="wrap pagehead">
        <h1 className="h-page">Не удалось открыть приложение</h1>
        <p role="alert">{this.state.error.message}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Перезагрузить
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
const root = createRoot(document.getElementById('root')!);
try {
  const config = readConfig(import.meta.env);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={client}>
          <MotionConfig reducedMotion="user">
            <BrowserRouter>
              <App initialMode={config.mode} apiBase={config.apiBase} />
            </BrowserRouter>
          </MotionConfig>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  root.render(
    <main className="wrap pagehead">
      <h1 className="h-page">Ошибка конфигурации</h1>
      <p role="alert">{error instanceof Error ? error.message : 'Проверьте переменные VITE_*.'}</p>
    </main>,
  );
}
