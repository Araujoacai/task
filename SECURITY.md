# 🔒 Segurança no AppAlerta (Guia de Proteção)

O AppAlerta foi construído utilizando a Arquitetura Frontend-to-Backend servida nativamente pelo Firebase. Este modelo requer atenção aos seguintes pilares de segurança implementados e aos próximos passos no painel do administrador.

## 1. As API Keys Expostas (A "Falsa Exposição")
No Firebase Web, as `apiKey`, `appId` e `projectId` presentes no `firebase-config.js` **não são chaves secretas servidor-servidor**.
Elas são apenas **identificadores públicos** que dizem ao Google: "Este cliente quer se conectar ao projeto XYZ". 

⚠️ **Mas, como um invasor poderia usá-las?**
Se ele copiar suas chaves da aba 'Network' do navegador, ele não roubará o banco de dados (porque as *Security Rules* protegem isso), MAS ele poderá "clonar" o seu site, hospedá-lo no computador particular e usar **sua** cota (Banda, Leituras e Escritas), gerando custos.

**✅ SOLUÇÃO OBRIGATÓRIA (Faça isso agora no Console):**
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Selecione o projeto `appalerta-d748b`.
3. Vá em **APIs e Serviços > Credenciais**.
4. Clique na sua *API Key do Firebase*.
5. Em **Restrições de chave (Restrições de Aplicativos)**, selecione "Servidores HTTP (Referenciadores HTTP)".
6. Adicione *apenas* os domínios onde o AppAlerta está rodando oficialmente (ex: `https://meu-appalerta.com/*` e `http://localhost:*` caso esteja desenvolvendo).

*Pronto. Agora sua chave só funciona no seu domínio. Se o atacante tentar usar em outro site, a requisição será rejeitada imediatamente.*

## 2. Regras de Segurança do Firestore (Firestore Rules)
Para evitar injeções ou *Data Breaches*, adicionei ao repositório o arquivo `firestore.rules`.
No momento, a regra configurada lá (e que você deve colar na aba de "Rules" dentro da página do "Firestore Database" no Firebase Console) garante que:

- NINGUÉM não-autenticado lê absolutamente nada.
- O Usuário A (`uid: 123`) só consegue ler documentos (`fetch`) se o campo interno `userId == '123'`.
- O Usuário A não pode criar uma tarefa e dizer que foi o Usuário B.

**👉 Como aplicar:** Copie o texto de `firestore.rules` e cole na aba de "Rules" do Cloud Firestore no painel do Firebase.

## 3. Segurança no Kubernetes
- O *LoadBalancer* (`k8s-service.yaml`) expõe o serviço na porta 80. Em produção real, você deve instalar um Ingress (como `nginx-ingress`) e vincular o `cert-manager` para fornecer TLS (HTTPS `porta 443`) gratuito automatizado (Let's Encrypt), fechando o tráfego HTTP sem criptografia.
- As comunicações Auth e Firestore do Firebase já fluem internamente e obrigatoriamente sob *SSL/TLS seguro (wss://)* embutido na biblioteca do Firebase instalada por nós.

## 4. Evitando Ataques XSS e CSRF
O AppAlerta **não** utiliza injeção de HTML puro (`innerHTML` sem sanitização), limitando severamente os ataques de *Cross-Site Scripting* (XSS) via entrada do usuário manual ou entrada do Chatbot de IA, pois renderiza via `.textContent` com o Firebase blindando a string JSON. Da mesma forma, a infraestrutura base do Google Firebase Auth já previne CSRF em operações sensíveis através de tokens renováveis em curta duração.
