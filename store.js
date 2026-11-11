/* Capa de datos. Dos modos con la misma interfaz:
   - supabase: producción, con login.
   - demo: solo en localhost, datos inventados guardados en este navegador. */
(function () {
  'use strict';
  const cfg = window.CRM_CONFIG || {};
  const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  /* La demo solo existe en este ordenador y pidiéndola con ?demo en la dirección. */
  const demo = esLocal && new URLSearchParams(location.search).has('demo');
  const configurado = !demo && Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);

  function supabaseStore() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    async function invocar(body) {
      const { data, error } = await sb.functions.invoke('crm', { body, region: cfg.SUPABASE_REGION || undefined });
      if (error) {
        let mensaje = 'No se ha podido completar la acción.';
        try { mensaje = (await error.context.json()).error || mensaje; } catch { /* respuesta sin JSON */ }
        throw new Error(mensaje);
      }
      return data;
    }
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    const autorizado = async () => ok(await sb.rpc('es_equipo')) === true;
    const rechazar = async () => {
      await sb.auth.signOut();
      throw new Error('no-autorizado');
    };
    return {
      modo: 'supabase',
      async sesion() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        /* Una sesión sin segundo factor o sin permiso no se reutiliza: se vuelve al login. */
        if (!(await autorizado())) { await sb.auth.signOut(); return null; }
        return data.session.user.email;
      },
      /* Primer paso: contraseña. Devuelve qué pantalla de segundo factor toca. */
      async entrar(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (ok(await sb.rpc('es_miembro')) !== true) await rechazar();
        const factores = ok(await sb.auth.mfa.listFactors());
        if (factores.totp.length) return { paso: 'codigo', factorId: factores.totp[0].id };
        for (const f of factores.all.filter((x) => x.status === 'unverified')) {
          ok(await sb.auth.mfa.unenroll({ factorId: f.id }));
        }
        const alta = ok(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Bajo Teja CRM' }));
        return { paso: 'alta', factorId: alta.id, qr: alta.totp.qr_code, secreto: alta.totp.secret };
      },
      /* Segundo paso: código de 6 dígitos de la app del móvil. */
      async verificar(factorId, code) {
        ok(await sb.auth.mfa.challengeAndVerify({ factorId, code }));
        if (!(await autorizado())) await rechazar();
        const { data } = await sb.auth.getSession();
        return data.session.user.email;
      },
      async salir() { await sb.auth.signOut(); },
      alCerrarSesion(fn) {
        sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') fn(); });
      },
      async cargar() {
        const [ops, tits, ests, coms, docs, ofertas, encargos, envios, empresa, firmas] = await Promise.all([
          sb.from('operaciones').select('*'),
          sb.from('titulares').select('*'),
          sb.from('estudios').select('*').order('created_at'),
          sb.from('comentarios').select('*'),
          sb.from('documentos').select('*').order('created_at'),
          sb.from('ofertas').select('*').order('created_at'),
          sb.from('encargos').select('*').order('created_at'),
          sb.from('envios_email').select('*').order('created_at'),
          sb.from('empresa').select('*').maybeSingle(),
          /* Sin el trazo de la firma: pesa y el CRM no lo necesita. */
          sb.from('firmas').select('id,operacion_id,titular_id,tipo,referencia_id,nombre,created_at').order('created_at'),
        ]);
        return {
          ops: ok(ops), tits: ok(tits), ests: ok(ests), coms: ok(coms), docs: ok(docs),
          ofertas: ok(ofertas), encargos: ok(encargos), envios: ok(envios), empresa: ok(empresa) || {},
          firmas: ok(firmas),
        };
      },
      async crear(tabla, fila) {
        return ok(await sb.from(tabla).insert(fila).select().single());
      },
      async actualizar(tabla, id, cambios) {
        return ok(await sb.from(tabla).update(cambios).eq('id', id).select().single());
      },
      async borrar(tabla, id) {
        ok(await sb.from(tabla).delete().eq('id', id));
      },
      async guardarEmpresa(cambios) {
        return ok(await sb.from('empresa').update(cambios).eq('id', true).select().single());
      },
      async accion(nombre, datos) {
        return invocar({ accion: nombre, ...datos });
      },
      /* Subida del gestor: multipart con el PDF ya preparado en el navegador. */
      async subirDocumento({ operacion_id, titular_id, tipo, documento_id, archivo, nombre }) {
        const form = new FormData();
        form.append('accion', 'subir-documento');
        form.append('operacion_id', operacion_id);
        form.append('titular_id', titular_id);
        form.append('tipo', tipo);
        if (documento_id) form.append('documento_id', documento_id);
        form.append('archivo', archivo, nombre);
        return invocar(form);
      },
      /* Oferta o Nota firmada fuera del portal. */
      async subirFirmado({ tipo, referencia_id, archivo, nombre }) {
        const form = new FormData();
        form.append('accion', 'subir-firmado');
        form.append('tipo', tipo);
        form.append('referencia_id', referencia_id);
        form.append('archivo', archivo, nombre);
        return invocar(form);
      },
      /* PDF devuelto por generar-oferta / generar-nota. */
      async pdfGenerado(r) {
        const bytes = Uint8Array.from(atob(r.pdf_base64), (c) => c.charCodeAt(0));
        return new Blob([bytes], { type: 'application/pdf' });
      },
      enlaceDrive: (id) => (id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : null),
      async pdfGuardado() { return null; },
    };
  }

  function demoStore() {
    const demo = window.DemoBackend;
    const mapa = { operaciones: 'ops', titulares: 'tits', estudios: 'ests', comentarios: 'coms' };
    const defectos = (tabla) => {
      const created_at = new Date().toISOString();
      if (tabla === 'operaciones') return { etapa: 1, honorarios_cobrados: false, descartada: false, created_at };
      if (tabla === 'estudios') return { estado: 'Enviado', created_at };
      if (tabla === 'comentarios') return { autor: 'demo@local', created_at };
      return { created_at };
    };
    return {
      modo: 'demo',
      async sesion() { return 'demo@local'; },
      async entrar() { return 'demo@local'; },
      async salir() {},
      alCerrarSesion() {},
      async cargar() { return demo.leer(); },
      async crear(tabla, fila) {
        return demo.conDb((db) => {
          const nueva = { id: crypto.randomUUID(), ...defectos(tabla), ...fila };
          db[mapa[tabla]].push(nueva);
          return { ...nueva };
        });
      },
      async actualizar(tabla, id, cambios) {
        return demo.conDb((db) => {
          const fila = db[mapa[tabla]].find((f) => f.id === id);
          Object.assign(fila, cambios);
          return { ...fila };
        });
      },
      async borrar(tabla, id) {
        demo.conDb((db) => {
          const fila = db[mapa[tabla]].find((f) => f.id === id);
          if (tabla === 'operaciones' && fila?.expediente) throw new Error('Un expediente abierto no se puede eliminar');
          db[mapa[tabla]] = db[mapa[tabla]].filter((f) => f.id !== id);
          if (tabla === 'operaciones') {
            ['tits', 'ests', 'coms', 'docs'].forEach((k) => {
              db[k] = db[k].filter((f) => f.operacion_id !== id);
            });
          }
        });
      },
      async guardarEmpresa(cambios) {
        return demo.conDb((db) => Object.assign(db.empresa, cambios));
      },
      async accion(nombre, datos) {
        const r = demo.crm(nombre, datos);
        if (r?.lineas) await demo.guardarPdf(r.id_pdf, window.PortalPdf.desdeTexto(r.lineas));
        return r;
      },
      async subirDocumento({ archivo, nombre, ...datos }) {
        const r = demo.crm('subir-documento', { ...datos, archivo_nombre: nombre });
        const pdf = /\.docx?$/i.test(nombre) ? await window.PortalPdf.pdfAvisoDemo(nombre) : archivo;
        await demo.guardarPdf(r.id, pdf);
        return r;
      },
      async subirFirmado({ archivo, nombre, ...datos }) {
        const r = demo.crm('subir-firmado', datos);
        await demo.guardarPdf(`${datos.referencia_id}-firmado`, /\.docx?$/i.test(nombre) ? await window.PortalPdf.pdfAvisoDemo(nombre) : archivo);
        return r;
      },
      async pdfGenerado(r) { return demo.leerPdf(r.id_pdf); },
      enlaceDrive: () => null,
      async pdfGuardado(id) { return demo.leerPdf(id); },
    };
  }

  let store = null;
  if (configurado) store = supabaseStore();
  else if (demo) store = demoStore();
  window.CRM_STORE = store;
})();
