'use strict';
(function () {
  const store = window.CRM_STORE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ETAPAS = [
    { n: 1, nombre: 'Nueva oportunidad', paso: 'Lead sin llamar. Hacer la primera llamada.' },
    { n: 2, nombre: 'Documentación pendiente', paso: 'Primera llamada hecha. A la espera de la documentación.' },
    { n: 3, nombre: 'Oferta presentada', paso: 'Si quiere trabajar con nosotros, enviar la Nota de Encargo. Si no, descartar la oportunidad.' },
    { n: 4, nombre: 'Nota de Encargo firmada', paso: 'Enviar la operación a las entidades y empezar a pedir PRE-VALORES.' },
    { n: 5, nombre: 'Estudio económico bancario', paso: 'Crear una pestaña por cada banco y llevar ahí su estado.' },
    { n: 6, nombre: 'FEIN emitida', paso: 'Una entidad ha emitido oferta formal. Cobrar nuestros honorarios.' },
    { n: 7, nombre: 'Gestión de firma', paso: 'Coordinar notaría y vendedores, y subsanar el expediente.' },
    { n: 8, nombre: 'Operación firmada', paso: 'Operación cerrada.' },
  ];
  const COMUNIDADES = ['Andalucía', 'Aragón', 'Principado de Asturias', 'Illes Balears', 'Canarias', 'Cantabria',
    'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Ceuta', 'Comunitat Valenciana', 'Extremadura', 'Galicia',
    'Comunidad de Madrid', 'Melilla', 'Región de Murcia', 'Comunidad Foral de Navarra', 'País Vasco', 'La Rioja'];
  const ESTADOS_CIVILES = ['Soltero/a', 'Casado/a (gananciales)', 'Casado/a (separación de bienes)',
    'Pareja de hecho', 'Divorciado/a', 'Viudo/a'];
  const ESTADOS_BANCO = ['Enviado', 'En análisis', 'Documentación adicional', 'Aprobado', 'FEIN emitida', 'Denegado', 'Desistido'];
  const TIPOS_INTERES = ['Fijo', 'Variable', 'Mixto'];
  const BANCOS = ['Abanca', 'Bankinter', 'BBVA', 'CaixaBank', 'Caja Rural', 'Cajamar', 'Deutsche Bank', 'Ibercaja',
    'ING', 'Kutxabank', 'Laboral Kutxa', 'Openbank', 'Sabadell', 'Santander', 'Unicaja'];
  const TIPOS_FINANCIACION = ['Préstamo hipotecario', 'Préstamo personal', 'Otro'];
  const PERFILES = ['Asalariado', 'Autónomo', 'Funcionario', 'Pensionista'];
  /* Lista de documentos por perfil. Editable aquí y, caso a caso, al enviar el enlace. */
  const DOCUMENTOS_PERFIL = {
    Asalariado: ['DNI / NIE', '3 últimas nóminas', 'Contrato de trabajo', 'Vida laboral', 'Última declaración de IRPF', 'Extractos bancarios de 6 meses'],
    Autónomo: ['DNI / NIE', 'IRPF de los 2 últimos años', 'Modelos 130 o 131 del año en curso', 'Modelos 303 y 390', 'Vida laboral', 'Extractos bancarios de 6 meses'],
    Funcionario: ['DNI / NIE', '3 últimas nóminas', 'Vida laboral', 'Última declaración de IRPF', 'Extractos bancarios de 6 meses'],
    Pensionista: ['DNI / NIE', 'Certificado de pensión', 'Última declaración de IRPF', 'Extractos bancarios de 6 meses'],
  };
  const ESTADO_DOC = { pendiente: 'Pendiente', subido: 'Subido, sin aprobar', aprobado: 'Aprobado', no_aplica: 'No aplica' };
  const ENT = { op: ['operaciones', 'ops'], tit: ['titulares', 'tits'], est: ['estudios', 'ests'] };
  const MAX_PALABRAS = 10;
  const MINUTOS_INACTIVIDAD = 30;

  const LOGO = `<svg class="logo" viewBox="0 0 52 40" aria-hidden="true"><path class="logo-chimenea" d="M26 15V7"/><path class="logo-tejado" d="M10 30l16-15 16 15"/></svg>`;

  const estado = { ops: [], tits: [], ests: [], coms: [], docs: [], ofertas: [], encargos: [], envios: [], empresa: {}, firmas: [], borradores: {}, usuario: null, busqueda: '', vista: 'tablero', fichaId: null, pestana: 'datos' };

  /* ---------- utilidades ---------- */
  const palabras = (t) => (t || '').trim().split(/\s+/).filter(Boolean).length;
  const fechaHora = (iso) => new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
  const euros = (n) => (n === null || n === undefined ? '—'
    : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n));
  const titularesDe = (id) => estado.tits.filter((t) => t.operacion_id === id).sort((a, b) => a.orden - b.orden);
  const estudiosDe = (id) => estado.ests.filter((e) => e.operacion_id === id);
  const comentariosDe = (id) => estado.coms.filter((c) => c.operacion_id === id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const docsDe = (id) => estado.docs.filter((d) => d.operacion_id === id && d.estado !== 'sustituido');
  const ultimaOferta = (id) => estado.ofertas.filter((o) => o.operacion_id === id).at(-1);
  const ultimoEncargo = (id) => estado.encargos.filter((e) => e.operacion_id === id).at(-1);
  const firmasDe = (referenciaId) => (estado.firmas || []).filter((f) => f.referencia_id === referenciaId);
  const enviosDe = (id) => estado.envios.filter((e) => e.operacion_id === id).reverse();
  const progreso = (id) => {
    const utiles = docsDe(id).filter((d) => d.estado !== 'no_aplica');
    const aprobados = utiles.filter((d) => d.estado === 'aprobado').length;
    return { aprobados, total: utiles.length, listo: utiles.length > 0 && aprobados === utiles.length };
  };
  const listoParaOferta = (op) => !op.descartada && progreso(op.id).listo && !ultimaOferta(op.id);
  const nombreDe = (t) => [t.nombre, t.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
  const nombresOp = (id) => {
    const lista = titularesDe(id).map(nombreDe);
    return lista.length ? lista : ['Sin titular'];
  };

  function dniValido(valor) {
    const v = (valor || '').toUpperCase();
    const letras = 'TRWAGMYFPDXBNJZSQVHLCKE';
    if (/^\d{8}[A-Z]$/.test(v)) return letras[Number(v.slice(0, 8)) % 23] === v[8];
    if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
      const n = 'XYZ'.indexOf(v[0]) + v.slice(1, 8);
      return letras[Number(n) % 23] === v[8];
    }
    return false;
  }

  let toastTimer;
  function aviso(texto, error = false) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.toggle('toast-error', error);
    if (t.matches(':popover-open')) t.hidePopover();
    t.showPopover();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.hidePopover(), error ? 7000 : 2600);
  }

  function fallo(err) {
    console.error(err);
    if (err?.visible) { aviso(err.message, true); return; }
    const sesion = err && (err.status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303');
    aviso(sesion ? 'La sesión ha caducado. Vuelve a entrar.' : 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.', true);
  }

  /* ---------- login ---------- */
  function pantallaLogin(mensaje = '') {
    if ($('#ficha').open) $('#ficha').close();
    $('#app').innerHTML = `
      <main class="login">
        <form class="login-card" id="login-form">
          ${LOGO}
          <h1>Bajo Teja</h1>
          <p class="login-sub">Acceso restringido</p>
          <label class="campo"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
          <label class="campo"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>
          <p class="login-error" id="login-error" role="alert">${esc(mensaje)}</p>
          <button class="btn btn-primario btn-ancho" type="submit">Entrar</button>
        </form>
      </main>`;
    $('#login-form input').focus();
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const boton = $('button', e.target);
      const datos = new FormData(e.target);
      boton.disabled = true;
      $('#login-error').textContent = '';
      try {
        const r = await store.entrar(datos.get('email').trim(), datos.get('password'));
        if (r?.paso) { pantallaCodigo(r); return; }
        estado.usuario = r;
        await iniciar();
      } catch (err) {
        $('#login-error').textContent = err.message === 'no-autorizado'
          ? 'Este usuario no tiene acceso.'
          : err.status === 400 ? 'Email o contraseña incorrectos.' : 'No se ha podido conectar. Inténtalo de nuevo.';
        boton.disabled = false;
      }
    });
  }

  function pantallaCodigo({ paso, factorId, qr, secreto }) {
    const alta = paso === 'alta';
    const instrucciones = alta
      ? `<p class="login-sub">Activa el segundo factor</p>
         <p class="login-ayuda">Escanea este código con una app de autenticación (Google Authenticator, Microsoft Authenticator o 1Password) y escribe los 6 dígitos que te muestre.</p>
         <img class="login-qr" src="${esc(qr)}" alt="Código QR para la app de autenticación">
         <p class="login-ayuda">Si no puedes escanearlo, introduce esta clave: <code>${esc(secreto)}</code></p>`
      : '<p class="login-sub">Escribe el código de 6 dígitos de tu app de autenticación</p>';
    $('#app').innerHTML = `
      <main class="login">
        <form class="login-card" id="codigo-form">
          ${LOGO}
          <h1>Bajo Teja</h1>
          ${instrucciones}
          <label class="campo"><span>Código</span><input name="codigo" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
          <p class="login-error" id="login-error" role="alert"></p>
          <button class="btn btn-primario btn-ancho" type="submit">${alta ? 'Activar y entrar' : 'Entrar'}</button>
          <button class="enlace login-volver" type="button" id="login-volver">Volver</button>
        </form>
      </main>`;
    $('#codigo-form input').focus();
    $('#login-volver').addEventListener('click', () => store.salir());
    $('#codigo-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const boton = $('button[type=submit]', e.target);
      boton.disabled = true;
      $('#login-error').textContent = '';
      try {
        estado.usuario = await store.verificar(factorId, new FormData(e.target).get('codigo'));
        await iniciar();
      } catch (err) {
        if (err.message === 'no-autorizado') return;
        $('#login-error').textContent = 'Código incorrecto o caducado. Prueba con el siguiente.';
        e.target.codigo.value = '';
        boton.disabled = false;
      }
    });
  }

  /* Cierra la sesión tras un rato sin actividad, también si el equipo estaba en reposo. */
  function vigilarInactividad() {
    if (store.modo === 'demo' || vigilarInactividad.activo) return;
    vigilarInactividad.activo = true;
    let ultima = Date.now();
    const anotar = () => { ultima = Date.now(); };
    const comprobar = () => {
      if (estado.usuario && Date.now() - ultima > MINUTOS_INACTIVIDAD * 60000) {
        estado.motivoSalida = 'Sesión cerrada por inactividad.';
        store.salir();
      }
    };
    ['pointerdown', 'keydown', 'scroll'].forEach((ev) => document.addEventListener(ev, anotar, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', comprobar);
    setInterval(comprobar, 30000);
  }

  /* ---------- estructura ---------- */
  function pantallaApp() {
    const demo = store.modo === 'demo';
    $('#app').innerHTML = `
      ${demo ? '<p class="demo-aviso">Modo demo: datos inventados guardados solo en este navegador. No introducir datos reales de clientes.</p>' : ''}
      <header class="barra">
        <div class="marca">${LOGO}<span>Bajo Teja</span><small>CRM</small></div>
        <input class="buscador" id="buscador" type="search" placeholder="Buscar por nombre, DNI, comunidad…" aria-label="Buscar operaciones">
        <p class="alerta" id="alerta" role="status"></p>
        <div class="barra-acciones">
          <button class="btn btn-fantasma" id="btn-empresa" type="button">Empresa</button>
          <button class="btn btn-fantasma" id="btn-vista" type="button"></button>
          <button class="btn btn-primario" id="btn-nueva" type="button">Nueva operación</button>
          ${demo ? '' : '<button class="btn btn-fantasma" id="btn-salir" type="button">Salir</button>'}
        </div>
      </header>
      <main id="contenido" class="contenido"></main>`;
    $('#buscador').addEventListener('input', (e) => { estado.busqueda = e.target.value; pintar(); });
    $('#btn-nueva').addEventListener('click', modalNueva);
    $('#btn-empresa').addEventListener('click', modalEmpresa);
    $('#btn-vista').addEventListener('click', () => {
      estado.vista = estado.vista === 'tablero' ? 'descartadas' : 'tablero';
      pintar();
    });
    $('#btn-salir')?.addEventListener('click', () => store.salir());
  }

  function coincide(op) {
    const q = estado.busqueda.trim().toLowerCase();
    if (!q) return true;
    const texto = [op.descripcion, op.comunidad,
      ...titularesDe(op.id).flatMap((t) => [t.nombre, t.apellidos, t.dni]),
      ...comentariosDe(op.id).map((c) => c.texto)].join(' ').toLowerCase();
    return texto.includes(q);
  }

  function pintar() {
    const descartadas = estado.ops.filter((o) => o.descartada);
    const boton = $('#btn-vista');
    if (!boton) return;
    boton.textContent = estado.vista === 'tablero' ? `Descartadas (${descartadas.length})` : 'Volver al tablero';
    const listos = estado.ops.filter(listoParaOferta).length;
    $('#alerta').textContent = listos ? `${listos} ${listos === 1 ? 'listo' : 'listos'} para oferta` : '';
    if (estado.vista === 'tablero') pintarTablero(); else pintarDescartadas(descartadas);
  }

  /* ---------- tablero ---------- */
  function tarjeta(op) {
    const nombres = nombresOp(op.id).map((n) => `<span>${esc(n)}</span>`).join('');
    const honorarios = op.etapa >= 6 && !op.honorarios_cobrados ? '<p class="t-chip">Honorarios pendientes</p>' : '';
    const fase = chipFase(op);
    return `<article class="tarjeta" draggable="true" tabindex="0" role="button" data-op="${esc(op.id)}">
      <h3>${nombres}</h3>
      <p class="t-ccaa">${op.expediente ? `<b>${esc(op.expediente)}</b> · ` : ''}${esc(op.comunidad || 'Sin comunidad')}</p>
      <p class="t-desc">${esc(op.descripcion || '')}</p>
      ${fase}${honorarios}
    </article>`;
  }

  function chipFase(op) {
    if (op.etapa >= 5) return '';
    const chip = (texto, clase = '') => `<p class="t-chip ${clase}">${esc(texto)}</p>`;
    const nota = ultimoEncargo(op.id);
    if (nota) return nota.estado === 'enviada' ? chip('Nota pendiente de firma') : '';
    const oferta = ultimaOferta(op.id);
    if (oferta?.estado === 'aceptada') return chip('Oferta aceptada: enviar Nota', 't-chip-listo');
    if (oferta?.estado === 'rechazada') return chip('Oferta rechazada');
    if (oferta) return chip('Oferta enviada');
    const p = progreso(op.id);
    if (p.listo) return chip('Listo para oferta', 't-chip-listo');
    return p.total ? chip(`Documentos ${p.aprobados}/${p.total}`) : '';
  }

  const ordenar = (a, b) => new Date(a.created_at) - new Date(b.created_at);

  function pintarTablero() {
    const cont = $('#contenido');
    const previo = $('#tablero')?.scrollLeft || 0;
    const visibles = estado.ops.filter((o) => !o.descartada && coincide(o));
    cont.innerHTML = `<div class="tablero" id="tablero">${ETAPAS.map((et) => {
      const ops = visibles.filter((o) => o.etapa === et.n).sort(ordenar);
      return `<section class="columna${et.n === 8 ? ' columna-final' : ''}" data-etapa="${et.n}" aria-label="${esc(et.nombre)}">
        <header><span class="col-num">${et.n}</span><h2>${esc(et.nombre)}</h2><span class="col-total">${ops.length}</span></header>
        <div class="col-lista">${ops.map(tarjeta).join('') || '<p class="col-vacia">Sin operaciones</p>'}</div>
      </section>`;
    }).join('')}</div>`;
    $('#tablero').scrollLeft = previo;
  }

  function activarTablero() {
    const cont = $('#contenido');
    cont.addEventListener('click', (e) => {
      const t = e.target.closest('[data-op]');
      if (t) abrirFicha(t.dataset.op);
    });
    cont.addEventListener('keydown', (e) => {
      const t = e.target.closest('.tarjeta');
      if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirFicha(t.dataset.op); }
    });
    cont.addEventListener('dragstart', (e) => {
      const t = e.target.closest('.tarjeta');
      if (!t) return;
      e.dataTransfer.setData('text/plain', t.dataset.op);
      e.dataTransfer.effectAllowed = 'move';
      t.classList.add('arrastrando');
    });
    cont.addEventListener('dragend', () => {
      $$('.arrastrando, .sobre').forEach((n) => n.classList.remove('arrastrando', 'sobre'));
    });
    cont.addEventListener('dragover', (e) => {
      const col = e.target.closest('.columna');
      if (!col) return;
      e.preventDefault();
      $$('.columna.sobre').forEach((n) => n !== col && n.classList.remove('sobre'));
      col.classList.add('sobre');
    });
    cont.addEventListener('drop', (e) => {
      const col = e.target.closest('.columna');
      if (!col) return;
      e.preventDefault();
      moverEtapa(e.dataTransfer.getData('text/plain'), Number(col.dataset.etapa));
    });
  }

  async function moverEtapa(id, etapa) {
    const op = estado.ops.find((o) => o.id === id);
    if (!op || op.etapa === etapa) return;
    const anterior = op.etapa;
    op.etapa = etapa;
    pintar();
    if (estado.fichaId === id) pintarFicha();
    try {
      await store.actualizar('operaciones', id, { etapa });
    } catch (err) {
      op.etapa = anterior;
      pintar();
      if (estado.fichaId === id) pintarFicha();
      fallo(err);
    }
  }

  /* ---------- descartadas ---------- */
  function pintarDescartadas(lista) {
    const filas = lista.filter(coincide).map((op) => `<tr>
      <td><button class="enlace" type="button" data-op="${esc(op.id)}">${esc(nombresOp(op.id).join(' · '))}</button></td>
      <td>${esc(op.comunidad || '—')}</td>
      <td>${esc(ETAPAS[op.etapa - 1].nombre)}</td>
      <td>${esc(op.motivo_descarte || '—')}</td>
      <td class="acciones">
        <button class="btn btn-suave" type="button" data-recuperar="${esc(op.id)}">Recuperar</button>
        ${op.expediente ? '' : `<button class="btn btn-peligro" type="button" data-eliminar="${esc(op.id)}">Eliminar</button>`}
      </td></tr>`).join('');
    $('#contenido').innerHTML = `<section class="descartadas">
      <h2 class="seccion">Operaciones descartadas</h2>
      ${filas ? `<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Titulares</th><th>Comunidad</th><th>Etapa</th><th>Motivo</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`
    : '<p class="vacio">No hay operaciones descartadas.</p>'}
    </section>`;
  }

  async function recuperar(id) {
    const op = estado.ops.find((o) => o.id === id);
    try {
      const fila = await store.actualizar('operaciones', id, { descartada: false, motivo_descarte: null });
      Object.assign(op, fila);
      pintar();
      aviso('Operación recuperada');
    } catch (err) { fallo(err); }
  }

  function eliminar(id) {
    confirmar({
      titulo: 'Eliminar operación',
      texto: `Se borrarán de forma definitiva los datos de ${nombresOp(id).join(' y ')}, incluidos titulares y estudios bancarios.`,
      accion: 'Eliminar definitivamente',
      alAceptar: async () => {
        await store.borrar('operaciones', id);
        estado.ops = estado.ops.filter((o) => o.id !== id);
        estado.tits = estado.tits.filter((t) => t.operacion_id !== id);
        estado.ests = estado.ests.filter((t) => t.operacion_id !== id);
        estado.coms = estado.coms.filter((t) => t.operacion_id !== id);
        pintar();
      },
    });
  }

  /* ---------- modales ---------- */
  function abrirModal(html, alEnviar) {
    const m = $('#modal');
    m.innerHTML = html;
    m.showModal();
    $('[data-cerrar]', m)?.addEventListener('click', () => m.close());
    $('form', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const botones = $$('button[type=submit]:not(:disabled)', m);
      botones.forEach((b) => { b.disabled = true; });
      try {
        const datos = new FormData(e.target);
        /* El botón pulsado (p. ej. "Generar PDF" o "Enviar por email") se añade a mano: no todos los navegadores lo incluyen. */
        if (e.submitter?.name) datos.set(e.submitter.name, e.submitter.value);
        await alEnviar(datos);
        /* Si alEnviar abrió otro modal (p. ej. los enlaces), se queda abierto. */
        if (m.open && m.contains(e.target)) m.close();
      } catch (err) {
        botones.forEach((b) => { b.disabled = false; });
        fallo(err);
      }
    });
  }

  function confirmar({ titulo, texto, accion, alAceptar }) {
    abrirModal(`<form>
      <h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-peligro" type="submit">${esc(accion)}</button></div></form>`, alAceptar);
  }

  function modalNueva() {
    abrirModal(`<form>
      <h2>Nueva operación</h2>
      <div class="rejilla">
        <label class="campo"><span>Nombre titular</span><input name="n1" required></label>
        <label class="campo"><span>Apellidos titular</span><input name="a1" required></label>
        <label class="campo"><span>Email titular</span><input name="e1" type="email"></label>
        <label class="campo"><span>Teléfono titular</span><input name="t1" type="tel"></label>
        <label class="campo"><span>Nombre cotitular (opcional)</span><input name="n2"></label>
        <label class="campo"><span>Apellidos cotitular</span><input name="a2"></label>
        <label class="campo"><span>Email cotitular</span><input name="e2" type="email"></label>
        <label class="campo"><span>Teléfono cotitular</span><input name="t2" type="tel"></label>
        <label class="campo campo-ancho"><span>Comunidad autónoma de la compra</span>
          <select name="comunidad" required><option value="">Selecciona…</option>${COMUNIDADES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label class="campo campo-ancho"><span>Descripción (máx. ${MAX_PALABRAS} palabras)</span>
          <input name="descripcion" id="nueva-desc" required><small class="contador" id="nueva-contador">0 / ${MAX_PALABRAS}</small></label>
      </div>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-primario" type="submit">Crear operación</button></div></form>`, async (d) => {
      const op = await store.crear('operaciones', {
        comunidad: d.get('comunidad'), descripcion: d.get('descripcion').trim(), etapa: 1,
      });
      estado.ops.push(op);
      const personas = ['1', '2'].map((n) => ({
        nombre: d.get(`n${n}`).trim(), apellidos: d.get(`a${n}`).trim(),
        email: d.get(`e${n}`).trim() || null, telefono: d.get(`t${n}`).trim() || null,
      })).filter((p) => p.nombre || p.apellidos);
      for (const [i, persona] of personas.entries()) {
        estado.tits.push(await store.crear('titulares', { operacion_id: op.id, orden: i + 1, ...persona }));
      }
      estado.vista = 'tablero';
      pintar();
      abrirFicha(op.id);
    });
    const desc = $('#nueva-desc');
    desc.addEventListener('input', () => {
      const n = palabras(desc.value);
      $('#nueva-contador').textContent = `${n} / ${MAX_PALABRAS}`;
      $('#nueva-contador').classList.toggle('excedido', n > MAX_PALABRAS);
      desc.setCustomValidity(n > MAX_PALABRAS ? `Máximo ${MAX_PALABRAS} palabras` : '');
    });
  }

  function modalDescartar(id) {
    abrirModal(`<form>
      <h2>Descartar oportunidad</h2>
      <p>Saldrá del tablero. Podrás recuperarla desde Descartadas.</p>
      <label class="campo"><span>Motivo</span><input name="motivo" required></label>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-peligro" type="submit">Descartar</button></div></form>`, async (d) => {
      const fila = await store.actualizar('operaciones', id, { descartada: true, motivo_descarte: d.get('motivo').trim() });
      Object.assign(estado.ops.find((o) => o.id === id), fila);
      $('#ficha').close();
      pintar();
      aviso('Oportunidad descartada');
    });
  }

  function modalBanco(id) {
    abrirModal(`<form>
      <h2>Añadir banco</h2>
      <label class="campo"><span>Banco</span><input name="banco" list="lista-bancos" required autocomplete="off">
      <datalist id="lista-bancos">${BANCOS.map((b) => `<option value="${esc(b)}"></option>`).join('')}</datalist></label>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-primario" type="submit">Añadir</button></div></form>`, async (d) => {
      const est = await store.crear('estudios', { operacion_id: id, banco: d.get('banco').trim() });
      estado.ests.push(est);
      estado.pestana = est.id;
      pintarFicha();
    });
  }

  /* ---------- ficha ---------- */
  function campo({ ent, id, f, label, tipo = 'text', valor, opciones, ancho, sufijo, paso, lista }) {
    const attrs = `data-ent="${ent}" data-id="${esc(id)}" data-f="${f}" data-tipo="${tipo}"`;
    let control;
    if (opciones) {
      const conActual = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones;
      control = `<select ${attrs}><option value="">—</option>${conActual.map((o) => `<option${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (tipo === 'area') {
      control = `<textarea rows="3" ${attrs}>${esc(valor)}</textarea>`;
    } else {
      const extra = tipo === 'number' ? ` min="0" step="${paso || 'any'}" inputmode="decimal"` : '';
      control = `<input type="${tipo}" value="${esc(valor)}"${extra}${lista ? ` list="${lista}"` : ''} ${attrs}>`;
    }
    const conSufijo = sufijo ? `<div class="con-sufijo">${control}<em>${esc(sufijo)}</em></div>` : control;
    return `<label class="campo${ancho ? ' campo-ancho' : ''}"><span>${esc(label)}</span>${conSufijo}<small class="campo-nota" data-nota="${f}"></small></label>`;
  }

  function bloqueTitular(t, i, total) {
    const c = (o) => campo({ ent: 'tit', id: t.id, valor: t[o.f], ...o });
    return `<section class="titular">
      <header><h4>${i === 0 ? 'Titular' : `Cotitular ${total > 2 ? i : ''}`}</h4>
      ${i > 0 ? `<button class="enlace enlace-peligro" type="button" data-quitar-titular="${esc(t.id)}">Quitar</button>` : ''}</header>
      <div class="rejilla">
        ${c({ f: 'nombre', label: 'Nombre' })}
        ${c({ f: 'apellidos', label: 'Apellidos' })}
        ${c({ f: 'dni', label: 'DNI / NIE' })}
        ${c({ f: 'perfil_laboral', label: 'Perfil laboral', opciones: PERFILES })}
        ${c({ f: 'email', label: 'Email', tipo: 'email' })}
        ${c({ f: 'telefono', label: 'Teléfono', tipo: 'tel' })}
        ${c({ f: 'domicilio', label: 'Domicilio', ancho: true })}
        ${c({ f: 'fecha_nacimiento', label: 'Fecha de nacimiento', tipo: 'date' })}
        ${c({ f: 'antiguedad_laboral', label: 'Antigüedad laboral actual', tipo: 'date' })}
        ${c({ f: 'anios_cotizados', label: 'Años cotizados', tipo: 'number', paso: '0.1' })}
        ${c({ f: 'ingresos_mensuales', label: 'Ingresos mensuales', tipo: 'number', sufijo: '€' })}
        ${c({ f: 'num_pagas', label: 'Número de pagas', tipo: 'number', paso: '1' })}
        ${c({ f: 'estado_civil', label: 'Estado civil', opciones: ESTADOS_CIVILES })}
        ${c({ f: 'num_hijos', label: 'Número de hijos', tipo: 'number', paso: '1' })}
        ${c({ f: 'prestamos_cuota', label: 'Préstamos actuales (cuota)', tipo: 'number', sufijo: '€/mes' })}
        ${c({ f: 'prestamos_detalle', label: 'Detalle de préstamos' })}
      </div></section>`;
  }

  function resumenBancos(op, estudios) {
    if (!estudios.length) {
      return '<p class="vacio">Aún no hay bancos. Añade una pestaña por cada entidad a la que se envíe la operación.</p>';
    }
    return `<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Banco</th><th>Estado</th><th>Tipo de interés</th><th>Duración</th><th>Cuota mensual</th><th>Bonificaciones</th></tr></thead><tbody>
      ${estudios.map((e) => `<tr>
        <td><button class="enlace" type="button" data-pestana="${esc(e.id)}">${esc(e.banco || 'Sin nombre')}</button></td>
        <td>${esc(e.estado)}</td>
        <td>${esc([e.tipo_interes, e.interes !== null && e.interes !== undefined ? `${String(e.interes).replace('.', ',')} %` : ''].filter(Boolean).join(' · ') || '—')}</td>
        <td>${e.duracion_anios ? `${esc(e.duracion_anios)} años` : '—'}</td>
        <td>${esc(euros(e.cuota_mensual))}</td>
        <td>${esc(e.bonificaciones || '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  function bloqueComentarios(op) {
    const lista = comentariosDe(op.id).map((c) => `<li>
      <div class="comentario-cab"><time datetime="${esc(c.created_at)}">${esc(fechaHora(c.created_at))}</time>
      ${c.autor ? `<span>${esc(c.autor)}</span>` : ''}
      <button class="enlace enlace-peligro" type="button" data-quitar-comentario="${esc(c.id)}">Borrar</button></div>
      <p>${esc(c.texto)}</p></li>`).join('');
    return `<section class="comentarios">
      <h3 class="seccion">Comentarios</h3>
      <div class="comentario-nuevo">
        <textarea id="comentario-texto" rows="2" aria-label="Nuevo comentario" placeholder="Escribe un comentario…">${esc(estado.borradores[op.id])}</textarea>
        <button class="btn btn-primario" type="button" data-nuevo-comentario>Añadir</button>
      </div>
      ${lista ? `<ol class="comentario-lista">${lista}</ol>` : ''}
    </section>`;
  }

  async function anadirComentario() {
    const id = estado.fichaId;
    const caja = $('#comentario-texto');
    const texto = caja.value.trim();
    if (!texto) { caja.focus(); return; }
    const boton = $('[data-nuevo-comentario]');
    boton.disabled = true;
    try {
      estado.coms.push(await store.crear('comentarios', { operacion_id: id, texto }));
      delete estado.borradores[id];
      pintarFicha();
      $('#comentario-texto').focus();
    } catch (err) {
      boton.disabled = false;
      fallo(err);
    }
  }

  function filaPaso(titulo, detalle, acciones, hecho) {
    return `<div class="exp-paso${hecho ? ' hecho' : ''}"><div><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></div>
      <div class="exp-acciones">${acciones}</div></div>`;
  }

  /* Visor de PDF dentro de la página, con descarga. Sirve para documentos y para PDF generados. */
  function abrirVisor(titulo, blob, nombreArchivo) {
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const visor = $('#visor');
    visor.innerHTML = `<header><strong>${esc(titulo)}</strong>
      <a class="enlace" href="${esc(url)}" download="${esc(nombreArchivo)}">Descargar</a>
      <button class="cerrar" type="button" aria-label="Cerrar">×</button></header>
      <iframe src="${esc(url)}" title="${esc(titulo)}"></iframe>`;
    $('.cerrar', visor).addEventListener('click', () => visor.close());
    visor.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
    visor.showModal();
  }

  /* Enlace a Drive en real; en la demo, visor con el PDF guardado en este navegador. */
  function botonPdf(driveId, idDemo, texto = 'Ver') {
    const enlace = store.enlaceDrive(driveId);
    if (enlace) return `<a class="enlace" href="${esc(enlace)}" target="_blank" rel="noopener noreferrer">${esc(texto)}</a>`;
    return store.modo === 'demo' && idDemo ? `<button class="enlace" type="button" data-ver-pdf="${esc(idDemo)}">${esc(texto)}</button>` : '';
  }

  async function verPdfGuardado(id) {
    const pdf = await store.pdfGuardado(id);
    if (!pdf) {
      aviso('Documento de ejemplo sin PDF. Prueba con uno subido desde el portal o desde aquí.', true);
      return;
    }
    const doc = estado.docs.find((d) => d.id === id);
    const of = estado.ofertas.find((o) => o.id === id);
    const titulo = doc ? doc.tipo : of ? 'Oferta' : 'Nota de Encargo';
    abrirVisor(titulo, pdf, `${titulo}.pdf`);
  }

  function listaDocumentos(op) {
    const enlace = (dato, id, texto) => `<button class="enlace" type="button" ${dato}="${esc(id)}">${esc(texto)}</button>`;
    return titularesDe(op.id).map((t) => {
      const docs = docsDe(op.id).filter((d) => d.titular_id === t.id);
      if (!docs.length) return '';
      return `<h4>${esc(nombreDe(t))}</h4><ul class="doc-lista">${docs.map((d) => {
        let acciones = '';
        if (d.estado === 'pendiente') acciones = enlace('data-doc-subir', d.id, 'Subir') + enlace('data-doc-noaplica', d.id, 'No aplica');
        else if (d.estado === 'no_aplica') acciones = enlace('data-doc-subir', d.id, 'Subir') + enlace('data-doc-pedir', d.id, 'Pedir');
        else if (d.estado === 'aprobado') {
          acciones = botonPdf(d.drive_id, d.id) + enlace('data-doc-subir', d.id, 'Sustituir') + enlace('data-doc-tipo', d.id, 'Cambiar tipo')
            + enlace('data-doc-quitar', d.id, 'Quitar') + enlace('data-doc-rechazar', d.id, 'Pedir al cliente');
        }
        const origen = d.origen === 'gestor' ? ' · subido por el gestor' : '';
        return `<li class="doc-${d.estado}">
          <span class="doc-tipo">${esc(d.tipo)}${d.version > 1 ? ` · v${esc(d.version)}` : ''}</span>
          <span class="doc-estado">${esc(ESTADO_DOC[d.estado])}${esc(origen)}</span>
          <span class="doc-acciones">${acciones}</span>
        </li>`;
      }).join('')}</ul>`;
    }).join('');
  }

  function listaEnvios(op) {
    const envios = enviosDe(op.id);
    if (!envios.length) return '';
    return `<details class="exp-detalle"><summary>Emails enviados (${envios.length})</summary><ul class="envio-lista">
      ${envios.map((e) => `<li><button class="enlace" type="button" data-envio="${esc(e.id)}">${esc(e.asunto)}</button>
        <span>${esc(fechaHora(e.created_at))} · ${esc(e.para)}${e.estado === 'error' ? ' · ERROR' : ''}</span></li>`).join('')}
    </ul></details>`;
  }

  function bloqueExpediente(op) {
    const p = progreso(op.id);
    const oferta = ultimaOferta(op.id);
    const nota = ultimoEncargo(op.id);
    const boton = (dato, texto, clase = 'btn-suave') => `<button class="btn ${clase}" type="button" ${dato}>${esc(texto)}</button>`;

    const drive = op.drive_folder_id
      ? `<a class="enlace" href="https://drive.google.com/drive/folders/${encodeURIComponent(op.drive_folder_id)}" target="_blank" rel="noopener noreferrer">Abrir carpeta</a>` : '';
    const cabecera = op.expediente
      ? `<div class="seccion-cab"><h3 class="seccion">Expediente ${esc(op.expediente)}${op.alias ? ` - ${esc(op.alias)}` : ''}</h3>${drive}</div>`
      : '<h3 class="seccion">Expediente</h3>';

    const paso1 = op.expediente
      ? filaPaso('Documentación', p.total ? `${p.listo ? 'Completa: ' : ''}${p.aprobados} de ${p.total} aprobados` : 'Sin documentos pedidos',
        boton('data-enlace', 'Pedir al cliente') + boton('data-reenviar', 'Nuevo enlace'), p.listo)
      : filaPaso('Documentación', 'Crea el número y la carpeta, o envía directamente el enlace al cliente',
        boton('data-crear-expediente', 'Crear expediente') + boton('data-enlace', 'Pedir documentación', 'btn-primario'), false);

    const entrega = (x) => (x.canal === 'manual' ? 'Generada en PDF' : 'Enviada por email');
    let paso2;
    if (!oferta) {
      paso2 = filaPaso('Oferta', p.listo ? 'Lista para preparar' : 'Pendiente de documentación',
        boton('data-oferta', 'Preparar oferta', p.listo ? 'btn-primario' : 'btn-suave'), false);
    } else {
      const precio = `${euros(oferta.honorarios)} ${oferta.iva_incluido ? 'IVA incluido' : `+ ${oferta.iva_pct} % IVA`}`;
      const pdf = botonPdf(oferta.pdf_drive_id, oferta.id, 'Ver PDF') + botonPdf(oferta.pdf_firmado_drive_id, null, 'Ver firmada');
      const firmadaSinPdf = firmasDe(oferta.id).length > 0 && !oferta.pdf_firmado_drive_id && store.modo !== 'demo';
      const reintento = firmadaSinPdf ? boton('data-completar-firma="oferta"', 'Generar PDF firmado') : '';
      const sinFirmar = !firmasDe(oferta.id).length && !oferta.pdf_firmado_drive_id;
      const pedirFirma = sinFirmar ? boton('data-pedir-firma="oferta"', 'Pedir firma') : '';
      if (oferta.estado === 'enviada') {
        paso2 = filaPaso('Oferta', `${entrega(oferta)} · ${precio} · pendiente de firma del cliente`,
          pdf + reintento + pedirFirma + boton('data-marcar-oferta="aceptada"', 'Marcar aceptada') + boton('data-marcar-oferta="rechazada"', 'Marcar rechazada'), false);
      } else if (oferta.estado === 'aceptada') {
        const como = oferta.pdf_firmado_drive_id || firmasDe(oferta.id).length ? ' y firmada por el cliente'
          : oferta.via === 'portal' ? ' por el cliente en el portal' : ' a mano, sin firma del cliente';
        paso2 = filaPaso('Oferta', `Aceptada${como} · ${precio}`, pdf + reintento + pedirFirma, true);
      } else {
        paso2 = filaPaso('Oferta', `Rechazada · ${precio}`, pdf + boton('data-oferta', 'Preparar nueva oferta'), false);
      }
    }

    let paso3;
    const pdfNota = nota ? botonPdf(nota.pdf_drive_id, nota.id, 'Ver PDF') + botonPdf(nota.pdf_firmado_drive_id, null, 'Ver firmada') : '';
    const firmasNota = nota ? firmasDe(nota.id) : [];
    const totalTits = titularesDe(op.id).length;
    const faltanTits = titularesDe(op.id).filter((t) => !firmasNota.some((f) => f.titular_id === t.id)).map(nombreDe);
    if (nota?.estado === 'firmada') {
      paso3 = filaPaso('Nota de Encargo', firmasNota.length ? `Firmada en el portal por ${firmasNota.length} de ${totalTits}` : 'Firmada', pdfNota, true);
    } else if (nota) {
      const detalle = firmasNota.length
        ? `Firmada por ${firmasNota.length} de ${totalTits}${faltanTits.length ? ` · falta ${faltanTits.join(', ')}` : ''}`
        : `${entrega(nota)}, pendiente de firma en el portal`;
      const reintento = !faltanTits.length && !nota.pdf_firmado_drive_id && store.modo !== 'demo'
        ? boton('data-completar-firma="nota"', 'Generar PDF firmado', 'btn-primario') : '';
      const pedirFirma = faltanTits.length ? boton('data-pedir-firma="nota"', 'Pedir firma') : '';
      paso3 = filaPaso('Nota de Encargo', detalle, pdfNota + reintento + pedirFirma + boton('data-marcar-nota', 'Marcar firmada'), false);
    }
    else {
      paso3 = filaPaso('Nota de Encargo', oferta?.estado === 'aceptada' ? 'Lista para preparar' : 'Se habilita al aceptar la oferta',
        oferta?.estado === 'aceptada' ? boton('data-nota', 'Preparar Nota', 'btn-primario') : '', false);
    }

    const docs = `<details class="exp-detalle" open><summary>Documentos</summary>
      <div class="docs-cab"><button class="btn btn-suave" type="button" data-doc-nuevo>Subir documento</button></div>
      ${listaDocumentos(op) || '<p class="campo-nota">Aún no hay documentos.</p>'}</details>`;
    return `<section class="expediente">${cabecera}${paso1}${paso2}${paso3}${docs}${listaEnvios(op)}</section>`;
  }

  async function ejecutar(nombre, datos, exito) {
    try {
      const r = await store.accion(nombre, datos);
      await refrescar();
      pintar();
      if (estado.fichaId) pintarFicha();
      (r?.avisos || []).forEach((a) => aviso(a, true));
      if (exito && !r?.avisos?.length) aviso(exito);
      return r;
    } catch (err) {
      err.visible = true;
      throw err;
    }
  }

  function documentosSugeridos(t, op, perfil) {
    const lista = [...DOCUMENTOS_PERFIL[perfil]];
    if (t.prestamos_cuota) lista.push('Recibos de préstamos actuales');
    if (t.orden === 1 && op.arras_entregadas) lista.push('Contrato de arras o reserva');
    const existentes = docsDe(op.id).filter((d) => d.titular_id === t.id).map((d) => d.tipo);
    return lista.filter((d) => !existentes.includes(d));
  }

  function casillasDocumentos(t, op, perfil) {
    const lista = documentosSugeridos(t, op, perfil);
    return lista.map((d) => `<label class="check"><input type="checkbox" name="doc" value="${esc(t.id)}|${esc(d)}" checked><span>${esc(d)}</span></label>`).join('')
      || '<p class="campo-nota">Ya están pedidos todos los documentos de este perfil.</p>';
  }

  /* Enlaces para compartir a mano: se muestran una sola vez, no se guardan. */
  function modalEnlaces(enlaces) {
    const whatsapp = (e) => {
      let tel = (e.telefono || '').replace(/\D/g, '');
      if (tel.length === 9) tel = `34${tel}`;
      const texto = `Hola ${e.nombre.split(' ')[0]}, este es tu enlace personal de Bajo Teja para subir tu documentación: ${e.url}`;
      return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
    };
    abrirModal(`<form>
      <h2>Enlaces para el cliente</h2>
      <p>Cópialos ahora: por seguridad no se guardan y no se pueden volver a ver. Si se pierden, genera uno nuevo. Caducan en 30 días.</p>
      ${enlaces.map((e, i) => `<div class="enlace-cliente"><strong>${esc(e.nombre)}</strong>
        <input readonly value="${esc(e.url)}" data-enlace-url="${i}" aria-label="Enlace de ${esc(e.nombre)}">
        <div class="enlace-acciones"><button class="btn btn-suave" type="button" data-copiar="${i}">Copiar</button>
        <a class="btn btn-suave" href="${esc(whatsapp(e))}" target="_blank" rel="noopener noreferrer">WhatsApp</a></div></div>`).join('')}
      <div class="modal-pie"><button class="btn btn-primario" type="submit">Hecho</button></div></form>`, async () => {});
    $$('#modal [data-copiar]').forEach((b) => b.addEventListener('click', async () => {
      const campo = $(`#modal [data-enlace-url="${b.dataset.copiar}"]`);
      try {
        await navigator.clipboard.writeText(campo.value);
      } catch {
        campo.select();
        document.execCommand('copy');
      }
      b.textContent = 'Copiado';
    }));
  }

  async function pedirEnlace(accion, datos, canal) {
    const r = await ejecutar(accion, { ...datos, canal }, canal === 'email' ? 'Enlace enviado por email' : null);
    if (canal === 'manual' && r?.enlaces?.length) modalEnlaces(r.enlaces);
  }

  function modalReenviar(op, motivo = 'documentacion') {
    const sinEmail = titularesDe(op.id).filter((t) => !t.email).map(nombreDe);
    const titulo = { documentacion: 'Nuevo enlace', oferta: 'Pedir firma de la oferta', nota: 'Pedir firma de la Nota de Encargo' }[motivo];
    const texto = motivo === 'documentacion'
      ? 'Cada titular recibe un enlace nuevo y los anteriores dejan de funcionar.'
      : 'Cada titular recibe un enlace nuevo para leer y firmar el documento en el portal. Los anteriores dejan de funcionar; lo ya subido o firmado se conserva.';
    abrirModal(`<form>
      <h2>${esc(titulo)}</h2>
      <p>${esc(texto)}</p>
      ${sinEmail.length ? `<p class="campo-nota">Sin email: ${esc(sinEmail.join(', '))}. Solo se puede generar el enlace para compartirlo tú.</p>` : ''}
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-suave" type="submit" name="canal" value="email"${sinEmail.length ? ' disabled' : ''}>Enviar por email</button>
      <button class="btn btn-primario" type="submit" name="canal" value="manual">Generar enlace</button></div></form>`,
    (d) => pedirEnlace('reenviar-enlace', { operacion_id: op.id, motivo }, d.get('canal')));
  }

  function modalEnlace(op) {
    const tits = titularesDe(op.id);
    const sinEmail = tits.filter((t) => !t.email).map(nombreDe);
    if (!tits.length) { aviso('Añade al menos un titular.', true); return; }
    const perfil = (t) => (PERFILES.includes(t.perfil_laboral) ? t.perfil_laboral : 'Asalariado');
    abrirModal(`<form>
      <h2>${op.expediente ? 'Añadir documentos' : 'Pedir documentación al cliente'}</h2>
      <p>${op.expediente ? `Expediente ${esc(op.expediente)}. Cada titular recibe un enlace nuevo.` : 'Se asigna el número de expediente, se crea la carpeta en Drive y se crea un enlace personal por titular.'}
      Lo que suba el cliente se guarda en su carpeta de Drive.</p>
      ${sinEmail.length ? `<p class="campo-nota">Sin email: ${esc(sinEmail.join(', '))}. Genera el enlace y compártelo tú por WhatsApp.</p>` : ''}
      ${tits.map((t) => `<fieldset class="doc-titular"><legend>${esc(nombreDe(t))}${t.email ? ` · ${esc(t.email)}` : ''}</legend>
        <label class="campo"><span>Perfil laboral</span><select data-perfil="${esc(t.id)}">${PERFILES.map((x) => `<option${x === perfil(t) ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <div class="doc-casillas" data-casillas="${esc(t.id)}">${casillasDocumentos(t, op, perfil(t))}</div>
        <label class="campo"><span>Otro documento (opcional)</span><input name="extra-${esc(t.id)}"></label>
      </fieldset>`).join('')}
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-suave" type="submit" name="canal" value="email"${sinEmail.length ? ' disabled' : ''}>Enviar por email</button>
      <button class="btn btn-primario" type="submit" name="canal" value="manual">Generar enlace</button></div></form>`, async (d) => {
      const documentos = d.getAll('doc').map((v) => {
        const [titular_id, ...tipo] = v.split('|');
        return { titular_id, tipo: tipo.join('|') };
      });
      tits.forEach((t) => {
        const extra = d.get(`extra-${t.id}`).trim();
        if (extra) documentos.push({ titular_id: t.id, tipo: extra });
      });
      if (!documentos.length && !op.expediente) throw Object.assign(new Error('Marca al menos un documento.'), { visible: true });
      for (const t of tits) {
        const elegido = $(`[data-perfil="${t.id}"]`).value;
        if (elegido !== t.perfil_laboral) {
          await store.actualizar('titulares', t.id, { perfil_laboral: elegido });
          t.perfil_laboral = elegido;
        }
      }
      await pedirEnlace('enviar-enlace', { operacion_id: op.id, documentos }, d.get('canal'));
    });
    $$('[data-perfil]').forEach((sel) => sel.addEventListener('change', () => {
      const t = tits.find((x) => x.id === sel.dataset.perfil);
      $(`[data-casillas="${t.id}"]`).innerHTML = casillasDocumentos(t, op, sel.value);
    }));
  }

  function modalOferta(op) {
    const previa = ultimaOferta(op.id);
    const p = progreso(op.id);
    const select = (lista, valor) => `<option value="">Selecciona…</option>${lista.map((x) => `<option${x === valor ? ' selected' : ''}>${esc(x)}</option>`).join('')}`;
    abrirModal(`<form>
      <h2>Preparar oferta</h2>
      <p>Genera el PDF para enviarlo tú (WhatsApp, en mano…) o envíalo por email a todos los titulares. En los dos casos queda registrada.</p>
      ${p.listo ? '' : `<p class="nota-error">La documentación no está completa: ${p.aprobados} de ${p.total} aprobados.</p>`}
      <div class="rejilla">
        <label class="campo"><span>Honorarios</span><div class="con-sufijo"><input name="honorarios" type="number" min="0" step="any" required value="${esc(previa?.honorarios)}"><em>€</em></div></label>
        <label class="campo"><span>IVA</span><select name="iva"><option value="no">No incluido (21 %)</option><option value="si">Incluido</option></select></label>
        <label class="campo"><span>Tipo de financiación</span><select name="tipo_financiacion" required>${select(TIPOS_FINANCIACION, op.tipo_financiacion)}</select></label>
        <label class="campo"><span>Importe solicitado</span><div class="con-sufijo"><input name="importe_solicitado" type="number" min="0" step="any" required value="${esc(op.importe_solicitado)}"><em>€</em></div></label>
        <label class="campo campo-ancho"><span>Finalidad</span><input name="finalidad" required value="${esc(op.finalidad)}"></label>
        <label class="campo campo-ancho"><span>Mensaje para el cliente (opcional)</span><textarea name="mensaje" rows="3"></textarea></label>
      </div>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-suave" type="submit" name="modo" value="email">Enviar por email</button>
      <button class="btn btn-primario" type="submit" name="modo" value="pdf">Generar PDF</button></div></form>`, async (d) => {
      const cambios = {
        tipo_financiacion: d.get('tipo_financiacion'), finalidad: d.get('finalidad').trim(),
        importe_solicitado: Number(d.get('importe_solicitado')),
      };
      Object.assign(op, await store.actualizar('operaciones', op.id, cambios));
      const datos = {
        operacion_id: op.id, honorarios: Number(d.get('honorarios')), iva_incluido: d.get('iva') === 'si',
        iva_pct: 21, mensaje: d.get('mensaje').trim() || null,
      };
      if (d.get('modo') === 'pdf') await generarPdf('generar-oferta', datos, 'Oferta');
      else await ejecutar('enviar-oferta', datos, 'Oferta enviada');
    });
  }

  function datosQueFaltan(op) {
    const faltan = [];
    titularesDe(op.id).forEach((t) => {
      const huecos = [['nombre', 'nombre'], ['apellidos', 'apellidos'], ['dni', 'DNI'], ['telefono', 'teléfono'], ['domicilio', 'domicilio'], ['email', 'email']]
        .filter(([k]) => !t[k]).map(([, n]) => n);
      if (huecos.length) faltan.push(`${nombreDe(t)}: ${huecos.join(', ')}`);
    });
    const op_ = [['tipo_financiacion', 'tipo de financiación'], ['finalidad', 'finalidad'], ['inmueble', 'inmueble'], ['importe_solicitado', 'importe solicitado']]
      .filter(([k]) => !op[k]).map(([, n]) => n);
    if (op_.length) faltan.push(`Operación: ${op_.join(', ')}`);
    const emp = [['razon_social', 'razón social'], ['cif', 'CIF'], ['num_registro', 'nº de registro'], ['domicilio', 'domicilio'], ['representante', 'representante']]
      .filter(([k]) => !estado.empresa[k]).map(([, n]) => n);
    if (emp.length) faltan.push(`Empresa: ${emp.join(', ')}`);
    return faltan;
  }

  function modalNota(op) {
    const faltan = datosQueFaltan(op);
    if (faltan.length) {
      abrirModal(`<form><h2>Faltan datos para la Nota</h2>
        <ul class="lista-faltan">${faltan.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <div class="modal-pie"><button class="btn btn-primario" type="submit">Entendido</button></div></form>`, async () => {});
      return;
    }
    abrirModal(`<form>
      <h2>Preparar Nota de Encargo</h2>
      <p>Se genera el PDF con los datos del expediente. Puedes descargarlo para enviarlo tú o mandarlo por email a todos los titulares.</p>
      <div class="rejilla">
        <label class="campo campo-ancho"><span>Lugar</span><input name="lugar" required value="${esc(estado.empresa.ciudad)}"></label>
        <label class="campo"><span>Pago antes de firma (días)</span><input name="plazo" type="number" min="0" step="1" required value="3"></label>
        <label class="campo"><span>Desiste tras tasación (%)</span><input name="pct" type="number" min="0" max="100" step="1" required value="50"></label>
        <label class="campo"><span>Plazo de desistimiento (días)</span><input name="dias" type="number" min="0" step="1" required value="14"></label>
      </div>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-suave" type="submit" name="modo" value="email">Enviar por email</button>
      <button class="btn btn-primario" type="submit" name="modo" value="pdf">Generar PDF</button></div></form>`, async (d) => {
      const datos = {
        operacion_id: op.id, lugar: d.get('lugar').trim(), plazo_pago_dias: Number(d.get('plazo')),
        pct_desistimiento: Number(d.get('pct')), dias_desistimiento: Number(d.get('dias')),
      };
      if (d.get('modo') === 'pdf') await generarPdf('generar-nota', datos, 'Nota de Encargo');
      else await ejecutar('enviar-nota', datos, 'Nota enviada');
    });
  }

  function modalEmpresa() {
    const e = estado.empresa;
    const c = (n, l, ancho) => `<label class="campo${ancho ? ' campo-ancho' : ''}"><span>${esc(l)}</span><input name="${n}" value="${esc(e[n])}"></label>`;
    abrirModal(`<form>
      <h2>Datos de la empresa</h2>
      <p>Aparecen en la oferta y en la Nota de Encargo.</p>
      <div class="rejilla">
        ${c('razon_social', 'Razón social', true)}${c('cif', 'CIF')}${c('num_registro', 'Nº de registro de intermediario')}
        ${c('domicilio', 'Domicilio', true)}${c('representante', 'Representante (nombre y cargo)')}${c('ciudad', 'Ciudad por defecto')}
      </div>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-primario" type="submit">Guardar</button></div></form>`, async (d) => {
      const cambios = Object.fromEntries(['razon_social', 'cif', 'num_registro', 'domicilio', 'representante', 'ciudad']
        .map((k) => [k, d.get(k).trim() || null]));
      estado.empresa = await store.guardarEmpresa(cambios);
      aviso('Datos guardados');
    });
  }

  /* Genera el PDF sin enviar email, lo registra y lo abre para descargar. */
  async function generarPdf(nombre, datos, titulo) {
    let r;
    try {
      r = await store.accion(nombre, datos);
    } catch (err) {
      err.visible = true;
      throw err;
    }
    $('#modal').close();
    await refrescar();
    pintar();
    if (estado.fichaId) pintarFicha();
    const pdf = await store.pdfGenerado(r);
    if (pdf) abrirVisor(titulo, pdf, r.nombre);
    aviso(`${titulo} generada. Descárgala para enviarla.`);
  }

  const DOCS_ACEPTADOS = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp';
  async function prepararArchivo(archivos) {
    const lista = [...archivos];
    const error = (m) => Object.assign(new Error(m), { visible: true });
    if (!lista.length) throw error('Elige un archivo.');
    if (lista.every((a) => /\.(jpe?g|png|webp)$/i.test(a.name))) {
      try {
        return { archivo: await window.PortalPdf.desdeImagenes(lista), nombre: `${lista[0].name.replace(/\.[^.]+$/, '')}.pdf` };
      } catch {
        throw error('No se ha podido leer la imagen. Usa JPG, PNG o PDF.');
      }
    }
    if (lista.length > 1) throw error('Solo se pueden juntar varias fotos. Un PDF o Word va de uno en uno.');
    const [a] = lista;
    if (/\.pdf$/i.test(a.name) && a.size <= 25 * 1024 * 1024) return { archivo: a, nombre: a.name };
    if (/\.docx?$/i.test(a.name) && a.size <= 10 * 1024 * 1024) return { archivo: a, nombre: a.name };
    throw error('Formato no admitido o demasiado grande. PDF hasta 25 MB, Word hasta 10 MB, o fotos.');
  }

  function modalSubirDocumento(op, docId) {
    const doc = docId && estado.docs.find((d) => d.id === docId);
    const tits = titularesDe(op.id);
    if (!tits.length) { aviso('Añade al menos un titular.', true); return; }
    const tipos = [...new Set(Object.values(DOCUMENTOS_PERFIL).flat())];
    const titulo = !doc ? 'Subir documento' : doc.estado === 'aprobado' ? `Sustituir: ${doc.tipo}` : `Subir: ${doc.tipo}`;
    abrirModal(`<form>
      <h2>${esc(titulo)}</h2>
      <p>${doc?.estado === 'aprobado' ? 'La versión anterior se conserva en Drive. ' : ''}Se guarda en PDF en la carpeta del expediente${op.expediente ? '' : ', que se crea ahora'}. Fotos y Word se convierten a PDF.</p>
      ${doc ? '' : `<div class="rejilla">
        <label class="campo"><span>Titular</span><select name="titular_id">${tits.map((t) => `<option value="${esc(t.id)}">${esc(nombreDe(t))}</option>`).join('')}</select></label>
        <label class="campo"><span>Tipo de documento</span><input name="tipo" list="lista-tipos-doc" required autocomplete="off"></label>
        <datalist id="lista-tipos-doc">${tipos.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      </div>`}
      <label class="campo"><span>Archivo (varias fotos del mismo documento se unen en un PDF)</span><input name="archivo" type="file" multiple accept="${DOCS_ACEPTADOS}" required></label>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-primario" type="submit">Subir</button></div></form>`, async (d) => {
      const { archivo, nombre } = await prepararArchivo($('#modal [name=archivo]').files);
      try {
        await store.subirDocumento({
          operacion_id: op.id,
          titular_id: doc ? doc.titular_id : d.get('titular_id'),
          tipo: doc ? doc.tipo : d.get('tipo').trim(),
          documento_id: doc?.id || null,
          archivo, nombre,
        });
      } catch (err) {
        err.visible = true;
        throw err;
      }
      await refrescar();
      pintar();
      pintarFicha();
      aviso('Documento guardado');
    });
  }

  function modalTipoDocumento(id) {
    const doc = estado.docs.find((d) => d.id === id);
    abrirModal(`<form>
      <h2>Cambiar tipo de documento</h2>
      <label class="campo"><span>Tipo</span><input name="tipo" required value="${esc(doc.tipo)}"></label>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-primario" type="submit">Guardar</button></div></form>`, async (d) => {
      await ejecutar('cambiar-tipo-documento', { documento_id: id, tipo: d.get('tipo').trim() }, 'Tipo cambiado');
    });
  }

  function modalQuitarDocumento(id) {
    const doc = estado.docs.find((d) => d.id === id);
    abrirModal(`<form>
      <h2>Quitar: ${esc(doc.tipo)}</h2>
      <p>Deja de contar en el expediente. El PDF se conserva en Drive.</p>
      <label class="campo"><span>Motivo</span><input name="motivo" required></label>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-peligro" type="submit">Quitar</button></div></form>`, async (d) => {
      await ejecutar('quitar-documento', { documento_id: id, motivo: d.get('motivo').trim() }, 'Documento quitado');
    });
  }

  function modalRechazar(id) {
    const doc = estado.docs.find((d) => d.id === id);
    abrirModal(`<form>
      <h2>Pedir de nuevo: ${esc(doc.tipo)}</h2>
      <p>El PDF aprobado se conserva en Drive. El cliente recibe un email para subir una versión nueva.</p>
      <label class="campo"><span>Motivo</span><input name="motivo" required></label>
      <div class="modal-pie"><button class="btn btn-suave" type="button" data-cerrar>Cancelar</button>
      <button class="btn btn-primario" type="submit">Pedir de nuevo</button></div></form>`, async (d) => {
      await ejecutar('rechazar-documento', { documento_id: id, motivo: d.get('motivo').trim() }, 'Email enviado al cliente');
    });
  }

  function modalEnvio(id) {
    const e = estado.envios.find((x) => x.id === id);
    const demo = e.enlace_demo ? `<p><a class="enlace" href="../portal/?demo#${esc(e.enlace_demo)}" target="_blank" rel="noopener">Abrir el portal como este cliente</a></p>` : '';
    abrirModal(`<form>
      <h2>${esc(e.asunto)}</h2>
      <p>Para ${esc(e.para)} · ${esc(fechaHora(e.created_at))}${e.adjunto ? ` · Adjunto: ${esc(e.adjunto)}` : ''}</p>
      ${e.error ? `<p class="nota-error">${esc(e.error)}</p>` : ''}
      ${e.cuerpo ? `<p class="envio-cuerpo">${esc(e.cuerpo)}</p>` : ''}${demo}
      <div class="modal-pie"><button class="btn btn-primario" type="submit">Cerrar</button></div></form>`, async () => {});
  }

  async function accionDirecta(nombre, datos, exito) {
    try { await ejecutar(nombre, datos, exito); } catch (err) { fallo(err); }
  }

  function panelDatos(op) {
    const c = (o) => campo({ ent: 'op', id: op.id, valor: op[o.f], ...o });
    const tits = titularesDe(op.id);
    const estudios = estudiosDe(op.id);
    return `
      <div id="bloque-expediente">${bloqueExpediente(op)}</div>
      ${bloqueComentarios(op)}
      <section>
        <h3 class="seccion">Operación</h3>
        <div class="rejilla rejilla-3">
          ${c({ f: 'descripcion', label: `Descripción (máx. ${MAX_PALABRAS} palabras)`, ancho: true })}
          ${c({ f: 'comunidad', label: 'Comunidad autónoma', opciones: COMUNIDADES })}
          ${c({ f: 'precio_compraventa', label: 'Precio de compraventa', tipo: 'number', sufijo: '€' })}
          ${c({ f: 'arras_entregadas', label: 'Arras entregadas', tipo: 'number', sufijo: '€' })}
          ${c({ f: 'itp', label: 'ITP al que aplica', tipo: 'number', sufijo: '%' })}
          ${c({ f: 'valor_tasacion', label: 'Valor de tasación requerido', tipo: 'number', sufijo: '€' })}
          ${c({ f: 'importe_solicitado', label: 'Importe solicitado', tipo: 'number', sufijo: '€' })}
          ${c({ f: 'tipo_financiacion', label: 'Tipo de financiación', opciones: TIPOS_FINANCIACION })}
          ${c({ f: 'finalidad', label: 'Finalidad' })}
          ${c({ f: 'inmueble', label: 'Inmueble (dirección)', ancho: true })}
          ${c({ f: 'ref_catastral', label: 'Referencia catastral' })}
          ${op.etapa >= 6 ? `<label class="check"><input type="checkbox" data-ent="op" data-id="${esc(op.id)}" data-f="honorarios_cobrados" data-tipo="checkbox"${op.honorarios_cobrados ? ' checked' : ''}><span>Honorarios cobrados</span></label>` : ''}
        </div>
      </section>
      <section>
        <div class="seccion-cab"><h3 class="seccion">Titulares</h3>
        <button class="btn btn-suave" type="button" data-nuevo-titular>Añadir cotitular</button></div>
        <div class="titulares">${tits.map((t, i) => bloqueTitular(t, i, tits.length)).join('')}</div>
      </section>
      ${op.etapa >= 5 || estudios.length ? `<section><h3 class="seccion">Estudios bancarios</h3>${resumenBancos(op, estudios)}</section>` : ''}`;
  }

  function panelBanco(e) {
    const c = (o) => campo({ ent: 'est', id: e.id, valor: e[o.f], ...o });
    return `<section>
      <div class="seccion-cab"><h3 class="seccion">${esc(e.banco || 'Banco')}</h3>
      <button class="enlace enlace-peligro" type="button" data-quitar-banco="${esc(e.id)}">Quitar banco</button></div>
      <div class="rejilla rejilla-3">
        ${c({ f: 'banco', label: 'Banco que estudia la operación', lista: 'lista-bancos-ficha' })}
        ${c({ f: 'estado', label: 'Estado del estudio', opciones: ESTADOS_BANCO })}
        ${c({ f: 'tipo_interes', label: 'Tipo de interés', opciones: TIPOS_INTERES })}
        ${c({ f: 'interes', label: 'Interés', tipo: 'number', sufijo: '%' })}
        ${c({ f: 'duracion_anios', label: 'Duración de la hipoteca', tipo: 'number', paso: '1', sufijo: 'años' })}
        ${c({ f: 'cuota_mensual', label: 'Cuota mensual', tipo: 'number', sufijo: '€' })}
        ${c({ f: 'bonificaciones', label: 'Bonificaciones', tipo: 'area', ancho: true })}
      </div>
      <datalist id="lista-bancos-ficha">${BANCOS.map((b) => `<option value="${esc(b)}"></option>`).join('')}</datalist>
    </section>`;
  }

  function cabeceraFicha(op) {
    const etapa = ETAPAS[op.etapa - 1];
    return `<div class="ficha-eyebrow"><span>${op.descartada ? 'Descartada · ' : ''}Etapa ${etapa.n} de 8</span><span id="guardado" class="guardado" aria-live="polite"></span></div>
      <h2 id="ficha-titulo">${esc(nombresOp(op.id).join(' · '))}</h2>`;
  }

  function pintarFicha() {
    const f = $('#ficha');
    const op = estado.ops.find((o) => o.id === estado.fichaId);
    if (!op) { if (f.open) f.close(); return; }
    const etapa = ETAPAS[op.etapa - 1];
    const estudios = estudiosDe(op.id);
    const conBancos = op.etapa >= 5 || estudios.length > 0;
    let actual = estudios.find((e) => e.id === estado.pestana);
    if (!actual) estado.pestana = 'datos';
    const scroll = $('.ficha-cuerpo', f)?.scrollTop || 0;
    f.innerHTML = `
      <header class="ficha-cab">
        <div class="ficha-cab-sup"><div id="ficha-cabecera">${cabeceraFicha(op)}</div>
        <button class="cerrar" type="button" data-cerrar-ficha aria-label="Cerrar ficha">×</button></div>
        <ol class="pasos">${ETAPAS.map((e) => `<li><button type="button" data-etapa-ficha="${e.n}" class="${e.n === op.etapa ? 'actual' : e.n < op.etapa ? 'hecho' : ''}" title="${esc(e.nombre)}" aria-label="Mover a ${esc(e.nombre)}"${e.n === op.etapa ? ' aria-current="step"' : ''}>${e.n}</button></li>`).join('')}</ol>
        <p class="paso-texto"><strong>${esc(etapa.nombre)}.</strong> ${esc(etapa.paso)}</p>
        ${conBancos ? `<nav class="pestanas" aria-label="Secciones de la ficha">
          <button type="button" data-pestana="datos" class="${estado.pestana === 'datos' ? 'activa' : ''}">Datos</button>
          ${estudios.map((e) => `<button type="button" data-pestana="${esc(e.id)}" class="${estado.pestana === e.id ? 'activa' : ''}">${esc(e.banco || 'Sin nombre')}<small>${esc(e.estado)}</small></button>`).join('')}
          <button type="button" class="pestana-nueva" data-nuevo-banco>+ Banco</button>
        </nav>` : ''}
      </header>
      <div class="ficha-cuerpo">${actual ? panelBanco(actual) : panelDatos(op)}</div>
      <footer class="ficha-pie">
        ${op.descartada ? '' : '<button class="btn btn-peligro" type="button" data-descartar>Descartar oportunidad</button>'}
      </footer>`;
    $('.ficha-cuerpo', f).scrollTop = scroll;
    $$('[data-f="dni"]', f).forEach(notaDni);
  }

  function abrirFicha(id) {
    estado.fichaId = id;
    estado.pestana = 'datos';
    pintarFicha();
    const f = $('#ficha');
    if (!f.open) f.showModal();
    $('[data-cerrar-ficha]', f).focus();
  }

  function cerrarFicha() {
    document.activeElement?.blur();
    $('#ficha').close();
  }

  function notaDni(el) {
    const nota = $('[data-nota="dni"]', el.closest('.campo'));
    const malo = el.value && !dniValido(el.value);
    nota.textContent = malo ? 'Revisa el DNI / NIE: la letra no cuadra' : '';
    nota.classList.toggle('nota-error', Boolean(malo));
  }

  function marcarGuardado(texto, error = false) {
    const g = $('#guardado');
    if (!g) return;
    g.textContent = texto;
    g.classList.toggle('guardado-error', error);
  }

  function leerValor(el) {
    const tipo = el.dataset.tipo;
    if (tipo === 'checkbox') return el.checked;
    if (tipo === 'number') return el.value === '' ? null : Number(el.value);
    return el.value.trim() || null;
  }

  async function guardarCampo(el) {
    const { ent, id, f } = el.dataset;
    const [tabla, clave] = ENT[ent];
    const fila = estado[clave].find((x) => x.id === id);
    if (!fila) return;

    if (f === 'dni') {
      el.value = el.value.toUpperCase().replace(/[\s.-]/g, '');
      notaDni(el);
    }
    if (f === 'descripcion') {
      const nota = $('[data-nota="descripcion"]', el.closest('.campo'));
      const exceso = palabras(el.value) > MAX_PALABRAS;
      nota.textContent = exceso ? `No guardado: tiene ${palabras(el.value)} palabras (máx. ${MAX_PALABRAS})` : '';
      nota.classList.toggle('nota-error', exceso);
      if (exceso) return;
    }
    if (el.dataset.tipo === 'number' && !el.checkValidity()) {
      marcarGuardado('Valor no válido, sin guardar', true);
      return;
    }

    const valor = leerValor(el);
    const anterior = fila[f];
    if (valor === anterior) return;
    fila[f] = valor;
    marcarGuardado('Guardando…');
    try {
      await store.actualizar(tabla, id, { [f]: valor });
      marcarGuardado('Guardado');
      pintar();
      if (f === 'honorarios_cobrados') return;
      if (ent === 'tit') $('#ficha-cabecera').innerHTML = cabeceraFicha(estado.ops.find((o) => o.id === estado.fichaId));
      if (ent === 'est' && (f === 'banco' || f === 'estado')) pintarFicha();
      marcarGuardado('Guardado');
    } catch (err) {
      fila[f] = anterior;
      marcarGuardado('Sin guardar', true);
      fallo(err);
    }
  }

  async function anadirTitular() {
    const id = estado.fichaId;
    const orden = Math.max(0, ...titularesDe(id).map((t) => t.orden)) + 1;
    try {
      estado.tits.push(await store.crear('titulares', { operacion_id: id, orden }));
      pintarFicha();
      pintar();
    } catch (err) { fallo(err); }
  }

  const opActual = () => estado.ops.find((o) => o.id === estado.fichaId);

  function activarFicha() {
    const f = $('#ficha');
    f.addEventListener('change', (e) => {
      const el = e.target.closest('[data-f]');
      if (el) guardarCampo(el);
    });
    f.addEventListener('input', (e) => {
      if (e.target.id === 'comentario-texto') estado.borradores[estado.fichaId] = e.target.value;
    });
    f.addEventListener('keydown', (e) => {
      if (e.target.id === 'comentario-texto' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) anadirComentario();
    });
    f.addEventListener('click', (e) => {
      if (e.target === f) { cerrarFicha(); return; }
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if ('cerrarFicha' in d) cerrarFicha();
      else if (d.etapaFicha) moverEtapa(estado.fichaId, Number(d.etapaFicha));
      else if (d.pestana) { estado.pestana = d.pestana; pintarFicha(); $('.ficha-cuerpo', f).scrollTop = 0; }
      else if ('nuevoBanco' in d) modalBanco(estado.fichaId);
      else if ('nuevoTitular' in d) anadirTitular();
      else if ('nuevoComentario' in d) anadirComentario();
      else if ('enlace' in d) modalEnlace(opActual());
      else if ('reenviar' in d) modalReenviar(opActual());
      else if ('oferta' in d) modalOferta(opActual());
      else if (d.marcarOferta) accionDirecta('marcar-oferta', { oferta_id: ultimaOferta(estado.fichaId).id, estado: d.marcarOferta }, 'Oferta actualizada');
      else if ('nota' in d) modalNota(opActual());
      else if ('marcarNota' in d) accionDirecta('marcar-nota', { encargo_id: ultimoEncargo(estado.fichaId).id }, 'Nota firmada');
      else if (d.docNoaplica) accionDirecta('documento-no-aplica', { documento_id: d.docNoaplica, no_aplica: true });
      else if (d.docPedir) accionDirecta('documento-no-aplica', { documento_id: d.docPedir, no_aplica: false });
      else if (d.docRechazar) modalRechazar(d.docRechazar);
      else if (d.verPdf) verPdfGuardado(d.verPdf);
      else if ('crearExpediente' in d) accionDirecta('crear-expediente', { operacion_id: estado.fichaId }, 'Expediente creado');
      else if (d.pedirFirma) modalReenviar(opActual(), d.pedirFirma);
      else if (d.completarFirma) {
        const ref = d.completarFirma === 'oferta' ? ultimaOferta(estado.fichaId) : ultimoEncargo(estado.fichaId);
        accionDirecta('completar-firma', { tipo: d.completarFirma, referencia_id: ref.id }, 'PDF firmado guardado en Drive');
      }
      else if ('docNuevo' in d) modalSubirDocumento(opActual());
      else if (d.docSubir) modalSubirDocumento(opActual(), d.docSubir);
      else if (d.docTipo) modalTipoDocumento(d.docTipo);
      else if (d.docQuitar) modalQuitarDocumento(d.docQuitar);
      else if (d.envio) modalEnvio(d.envio);
      else if (d.quitarComentario) {
        confirmar({
          titulo: 'Borrar comentario', texto: 'El comentario se borrará de forma definitiva.', accion: 'Borrar',
          alAceptar: async () => {
            await store.borrar('comentarios', d.quitarComentario);
            estado.coms = estado.coms.filter((x) => x.id !== d.quitarComentario);
            pintarFicha();
          },
        });
      }
      else if ('descartar' in d) modalDescartar(estado.fichaId);
      else if (d.quitarTitular) {
        const t = estado.tits.find((x) => x.id === d.quitarTitular);
        confirmar({
          titulo: 'Quitar cotitular', texto: `Se borrarán los datos de ${nombreDe(t)}.`, accion: 'Quitar',
          alAceptar: async () => {
            await store.borrar('titulares', t.id);
            estado.tits = estado.tits.filter((x) => x.id !== t.id);
            pintarFicha(); pintar();
          },
        });
      } else if (d.quitarBanco) {
        const est = estado.ests.find((x) => x.id === d.quitarBanco);
        confirmar({
          titulo: 'Quitar banco', texto: `Se borrará el estudio de ${est.banco || 'este banco'}.`, accion: 'Quitar',
          alAceptar: async () => {
            await store.borrar('estudios', est.id);
            estado.ests = estado.ests.filter((x) => x.id !== est.id);
            estado.pestana = 'datos';
            pintarFicha();
          },
        });
      }
    });
    f.addEventListener('cancel', (e) => { e.preventDefault(); cerrarFicha(); });
    f.addEventListener('close', () => { estado.fichaId = null; });
  }

  /* ---------- arranque ---------- */
  async function refrescar() {
    const datos = await store.cargar();
    Object.assign(estado, datos);
  }

  async function iniciar() {
    vigilarInactividad();
    pantallaApp();
    $('#contenido').innerHTML = '<p class="vacio">Cargando…</p>';
    activarTablero();
    $('#contenido').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.recuperar) recuperar(b.dataset.recuperar);
      if (b?.dataset.eliminar) eliminar(b.dataset.eliminar);
    });
    try {
      await refrescar();
      pintar();
    } catch (err) {
      console.error(err);
      $('#contenido').innerHTML = '<p class="vacio">No se han podido cargar los datos. Recarga la página.</p>';
    }
  }

  /* Trae los cambios del socio y del portal al volver a la pestaña, sin tocar los campos de una ficha abierta. */
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !estado.usuario || $('#modal').open) return;
    try {
      await refrescar();
      pintar();
      const bloque = $('#bloque-expediente');
      const op = opActual();
      if (bloque && op) bloque.innerHTML = bloqueExpediente(op);
    } catch (err) { console.error(err); }
  });

  async function arrancar() {
    if (!store) {
      $('#app').innerHTML = '<main class="login"><div class="login-card"><h1>Bajo Teja</h1><p class="login-sub">CRM sin configurar</p></div></main>';
      return;
    }
    activarFicha();
    store.alCerrarSesion(() => {
      estado.usuario = null;
      if ($('#modal').open) $('#modal').close();
      pantallaLogin(estado.motivoSalida);
      estado.motivoSalida = '';
    });
    estado.usuario = await store.sesion();
    if (estado.usuario) await iniciar(); else pantallaLogin();
  }

  arrancar();
})();
