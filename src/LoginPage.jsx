import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { loginRequest, registerRequest } from './apiClient.js';
import { isAuthenticated, setAuthSession } from './authStorage.js';
import { useAuth } from './AuthContext.jsx';

const inputClass =
  'w-full rounded-xl border border-slate-600/80 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40';

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { refreshFromStorage } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombreTaller, setNombreTaller] = useState('');
  const [metaPageId, setMetaPageId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (isAuthenticated()) {
      const from =
        location.state?.from?.pathname ||
        searchParams.get('from') ||
        '/';
      navigate(from.startsWith('/login') ? '/' : from, { replace: true });
    }
  }, [location.state, navigate, searchParams]);

  const switchToLogin = () => {
    setIsRegister(false);
    setError('');
    setNombreTaller('');
    setMetaPageId('');
  };

  const switchToRegister = () => {
    setIsRegister(true);
    setError('');
    setSuccessMessage('');
    setPassword('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
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

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedNombre = nombreTaller.trim();
    if (!trimmedNombre) {
      setError('El nombre del taller es obligatorio.');
      return;
    }
    if (!trimmedEmail || !password) {
      setError('Ingresa email y contraseña.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await registerRequest({
        email: trimmedEmail,
        password,
        nombreTaller: trimmedNombre,
        metaPageId: metaPageId.trim() || undefined,
      });
      setSuccessMessage('¡Taller registrado con éxito!');
      setEmail(trimmedEmail);
      setPassword('');
      setNombreTaller('');
      setMetaPageId('');
      setIsRegister(false);
    } catch (err) {
      setError(err?.message ?? 'No se pudo registrar el taller.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 text-center sm:mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold shadow-lg shadow-indigo-900/50">
              AF
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-3xl">
              {isRegister ? 'Registra tu Taller en AutoFix' : 'Omnichannel'}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {isRegister
                ? 'Crea tu cuenta y conecta la bandeja de Messenger'
                : 'Accede a la bandeja de tu taller'}
            </p>
          </div>

          <form
            onSubmit={isRegister ? handleRegisterSubmit : handleLoginSubmit}
            className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8"
          >
            {successMessage ? (
              <div
                role="status"
                className="mb-4 rounded-xl border border-emerald-400/50 bg-gradient-to-r from-emerald-950/80 to-teal-950/60 px-4 py-3 text-sm font-medium text-emerald-100 shadow-inner shadow-emerald-900/30"
              >
                <span className="mr-1.5" aria-hidden>
                  ✓
                </span>
                {successMessage}
                <p className="mt-1 text-xs font-normal text-emerald-200/80">
                  Inicia sesión con tu email y contraseña.
                </p>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2.5 text-sm text-red-200"
              >
                {error}
              </div>
            ) : null}

            {isRegister ? (
              <>
                <label className="mb-4 block">
                  <span className={labelClass}>Nombre del taller</span>
                  <input
                    type="text"
                    name="nombreTaller"
                    autoComplete="organization"
                    required
                    value={nombreTaller}
                    onChange={(e) => setNombreTaller(e.target.value)}
                    className={inputClass}
                    placeholder="Ej. AutoFix CDMX"
                  />
                </label>

                <label className="mb-4 block">
                  <span className={labelClass}>
                    ID página Facebook / Meta{' '}
                    <span className="normal-case text-slate-500">(opcional)</span>
                  </span>
                  <input
                    type="text"
                    name="metaPageId"
                    inputMode="numeric"
                    autoComplete="off"
                    value={metaPageId}
                    onChange={(e) => setMetaPageId(e.target.value)}
                    className={inputClass}
                    placeholder="ID de tu página de Messenger"
                  />
                </label>
              </>
            ) : null}

            <label className="mb-4 block">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="tu@email.com"
              />
            </label>

            <label className="mb-6 block">
              <span className={labelClass}>Contraseña</span>
              <input
                type="password"
                name="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                minLength={isRegister ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder={isRegister ? 'Mínimo 8 caracteres' : '••••••••'}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
            >
              {loading
                ? isRegister
                  ? 'Creando…'
                  : 'Entrando…'
                : isRegister
                  ? 'Crear Cuenta y Taller'
                  : 'Iniciar sesión'}
            </button>

            <p className="mt-5 text-center text-sm text-slate-400">
              {isRegister ? (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={switchToLogin}
                    className="font-semibold text-indigo-300 underline-offset-2 transition hover:text-indigo-200 hover:underline"
                  >
                    Inicia sesión aquí
                  </button>
                </>
              ) : (
                <>
                  ¿Eres nuevo?{' '}
                  <button
                    type="button"
                    onClick={switchToRegister}
                    className="font-semibold text-indigo-300 underline-offset-2 transition hover:text-indigo-200 hover:underline"
                  >
                    Registra tu taller aquí
                  </button>
                </>
              )}
            </p>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500 sm:mt-6">
            Sesión segura con JWT · datos aislados por taller
          </p>
        </div>
      </div>
    </div>
  );
}
