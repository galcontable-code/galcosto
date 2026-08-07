import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

/** Devuelve el valor después de `ms` sin cambios. Para búsquedas y previews. */
export function useDebounced<T>(valor: T, ms = 350): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return debounced;
}

/** Cierra un popover al hacer clic afuera o al presionar Escape. */
export function useCerrarAlClickAfuera(
  abierto: boolean,
  cerrar: () => void,
): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto, cerrar]);

  return ref;
}

/** Estado persistido en sessionStorage (el wizard de facturación lo usa). */
export function useSessionState<T>(
  clave: string,
  inicial: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const crudo = sessionStorage.getItem(clave);
      if (crudo) return { ...inicial, ...(JSON.parse(crudo) as object) } as T;
    } catch {
      /* dato corrupto: arrancamos limpio */
    }
    return inicial;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* sin storage */
    }
  }, [clave, valor]);

  const limpiar = useCallback(() => {
    try {
      sessionStorage.removeItem(clave);
    } catch {
      /* sin storage */
    }
  }, [clave]);

  return [valor, setValor, limpiar];
}

/** Enfoca un elemento al montar. */
export function useAutoFocus<T extends HTMLElement>(activo = true): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!activo) return;
    const id = window.setTimeout(() => ref.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [activo]);
  return ref;
}

/** Título del documento por pantalla. */
export function useTitulo(titulo: string): void {
  useEffect(() => {
    document.title = `${titulo} · Galcosto`;
  }, [titulo]);
}

/** Atajo de teclado global. */
export function useAtajo(
  combo: { key: string; ctrl?: boolean; meta?: boolean },
  handler: () => void,
  activo = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!activo) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== combo.key.toLowerCase()) return;
      const ctrlOk = combo.ctrl ? e.ctrlKey || e.metaKey : true;
      if (!ctrlOk) return;
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo.key, combo.ctrl, combo.meta, activo]);
}
