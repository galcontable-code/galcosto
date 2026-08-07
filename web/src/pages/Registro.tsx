import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTitulo } from '../lib/hooks';
import { Alert, Button, Field, Input } from '../components/ui';
import { AuthShell } from './AuthShell';

export function RegistroPage(): JSX.Element {
  useTitulo('Crear estudio');
  const { registrar } = useAuth();
  const navigate = useNavigate();

  const [studioName, setStudioName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primero = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primero.current?.focus();
  }, []);

  const passwordCorta = password.length > 0 && password.length < 8;
  const noCoinciden = repetir.length > 0 && repetir !== password;

  async function enviar(): Promise<void> {
    if (passwordCorta || noCoinciden) return;
    setEnviando(true);
    setError(null);
    try {
      await registrar({ studioName, name, email, password });
      navigate('/', { replace: true });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Creá tu estudio
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Este primer usuario queda como administrador. Después vas a poder cargar las empresas
        emisoras y sus certificados de ARCA.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        {error ? <Alert tono="rojo">{error}</Alert> : null}

        <Field label="Nombre del estudio" requerido>
          {(id) => (
            <Input
              id={id}
              ref={primero}
              placeholder="Estudio Contable Gómez & Asoc."
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              required
            />
          )}
        </Field>

        <Field label="Tu nombre y apellido" requerido>
          {(id) => (
            <Input
              id={id}
              autoComplete="name"
              placeholder="María Gómez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
        </Field>

        <Field label="Correo electrónico" requerido>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="username"
              placeholder="vos@estudio.com.ar"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Contraseña"
            requerido
            error={passwordCorta ? 'Usá al menos 8 caracteres.' : null}
            hint="Mínimo 8 caracteres."
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                value={password}
                invalido={passwordCorta}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>
          <Field
            label="Repetir contraseña"
            requerido
            error={noCoinciden ? 'Las contraseñas no coinciden.' : null}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                value={repetir}
                invalido={noCoinciden}
                onChange={(e) => setRepetir(e.target.value)}
                required
              />
            )}
          </Field>
        </div>

        <Button
          type="submit"
          tamano="lg"
          ancho
          cargando={enviando}
          disabled={passwordCorta || noCoinciden}
        >
          Crear estudio y empezar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        ¿Ya tenés cuenta?{' '}
        <Link to="/login" className="link font-medium">
          Ingresá
        </Link>
      </p>
    </AuthShell>
  );
}
