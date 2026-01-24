(async function(){
  const API_URL = 'https://cartera-pr-pia.onrender.com';
  const notice = document.getElementById('notice');
  const postsEl = document.getElementById('posts');
  const controls = document.getElementById('controls');

  function show(msg){ if(notice) notice.textContent = msg; }

  const username = sessionStorage.getItem('usuario_actual');
  const password = sessionStorage.getItem('pass_actual');
  if (!username || !password) {
    show('Debes iniciar sesión y estar suscrito para ver la newsletter.');
    return;
  }

  // obtener info del usuario
  let me = null;
  try {
    const r = await fetch(API_URL + '/me', { headers: { 'x-username': username, 'x-password': password } });
    if (!r.ok) throw new Error('no auth');
    me = await r.json();
  } catch (e) {
    show('Error autenticando. Inicia sesión de nuevo.');
    return;
  }

  if (!me.premium) {
    show('Necesitas ser suscriptor (premium) para acceder a esta página.');
    return;
  }

  // Si es JEFE, mostrar formulario para publicar
  if (me.role === 'JEFE') {
    const form = document.createElement('form');
    form.innerHTML = `
      <div><input name="title" placeholder="Título" required style="width:100%"/></div>
      <div><input name="file_url" placeholder="URL del PDF / recurso" required style="width:100%"/></div>
      <div><textarea name="description" placeholder="Descripción" style="width:100%"></textarea></div>
      <div><button type="submit">Publicar revista</button></div>
    `;
    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const fd = new FormData(form);
      const payload = { title: fd.get('title'), file_url: fd.get('file_url'), description: fd.get('description'), username, password };
      try {
        const resp = await fetch(API_URL + '/newsletter', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if (!resp.ok) {
          const j = await resp.json().catch(()=>null);
          alert('Error publicando: ' + (j && j.detail ? j.detail : resp.statusText));
          return;
        }
        alert('Publicado');
        loadPosts();
        form.reset();
      } catch (err) { alert('Error conectando al servidor'); }
    });
    controls.appendChild(form);
  }

  async function loadPosts(){
    postsEl.innerHTML = '';
    try {
      const r = await fetch(API_URL + '/newsletter', { headers: { 'x-username': username, 'x-password': password } });
      if (!r.ok) {
        const j = await r.json().catch(()=>null);
        show('No tienes acceso a las revistas: ' + (j && j.detail ? j.detail : r.statusText));
        return;
      }
      const arr = await r.json();
      if (!arr || !arr.length) { postsEl.textContent = 'No hay revistas publicadas.'; return; }
      arr.forEach(p => {
        const el = document.createElement('div'); el.className = 'newsletter-post';
        // title and description
        const h = document.createElement('h3'); h.textContent = p.title || '';
        const desc = document.createElement('p'); desc.textContent = p.description || '';
        el.appendChild(h);
        el.appendChild(desc);

        // centered action area
        const actions = document.createElement('div'); actions.className = 'newsletter-actions';
        const link = document.createElement('a');
        link.href = p.file_url || '#';
        link.target = '_blank';
        link.className = 'read-btn';
        link.textContent = 'LEER';
        actions.appendChild(link);

        if (me.role === 'JEFE') {
          const del = document.createElement('button'); del.textContent = 'Eliminar'; del.className = 'delete-btn';
          del.addEventListener('click', async ()=>{
            if (!confirm('Eliminar entrada?')) return;
            try {
              const resp = await fetch(API_URL + '/newsletter/' + p.id, { method: 'DELETE', headers: {'Content-Type':'application/json', 'x-username': username, 'x-password': password } });
              if (!resp.ok) { alert('Error al eliminar'); return; }
              loadPosts();
            } catch(e) { alert('Error conectando al servidor'); }
          });
          actions.appendChild(del);
        }

        el.appendChild(actions);
        postsEl.appendChild(el);
      });
    } catch (err) { show('Error cargando revistas'); }
  }

  loadPosts();
})();