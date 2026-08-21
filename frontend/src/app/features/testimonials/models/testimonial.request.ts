export interface CreateTestimonialRequest {
  name: string;
  treatment: string;
  comment: string;
  /** Honeypot anti-bot: campo oculto que un humano nunca completa. Si viene con
   * contenido, el backend responde 201 "de mentira" sin persistir nada. */
  website?: string;
  /** Ms transcurridos desde que se abrió el formulario hasta el envío — un bot
   * suele enviarlo casi instantáneamente. Ver TestimonialsService.create() en el backend. */
  elapsedMs?: number;
}
