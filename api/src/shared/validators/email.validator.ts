// Espejo de frontend/src/app/shared/validation/email.validator.ts — cambiar
// los dos juntos. No agregado a la tabla de Fase 2 del plan (esa tabla solo
// lista full-name/phone/text-safety para el backend), pero GuestContactDto.email
// (Fase 4.1) necesita el mismo regex que @IsEmail() para que las dos reglas
// sean literalmente la misma y no puedan divergir — de ahí este archivo.
export const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
