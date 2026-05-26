import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { loginRequest } from './apiClient.js';
import { isAuthenticated, setAuthSession } from './authStorage.js';
import { useAuth } from './AuthContext.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { refreshFromStorage } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated()) {
      const from =
        location.state?.from?.pathname ||
        searchParams.get('from') ||
        '/';
      navigate(from.startsWith('/login') ? '/' : from, { replace: true });
    }
  }, [location.state, navigate, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Ingresa email y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginRequest({
        email: trimmedEmail,
        password,
      });
      if (!data?.accessToken) {
        throw new Error('El servidor no devolvió un token de acceso.');
      }
      setAuthSession({
        accessToken: data.accessToken,
        user: data.user,
        taller: data.taller,
      });
      refreshFromStorage();

      const from =
        location.state?.from?.pathname ||
        searchParams.get('from') ||
        '/';
      const target =
        from && from !== '/login' && !from.startsWith('/login?') ? from : '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err?.message ?? 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold shadow-lg shadow-indigo-900/50">
              AF
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Omnichannel
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Accede a la bandeja de tu taller
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8"
          >
            {error ? (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2.5 text-sm text-red-200"
              >
                {error}
              </div>
            ) : null}

            <label className="mb-4 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Email
              </span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-600/80 bg-slate-950/80 px-4 py-3 text-base text-white outline-none ring-indigo-500/0 transition placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40"
                placeholder="tu@email.com"
              />
            </label>

            <label className="mb-6 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Contraseña
              </span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-600/80 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40"
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
            >
              {loading ? 'Entrando…' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Sesión segura con JWT · datos aislados por taller
          </p>
        </div>
      </div>
    </div>
  );
}
