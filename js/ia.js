/* Explicaciones con IA (Gemini, a través de la función gemini-proxy). */

/* Construye la tarjeta de la explicación ampliada por IA a partir del objeto
   { simple, technical, glossary }: explicación fácil, explicación técnica y
   un pequeño glosario. Se usa tanto justo después de generarla como al
   recargar una pregunta que ya la tenía guardada de forma permanente. */
function formatAIParagraphs(text){
  return (text || '').split(/\n{2,}/).map(p => '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
}
function aiExplainCardHtml(data, questionId){
  const glossary = Array.isArray(data.glossary) ? data.glossary.filter(g => g && g.term) : [];
  const glossaryItemsHtml = glossary.map(g =>
    '<div class="ia-glossary-item">' +
      '<div class="ia-glossary-term">' + esc(g.term) + '</div>' +
      '<div class="ia-glossary-def">' + esc(g.meaning || '') + '</div>' +
      (Array.isArray(g.synonyms) && g.synonyms.length
        ? '<div class="ia-glossary-syn"><b>Sinónimos:</b> ' + esc(g.synonyms.join(', ')) + '</div>'
        : '') +
    '</div>'
  ).join('');
  const glossaryHtml = glossary.length
    ? '<div class="ia-explain-block" data-ia-block>' +
        '<div class="ia-explain-block-head" role="button" tabindex="0" onclick="toggleIABlock(this)"><span class="ia-block-icon glossary">' + ICONS.book + '</span><span>Palabras clave</span><span class="ia-block-chev">' + ICONS.chevron + '</span></div>' +
        '<div class="ia-explain-block-body"><div class="ia-explain-glossary">' + glossaryItemsHtml + '</div></div>' +
      '</div>'
    : '';

  const incorrect = Array.isArray(data.incorrect) ? data.incorrect.filter(x => x && x.reason) : [];
  const incorrectItemsHtml = incorrect.map(x =>
    '<div class="ia-incorrect-item">' +
      '<div class="ia-incorrect-opt">' + esc(x.option || '') + '</div>' +
      '<div class="ia-incorrect-reason">' + esc(x.reason || '') + '</div>' +
    '</div>'
  ).join('');
  const incorrectHtml = incorrect.length
    ? '<div class="ia-explain-block" data-ia-block>' +
        '<div class="ia-explain-block-head" role="button" tabindex="0" onclick="toggleIABlock(this)"><span class="ia-block-icon incorrect">' + ICONS.warn + '</span><span>Por qué las demás no son correctas</span><span class="ia-block-chev">' + ICONS.chevron + '</span></div>' +
        '<div class="ia-explain-block-body"><div class="ia-explain-incorrect">' + incorrectItemsHtml + '</div></div>' +
      '</div>'
    : '';

  return '<div class="ia-explain-card">' +
    '<div class="ia-explain-label">' +
      '<span class="ia-explain-icon-badge">' + ICONS.brain + '</span><span>Explicación ampliada con IA</span>' +
      '<button type="button" class="ia-explain-remove" onclick="event.stopPropagation();removeAIExplain(\'' + questionId + '\', this)" title="Quitar esta explicación generada por IA">' + ICONS.cross + '</button>' +
    '</div>' +
    '<div class="ia-explain-block" data-ia-block>' +
      '<div class="ia-explain-block-head" role="button" tabindex="0" onclick="toggleIABlock(this)"><span class="ia-block-icon simple">' + ICONS.smile + '</span><span>Explicado fácil</span><span class="ia-block-chev">' + ICONS.chevron + '</span></div>' +
      '<div class="ia-explain-block-body"><div class="ia-explain-text">' + formatAIParagraphs(data.simple) + '</div></div>' +
    '</div>' +
    '<div class="ia-explain-block" data-ia-block>' +
      '<div class="ia-explain-block-head" role="button" tabindex="0" onclick="toggleIABlock(this)"><span class="ia-block-icon technical">' + ICONS.graduation + '</span><span>Explicado con más detalle</span><span class="ia-block-chev">' + ICONS.chevron + '</span></div>' +
      '<div class="ia-explain-block-body"><div class="ia-explain-text">' + formatAIParagraphs(data.technical) + '</div></div>' +
    '</div>' +
    incorrectHtml +
    glossaryHtml +
  '</div>';
}

/* Cada bloque de la tarjeta IA (fácil / detalle / por qué las demás no
   son correctas / palabras clave) empieza cerrado y se pliega/despliega
   como un acordeón al tocar su cabecera, en cualquier tamaño de pantalla
   (ver CSS: reglas base de .ia-explain-block, ya no solo en móvil). */
function toggleIABlock(headEl){
  const block = headEl.closest('.ia-explain-block');
  if(block) block.classList.toggle('ia-block-open');
}

function findQuestionById(questionId){
  if(typeof ACTIVE_QUESTIONS !== 'undefined' && ACTIVE_QUESTIONS){
    const found = ACTIVE_QUESTIONS.find(q => String(q.id) === String(questionId));
    if(found) return found;
  }
  if(typeof currentReview !== 'undefined' && currentReview && currentReview.questions){
    const found = currentReview.questions.find(q => String(q.id) === String(questionId));
    if(found) return found;
  }
  // último recurso: el conjunto completo de preguntas cargado al entrar en
  // la app (cubre, por ejemplo, la pantalla "Notas y explicaciones IA",
  // que no pasa por un test/revisión en curso).
  if(typeof QUESTIONS_POOL !== 'undefined' && QUESTIONS_POOL){
    const found = QUESTIONS_POOL.find(q => String(q.id) === String(questionId));
    if(found) return found;
  }
  return null;
}

/* Llama a la Edge Function gemini-proxy, que usa la clave única
   configurada por el administrador en el servidor. Lanza un Error con
   un mensaje ya listo para mostrar al usuario si algo falla (incluida
   la falta de clave configurada). */
async function callGeminiProxy(prompt, imageRef){
  const body = { prompt };
  if(imageRef && imageRef.url) body.imageUrl = imageRef.url;
  else if(imageRef && imageRef.data) body.image = imageRef; // { mimeType, data(base64) }
  const { data, error } = await sb.functions.invoke('gemini-proxy', { body });
  if(error){
    let message = error.message || 'Error llamando a la IA.';
    try{
      const ctx = error.context;
      if(ctx && typeof ctx.json === 'function'){
        const body = await ctx.json();
        if(body && body.message) message = body.message;
      }
    } catch(e){ /* si no se puede leer el cuerpo del error, nos quedamos con el mensaje genérico */ }
    throw new Error(message);
  }
  if(data && data.error){ throw new Error(data.message || 'Error llamando a la IA.'); }
  return (data && data.text) || '';
}

async function generateIAExplain(questionId, btnEl){
  const body = btnEl.closest('.explain-body');
  const resultEl = body ? body.querySelector('.ia-explain-result') : null;
  if(!resultEl) return;

  // si ya se generó/cargó antes para esta pregunta, solo mostrar/ocultar sin repetir la llamada
  if(resultEl.dataset.loaded === '1'){
    resultEl.classList.toggle('show');
    return;
  }

  const q = findQuestionById(questionId);
  if(!q){
    resultEl.innerHTML = '<div class="ia-explain-empty">No se ha podido identificar la pregunta.</div>';
    resultEl.classList.add('show');
    return;
  }

  // Si la pregunta ya tiene una foto subida en su nota propia (botón "Nota"),
  // se reutiliza automáticamente como imagen del artículo: no se vuelve a
  // pedir. Si hay varias, se usa la primera.
  const noteImageUrl = ownNoteImageUrls(q.own_note)[0] || null;

  const originalBtnHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '<span>Generando…</span>';
  resultEl.classList.add('show');
  resultEl.innerHTML = '<div class="ia-explain-loading">' + (noteImageUrl ? 'Leyendo la foto del artículo que ya subiste y generando una explicación estructurada…' : 'Generando una explicación estructurada…') + '</div>';

  const letters = ['A','B','C','D'];
  const optionsText = q.options.map((opt,i) => letters[i] + ') ' + opt).join('\n');
  const incorrectLetters = letters.slice(0, q.options.length).filter((_, i) => i !== q.correct);

  let prompt = 'Eres un profesor que prepara opositores para un examen tipo test de legislación. ' +
    'Te doy una pregunta, sus opciones, la respuesta correcta y una explicación breve ya existente. ';
  if(noteImageUrl){
    prompt += 'Además te adjunto una foto del artículo de la ley del que sale la pregunta (la subió el propio usuario como nota de esta pregunta): básate en su texto literal siempre que sea legible tanto para justificar la respuesta correcta como para explicar cada opción incorrecta. Si la foto no se lee bien o no coincide con esta pregunta, dilo brevemente dentro del campo correspondiente y apóyate en tu conocimiento general. ';
  }
  prompt += 'Devuelve EXCLUSIVAMENTE un objeto JSON (sin markdown, sin ```, sin texto antes ni después) con esta forma exacta:\n' +
    '{\n' +
    '  "simple": "por qué es correcta esa opción, en lenguaje MUY sencillo y cercano, como si se lo explicaras a un niño o a una persona mayor sin conocimientos de leyes, con algún ejemplo cotidiano y sin tecnicismos",\n' +
    '  "technical": "la misma idea explicada de otra forma: más completa y precisa, con el rigor y el vocabulario propios de una oposición, citando el artículo o concepto de fondo",\n' +
    '  "incorrect": [ { "option": "letra de una opción incorrecta (' + incorrectLetters.join(', ') + ')", "reason": "por qué esa opción concreta NO es correcta, en 1-2 frases" } ],\n' +
    '  "glossary": [ { "term": "palabra o expresión clave que aparezca en el ENUNCIADO o en las OPCIONES de la pregunta (no en el texto que generes tú)", "meaning": "qué significa, explicado de forma simple", "synonyms": ["sinónimo 1", "sinónimo 2"] } ]\n' +
    '}\n\n' +
    'En "incorrect" incluye SIEMPRE una entrada por cada opción incorrecta (' + incorrectLetters.join(', ') + '), cada una explicada por separado y de forma concreta (no una frase genérica repetida). ' +
    'En "glossary" incluye entre 2 y 5 palabras o expresiones clave reales de la pregunta (del enunciado o de las opciones, nunca inventadas ni sacadas de tu propio texto); deja el array vacío solo si de verdad no hay ninguna palabra destacable. ' +
    'Responde siempre en español, en texto plano dentro de cada campo (sin markdown ni asteriscos), y separa los párrafos de "simple" y "technical" con una línea en blanco si hace falta más de uno.\n\n' +
    'PREGUNTA: ' + q.q + '\n\nOPCIONES:\n' + optionsText + '\n\n' +
    'RESPUESTA CORRECTA: ' + letters[q.correct] + ') ' + q.options[q.correct] + '\n\n' +
    'EXPLICACIÓN BREVE YA EXISTENTE: ' + (q.explain ? q.explain.replace(/<[^>]+>/g, ' ') : '(ninguna)');

  try{
    // Gemini a veces devuelve "modelo saturado" (alta demanda) de forma
    // puntual; se reintenta un par de veces antes de rendirse, en vez de
    // que el usuario tenga que darle a "Reintentar" a mano cada vez.
    const text = await withRetry(
      () => callGeminiProxy(prompt, noteImageUrl ? { url: noteImageUrl } : null),
      3, 1500
    );
    const cleanText = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    if(!cleanText){ throw new Error('La IA no ha devuelto ninguna explicación.'); }

    let parsed;
    try{
      parsed = JSON.parse(cleanText);
    } catch(parseErr){
      // si por lo que sea no ha devuelto JSON válido, lo mostramos igualmente como explicación "fácil"
      parsed = { simple: cleanText, technical: '', incorrect: [], glossary: [] };
    }
    if(!parsed || (!parsed.simple && !parsed.technical)){
      throw new Error('La IA no ha devuelto ninguna explicación.');
    }
    if(!Array.isArray(parsed.incorrect)) parsed.incorrect = [];
    if(!Array.isArray(parsed.glossary)) parsed.glossary = [];

    resultEl.innerHTML = aiExplainCardHtml(parsed, q.id);
    resultEl.dataset.loaded = '1';
    q.ai_explain = parsed;
    btnEl.remove(); // ya no hace falta el botón "IA": la explicación queda permanente hasta que se quite con la X

    // Guardarla de forma permanente en la pregunta (RPC que solo toca la columna ai_explain)
    try{
      const { error: saveErr } = await sb.rpc('set_question_ai_explain', { p_question_id: q.id, p_explain: parsed });
      if(saveErr){ console.error('No se ha podido guardar la explicación de forma permanente', saveErr); }
    } catch(saveErr){
      console.error('No se ha podido guardar la explicación de forma permanente', saveErr);
    }
  } catch(err){
    resultEl.innerHTML = '<div class="ia-explain-empty">No se ha podido generar la explicación: ' + esc(err.message || 'error desconocido') + '</div>';
    btnEl.disabled = false;
    btnEl.innerHTML = originalBtnHtml;
  }
}

/* Quita una explicación IA ya generada (botón "X" dentro de la tarjeta).
   Se borra también en Supabase (permanente para todo el mundo) y se vuelve
   a mostrar el botón "IA" por si se quiere generar otra distinta. */
async function removeAIExplain(questionId, btnEl){
  if(!await uiConfirm('¿Quitar esta explicación generada por IA?\n\nSe borrará de forma permanente y habrá que generarla de nuevo si se quiere volver a ver.')) return;

  const resultEl = btnEl.closest('.ia-explain-result');
  const body = btnEl.closest('.explain-body');
  const q = findQuestionById(questionId);

  btnEl.disabled = true;
  try{
    const { error } = await sb.rpc('clear_question_ai_explain', { p_question_id: questionId });
    if(error) throw error;

    if(q) q.ai_explain = null;
    if(resultEl){
      resultEl.innerHTML = '';
      resultEl.classList.remove('show');
      resultEl.dataset.loaded = '';
    }
    const head = body ? body.querySelector('.explain-section-head') : null;
    if(head && !head.querySelector('.ia-explain-btn')){
      head.insertAdjacentHTML('beforeend',
        '<button type="button" class="ia-explain-btn" onclick="event.stopPropagation();generateIAExplain(\'' + questionId + '\', this)" title="Pedir una explicación más completa con IA">' +
          ICONS.brain + '<span>IA</span>' +
        '</button>');
    }
  } catch(err){
    uiToast('No se ha podido quitar la explicación: ' + (err.message || 'error desconocido'));
    btnEl.disabled = false;
  }
}
