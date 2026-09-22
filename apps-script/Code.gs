const PLATFORMAS = {
  netflix: { nombre: 'Netflix', consulta: 'from:(netflix.com)', remitentes: ['netflix.com'] },
  disney: { nombre: 'Disney+', consulta: 'from:(disneyplus.com OR disney.com)', remitentes: ['disneyplus.com', 'disney.com'] },
  max: { nombre: 'Max', consulta: 'from:(no-reply@alerts.hbomax.com OR hbomax.com OR max.com)', remitentes: ['alerts.hbomax.com', 'hbomax.com', 'max.com'] },
  prime: { nombre: 'Prime Video', consulta: 'from:(account-update@amazon.com OR amazon.com OR primevideo.com)', remitentes: ['amazon.com', 'primevideo.com'] },
  apple: { nombre: 'Apple TV+', consulta: 'from:(apple.com)', remitentes: ['apple.com'] }
};

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents || '{}');
    const tokenGuardado = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
    if (!tokenGuardado || datos.token !== tokenGuardado) return respuesta({ ok: false, message: 'Solicitud no autorizada.' });
    const correo = String(datos.email || '').trim().toLowerCase();
    const plataformaId = String(datos.platform || '').trim().toLowerCase();
    const plataforma = PLATFORMAS[plataformaId];
    if (!/^\S+@\S+\.\S+$/.test(correo) || !plataforma) return respuesta({ ok: false, message: 'Correo o plataforma inválidos.' });
    const consulta = plataformaId === 'netflix'
      ? 'from:(info@account.netflix.com) newer_than:1d {subject:"Tu código de acceso temporal" subject:"Importante: Cómo cambiar tu hogar Netflix"}'
      : plataforma.consulta + ' newer_than:1d';
    const hilos = GmailApp.search(consulta, 0, plataformaId === 'netflix' ? 10 : 30);
    const mensajes = [];
    const accionesNetflixSinCuentaVisible = [];
    let encontroCorreoNetflix = false;
    hilos.forEach(function (hilo) { hilo.getMessages().forEach(function (mensaje) { mensajes.push(mensaje); }); });
    mensajes.sort(function (a, b) { return b.getDate().getTime() - a.getDate().getTime(); });
    for (const mensaje of mensajes) {
      if (Date.now() - mensaje.getDate().getTime() > 30 * 60 * 1000) continue;
      const remitente = mensaje.getFrom().toLowerCase();
      const asunto = mensaje.getSubject() || '';
      const cuerpoPlano = mensaje.getPlainBody() || '';
      const cuerpoHtml = mensaje.getBody() || '';
      const destinatarios = (mensaje.getTo() + ',' + mensaje.getCc()).toLowerCase();
      const remitenteValido = plataforma.remitentes.some(function (dominio) { return remitente.includes(dominio); });
      // En mensajes reenviados, el destinatario original puede aparecer solamente
      // dentro del cuerpo y no en los encabezados To/Cc del Gmail central.
      const referenciaCuenta = (destinatarios + '\n' + asunto + '\n' + cuerpoPlano + '\n' + cuerpoHtml).toLowerCase();
      if (!remitenteValido) continue;
      const texto = asunto + '\n' + cuerpoPlano + '\n' + limpiarHtml(cuerpoHtml);
      if (/restablecer|recuperar|contraseña|password reset|factura|pago|promoción|oferta|profile has been updated|perfil ha sido actualizado/i.test(texto)) continue;
      const esAccesoTemporalNetflix = plataformaId === 'netflix' && /tu c[oó]digo de acceso temporal/i.test(asunto + '\n' + texto);
      const esCambioHogarNetflix = plataformaId === 'netflix' && /(?:importante:\s*)?c[oó]mo cambiar tu hogar Netflix|cambiemos tu hogar Netflix/i.test(asunto + '\n' + texto);
      if (esAccesoTemporalNetflix || esCambioHogarNetflix) encontroCorreoNetflix = true;
      if (!referenciaCuenta.includes(correo)) {
        // Algunos reenvíos de Netflix eliminan el destinatario original. Solo se
        // admite el respaldo si existe una única solicitud muy reciente, evitando
        // entregar el enlace equivocado cuando hay varias solicitudes simultáneas.
        if ((esAccesoTemporalNetflix || esCambioHogarNetflix) && Date.now() - mensaje.getDate().getTime() <= 10 * 60 * 1000) {
          const tipoRespaldo = esCambioHogarNetflix ? 'household' : 'temporary_access';
          const enlaceRespaldo = extraerEnlaceNetflix(cuerpoHtml, tipoRespaldo);
          if (enlaceRespaldo) accionesNetflixSinCuentaVisible.push({ enlace: enlaceRespaldo, id: mensaje.getId(), tipo: tipoRespaldo });
        }
        continue;
      }
      if (esAccesoTemporalNetflix) {
        const enlace = extraerEnlaceNetflix(cuerpoHtml, 'temporary_access');
        if (enlace) return respuesta({ ok: true, actionUrl: enlace, actionType: 'temporary_access', messageId: mensaje.getId(), platform: plataforma.nombre });
      }
      if (esCambioHogarNetflix) {
        const enlaceHogar = extraerEnlaceNetflix(cuerpoHtml, 'household');
        if (enlaceHogar) return respuesta({ ok: true, actionUrl: enlaceHogar, actionType: 'household', messageId: mensaje.getId(), platform: plataforma.nombre });
      }
      const codigo = extraerCodigo(texto, plataformaId);
      if (codigo) return respuesta({ ok: true, code: codigo, messageId: mensaje.getId(), platform: plataforma.nombre });
    }
    if (accionesNetflixSinCuentaVisible.length === 1) {
      return respuesta({ ok: true, actionUrl: accionesNetflixSinCuentaVisible[0].enlace, actionType: accionesNetflixSinCuentaVisible[0].tipo, messageId: accionesNetflixSinCuentaVisible[0].id, platform: plataforma.nombre });
    }
    if (accionesNetflixSinCuentaVisible.length > 1) {
      return respuesta({ ok: false, message: 'Encontramos varias solicitudes recientes de Netflix. Solicita un código nuevo y vuelve a intentar.' });
    }
    if (encontroCorreoNetflix) {
      return respuesta({ ok: false, message: 'Encontramos el correo de Netflix, pero no pudimos leer el botón Obtener código.' });
    }
    return respuesta({ ok: false, message: plataformaId === 'netflix' ? 'No encontramos el correo reciente en el Gmail conectado al sistema.' : 'No encontramos un código reciente para esa cuenta.' });
  } catch (error) {
    return respuesta({ ok: false, message: 'No se pudo consultar Gmail.' });
  }
}

function extraerEnlaceNetflix(html, tipo) {
  const contenido = String(html || '');
  const enlaces = contenido.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  for (let i = 0; i < enlaces.length; i++) {
    const etiqueta = limpiarHtml(enlaces[i]);
    const etiquetaValida = tipo === 'household'
      ? /s[ií],?\s*lo solicit[eé] yo/i.test(etiqueta)
      : /obtener c[oó]digo/i.test(etiqueta);
    if (!etiquetaValida) continue;
    const coincidencia = enlaces[i].match(/href\s*=\s*["']([^"']+)["']/i);
    if (!coincidencia) continue;
    const enlace = decodificarHtml(coincidencia[1]);
    if (esEnlaceNetflixSeguro(enlace)) return enlace;
  }
  return '';
}

function decodificarHtml(valor) {
  return String(valor || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function esEnlaceNetflixSeguro(valor) {
  try {
    const url = new URL(valor);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'netflix.com' || host.endsWith('.netflix.com'));
  } catch (error) {
    return false;
  }
}

function limpiarHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&aacute;|&#225;/gi, 'á')
    .replace(/&eacute;|&#233;/gi, 'é')
    .replace(/&iacute;|&#237;/gi, 'í')
    .replace(/&oacute;|&#243;/gi, 'ó')
    .replace(/&uacute;|&#250;/gi, 'ú')
    .replace(/\s+/g, ' ');
}

function extraerCodigo(texto, plataformaId) {
  const contenido = String(texto || '').replace(/\u00a0/g, ' ');
  const numero = '(\\d(?:[\\s-]?\\d){3,5})';
  const palabrasComunes = '(?:c[oó]digo(?: de acceso)?(?: único| temporal| de inicio de sesi[oó]n| de verificaci[oó]n| de un solo uso)?|verification code|login code|access code|one[ .-]?time code|one[ .-]?time passcode|sign[ .-]?in code)';
  const palabrasNetflix = '(?:c[oó]digo de Netflix|Netflix code|usa este c[oó]digo|use this code|ingresa este c[oó]digo|enter this code)';
  const palabrasMax = '(?:tu c[oó]digo de un solo uso|c[oó]digo de un solo uso|one[ .-]?time code)';
  const palabrasPrime = '(?:tu c[oó]digo de verificaci[oó]n(?: es)?|c[oó]digo de verificaci[oó]n|verification code|sign[ .-]?in code)';
  const palabras = plataformaId === 'netflix'
    ? '(?:' + palabrasComunes + '|' + palabrasNetflix + ')'
    : plataformaId === 'max'
      ? '(?:' + palabrasComunes + '|' + palabrasMax + ')'
      : plataformaId === 'prime'
        ? '(?:' + palabrasComunes + '|' + palabrasPrime + ')'
        : palabrasComunes;
  const patrones = [
    new RegExp(palabras + '[\\s\\S]{0,400}?' + numero, 'i'),
    new RegExp(numero + '[\\s\\S]{0,160}?' + palabras, 'i')
  ];

  for (let i = 0; i < patrones.length; i++) {
    const coincidencia = contenido.match(patrones[i]);
    if (!coincidencia) continue;
    const candidato = coincidencia[1].replace(/\D/g, '');
    if (candidato.length === 4 || candidato.length === 6) return candidato;
  }

  // Respaldo exclusivo para Netflix: algunos correos nuevos muestran el código
  // como un bloque aislado sin una etiqueta reconocible en el cuerpo de texto.
  if (plataformaId === 'netflix') {
    const candidatos = contenido.match(/\b\d(?:[\s-]?\d){3,5}\b/g) || [];
    const validos = candidatos.map(function (valor) { return valor.replace(/\D/g, ''); })
      .filter(function (valor) { return valor.length === 4 || valor.length === 6; })
      .filter(function (valor) { return !/^20\d{2}$/.test(valor); });
    if (validos.length === 1) return validos[0];
  }
  return '';
}

function respuesta(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

function probarConfiguracion() {
  const token = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
  console.log(token ? 'Token configurado correctamente.' : 'Falta configurar PANEL_TOKEN.');
}

function diagnosticarNetflix() {
  const gmailConectado = Session.getEffectiveUser().getEmail() || '(Google no mostró el correo)';
  const hilos = GmailApp.search('from:(info@account.netflix.com) newer_than:1d', 0, 10);
  const resultados = [];
  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (mensaje) {
      if (Date.now() - mensaje.getDate().getTime() <= 24 * 60 * 60 * 1000) {
        resultados.push({ fecha: mensaje.getDate(), asunto: mensaje.getSubject() || '(sin asunto)' });
      }
    });
  });
  resultados.sort(function (a, b) { return b.fecha.getTime() - a.fecha.getTime(); });
  console.log('Gmail conectado al Apps Script: ' + gmailConectado);
  console.log('Correos recientes de Netflix encontrados: ' + resultados.length);
  resultados.slice(0, 10).forEach(function (item, indice) {
    console.log((indice + 1) + '. ' + item.fecha + ' | ' + item.asunto);
  });
  if (!resultados.length) console.log('CAUSA PROBABLE: el correo llegó a otro Gmail o el remitente no coincide con info@account.netflix.com.');
}
