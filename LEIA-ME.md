# Sistema de Votação — Eleição de Liderança 2026
### Igreja Cristã Presbiteriana Missionária

- **Telas** (HTML, CSS, JavaScript) → ficam no **GitHub Pages**
- **Votos** → ficam numa **Planilha Google**, gravados por um script do próprio Google (Apps Script)

Formato: o membro vota **SIM ou NÃO** em cada candidato, uma única vez.

---

## Arquivos

```
index.html        ← tela inicial
votar.html        ← votação
admin.html        ← painel do administrador (senha 3524)
resultados.html   ← resultado público (só se você liberar)
css/style.css     ← cores e visual
js/config.js      ← AQUI vai o endereço do script do Google
js/...            ← funcionamento das telas
img/...           ← logo da igreja
google-apps-script/Codigo.gs   ← o "servidor" (vai dentro da Planilha Google)
```

---

## PARTE 1 — Criar a Planilha Google e o script (10 min)

1. Entre em https://sheets.google.com com a conta Google da igreja e crie uma **planilha em branco**.
   Dê um nome, ex: **Eleição 2026 - Votos**.
2. No menu da planilha: **Extensões → Apps Script**.
3. Apague todo o código que aparece e cole **todo** o conteúdo do arquivo `google-apps-script/Codigo.gs`.
   Clique no ícone de **disquete (Salvar)**.
4. Na barra de cima, ao lado de "Depurar", escolha a função **configurar** e clique em **▶ Executar**.
5. O Google vai pedir permissão:
   **Revisar permissões** → escolha sua conta → aparece "O Google não verificou este app" →
   clique em **Avançado** → **Acessar (nome do projeto) (não seguro)** → **Permitir**.
   (É normal: o "app" é o seu próprio script.)
6. Volte para a planilha: devem aparecer as abas **Resultado, Candidatos, Eleitores, Configurações**,
   já com os 11 candidatos.
7. No Apps Script, clique em **Implantar → Nova implantação**.
   - Clique na engrenagem ⚙ ao lado de "Selecionar tipo" → **App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique em **Implantar**
8. Copie o **URL do app da Web** (termina com `/exec`).

## PARTE 2 — Colocar no GitHub Pages (5 min)

1. No GitHub, crie um repositório novo, ex: **eleicao** (pode ser público — o arquivo de senha fica no Google, não aqui).
2. **Add file → Upload files** → arraste **tudo** desta pasta (index.html, votar.html, admin.html,
   resultados.html e as pastas css, js, img) → **Commit changes**.
   (A pasta google-apps-script não precisa ir, mas não atrapalha.)
3. No repositório, abra **js/config.js** → clique no **lápis (Edit)** → troque
   `COLE_AQUI_O_ENDERECO_DO_APPS_SCRIPT` pelo endereço copiado no passo 8 (mantenha as aspas) → **Commit changes**.
   ```js
   const API_URL = "https://script.google.com/macros/s/AKfy..../exec";
   ```
4. **Settings → Pages** → Fonte: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**.
5. Em 1–2 minutos o site fica em: `https://SEU-USUARIO.github.io/eleicao/`

---

## Onde ver os votos

Abra a **Planilha Google** (no Google Drive, ou pelo botão **Abrir Planilha Google** no painel):

| Aba | O que mostra |
|---|---|
| **Resultado** | Apuração pronta: SIM, NÃO, total, % de SIM e se foi ELEITO. Atualiza a cada voto. |
| **Candidatos** | Nome, categoria, foto e o total de votos SIM e NÃO de cada um. |
| **Eleitores** | Quem pode votar, se já votou e quando. |
| **Configurações** | Nome da igreja, % mínimo, período da votação, resultado público. |

A planilha guarda só o **total** de SIM e NÃO de cada candidato — nunca como cada pessoa votou.
**Não compartilhe a planilha** (ela tem os CPFs). O site funciona com ela privada.

## Usar o painel (`admin.html`, usuário `admin`, senha `3524`)

- **Resultados** — SIM, NÃO, %, Eleito/Não eleito, exportar PDF/Excel, abrir a Planilha Google.
- **Candidatos** — cadastrar, editar (foto vai para uma pasta "Fotos - Votação" no seu Drive) e excluir.
- **Eleitores** — um por vez ou lista colada (`Nome;CPF`, uma pessoa por linha; pode colar do Excel).
  Sem CPF? Cole só os nomes e clique **Gerar códigos**. Também dá para digitar direto na aba Eleitores da planilha
  (preencha ID, Nome, CPF e "Não" em "Já votou").
- **Configurações** — % mínimo de SIM (padrão: mais de 50%), início/fim da votação, mostrar resultado ao público,
  **Zerar votação** (use depois dos testes).

## Trocar a senha

Apps Script → no topo do código mude `var ADMIN_SENHA = "3524";` → Salvar →
**Implantar → Gerenciar implantações → ✏ (editar) → Versão: Nova versão → Implantar**.

> Sempre que mudar o código do script, faça esse "Nova versão" — assim o endereço `/exec` continua o mesmo.

## Enviar para os membros

> Graça e paz! A votação para a liderança 2026 está aberta até DD/MM às HH:MM.
> Vote aqui: https://SEU-USUARIO.github.io/eleicao/
> Use seu nome e seu CPF (ou o código que você recebeu).

Não envie o link do `admin.html`.

---

## Segurança e capacidade

- **1 pessoa = 1 voto:** o script trava a planilha enquanto grava cada voto; quem chega junto espera na fila
  e, se o Google pedir para esperar, o site tenta de novo sozinho.
- **Voto secreto:** só os totais por candidato são gravados.
- **Capacidade:** cada voto leva por volta de 1 segundo no Google. Para dezenas de pessoas votando ao longo do
  dia não há problema. Se todos forem votar no **mesmo minuto** (ex: logo após o culto), alguns podem esperar
  ou precisar clicar de novo em "Confirmar Voto" — prefira deixar a votação aberta por um período maior.
- **Backup:** no final, na planilha: **Arquivo → Fazer download → Microsoft Excel (.xlsx)**.
