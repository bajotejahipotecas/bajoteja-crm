/* Conexión a Supabase. Se rellena una sola vez (ver PUESTA_EN_MARCHA.md).
   Esta clave es pública por diseño: lo que protege los datos es el login
   y las reglas de la base de datos, no ocultar esta clave.
   NUNCA pegar aquí la clave "secret" / "service_role". */
window.CRM_CONFIG = {
  SUPABASE_URL: "https://npmecmhzcpxuinflfgyl.supabase.co",
  SUPABASE_KEY: "sb_publishable_KcN0YEgr5Aom0B_OlQ84uQ_jTkkjGHi",
  SUPABASE_REGION: "eu-central-1"  /* Frankfurt */
};
