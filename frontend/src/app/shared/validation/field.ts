// Sin Reactive Forms: el repo no tiene ni un FormGroup y frontend/CLAUDE.md
// manda signals. `field()` es el mínimo necesario para tener error por campo
// (mensaje + borde rojo + aria-invalid en blur) sin repetir el boilerplate de
// signal(value) + signal(touched) + computed(error) en cada uno de los ~40
// campos del wizard de paciente. Solo `signal`/`computed` de Angular — nada
// más, así que es testeable sin TestBed.

import { signal, computed, type Signal } from '@angular/core';

export interface Field<T> {
  /** Valor actual, tal cual lo tipeó/eligió el usuario (sin normalizar). */
  readonly value: Signal<T>;
  /** Mensaje de error, o `null` si el valor es válido. Se recalcula solo. */
  readonly error: Signal<string | null>;
  /** `true` solo cuando hay error Y el campo ya fue tocado — para no mostrar
   * en rojo un formulario recién abierto. */
  readonly showError: Signal<boolean>;
  /** Actualiza el valor (ej. en `(input)`). No marca el campo como tocado. */
  set(v: T): void;
  /** Marca el campo como tocado (ej. en `(blur)`, o `touchAll()` al enviar). */
  markTouched(): void;
  /** Reemplaza valor y borra el estado de "tocado" (ej. al precargar en modo edición). */
  reset(v: T): void;
}

/**
 * Crea un `Field<T>`. `validate` puede leer otros signals (ej. otro `Field`)
 * durante su ejecución — `error` es un `computed()`, así que Angular rastrea
 * esa lectura como dependencia y recalcula solo cuando corresponde (ej. la
 * validación cruzada de `lastDentistVisit` contra `birthDate`).
 */
export function field<T>(initial: T, validate: (value: T) => string | null): Field<T> {
  const value = signal(initial);
  const touched = signal(false);
  const error = computed(() => validate(value()));
  const showError = computed(() => error() !== null && touched());

  return {
    value,
    error,
    showError,
    set(v: T): void {
      value.set(v);
    },
    markTouched(): void {
      touched.set(true);
    },
    reset(v: T): void {
      value.set(v);
      touched.set(false);
    },
  };
}

/** `true` si todos los fields pasados son válidos (ningún `error()`). */
export function allValid(...fields: Field<unknown>[]): boolean {
  return fields.every((f) => f.error() === null);
}

/** Marca todos los fields como tocados — para que al enviar se vean en rojo los que el usuario nunca tocó. */
export function touchAll(...fields: Field<unknown>[]): void {
  for (const f of fields) {
    f.markTouched();
  }
}
