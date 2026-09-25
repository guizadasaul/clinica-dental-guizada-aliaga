/**
 * Un link que acompaña la respuesta del asistente (por ejemplo, el de
 * reserva). El texto lo escribe el modelo, pero los links los pone el backend:
 * en la prueba en vivo de CLI-89 el modelo recortó la URL con "...", así que
 * nunca se le pide que copie una. La web los muestra como botón y WhatsApp
 * los agrega al final del mensaje.
 */
export interface ChatLink {
  label: string;
  url: string;
}

/**
 * Lo que devuelve una tool que además de datos para el modelo produce links
 * para el usuario. `data` va al LLM; `links` va directo a la respuesta, sin
 * pasar por el modelo.
 */
export class ToolOutputWithLinks {
  constructor(
    readonly data: unknown,
    readonly links: ChatLink[],
  ) {}
}
