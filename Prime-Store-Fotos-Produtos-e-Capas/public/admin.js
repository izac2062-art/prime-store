
const $ = s => document.querySelector(s);

let products = [];
let covers = {
  heroImage: '',
  essentials: '',
  tailoring: '',
  summer: '',
  sneakers: '',
  feature: ''
};

const coverFields = [
  ['heroImage', 'Capa principal (fica preta se vazia)'],
  ['essentials', 'Capa ESSENTIALS — Camisetas'],
  ['tailoring', 'Capa TAILORING — Calças'],
  ['summer', 'Capa SUMMER DROP — Bermudas'],
  ['sneakers', 'Capa SNEAKERS — Calçados'],
  ['feature', 'Banner de destaque — Jaquetas']
];

const money = v =>
  Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

async function api(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw Error(d.error || 'Erro na solicitação');
  }

  return d;
}

async function uploadImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw Error('Escolha um arquivo de imagem.');
  }

  const dataUrl = await compressImage(file);

  const d = await api('/api/admin/media', {
    method: 'POST',
    body: JSON.stringify({
      mimeType: 'image/jpeg',
      dataUrl
    })
  });

  return d.url;
}

/* LOGIN E NAVEGAÇÃO */

function showDash() {
  $('#loginView').hidden = true;
  $('#dashboard').hidden = false;
  loadProducts();
}

async function check() {
  try {
    const d = await api('/api/admin/me');
    if (d.authenticated) showDash();
  } catch (e) {
    console.error('Não foi possível verificar a sessão:', e);
  }
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  $('#loginMessage').textContent = '';

  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#username').value,
        password: $('#password').value
      })
    });

    showDash();
  } catch (err) {
    $('#loginMessage').textContent = err.message;
  }
};

$('#logout').onclick = async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
  } finally {
    location.reload();
  }
};

document.querySelectorAll('[data-tab]').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    $('#productsTab').hidden = button.dataset.tab !== 'products';
    $('#ordersTab').hidden = button.dataset.tab !== 'orders';
    $('#coversTab').hidden = button.dataset.tab !== 'covers';

    if (button.dataset.tab === 'orders') loadOrders();
    if (button.dataset.tab === 'covers') loadCovers();
  };
});

/* PRODUTOS */

async function loadProducts() {
  try {
    products = await api('/api/admin/products');
    renderEditor();
  } catch (e) {
    $('#saveMessage').textContent = e.message;
  }
}

function renderEditor() {
  const editor = $('#productEditor');

  editor.innerHTML = products.map((p, i) => `
    <article class="product-edit" data-index="${i}">
      <img src="${esc(p.image || '')}" alt="">

      <div class="fields">
        <label>Nome
          <input data-key="name" value="${esc(p.name || '')}">
        </label>

        <label>Categoria
          <select data-key="category">
            ${['Camisetas', 'Calças', 'Jaquetas', 'Calçados', 'Acessórios']
              .map(c => `<option ${p.category === c ? 'selected' : ''}>${c}</option>`)
              .join('')}
          </select>
        </label>

        <label class="field-check">
          <input type="checkbox" data-key="active"
            ${p.active !== false ? 'checked' : ''}>
          Produto visível na loja
        </label>
      </div>

      <div class="fields">
        <label>Preço (R$)
          <input type="number" min="0.01" step="0.01"
            data-key="price" value="${p.price ?? ''}">
        </label>

        <label>Preço anterior (R$)
          <input type="number" min="0" step="0.01"
            data-key="oldPrice" value="${p.oldPrice ?? 0}">
        </label>

        <label>Tamanhos separados por vírgula
          <input data-key="sizes"
            value="${esc((p.sizes || []).join(', '))}">
        </label>
      </div>

      <div class="fields">
        <label>URL da foto
          <input data-key="image" value="${esc(p.image || '')}"
            placeholder="https://...">
        </label>

        <label>Escolher foto do computador ou celular
          <input data-product-file="${i}" type="file"
            accept="image/png,image/jpeg,image/webp">
        </label>

        <label>Selo curto
          <input data-key="badge" value="${esc(p.badge || '')}">
        </label>

        <label>Descrição
          <textarea data-key="description">${esc(p.description || '')}</textarea>
        </label>

        <button type="button" class="secondary" data-delete="${i}">
          EXCLUIR PRODUTO
        </button>
      </div>
    </article>
  `).join('');

  editor.querySelectorAll('.product-edit').forEach(card => {
    const index = Number(card.dataset.index);

    card.querySelectorAll('[data-key]').forEach(input => {
      input.onchange = () => {
        const key = input.dataset.key;

        let value = input.type === 'checkbox'
          ? input.checked
          : input.value.trim();

        if (key === 'price' || key === 'oldPrice') {
          value = value === '' ? 0 : Number(value);
        }

        if (key === 'sizes') {
          value = value.split(',').map(s => s.trim()).filter(Boolean);
        }

        products[index][key] = value;

        if (key === 'image') {
          card.querySelector('img').src = value;
        }
      };
    });

    const fileInput = card.querySelector('[data-product-file]');

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const message = $('#saveMessage');
      message.textContent = 'Enviando foto...';

      try {
        const url = await uploadImage(file);

        products[index].image = url;
        card.querySelector('[data-key="image"]').value = url;
        card.querySelector('img').src = url;

        message.textContent =
          'Foto carregada. Clique em SALVAR ALTERAÇÕES.';
      } catch (e) {
        message.textContent = e.message;
      }
    };

    card.querySelector('[data-delete]').onclick = () => {
      products.splice(index, 1);
      renderEditor();
    };
  });
}

/* ADICIONAR PRODUTO */

$('#addProduct').onclick = () => {
  products.push({
    id: 'pc-' + Date.now(),
    name: '',
    category: 'Camisetas',
    price: '',
    oldPrice: 0,
    sizes: ['P', 'M', 'G', 'GG'],
    badge: 'NOVO',
    image: '',
    description: '',
    active: true
  });

  renderEditor();
};

/* SALVAR PRODUTOS */

$('#saveProducts').onclick = async () => {
  const button = $('#saveProducts');
  const message = $('#saveMessage');

  button.disabled = true;

  try {
    // Lê todos os campos atuais antes de enviar.
    document.querySelectorAll('.product-edit').forEach(card => {
      const index = Number(card.dataset.index);

      card.querySelectorAll('[data-key]').forEach(input => {
        const key = input.dataset.key;

        let value = input.type === 'checkbox'
          ? input.checked
          : input.value.trim();

        if (key === 'price' || key === 'oldPrice') {
          value = value === '' ? 0 : Number(value);
        }

        if (key === 'sizes') {
          value = value.split(',').map(s => s.trim()).filter(Boolean);
        }

        products[index][key] = value;
      });
    });

    // Validação local para evitar enviar produtos incompletos.
    for (const product of products) {
      if (!product.name.trim()) {
        throw Error('Preencha o nome de todos os produtos.');
      }

      if (!Number.isFinite(Number(product.price)) ||
          Number(product.price) <= 0) {
        throw Error('Informe um preço maior que zero para todos os produtos.');
      }

      if (!Array.isArray(product.sizes) || product.sizes.length === 0) {
        throw Error('Informe pelo menos um tamanho para cada produto.');
      }

      const image = String(product.image || '');

      if (!/^https:\/\//i.test(image) &&
          !/^\/media\/[a-z0-9-]+$/i.test(image)) {
        throw Error('Informe uma URL HTTPS válida ou envie uma foto para cada produto.');
      }
    }

    const d = await api('/api/admin/products', {
      method: 'PUT',
      body: JSON.stringify(products)
    });

    products = d.products;
    message.style.color = '#d5ff37';
    message.textContent = 'Alterações salvas!';
    renderEditor();
  } catch (e) {
    message.style.color = '#ff9b88';
    message.textContent = e.message;
  } finally {
    button.disabled = false;
  }
};

/* PEDIDOS */

async function loadOrders() {
  try {
    const orders = await api('/api/admin/orders');

    $('#ordersList').innerHTML = orders.length
      ? orders.map(o => `
        <article class="order-card">
          <div>
            <b>${esc(o.id)}</b>
            <small>${new Date(o.createdAt).toLocaleString('pt-BR')}</small>
          </div>

          <div>
            <b>${esc(o.customer?.name || 'Cliente')}</b>
            <small>${esc(o.customer?.email || '')}</small>
            <small>${esc(o.customer?.phone || '')}</small>
          </div>

          <div>
            <b>${money(o.total)}</b>
            <small class="status">
              Pagamento: ${esc(o.paymentStatus || 'pendente')}
            </small>
            <small>
              ${(o.items || []).map(item =>
                `${esc(item.name)} tam. ${esc(item.size)} ×${item.quantity}`
              ).join('<br>')}
            </small>
          </div>

          <select data-order="${esc(o.id)}">
            <option value="aguardando_pagamento"
              ${o.status === 'aguardando_pagamento' ? 'selected' : ''} disabled>
              Aguardando pagamento
            </option>
            <option value="separando"
              ${o.status === 'separando' ? 'selected' : ''}>Separando</option>
            <option value="enviado"
              ${o.status === 'enviado' ? 'selected' : ''}>Enviado</option>
            <option value="concluido"
              ${o.status === 'concluido' ? 'selected' : ''}>Concluído</option>
            <option value="cancelado"
              ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </article>
      `).join('')
      : '<p class="muted">Nenhum pedido registrado ainda.</p>';

    document.querySelectorAll('[data-order]').forEach(select => {
      select.onchange = async () => {
        try {
          await api(
            '/api/admin/orders/' + encodeURIComponent(select.dataset.order),
            {
              method: 'PATCH',
              body: JSON.stringify({ status: select.value })
            }
          );
        } catch (e) {
          alert(e.message);
        }
      };
    });
  } catch (e) {
    $('#ordersList').textContent = e.message;
  }
}

$('#refreshOrders').onclick = loadOrders;

/* CAPAS DA LOJA */

async function loadCovers() {
  try {
    covers = await api('/api/admin/collection-covers');

    coverFields.forEach(([key]) => {
      if (!(key in covers)) covers[key] = '';
    });

    renderCovers();
  } catch (e) {
    $('#coverSaveMessage').textContent = e.message;
  }
}

function renderCovers() {
  $('#coverEditor').innerHTML = coverFields.map(([key, label]) => `
    <article class="cover-edit" data-cover-key="${key}">
      <div class="cover-preview"
        style="background-image:${covers[key] ? `url(&quot;${esc(covers[key])}&quot;)` : 'none'}">
        <span>${esc(label)}</span>
      </div>

      <div class="cover-fields">
        <label>${esc(label)} — URL da imagem
          <input data-cover-url="${key}" type="url"
            placeholder="https://..."
            value="${esc(covers[key] && !covers[key].startsWith('data:')
              ? covers[key] : '')}">
        </label>

        <label>Escolher foto do celular/computador
          <input data-cover-file="${key}" type="file"
            accept="image/png,image/jpeg,image/webp">
        </label>

        <div class="cover-actions">
          <button type="button" class="secondary" data-cover-clear="${key}">
            DEIXAR PRETO / REMOVER
          </button>
        </div>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-cover-url]').forEach(input => {
    input.onchange = () => {
      covers[input.dataset.coverUrl] = input.value.trim();
      renderCovers();
    };
  });

  document.querySelectorAll('[data-cover-file]').forEach(input => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        covers[input.dataset.coverFile] = await uploadImage(file);
        renderCovers();
      } catch (e) {
        $('#coverSaveMessage').textContent = e.message;
      }
    };
  });

  document.querySelectorAll('[data-cover-clear]').forEach(button => {
    button.onclick = () => {
      covers[button.dataset.coverClear] = '';
      renderCovers();
    };
  });
}

/* COMPRESSÃO DE IMAGENS */

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(Error('Escolha um arquivo de imagem.'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(Error('Não foi possível ler a imagem.'));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(Error('Imagem inválida.'));

      img.onload = () => {
        const scale = Math.min(
          1,
          1500 / Math.max(img.width, img.height)
        );

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        canvas.getContext('2d').drawImage(
          img, 0, 0, canvas.width, canvas.height
        );

        const out = canvas.toDataURL('image/jpeg', 0.76);

        if (out.length > 2600000) {
          reject(Error('Imagem ainda muito grande. Escolha uma foto menor.'));
          return;
        }

        resolve(out);
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

async function compressCover(file) {
  return compressImage(file);
}

/* SALVAR CAPAS */

$('#saveCovers').onclick = async () => {
  const button = $('#saveCovers');
  const message = $('#coverSaveMessage');

  button.disabled = true;

  try {
    const d = await api('/api/admin/collection-covers', {
      method: 'PUT',
      body: JSON.stringify(covers)
    });

    covers = d.collectionCovers;
    message.style.color = '#d5ff37';
    message.textContent = 'Capas salvas! Atualize a loja para conferir.';
    renderCovers();
  } catch (e) {
    message.style.color = '#ff9b88';
    message.textContent = e.message;
  } finally {
    button.disabled = false;
  }
};

/* VERIFICAR SESSÃO */

check();

    

