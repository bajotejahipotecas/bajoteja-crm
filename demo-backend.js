/* Servidor simulado para la demo local. Datos inventados en este navegador:
   no envía emails, no crea carpetas y no se usa en producción.
   Reproduce las mismas reglas que supabase/functions. */
(function () {
  'use strict';
  const CLAVE = 'bajoteja_crm_demo_v3';
  const ahora = () => new Date().toISOString();
  const uuid = () => crypto.randomUUID();

  function leer() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(CLAVE)); } catch { /* sin almacenamiento */ }
    if (!db) { db = semilla(); guardar(db); }
    return db;
  }
  function guardar(db) {
    try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* sin almacenamiento */ }
  }
  function conDb(fn) {
    const db = leer();
    const r = fn(db);
    guardar(db);
    return r;
  }

  const tituLaresOp = (db, id) => db.tits.filter((t) => t.operacion_id === id).sort((a, b) => a.orden - b.orden);
  const nombre = (t) => [t.nombre, t.apellidos].filter(Boolean).join(' ');
  const importe = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2 }).format(n);
  const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  function correo(db, op, titular, tipo, asunto, cuerpo, extra = {}) {
    db.envios.push({
      id: uuid(), operacion_id: op.id, titular_id: titular?.id || null, tipo,
      para: titular?.email || 'expedientes@grupobajoteja.com', asunto, cuerpo,
      adjunto: null, estado: 'enviado', error: null, created_at: ahora(), ...extra,
    });
  }

  function crearEnlaces(db, op) {
    tituLaresOp(db, op.id).forEach((t) => {
      db.enlaces.filter((e) => e.titular_id === t.id).forEach((e) => { e.revocado = true; });
      const token = uuid().replaceAll('-', '');
      db.enlaces.push({ id: uuid(), operacion_id: op.id, titular_id: t.id, token, revocado: false });
      correo(db, op, t, 'enlace', `Tu documentación · Expediente ${op.expediente}`,
        `Hola ${t.nombre}:\n\nPara estudiar tu hipoteca necesitamos tu documentación. Entra en tu enlace personal, sube los archivos, revísalos y apruébalos cuando estén correctos.\n\nEl enlace es personal y caduca en 30 días.\n\nBajo Teja`,
        { enlace_demo: token });
    });
  }

  function asegurarExpediente(db, op) {
    if (op.expediente) return;
    const t = tituLaresOp(db, op.id)[0];
    const anio = new Date().getFullYear();
    db.contadores[anio] = (db.contadores[anio] || 0) + 1;
    op.expediente = String(anio % 100).padStart(2, '0') + String(db.contadores[anio]).padStart(3, '0');
    op.alias = op.alias || sinAcentos(((t?.apellidos || t?.nombre || 'CLIENTE').trim().split(/\s+/)[0])).toUpperCase();
    op.drive_folder_id = null;
  }

  const importeTexto = (o) => `${importe(o.honorarios)} € (${o.iva_incluido ? 'IVA incluido' : `IVA no incluido, ${o.iva_pct} %`})`;

  function lineasOferta(db, op, o) {
    return [
      `Propuesta de servicios · Expediente ${op.expediente}`,
      'DEMO: documento simulado. El real sale de la plantilla de Google Docs.',
      '',
      ...tituLaresOp(db, op.id).map((t) => `Solicitante: ${nombre(t)}`),
      `Tipo de financiación: ${op.tipo_financiacion || '-'}`,
      `Finalidad: ${op.finalidad || '-'}`,
      `Importe aproximado: ${op.importe_solicitado ? `${importe(op.importe_solicitado)} €` : '-'}`,
      `Honorarios: ${importeTexto(o)}`,
      ...(o.mensaje ? ['', o.mensaje] : []),
    ];
  }

  function lineasNota(db, op, e, o) {
    return [
      `Nota de Encargo · Expediente ${op.expediente}`,
      'DEMO: documento simulado. El real sale de la plantilla de Google Docs.',
      '',
      `Lugar: ${e.lugar}`,
      ...tituLaresOp(db, op.id).map((t) => `Solicitante: ${nombre(t)} · DNI ${t.dni || '-'}`),
      `Intermediario: ${db.empresa.razon_social || '-'} · ${db.empresa.cif || '-'}`,
      `Honorarios: ${importeTexto(o)}`,
      `Pago antes de firma: ${e.plazo_pago_dias} días · Desistimiento tras tasación: ${e.pct_desistimiento} %`,
      `Plazo de desistimiento: ${e.dias_desistimiento} días`,
    ];
  }

  function nuevaOferta(db, { operacion_id, honorarios, iva_incluido, iva_pct, mensaje }, canal) {
    const op = db.ops.find((o) => o.id === operacion_id);
    asegurarExpediente(db, op);
    const o = {
      id: uuid(), operacion_id, honorarios, iva_incluido, iva_pct, mensaje: mensaje || null,
      estado: 'enviada', canal, via: null, created_at: ahora(),
    };
    db.ofertas.push(o);
    if (op.etapa < 3) op.etapa = 3;
    return { op, o };
  }

  function nuevaNota(db, { operacion_id, lugar, plazo_pago_dias, pct_desistimiento, dias_desistimiento }, canal) {
    const op = db.ops.find((x) => x.id === operacion_id);
    const oferta = db.ofertas.filter((x) => x.operacion_id === operacion_id).at(-1);
    if (oferta?.estado !== 'aceptada') throw new Error('La oferta debe estar aceptada');
    const e = {
      id: uuid(), operacion_id, oferta_id: oferta.id, lugar, plazo_pago_dias, pct_desistimiento,
      dias_desistimiento, estado: 'enviada', canal, created_at: ahora(),
    };
    db.encargos.push(e);
    return { op, e, oferta };
  }

  function docVivo(db, titular_id, tipo, excepto) {
    return db.docs.find((d) => d.titular_id === titular_id && d.tipo === tipo && d.estado !== 'sustituido' && d.id !== excepto);
  }

  const ACCIONES = {
    'crear-expediente'(db, { operacion_id }) {
      const op = db.ops.find((o) => o.id === operacion_id);
      asegurarExpediente(db, op);
      return { expediente: op.expediente, alias: op.alias, avisos: [] };
    },
    'generar-oferta'(db, datos) {
      const { op, o } = nuevaOferta(db, datos, 'manual');
      o.pdf_drive_id = null;
      return { oferta_id: o.id, id_pdf: o.id, nombre: `${op.expediente} - Oferta.pdf`, lineas: lineasOferta(db, op, o) };
    },
    'generar-nota'(db, datos) {
      const { op, e, oferta } = nuevaNota(db, datos, 'manual');
      return { encargo_id: e.id, id_pdf: e.id, nombre: `${op.expediente} - Nota de Encargo.pdf`, lineas: lineasNota(db, op, e, oferta) };
    },
    'subir-documento'(db, { operacion_id, titular_id, tipo, documento_id, archivo_nombre }) {
      const op = db.ops.find((o) => o.id === operacion_id);
      asegurarExpediente(db, op);
      const nombreArchivo = archivo_nombre.replace(/\.docx?$/i, '.pdf');
      const comun = { estado: 'aprobado', origen: 'gestor', archivo_nombre: nombreArchivo, aprobado_at: ahora() };
      const previo = documento_id && db.docs.find((d) => d.id === documento_id);
      if (previo && (previo.estado === 'pendiente' || previo.estado === 'no_aplica')) {
        Object.assign(previo, comun);
        return { ...previo };
      }
      if (previo) {
        previo.estado = 'sustituido';
        const nuevo = { id: uuid(), operacion_id, titular_id: previo.titular_id, tipo: previo.tipo, version: previo.version + 1, created_at: ahora(), ...comun };
        db.docs.push(nuevo);
        return { ...nuevo };
      }
      if (docVivo(db, titular_id, tipo)) throw new Error(`Ya hay un documento "${tipo}" para este titular. Usa Sustituir.`);
      const nuevo = { id: uuid(), operacion_id, titular_id, tipo, version: 1, created_at: ahora(), ...comun };
      db.docs.push(nuevo);
      return { ...nuevo };
    },
    'quitar-documento'(db, { documento_id, motivo }) {
      const d = db.docs.find((x) => x.id === documento_id);
      if (d.estado === 'pendiente') d.estado = 'no_aplica';
      else Object.assign(d, { estado: 'sustituido', motivo: motivo || null });
      return {};
    },
    'cambiar-tipo-documento'(db, { documento_id, tipo }) {
      const d = db.docs.find((x) => x.id === documento_id);
      if (docVivo(db, d.titular_id, tipo, d.id)) throw new Error(`Ya hay un documento "${tipo}" para este titular`);
      d.tipo = tipo;
      return {};
    },
    'enviar-enlace'(db, { operacion_id, documentos }) {
      const op = db.ops.find((o) => o.id === operacion_id);
      const tits = tituLaresOp(db, op.id);
      const sinEmail = tits.filter((t) => !t.email);
      if (sinEmail.length) throw new Error(`Falta el email de ${sinEmail.map(nombre).join(', ')}`);
      asegurarExpediente(db, op);
      documentos.forEach(({ titular_id, tipo }) => {
        const existe = db.docs.some((d) => d.titular_id === titular_id && d.tipo === tipo && d.estado !== 'sustituido');
        if (!existe) {
          db.docs.push({ id: uuid(), operacion_id: op.id, titular_id, tipo, estado: 'pendiente', version: 1, created_at: ahora() });
        }
      });
      crearEnlaces(db, op);
      if (op.etapa === 1) op.etapa = 2;
      return { expediente: op.expediente, alias: op.alias, avisos: [] };
    },
    'reenviar-enlace'(db, { operacion_id }) {
      crearEnlaces(db, db.ops.find((o) => o.id === operacion_id));
      return {};
    },
    'documento-no-aplica'(db, { documento_id, no_aplica }) {
      const d = db.docs.find((x) => x.id === documento_id);
      if (d.estado === 'aprobado') throw new Error('Un documento aprobado no se puede cambiar');
      d.estado = no_aplica ? 'no_aplica' : 'pendiente';
      return {};
    },
    'rechazar-documento'(db, { documento_id, motivo }) {
      const d = db.docs.find((x) => x.id === documento_id);
      d.estado = 'sustituido';
      db.docs.push({
        id: uuid(), operacion_id: d.operacion_id, titular_id: d.titular_id, tipo: d.tipo,
        estado: 'pendiente', version: d.version + 1, motivo, created_at: ahora(),
      });
      const op = db.ops.find((o) => o.id === d.operacion_id);
      const t = db.tits.find((x) => x.id === d.titular_id);
      correo(db, op, t, 'documento_rechazado', `Necesitamos de nuevo: ${d.tipo}`,
        `Hola ${t.nombre}:\n\nNecesitamos que vuelvas a subir "${d.tipo}".\nMotivo: ${motivo}\n\nUsa el mismo enlace personal.\n\nBajo Teja`);
      return {};
    },
    'enviar-oferta'(db, datos) {
      const sinEmail = tituLaresOp(db, datos.operacion_id).filter((t) => !t.email);
      if (sinEmail.length) throw new Error(`Falta el email de ${sinEmail.map(nombre).join(', ')}`);
      const { op, o } = nuevaOferta(db, datos, 'email');
      tituLaresOp(db, op.id).forEach((t) => correo(db, op, t, 'oferta', `Tu propuesta · Expediente ${op.expediente}`,
        `Hola ${t.nombre}:\n\nTe adjuntamos nuestra propuesta de servicios. Honorarios: ${importeTexto(o)}.\n\nPuedes aceptarla o rechazarla desde tu enlace personal.\n\nBajo Teja`,
        { adjunto: `${op.expediente} - Oferta.pdf` }));
      return { id_pdf: o.id, lineas: lineasOferta(db, op, o) };
    },
    'marcar-oferta'(db, { oferta_id, estado }) {
      const o = db.ofertas.find((x) => x.id === oferta_id);
      Object.assign(o, { estado, via: 'manual', respondida_at: ahora() });
      return {};
    },
    'enviar-nota'(db, datos) {
      const { op, e, oferta } = nuevaNota(db, datos, 'email');
      const r = { id_pdf: e.id, lineas: lineasNota(db, op, e, oferta) };
      tituLaresOp(db, op.id).forEach((t) => correo(db, op, t, 'nota', `Nota de Encargo · Expediente ${op.expediente}`,
        `Hola ${t.nombre}:\n\nTe adjuntamos la Nota de Encargo para tu firma.\n\nBajo Teja`,
        { adjunto: `${op.expediente} - Nota de Encargo.pdf` }));
      return r;
    },
    'marcar-nota'(db, { encargo_id }) {
      const e = db.encargos.find((x) => x.id === encargo_id);
      Object.assign(e, { estado: 'firmada', firmado_at: ahora() });
      const op = db.ops.find((o) => o.id === e.operacion_id);
      if (op.etapa < 4) op.etapa = 4;
      return {};
    },
  };

  function enlaceValido(db, token) {
    const e = db.enlaces.find((x) => x.token === token && !x.revocado);
    if (!e) throw new Error('Enlace no válido o caducado');
    return e;
  }

  function avisarSiListo(db, op) {
    const docs = db.docs.filter((d) => d.operacion_id === op.id);
    const quedan = docs.some((d) => d.estado === 'pendiente' || d.estado === 'subido');
    if (!quedan && !db.envios.some((m) => m.operacion_id === op.id && m.tipo === 'aviso_listo')) {
      correo(db, op, null, 'aviso_listo', `Expediente ${op.expediente} listo para oferta`,
        'El cliente ha aprobado toda la documentación.');
    }
  }

  const PORTAL = {
    estado(db, { token }) {
      const e = enlaceValido(db, token);
      const op = db.ops.find((o) => o.id === e.operacion_id);
      const t = db.tits.find((x) => x.id === e.titular_id);
      const oferta = db.ofertas.filter((o) => o.operacion_id === op.id).at(-1) || null;
      return {
        expediente: op.expediente,
        titular: { nombre: t.nombre },
        documentos: db.docs.filter((d) => d.titular_id === t.id && d.estado !== 'sustituido'),
        oferta,
      };
    },
    subir(db, { token, documento_id, archivo_nombre }) {
      const e = enlaceValido(db, token);
      const d = db.docs.find((x) => x.id === documento_id && x.titular_id === e.titular_id);
      if (!d || !['pendiente', 'subido'].includes(d.estado)) throw new Error('Este documento ya no se puede cambiar');
      Object.assign(d, { estado: 'subido', archivo_nombre });
      return {};
    },
    quitar(db, { token, documento_id }) {
      const e = enlaceValido(db, token);
      const d = db.docs.find((x) => x.id === documento_id && x.titular_id === e.titular_id);
      if (d?.estado !== 'subido') throw new Error('Este documento ya no se puede cambiar');
      Object.assign(d, { estado: 'pendiente', archivo_nombre: null });
      return {};
    },
    aprobar(db, { token, documento_ids }) {
      const e = enlaceValido(db, token);
      documento_ids.forEach((id) => {
        const d = db.docs.find((x) => x.id === id && x.titular_id === e.titular_id);
        if (d?.estado === 'subido') Object.assign(d, { estado: 'aprobado', aprobado_at: ahora() });
      });
      avisarSiListo(db, db.ops.find((o) => o.id === e.operacion_id));
      return {};
    },
    'responder-oferta'(db, { token, oferta_id, respuesta }) {
      const e = enlaceValido(db, token);
      const o = db.ofertas.find((x) => x.id === oferta_id && x.operacion_id === e.operacion_id);
      if (o?.estado !== 'enviada') throw new Error('Esta oferta ya está respondida');
      Object.assign(o, { estado: respuesta, via: 'portal', respondida_por: e.titular_id, respondida_at: ahora() });
      return {};
    },
  };

  function semilla() {
    const dni = (n) => n + 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(n) % 23];
    const haceDias = (d) => new Date(Date.now() - d * 86400000).toISOString();
    const base = [
      [1, 'Primera vivienda en Getafe, pareja con ahorro del 20%', 'Comunidad de Madrid', 245000, [['Marta', 'Ruiz Peña'], ['Daniel', 'Soto Vega']], 'Primera llamada hecha, quiere empezar ya'],
      [1, 'Inversión piso pequeño para alquilar en Valencia', 'Comunitat Valenciana', 138000, [['Iván', 'Crespo Mora']], 'Pendiente de primera llamada'],
      [2, 'Compra adosado, falta vida laboral y nóminas', 'Andalucía', 212000, [['Lucía', 'Navas Gil'], ['Pablo', 'Rey Ortega']], 'Reclamar vida laboral'],
      [2, 'Cambio de vivienda con venta simultánea de la actual', 'Cataluña', 389000, [['Nuria', 'Ferrer Puig']], 'Documentación completa'],
      [3, 'Hipoteca 90% con aval familiar, oferta enviada', 'Región de Murcia', 176000, [['Sergio', 'Lara Paz'], ['Elena', 'Vidal Cano']], 'Esperando respuesta a la oferta'],
      [4, 'Nota firmada, pendiente de pre-valores en tres entidades', 'Comunidad de Madrid', 415000, [['Carlos', 'Mena Ríos'], ['Ana', 'Duarte Sanz']], 'Pedir pre-valor a Bankinter'],
      [5, 'Primera vivienda joven con garantía ICO', 'Galicia', 158000, [['Hugo', 'Paredes Lago']], 'Respuesta de Abanca'],
      [5, 'Vivienda habitual, dos sueldos fijos, tres bancos en estudio', 'Comunidad de Madrid', 325000, [['Inés', 'Bravo León'], ['Tomás', 'Quiroga Haro']], 'Enviar nóminas de octubre a Sabadell'],
      [6, 'FEIN de Santander aceptada, pendiente cobrar honorarios', 'Aragón', 198000, [['Raúl', 'Esteve Marín']], 'Emitir factura de honorarios'],
      [7, 'Firma prevista en notaría, subsanar nota simple', 'Illes Balears', 472000, [['Clara', 'Aguilar Roig'], ['Marc', 'Serra Coll']], 'Confirmar hora con notaría'],
      [8, 'Firmada en notaría, operación cerrada', 'Castilla y León', 142000, [['Javier', 'Pinto Gallo']], null],
    ];
    const db = {
      ops: [], tits: [], ests: [], coms: [], docs: [], ofertas: [], encargos: [], envios: [], enlaces: [],
      contadores: { [new Date().getFullYear()]: 8 },
      empresa: {
        razon_social: 'Empresa de demostración SL', cif: 'B00000000', num_registro: 'DEMO-0000',
        domicilio: 'Calle Ejemplo 1, 28001 Madrid', representante: 'Nombre del representante', ciudad: 'Madrid',
      },
    };
    base.forEach(([etapa, descripcion, comunidad, precio, personas, nota], i) => {
      const id = uuid();
      const op = {
        id, etapa, descripcion, comunidad, precio_compraventa: precio,
        arras_entregadas: etapa >= 3 ? 6000 : null, itp: 6, valor_tasacion: precio,
        honorarios_cobrados: etapa >= 7, descartada: false, motivo_descarte: null,
        tipo_financiacion: 'Préstamo hipotecario', finalidad: 'Adquisición de vivienda',
        inmueble: etapa >= 3 ? 'Calle Inventada 12, 3º B' : null,
        importe_solicitado: Math.round(precio * 0.8),
        created_at: haceDias(20 - i),
      };
      if (i >= 2 && i <= 5) { op.expediente = `2600${i + 2}`; op.alias = personas[0][1].split(' ')[0].toUpperCase(); }
      db.ops.push(op);
      if (nota) db.coms.push({ id: uuid(), operacion_id: id, texto: nota, autor: 'demo@local', created_at: haceDias(3) });
      if (i === 0) {
        db.coms.push({
          id: uuid(), operacion_id: id, autor: 'demo@local', created_at: haceDias(1),
          texto: 'Me comenta que su hermana también busca piso y quiere asesoría.',
        });
      }
      personas.forEach(([n, apellidos], j) => {
        const tid = uuid();
        db.tits.push({
          id: tid, operacion_id: id, orden: j + 1, nombre: n, apellidos,
          dni: dni(String(10000000 + i * 137911 + j * 7001)),
          email: `${sinAcentos(n).toLowerCase()}@ejemplo.test`, telefono: `600 000 ${String(100 + i * 10 + j)}`,
          domicilio: 'Calle Inventada 1, 28001 Madrid', perfil_laboral: 'Asalariado',
          fecha_nacimiento: `19${84 + (i % 9)}-0${1 + j}-1${i % 9}`,
          antiguedad_laboral: `201${i % 9}-09-01`, anios_cotizados: 8 + i, ingresos_mensuales: 2100 + i * 90,
          num_pagas: j ? 12 : 14, estado_civil: personas.length > 1 ? 'Casado/a (gananciales)' : 'Soltero/a',
          num_hijos: i % 3, prestamos_cuota: i % 4 === 0 ? 180 : null,
          prestamos_detalle: i % 4 === 0 ? 'Coche, 22 meses restantes' : null,
        });
        if (i >= 2 && i <= 5) {
          ['DNI / NIE', '3 últimas nóminas', 'Vida laboral'].forEach((tipo, k) => db.docs.push({
            id: uuid(), operacion_id: id, titular_id: tid, tipo, version: 1, created_at: haceDias(5),
            estado: i === 2 && k === 2 ? 'pendiente' : 'aprobado',
            archivo_nombre: i === 2 && k === 2 ? null : `${tipo}.pdf`,
          }));
        }
      });
      if (i === 4 || i === 5) {
        const oferta = {
          id: uuid(), operacion_id: id, honorarios: 2500, iva_incluido: false, iva_pct: 21, mensaje: null,
          estado: i === 4 ? 'enviada' : 'aceptada', via: i === 4 ? null : 'portal', created_at: haceDias(4),
        };
        db.ofertas.push(oferta);
        if (i === 5) {
          db.encargos.push({
            id: uuid(), operacion_id: id, oferta_id: oferta.id, lugar: 'Madrid', plazo_pago_dias: 3,
            pct_desistimiento: 50, dias_desistimiento: 14, estado: 'firmada', firmado_at: haceDias(2), created_at: haceDias(3),
          });
        }
      }
      if (etapa >= 5) {
        const bancos = etapa === 5 && personas.length > 1
          ? [['Sabadell', 'En análisis'], ['Bankinter', 'Aprobado'], ['BBVA', 'Enviado']]
          : [['Abanca', 'En análisis'], ['Santander', etapa > 5 ? 'FEIN emitida' : 'Enviado']];
        bancos.forEach(([banco, estado], k) => db.ests.push({
          id: uuid(), operacion_id: id, banco, estado, tipo_interes: 'Fijo',
          interes: Number((2.35 + k * 0.15).toFixed(2)), duracion_anios: 30, cuota_mensual: Math.round(precio * 0.0034),
          bonificaciones: 'Nómina, seguro de hogar y seguro de vida', created_at: haceDias(2),
        }));
      }
    });
    return db;
  }

  /* Los PDF de la demo se guardan en este navegador para verlos desde el portal y desde el CRM. */
  function almacenPdf(modo, fn) {
    return new Promise((ok, mal) => {
      const apertura = indexedDB.open('bajoteja_crm_demo_pdf', 1);
      apertura.onupgradeneeded = () => apertura.result.createObjectStore('pdf');
      apertura.onerror = () => mal(apertura.error);
      apertura.onsuccess = () => {
        const peticion = fn(apertura.result.transaction('pdf', modo).objectStore('pdf'));
        peticion.onsuccess = () => ok(peticion.result);
        peticion.onerror = () => mal(peticion.error);
      };
    });
  }

  window.DemoBackend = {
    guardarPdf: (id, blob) => almacenPdf('readwrite', (s) => s.put(blob, id)),
    leerPdf: (id) => almacenPdf('readonly', (s) => s.get(id)),
    borrarPdf: (id) => almacenPdf('readwrite', (s) => s.delete(id)),
    leer,
    conDb,
    crm: (accion, datos) => conDb((db) => ACCIONES[accion](db, datos)),
    portal: (accion, datos) => conDb((db) => PORTAL[accion](db, datos)),
  };
})();
