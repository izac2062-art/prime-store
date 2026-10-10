# Prime Store — Vercel + InfinitePay

Loja virtual responsiva com catálogo editável, sacola, checkout InfinitePay e painel privado do lojista. Esta edição substitui o armazenamento em arquivos JSON por PostgreSQL e guarda as sessões de administrador no banco, compatível com o modelo serverless da Vercel.

## Recursos
- Catálogo e preços validados no servidor.
- Carrinho com seleção de tamanho.
- Checkout dinâmico InfinitePay (o cliente finaliza o pagamento na página segura da InfinitePay).
- Webhook com consulta `payment_check` antes de marcar o pedido como pago.
- Painel privado em `/lojista` para produtos e pedidos.
- PostgreSQL para persistência de produtos, pedidos e sessões.
- Proteção contra tentativas repetidas de login e senha administrativa forte obrigatória.
- Endpoint de diagnóstico `/api/health`.

## Publicação na Vercel
1. Faça backup do projeto conectado ao GitHub antes de substituir os arquivos.
2. Copie os arquivos desta pasta para a raiz do repositório da loja e faça commit/push.
3. Crie um banco PostgreSQL (por exemplo, Neon) e copie a string de conexão `DATABASE_URL`.
4. Na Vercel, abra **Project → Settings → Environment Variables** e cadastre:
   - `DATABASE_URL`: string de conexão PostgreSQL com TLS.
   - `SESSION_SECRET`: segredo aleatório longo (mínimo recomendado 32 caracteres).
   - `ADMIN_USER`:primestore26
   - `ADMIN_PASSWORD`:primestore2026
   - `INFINITEPAY_HANDLE`: InfiniteTag sem o símbolo `$`.
   - `BASE_URL`: URL HTTPS pública da loja, por exemplo `https://seu-projeto.vercel.app`, sem barra no final.
5. Faça um novo deployment após cadastrar as variáveis.
6. Abra `/api/health` e confirme `ok: true` e `database: connected`.
7. Abra `/lojista` e confirme que o login funciona.
8. No app/site da InfinitePay, habilite Checkout Integrado. A criação de links usa `POST https://api.checkout.infinitepay.io/links`; a confirmação consulta `POST https://api.checkout.infinitepay.io/payment_check`.
9. Faça um pedido real de baixo valor somente quando a conta estiver configurada e confira o webhook e o pedido no painel.

## Variáveis e segurança
- Não coloque segredos em arquivos do frontend nem no GitHub. Configure-os somente em Environment Variables na Vercel.
- Não use senha padrão. A aplicação bloqueia o login do painel enquanto `ADMIN_USER` e `ADMIN_PASSWORD` fortes não estiverem configurados.
- A primeira inicialização cria as tabelas automaticamente e importa os produtos de demonstração se o catálogo do banco estiver vazio.
- O banco deve ser PostgreSQL acessível pela Vercel. O armazenamento em disco da função não é usado para pedidos ou produtos.

## Importante
O projeto não está publicado nem foi testado com a conta InfinitePay do lojista. Antes de anunciar a loja, confirme o banco, variáveis de ambiente, URL pública, login, webhook e um pagamento de teste. Substitua produtos e imagens demonstrativos no painel. Frete/cálculo de entrega ainda não está implementado.


### Acesso discreto do lojista

O link de acesso foi removido do rodapé da loja. Para abrir a área do lojista pela página principal, pressione **Ctrl + Shift + L** e, em seguida, **Ç** em até 3 segundos. A rota `/lojista` continua protegida pelo login administrativo; o atalho apenas oculta o acesso visual.

## IMPORTANTE: implantação na Vercel
Este pacote está organizado para que os arquivos do projeto fiquem diretamente na raiz do repositório. Ao importar o repositório `prime-store` na Vercel, deixe **Root Directory** vazio (raiz do repositório), ou selecione a pasta que contém diretamente este `package.json`. Não informe o nome deste ZIP nem `Prime-Store-BK-Concept-Layout...` como diretório raiz.

Depois de importar, configure as variáveis de ambiente necessárias em Vercel > Settings > Environment Variables, especialmente `DATABASE_URL` e as demais variáveis descritas em `.env.example`, e faça um novo deploy.
