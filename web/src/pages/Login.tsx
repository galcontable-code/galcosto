import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTitulo } from '../lib/hooks';
import { Alert, Button, Field, Input } from '../components/ui';
import { AuthShell } from './AuthShell';

const DEMO_EMAIL = 'demo@galcosto.app';
const DEMO_PASS = 'Demo1234!';

export function LoginPage(): JSX.Element {
  useTitulo('Ingresar');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function ingresar(mail: string, pass: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await login(mail, pass);
      navigate(destino, { replace: true });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Entrá a tu estudio
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Facturá en ARCA en tiempo real, en 3 pasos.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ingresar(email, password);
        }}
      >
        {error ? <Alert tono="rojo">{error}</Alert> : null}

        <Field label="Correo electrónico" requerido>
          {(id) => (
            <Input
              id={id}
              ref={emailRef}
              type="email"
              autoComplete="username"
              placeholder="vos@estudio.com.ar"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>

        <Field label="Contraseña" requerido>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>

        <Button type="submit" tamano="lg" ancho cargando={enviando}>
          Ingresar
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/60">
        <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
          ¿Querés probarla sin cargar nada?
        </p>
        <p className="mt-0.5 text-xs text-brand-800/90 dark:text-brand-200/90">
          Usá la cuenta demo. Los CAE son simulados y no tienen validez fiscal.
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="font-medium text-brand-800 dark:text-brand-200">Usuario</dt>
          <dd className="font-mono text-brand-950 dark:text-brand-50">{DEMO_EMAIL}</dd>
          <dt className="font-medium text-brand-800 dark:text-brand-200">Contraseña</dt>
          <dd className="font-mono text-brand-950 dark:text-brand-50">{DEMO_PASS}</dd>
        </dl>
        <Button
          variante="secundario"
          ancho
          className="mt-3"
          cargando={enviando}
          onClick={() => {
            setEmail(DEMO_EMAIL);
            setPassword(DEMO_PASS);
            void ingresar(DEMO_EMAIL, DEMO_PASS);
          }}
        >
          Entrar con la cuenta demo
        </Button>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        ¿Todavía no tenés estudio?{' '}
        <Link to="/registro" className="link font-medium">
          Creá uno gratis
        </Link>
      </p>
    </AuthShell>
  );
}
