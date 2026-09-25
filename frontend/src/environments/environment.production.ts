// Producción (rama main → guizadaaliaga.com). Se usa con
// `ng build --configuration production` (la configuración por defecto de
// `ng build`) vía fileReplacements en angular.json. Cada valor de este
// archivo es público: termina en el bundle que baja cualquier navegador. La key de
// Supabase es la publicable (anon), nunca la service_role.
//
// PENDIENTE (fase 10 del plan de despliegue): el proyecto Supabase de
// producción todavía no existe. Hasta completar `supabase`, vercel.json no
// construye la rama main — un build con estos valores vacíos rompería el
// login apenas carga la app.
export const environment = {
  production: true,
  backendUrl: 'https://api.guizadaaliaga.com',
  supabase: {
    url: '',
    anonKey: '',
  },
};
