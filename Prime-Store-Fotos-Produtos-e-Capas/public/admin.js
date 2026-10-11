const $=s=>document.querySelector(s);let products=[];let covers={heroImage:'',essentials:'',tailoring:'',summer:'',sneakers:'',feature:''};const coverFields=[['heroImage','Capa principal (fica preta se vazia)'],['essentials','Capa ESSENTIALS — Camisetas'],['tailoring','Capa TAILORING — Calças'],['summer','Capa SUMMER DROP — Bermudas'],['sneakers','Capa SNEAKERS — Calçados'],['feature','Banner de destaque — Jaquetas']];const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erro na solicitação');return d}async function uploadImage(file){
  if(!file || !file.type.startsWith('image/')) throw Error('Escolha um arquivo de imagem.');
  const dataUrl=await compressImage(file);
  const d=await api('/api/admin/media',{method:'POST',body:JSON.stringify({mimeType:'image/jpeg',dataUrl})});
  return d.url;
}
function showDash(){ $('#loginView').hidden=true;$('#dashboard').hidden=false;loadProducts() }async function check(){try{const d=await api('/api/admin/me');if(d.authenticated)showDash()}catch(e){}}$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMessage').textContent='';try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});showDash()}catch(err){$('#loginMessage').textContent=err.message}};$('#logout').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});location.reload()};document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#productsTab').hidden=b.dataset.tab!=='products';$('#ordersTab').hidden=b.dataset.tab!=='orders';$('#coversTab').hidden=b.dataset.tab!=='covers';if(b.dataset.tab==='orders')loadOrders();if(b.dataset.tab==='covers')loadCovers()});async function loadProducts(){try{products=await api('/api/admin/products');renderEditor()}catch(e){$('#saveMessage').textContent=e.message}}function renderEditor(){$('#productEditor').innerHTML=products.map((p,i)=>`<article class="product-edit" data-index="${i}"><img src="${esc(p.image)}" alt=""><div class="fields"><label>Nome<input data-key="name" value="${esc(p.name)}"></label><label>Categoria<select data-key="category"><option ${p.category==='Camisetas'?'selected':''}>Camisetas</option><option ${p.category==='Calças'?'selected':''}>Calças</option><option ${p.category==='Jaquetas'?'selected':''}>Jaquetas</option><option ${p.category==='Calçados'?'selected':''}>Calçados</option><option ${p.category==='Acessórios'?'selected':''}>Acessórios</option></select></label><label class="field-check"><input type="checkbox" data-key="active" ${p.active!==false?'checked':''}> Produto visível na loja</label></div><div class="fields"><label>Preço (R$)<input type="number" min="0" step="0.01" data-key="price" value="${Number(p.price)||0}"></label><label>Preço anterior (R$)<input type="number" min="0" step="0.01" data-key="oldPrice" value="${Number(p.oldPrice)||0}"></label><label>Tamanhos separados por vírgula<input data-key="sizes" value="${esc((p.sizes||[]).join(', '))}"></label></div><div class="fields"><label>URL da foto (opcional)<input data-key="image" value="${esc(p.image)}" placeholder="https://..."></label><label>Ou escolher foto do celular/computador<input data-product-file="${i}" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Selo curto<input data-key="badge" value="${esc(p.badge||'')}"></label><label>Descrição<textarea data-key="description">${esc(p.description||'')}</textarea></label><button class="secondary" data-delete="${i}">EXCLUIR PRODUTO</button></div></article>`).join('');
document.querySelectorAll('.product-edit').forEach(card => {
  card.querySelectorAll('[data-key]').forEach(input => {
    input.onchange = () => {
      const index = Number(card.dataset.index);
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
});

document.querySelectorAll('.product-edit').forEach(card => {
  card.querySelectorAll('[data-key]').forEach(input => {
    input.onchange = () => {
      const index = Number(card.dataset.index);
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
});
document.querySelectorAll('[data-product-file]').forEach(el=>el.onchange=async()=>{const card=el.closest('.product-edit');const p=products[Number(card.dataset.index)];const key=el.dataset.key;let v=el.type==='checkbox'?el.checked:el.value;if(key==='price'||key==='oldPrice')v=Number(v);if(key==='sizes')v=v.split(',').map(s=>s.trim()).filter(Boolean);p[key]=v;if(key==='image')card.querySelector('img').src=v});document.querySelectorAll('[data-product-file]').forEach(el=>el.onchange=async()=>{
 const file=el.files?.[0]; if(!file)return;
 const card=el.closest('.product-edit'); const idx=Number(card.dataset.index); const msg=$('#saveMessage');
 msg.textContent='Enviando foto...'; msg.style.color='#d5ff37';
 try { const url=await uploadImage(file); products[idx].image=url; card.querySelector('[data-key="image"]').value=url; card.querySelector('img').src=url; msg.textContent='Foto carregada. Clique em SALVAR ALTERAÇÕES.'; }
 catch(e){msg.style.color='#ff9b88';msg.textContent=e.message}
});
document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{products.splice(Number(b.dataset.delete),1);renderEditor()})}$
$('#addProduct').onclick=()=>{
  products.push({
    id:'pc-'+Date.now(),
    name:'',
    category:'Camisetas',
    price:'',
    oldPrice:0,
    sizes:['P','M','G','GG'],
    badge:'NOVO',
    image:'',
    description:'',
    active:true
  });
  renderEditor()
};

$('#saveProducts').onclick = async () => {
  const btn = $('#saveProducts');
  btn.disabled = true;

  try {
    document.querySelectorAll('.product-edit').forEach(card => {
      const index = Number(card.dataset.index);

      card.querySelectorAll('[data-key]').forEach(input => {
        const key = input.dataset.key;
        let value;

        if (input.type === 'checkbox') {
          value = input.checked;
        } else {
          value = input.value.trim();
        }

        if (key === 'price' || key === 'oldPrice') {
          value = value === '' ? 0 : Number(value);
        }

        if (key === 'sizes') {
          value = value.split(',').map(s => s.trim()).filter(Boolean);
        }

        products[index][key] = value;
      });
    });

    const d = await api('/api/admin/products', {
      method: 'PUT',
      body: JSON.stringify(products)
    });

    products = d.products;
    $('#saveMessage').style.color = '#d5ff37';
    $('#saveMessage').textContent = 'Alterações salvas!';
    renderEditor();
  } catch (e) {
    $('#saveMessage').style.color = '#ff9b88';
    $('#saveMessage').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};
try{const d=await api('/api/admin/products',{method:'PUT',body:JSON.stringify(products)});products=d.products;$('#saveMessage').style.color='#d5ff37';$('#saveMessage').textContent='Alterações salvas!';renderEditor()}catch(e){$('#saveMessage').style.color='#ff9b88';$('#saveMessage').textContent=e.message}};async function loadOrders(){try{const orders=await api('/api/admin/orders');$('#ordersList').innerHTML=orders.length?orders.map(o=>`<article class="order-card"><div><b>${esc(o.id)}</b><small>${new Date(o.createdAt).toLocaleString('pt-BR')}</small></div><div><b>${esc(o.customer?.name||'Cliente')}</b><small>${esc(o.customer?.email||'')}<br>${esc(o.customer?.phone||'')}</small></div><div><b>${money(o.total)}</b><small class="status">Pagamento: ${esc(o.paymentStatus||'pendente')}</small><small>${(o.items||[]).map(i=>`${esc(i.name)} tam. ${esc(i.size)} ×${i.quantity}`).join('<br>')}</small></div><select data-order="${esc(o.id)}"><option value="aguardando_pagamento" ${o.status==='aguardando_pagamento'?'selected':''} disabled>Aguardando pagamento</option><option value="separando" ${o.status==='separando'?'selected':''}>Separando</option><option value="enviado" ${o.status==='enviado'?'selected':''}>Enviado</option><option value="concluido" ${o.status==='concluido'?'selected':''}>Concluído</option><option value="cancelado" ${o.status==='cancelado'?'selected':''}>Cancelado</option></select></article>`).join(''):'<p class="muted">Nenhum pedido registrado ainda.</p>';document.querySelectorAll('[data-order]').forEach(s=>s.onchange=async()=>{try{await api('/api/admin/orders/'+encodeURIComponent(s.dataset.order),{method:'PATCH',body:JSON.stringify({status:s.value})})}catch(e){alert(e.message)}})}catch(e){$('#ordersList').textContent=e.message}}$('#refreshOrders').onclick=loadOrders;check();

async function loadCovers(){try{covers=await api('/api/admin/collection-covers');coverFields.forEach(([k])=>{if(!(k in covers))covers[k]=''});renderCovers()}catch(e){$('#coverSaveMessage').textContent=e.message}}
function renderCovers(){$('#coverEditor').innerHTML=coverFields.map(([key,label])=>`<article class="cover-edit" data-cover-key="${key}"><div class="cover-preview" style="background-image:${covers[key] ? `url(&quot;${esc(covers[key])}&quot;)` : 'none'}"><span>${esc(label)}</span></div><div class="cover-fields"><label>${esc(label)} — URL da imagem<input data-cover-url="${key}" type="url" placeholder="https://..." value="${esc(covers[key] && !covers[key].startsWith('data:') ? covers[key] : '')}"></label><label>Escolher foto do celular/computador<input data-cover-file="${key}" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="cover-actions"><button type="button" class="secondary" data-cover-clear="${key}">DEIXAR PRETO / REMOVER</button></div></div></article>`).join('');document.querySelectorAll('[data-cover-url]').forEach(el=>el.onchange=()=>{covers[el.dataset.coverUrl]=el.value.trim();renderCovers()});document.querySelectorAll('[data-cover-file]').forEach(el=>el.onchange=async()=>{const file=el.files?.[0];if(!file)return;try{covers[el.dataset.coverFile]=await uploadImage(file);renderCovers()}catch(e){$('#coverSaveMessage').textContent=e.message}});document.querySelectorAll('[data-cover-clear]').forEach(b=>b.onclick=()=>{covers[b.dataset.coverClear]='';renderCovers()})}
function compressImage(file){return new Promise((resolve,reject)=>{
 if(!file.type.startsWith('image/'))return reject(Error('Escolha um arquivo de imagem.'));
 const reader=new FileReader();reader.onerror=()=>reject(Error('Não foi possível ler a imagem.'));
 reader.onload=()=>{const img=new Image();img.onerror=()=>reject(Error('Imagem inválida.'));
 img.onload=()=>{const scale=Math.min(1,1500/Math.max(img.width,img.height));const canvas=document.createElement('canvas');
 canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const out=canvas.toDataURL('image/jpeg',.76);
 if(out.length>2600000)return reject(Error('Imagem ainda muito grande. Escolha uma foto menor.'));
 resolve(out)};img.src=reader.result};reader.readAsDataURL(file)
})}
async function compressCover(file){return compressImage(file)}
$('#saveCovers').onclick=async()=>{const b=$('#saveCovers');b.disabled=true;try{const d=await api('/api/admin/collection-covers',{method:'PUT',body:JSON.stringify(covers)});covers=d.collectionCovers;$('#coverSaveMessage').style.color='#d5ff37';$('#coverSaveMessage').textContent='Capas salvas! Atualize a loja para conferir.';renderCovers()}catch(e){$('#coverSaveMessage').style.color='#ff9b88';$('#coverSaveMessage').textContent=e.message}finally{b.disabled=false}};
