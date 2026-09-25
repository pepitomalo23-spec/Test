/* Notas propias de cada pregunta (texto e imágenes). */

/* Tarjeta de "nuestra" nota (texto y/o hasta 5 imágenes escritas/subidas a
   mano por vosotros, no generadas por IA). Mismo hueco que ocupaba antes
   solo la IA, pero con su propio botón "Nota": en cuanto alguien escribe
   texto o sube una imagen, ese botón desaparece y en su lugar queda esta
   tarjeta siempre visible (con lápiz para editar y aspa para quitarla del
   todo). Las imágenes se muestran todas, una debajo de otra. */
function ownNoteCardHtml(note, questionId){
  if(!note) return '';
  const images = ownNoteImageUrls(note);
  const textHtml = note.text ? '<div class="own-note-text">' + esc(note.text) + '</div>' : '';
  const imagesHtml = images.length
    ? '<div class="own-note-image-wrap">' +
        images.map(url => '<img class="own-note-image" src="' + esc(url) + '" alt="Imagen añadida por vosotros" onclick="event.stopPropagation();openImageLightbox(\'' + esc(url) + '\')">').join('') +
      '</div>'
    : '';
  return '<div class="own-note-card">' +
    '<div class="own-note-label">' +
      '<span class="own-note-icon-badge">' + ICONS.pencil + '</span><span>Nuestra explicación</span>' +
      '<button type="button" class="own-note-edit" onclick="event.stopPropagation();openOwnNoteEditor(\'' + questionId + '\', this)" title="Editar esta nota">' + ICONS.pencil + '</button>' +
      '<button type="button" class="own-note-remove" onclick="event.stopPropagation();removeOwnNote(\'' + questionId + '\', this)" title="Quitar esta nota">' + ICONS.cross + '</button>' +
    '</div>' +
    textHtml + imagesHtml +
  '</div>';
}

/* Abre el editor inline (textarea + input de imagen) para escribir o
   cambiar la nota propia de una pregunta. Se usa tanto desde el botón
   "Nota" (nota nueva) como desde el lápiz de una nota ya guardada
   (editarla). Precarga el texto y la imagen actuales si ya había algo. */
function openOwnNoteEditor(questionId, btnEl){
  const body = btnEl.closest('.explain-body');
  if(!body) return;
  const slot = body.querySelector('.own-note-editor-slot');
  if(!slot || slot.dataset.open === '1') return;

  const q = findQuestionById(questionId);
  const existing = q && q.own_note ? q.own_note : null;
  const existingText = existing && existing.text ? existing.text : '';
  const existingImages = ownNoteImageUrls(existing);

  const previewHtml = existingImages.length
    ? '<div class="own-note-editor-preview-grid">' +
        existingImages.map((url, i) =>
          '<div class="own-note-editor-preview-item">' +
            '<img src="' + esc(url) + '" alt="Imagen ' + (i+1) + '">' +
            '<label class="own-note-remove-image-row"><input type="checkbox" class="own-note-remove-image-check" value="' + esc(url) + '"> Quitar</label>' +
          '</div>'
        ).join('') +
      '</div>'
    : '';

  slot.dataset.open = '1';
  slot.innerHTML =
    '<div class="own-note-editor">' +
      '<div class="own-note-editor-label">Escribid aquí vuestra propia explicación (opcional)</div>' +
      '<textarea class="own-note-textarea" placeholder="Lo que queráis explicar con vuestras palabras…">' + esc(existingText) + '</textarea>' +
      '<div class="own-note-editor-label">Imágenes (opcional, hasta 5 en total)</div>' +
      previewHtml +
      '<input type="file" accept="image/*" multiple class="own-note-file-input" onchange="ownNoteFileInputChanged(this)">' +
      '<div class="own-note-editor-status"></div>' +
      '<div class="own-note-editor-actions">' +
        '<button type="button" class="btn btn-ghost" onclick="event.stopPropagation();closeOwnNoteEditor(this, \'' + questionId + '\')">Cancelar</button>' +
        '<button type="button" class="btn btn-block own-note-save-btn" onclick="event.stopPropagation();saveOwnNote(\'' + questionId + '\', this)">Guardar</button>' +
      '</div>' +
    '</div>';

  const addBtn = body.querySelector('.own-note-btn');
  if(addBtn) addBtn.style.display = 'none';
}

/* Añade imagen(es) al momento desde el botón redondo de imagen rápida:
   sube el/los archivo(s) y guarda la nota ya mismo (RPC), sin esperar a
   que se pulse "Guardar" y sin bloquear nada: el usuario puede seguir
   viendo otras preguntas mientras la subida sigue en segundo plano. El
   estado de carga se guarda por pregunta (pendingNoteImageUploads), así
   que si vuelve a esta pregunta antes de que termine, sigue viendo el
   spinner; y cuando termina, se repinta solo si sigue viéndola. */
async function quickAddOwnNoteImages(questionId, inputEl){
  const files = inputEl.files ? Array.from(inputEl.files) : [];
  if(!files.length) return;

  const body = inputEl.closest('.explain-body');
  const q = findQuestionById(questionId);
  const existingImages = ownNoteImageUrls(q && q.own_note);
  // Si el editor completo está abierto, respeta lo que se haya escrito y
  // las casillas de "Quitar" marcadas; si no, usa el texto/imágenes tal
  // cual estaban guardados. Se lee ya mismo, antes de que el usuario
  // pueda navegar a otra pregunta.
  const openEditor = body ? body.querySelector('.own-note-editor') : null;
  const text = openEditor
    ? openEditor.querySelector('.own-note-textarea').value.trim()
    : ((q && q.own_note && q.own_note.text) || '');
  const removeUrls = openEditor
    ? Array.from(openEditor.querySelectorAll('.own-note-remove-image-check:checked')).map(c => c.value)
    : [];
  const keptImages = existingImages.filter(url => !removeUrls.includes(url));

  const availableSlots = 5 - keptImages.length;
  if(files.length > availableSlots){
    uiToast('Máximo 5 imágenes por nota: caben ' + Math.max(availableSlots, 0) + ' más.');
    inputEl.value = '';
    return;
  }

  pendingNoteImageUploads[questionId] = true;
  refreshQuickImageBtnUI(questionId);
  inputEl.value = '';

  try{
    const uploadedUrls = [];
    for(let i = 0; i < files.length; i++){
      const trayId = addUploadTrayItem(files[i]);
      try{
        uploadedUrls.push(await uploadOwnNoteImage(questionId, files[i]));
      } finally {
        removeUploadTrayItem(trayId);
      }
    }
    const finalImages = keptImages.concat(uploadedUrls).slice(0, 5);

    const { error } = await sb.rpc('set_question_own_note', {
      p_question_id: questionId,
      p_text: text || null,
      p_image_urls: finalImages
    });
    if(error) throw error;

    const note = { text: text || null, image_urls: finalImages, updated_at: new Date().toISOString() };
    if(q) q.own_note = note;
    if(document.getElementById('myAdditionsList')) renderMyAdditionsList();

    // Repinta el resultado solo si la pregunta se sigue viendo en este
    // momento (puede que el usuario ya esté en otra distinta); si no, se
    // pintará ya correcta la próxima vez que se entre a esta pregunta.
    const liveBody = document.querySelector('.explain-body[data-qid="' + questionId + '"]');
    if(liveBody){
      const slot = liveBody.querySelector('.own-note-editor-slot');
      if(slot){ slot.innerHTML = ''; slot.dataset.open = ''; }
      const resultEl = liveBody.querySelector('.own-note-result');
      if(resultEl){
        resultEl.innerHTML = ownNoteCardHtml(note, questionId);
        resultEl.classList.add('show');
      }
      const addBtn = liveBody.querySelector('.own-note-btn');
      if(addBtn) addBtn.remove();
    }
  } catch(err){
    uiToast('No se ha podido añadir la imagen a la pregunta: ' + friendlyUploadErrorMessage(err));
  } finally {
    delete pendingNoteImageUploads[questionId];
    refreshQuickImageBtnUI(questionId);
  }
}

/* Avisa en vivo, mientras se eligen archivos, si el total (imágenes que se
   quedan + nuevas seleccionadas) supera el máximo de 5. No bloquea la
   selección: la comprobación real y definitiva se hace en saveOwnNote. */
function ownNoteFileInputChanged(inputEl){
  const editor = inputEl.closest('.own-note-editor');
  if(!editor) return;
  const statusEl = editor.querySelector('.own-note-editor-status');
  const existingCount = editor.querySelectorAll('.own-note-editor-preview-item').length;
  const removedCount = editor.querySelectorAll('.own-note-remove-image-check:checked').length;
  const kept = existingCount - removedCount;
  const selected = inputEl.files ? inputEl.files.length : 0;
  const available = 5 - kept;
  if(selected > available){
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = 'Has seleccionado ' + selected + ' imagen' + (selected===1?'':'es') + ', pero solo caben ' + Math.max(available,0) + ' más (máximo 5 en total).';
  } else {
    statusEl.style.color = '';
    statusEl.textContent = selected ? selected + ' imagen' + (selected===1?'':'es') + ' nueva' + (selected===1?'':'s') + ' seleccionada' + (selected===1?'':'s') + '.' : '';
  }
}

/* Cierra el editor sin guardar. Si la pregunta no tenía nota, vuelve a
   mostrar el botón "Nota" para poder abrirlo de nuevo. */
function closeOwnNoteEditor(btnEl, questionId){
  const body = btnEl.closest('.explain-body');
  if(!body) return;
  const slot = body.querySelector('.own-note-editor-slot');
  if(slot){ slot.innerHTML = ''; slot.dataset.open = ''; }
  const q = findQuestionById(questionId);
  if(!q || !q.own_note){
    const addBtn = body.querySelector('.own-note-btn');
    if(addBtn) addBtn.style.display = '';
  }
}

/* "Load failed" es el mensaje genérico que da Safari/WebKit cuando una
   petición de red se corta a medias (wifi inestable, paso a datos móviles,
   o simplemente una foto muy pesada tardando demasiado). No es un error
   de la app: para que pase menos, antes de subir se reduce la imagen de
   tamaño y, si aun así falla por red, se reintenta un par de veces solo
   antes de rendirse. */
function isNetworkLoadError(err){
  const msg = (err && err.message) ? String(err.message) : '';
  return /load failed|failed to fetch|network|ERR_/i.test(msg);
}
function friendlyUploadErrorMessage(err){
  const raw = (err && err.message) ? err.message : 'error desconocido';
  return isNetworkLoadError(err)
    ? 'Parece un fallo de conexión al subir la imagen (wifi/datos inestables). Ya se ha reintentado un par de veces: comprueba tu conexión y vuelve a intentarlo.'
    : raw;
}
/* Reintenta fn() hasta "attempts" veces si lanza error, con una pequeña
   espera creciente entre intento e intento. Solo tiene sentido para pasos
   de red (la subida al bucket), no para nada que tenga efectos que no se
   puedan repetir sin problema. */
async function withRetry(fn, attempts, delayMs){
  attempts = attempts || 3;
  delayMs = delayMs || 900;
  let lastErr;
  for(let i = 0; i < attempts; i++){
    try{ return await fn(); }
    catch(err){
      lastErr = err;
      if(i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
/* Reduce una foto antes de subirla (las del iPad/iPhone suelen pesar
   varios MB a resolución completa, lo que hace la subida más lenta y más
   propensa a cortarse con "Load failed"). Si algo falla al procesarla
   (formato raro, etc.), se sube el archivo original tal cual: nunca
   bloquea la subida por esto. */
function resizeImageForUpload(file, maxDim, quality){
  maxDim = maxDim || 1600;
  quality = quality || 0.82;
  return new Promise((resolve) => {
    if(!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif'){
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth, height = img.naturalHeight;
      if(!width || !height || (width <= maxDim && height <= maxDim && file.size <= 1.5 * 1024 * 1024)){
        resolve(file);
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const w = Math.round(width * scale), h = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if(!ctx){ resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if(!blob){ resolve(file); return; }
        const newName = (file.name || 'imagen').replace(/\.[^.]+$/, '') + '.jpg';
        resolve(new File([blob], newName, { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
/* Sube la imagen al bucket público "question-notes" (organizado por
   pregunta: question-notes/<id>/<timestamp>.<ext>) y devuelve su URL
   pública permanente. Antes la reduce de tamaño y, si la subida falla
   por red, la reintenta un par de veces. */
async function uploadOwnNoteImage(questionId, file){
  const uploadFile = await resizeImageForUpload(file);
  const ext = (uploadFile.name && uploadFile.name.includes('.')) ? uploadFile.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'') : 'jpg';
  const path = questionId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + '.' + (ext || 'jpg');
  await withRetry(async () => {
    const { error } = await sb.storage.from('question-notes').upload(path, uploadFile, { upsert: false, contentType: uploadFile.type || 'image/jpeg' });
    if(error) throw new Error(error.message || 'No se ha podido subir la imagen.');
  }, 3, 900);
  const { data } = sb.storage.from('question-notes').getPublicUrl(path);
  if(!data || !data.publicUrl) throw new Error('No se ha podido obtener la URL de la imagen.');
  return data.publicUrl;
}

/* Guarda la nota (texto y/o hasta 5 imágenes) de forma permanente para
   todo el mundo, vía la RPC set_question_own_note (solo toca esa
   columna). Sigue el mismo patrón que generateIAExplain: al guardar,
   sustituye el editor por la tarjeta ya renderizada y quita el botón
   "Nota" (o lo vuelve a mostrar si la nota se queda totalmente vacía). */
async function saveOwnNote(questionId, btnEl){
  const editor = btnEl.closest('.own-note-editor');
  const body = btnEl.closest('.explain-body');
  if(!editor || !body) return;

  const statusEl = editor.querySelector('.own-note-editor-status');
  const text = editor.querySelector('.own-note-textarea').value.trim();
  const fileInput = editor.querySelector('.own-note-file-input');
  const newFiles = (fileInput && fileInput.files) ? Array.from(fileInput.files) : [];
  const removeUrls = Array.from(editor.querySelectorAll('.own-note-remove-image-check:checked')).map(c => c.value);

  const q = findQuestionById(questionId);
  const existingImages = ownNoteImageUrls(q && q.own_note);
  const keptImages = existingImages.filter(url => !removeUrls.includes(url));

  const availableSlots = 5 - keptImages.length;
  if(newFiles.length > availableSlots){
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = 'Máximo 5 imágenes por nota: te caben ' + Math.max(availableSlots, 0) + ' más. Quita alguna imagen o selecciona menos.';
    return;
  }

  if(!text && !keptImages.length && !newFiles.length){
    statusEl.textContent = 'Escribe algo o añade al menos una imagen antes de guardar.';
    return;
  }

  const saveBtn = editor.querySelector('.own-note-save-btn');
  saveBtn.disabled = true;
  const originalBtnText = saveBtn.textContent;
  statusEl.style.color = '';
  statusEl.textContent = '';

  try{
    const uploadedUrls = [];
    if(newFiles.length){
      saveBtn.textContent = 'Subiendo imágenes…';
      for(let i = 0; i < newFiles.length; i++){
        statusEl.textContent = 'Subiendo imagen ' + (i+1) + ' de ' + newFiles.length + '…';
        uploadedUrls.push(await uploadOwnNoteImage(questionId, newFiles[i]));
      }
    }
    const finalImages = keptImages.concat(uploadedUrls).slice(0, 5);
    saveBtn.textContent = 'Guardando…';

    const { error } = await sb.rpc('set_question_own_note', {
      p_question_id: questionId,
      p_text: text || null,
      p_image_urls: finalImages
    });
    if(error) throw error;

    const hasContent = !!text || finalImages.length > 0;
    const note = hasContent ? { text: text || null, image_urls: finalImages, updated_at: new Date().toISOString() } : null;
    if(q) q.own_note = note;
    if(document.getElementById('myAdditionsList')) renderMyAdditionsList();

    const slot = body.querySelector('.own-note-editor-slot');
    if(slot){ slot.innerHTML = ''; slot.dataset.open = ''; }

    const resultEl = body.querySelector('.own-note-result');
    if(resultEl){
      resultEl.innerHTML = note ? ownNoteCardHtml(note, questionId) : '';
      resultEl.classList.toggle('show', !!note);
    }
    const addBtn = body.querySelector('.own-note-btn');
    if(note){
      if(addBtn) addBtn.remove();
    } else if(!addBtn){
      const actions = body.querySelector('.explain-section-actions');
      if(actions) actions.insertAdjacentHTML('beforeend', noteBtnHtml(questionId));
    }
  } catch(err){
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = 'No se ha podido guardar: ' + friendlyUploadErrorMessage(err);
    saveBtn.disabled = false;
    saveBtn.textContent = originalBtnText;
  }
}

/* Quita la nota propia (texto e imagen) de una pregunta, de forma
   permanente para todo el mundo, y vuelve a mostrar el botón "Nota" por
   si se quiere escribir otra distinta. El archivo de imagen en el bucket
   se queda huérfano (no se borra) para no complicar el flujo; ocupa poco
   y no afecta a nada más. */
async function removeOwnNote(questionId, btnEl){
  if(!await uiConfirm('¿Quitar esta nota (texto e imagen)?\n\nSe borrará de forma permanente y habrá que escribirla de nuevo si se quiere volver a ver.')) return;

  const resultEl = btnEl.closest('.own-note-result');
  const body = btnEl.closest('.explain-body');
  const q = findQuestionById(questionId);

  btnEl.disabled = true;
  try{
    const { error } = await sb.rpc('clear_question_own_note', { p_question_id: questionId });
    if(error) throw error;

    if(q) q.own_note = null;
    if(document.getElementById('myAdditionsList')) renderMyAdditionsList();
    if(resultEl){ resultEl.innerHTML = ''; resultEl.classList.remove('show'); }

    const actions = body ? body.querySelector('.explain-section-actions') : null;
    if(actions && !actions.querySelector('.own-note-btn')){
      actions.insertAdjacentHTML('beforeend', noteBtnHtml(questionId));
    }
  } catch(err){
    uiToast('No se ha podido quitar la nota: ' + (err.message || 'error desconocido'));
    btnEl.disabled = false;
  }
}
