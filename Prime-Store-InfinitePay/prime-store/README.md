# Prime Store — loja online

Loja virtual responsiva com catálogo editável, sacola, checkout integrado à InfinitePay e painel privado do lojista.

## Incluído
- Página responsiva para celular e computador.
- Catálogo com categorias, preços promocionais, tamanhos e fotos editáveis.
- Sacola de compras e seleção de tamanho.
- Checkout Integrado InfinitePay: o servidor cria um checkout dinâmico para o pedido e encaminha o cliente à página segura de pagamento da InfinitePay (Pix e cartão conforme configuração da conta).
- Validação de produtos, preços e tamanhos no servidor.
- Webhook que consulta a API de verificação da InfinitePay antes de marcar o pedido como pago.
- Painel privado em `/lojista`, com gestão de produtos e acompanhamento de pedidos.

## Configuração local
1. Instale Node.js 18 ou superior.
2. Extraia o ZIP e entre na pasta `prime-store`.
3. Execute `npm install`.
4. Copie `.env.example` para `.env`.
5. Configure `SESSION_SECRET`, `ADMIN_USER` e `ADMIN_PASSWORD` com valores fortes.
6. No app/site da InfinitePay, habilite Checkout Integrado e use sua InfiniteTag sem o símbolo `$` em `INFINITEPAY_HANDLE`.
7. Configure `BASE_URL` com a URL HTTPS pública da loja. O webhook será `https://SEU-DOMINIO/api/payments/webhook`.
8. Execute `npm start`.

## Antes de vender de verdade
- Substitua os produtos e imagens de demonstração no painel.
- Publique em hospedagem com HTTPS e armazenamento persistente.
- Configure credenciais seguras e teste uma compra de baixo valor antes de divulgar a loja.
- O status do pedido só muda para pago após consulta de verificação à API da InfinitePay.
- Este projeto usa JSON local para protótipo; para produção, migre pedidos/produtos para banco de dados e sessões para armazenamento persistente.
- O campo de endereço é guardado para contato/logística; configure cálculo de frete conforme a operação da loja.

## Painel
Acesse `/lojista` e entre com `ADMIN_USER` e `ADMIN_PASSWORD` definidos no `.env`. Troque as credenciais de exemplo antes de publicar.
