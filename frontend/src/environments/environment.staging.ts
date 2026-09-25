// Staging (rama develop → staging.guizadaaliaga.com). Se usa con
// `ng build --configuration staging` vía fileReplacements en angular.json.
// Todo lo de acá es público: termina en el bundle que baja cualquier
// navegador. La key de Supabase es la publicable (anon), nunca la
// service_role, que vive solo en el backend.
export const environment = {
  production: true,
  backendUrl: 'https://api-staging.guizadaaliaga.com',
  supabase: {
    url: 'https://lrvzfcwsvedigqsiehnf.supabase.co',
    anonKey: 'sb_publishable_TMNeUGt7wtuCqMfzew3-8w_qz-9CspC',
  },
};
