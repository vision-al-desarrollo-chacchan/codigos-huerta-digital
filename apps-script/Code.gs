const PLATFORMAS = {
  netflix: { nombre: 'Netflix', consulta: 'from:(netflix.com)', remitentes: ['netflix.com'] },
  disney: { nombre: 'Disney+', consulta: 'from:(disneyplus.com OR disney.com)', remitentes: ['disneyplus.com', 'disney.com'] },
  max: { nombre: 'Max', consulta: 'from:(max.com OR hbomax.com)', remitentes: ['max.com', 'hbomax.com'] },
  prime: { nombre: 'Prime Video', consulta: 'from:(amazon.com OR primevideo.com)', remitentes: ['amazon.com', 'primevideo.com'] },
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
    const hilos = GmailApp.search(plataforma.consulta + ' newer_than:1d', 0, 20);
    const mensajes = [];
    hilos.forEach(function (hilo) { hilo.getMessages().forEach(function (mensaje) { mensajes.push(mensaje); }); });
    mensajes.sort(function (a, b) { return b.getDate().getTime() - a.getDate().getTime(); });
    for (const mensaje of mensajes) {
      if (Date.now() - mensaje.getDate().getTime() > 30 * 60 * 1000) continue;
      const remitente = mensaje.getFrom().toLowerCase();
      const destinatarios = (mensaje.getTo() + ',' + mensaje.getCc()).toLowerCase();
      const remitenteValido = plataforma.remitentes.some(function (dominio) { return remitente.includes(dominio); });
      if (!remitenteValido || !destinatarios.includes(correo)) continue;
      const texto = mensaje.getSubject() + '\n' + mensaje.getPlainBody();
      if (/restablecer|recuperar|contraseña|password reset|factura|pago|promoción|oferta|profile has been updated|perfil ha sido actualizado/i.test(texto)) continue;
      const encontrado = texto.match(/(?:tu código de acceso único|código de acceso temporal|código de inicio de sesión|ingresa este código|código de verificación|verification code|login code|access code|one.time code)[\s\S]{0,300}?\b(\d{4}|\d{6})\b/i);
      if (encontrado) return respuesta({ ok: true, code: encontrado[1], messageId: mensaje.getId(), platform: plataforma.nombre });
    }
    return respuesta({ ok: false, message: 'No encontramos un código reciente para esa cuenta.' });
  } catch (error) {
    return respuesta({ ok: false, message: 'No se pudo consultar Gmail.' });
  }
}

function respuesta(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

function probarConfiguracion() {
  const token = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
  console.log(token ? 'Token configurado correctamente.' : 'Falta configurar PANEL_TOKEN.');
}
