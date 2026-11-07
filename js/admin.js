// ================================================================
// PAINEL ADMINISTRATIVO
// Abas: Resultados | Etapas | Candidatos | Eleitores | Configurações
// ================================================================
const CATEGORIAS = [
  { key: "pastor", label: "Pastores", singular: "Pastor", fase: 1 },
  { key: "presbitero", label: "Presbíteros", singular: "Presbítero", fase: 1 },
  { key: "diacono", label: "Diáconos", singular: "Diácono", fase: 1 },
  { key: "presidencia", label: "Presidente e Vice (etapa 2)", singular: "Presidência", fase: 2 },
  { key: "tesoureiro", label: "Tesoureiro (etapa 3)", singular: "Tesoureiro", fase: 3 },
  { key: "secretario", label: "1º e 2º Secretário (etapa 4)", singular: "Secretário", fase: 4 },
  { key: "exame", label: "Exame de Contas (etapa 5)", singular: "Exame de Contas", fase: 5 },
];
const FASES = [
  { n: 1, label: "Pastores, Presbíteros e Diáconos", como: "SIM, NÃO ou BRANCO em cada nome. Eleito quem passar do % mínimo." },
  { n: 2, label: "Presidente e Vice-presidente", como: "Candidatos = pastores eleitos na etapa 1. SIM, NÃO ou BRANCO; 1º lugar = Presidente, 2º lugar = Vice-presidente, os demais continuam Pastor." },
  { n: 3, label: "Tesoureiro", como: "Candidatos = presbíteros eleitos na etapa 1. Cada membro escolhe 1 nome (ou vota em branco); o mais votado é o Tesoureiro." },
  { n: 4, label: "1º e 2º Secretário", como: "Candidatos = presbíteros eleitos, menos o Tesoureiro. SIM, NÃO ou BRANCO; 1º lugar = 1º Secretário, 2º lugar = 2º Secretário." },
  { n: 5, label: "Exame de Contas", como: "Você cadastra os nomes na hora (aba Candidatos). SIM, NÃO ou BRANCO; os mais votados ocupam as vagas." },
];

// ---------- Login ----------
(async function iniciar() {
  if (!tokenAdmin()) return mostrarLogin();
  const { ok, dados } = await chamar("me");
  ok && dados.admin ? abrirPainel() : (guardarToken(null), mostrarLogin());
})();

function mostrarLogin() {
  $("#painel").classList.add("oculto");
  $("#tela-login").classList.remove("oculto");
  $("#senha").focus();
}

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#btn-entrar");
  btn.disabled = true; btn.textContent = "Entrando…";
  const { ok, dados } = await chamar("login", { user: $("#usuario").value, password: $("#senha").value });
  btn.disabled = false; btn.textContent = "Entrar";
  if (!ok) {
    $("#erro-login").textContent = dados.error || "Falha no login";
    $("#erro-login").classList.remove("oculto");
    return;
  }
  $("#senha").value = "";
  guardarToken(dados.token);
  abrirPainel();
});

$("#sair").addEventListener("click", async () => {
  guardarToken(null);
  location.reload();
});

let resultadosIniciados = false;
let URL_PLANILHA = "";
async function abrirPainel() {
  $("#tela-login").classList.add("oculto");
  $("#painel").classList.remove("oculto");
  if (!resultadosIniciados) {
    resultadosIniciados = true;
    const { ok, dados } = await chamar("settings");  // pega o link da Planilha Google
    if (ok) URL_PLANILHA = dados.spreadsheet_url;
    iniciarResultados($("#aba-resultados"), { planilhaUrl: URL_PLANILHA });
  }
}

// se a sessão expirar no meio do uso, volta para o login
function sessaoExpirou(status) {
  if (status === 401) { guardarToken(null); alert("Sua sessão expirou. Entre novamente."); location.reload(); return true; }
  return false;
}

// ---------- Abas ----------
$$(".abas button").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".abas button").forEach((x) => x.classList.toggle("ativa", x === b));
    $$("main > section").forEach((s) => s.classList.add("oculto"));
    $(`#aba-${b.dataset.aba}`).classList.remove("oculto");
    if (b.dataset.aba === "etapas") abaEtapas();
    if (b.dataset.aba === "candidatos") abaCandidatos();
    if (b.dataset.aba === "eleitores") abaEleitores();
    if (b.dataset.aba === "config") abaConfig();
  })
);

// Diminui a foto no próprio navegador (máx. 600px, JPEG) e manda para o Google Drive
function reduzirImagem(arquivo, max = 600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // fundo branco p/ PNG transparente
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = () => reject(new Error("imagem inválida"));
    img.src = URL.createObjectURL(arquivo);
  });
}

async function enviarImagem(arquivo) {
  let base64;
  try { base64 = await reduzirImagem(arquivo); } catch { alert("Não foi possível ler essa imagem."); return null; }
  const { ok, status, dados } = await chamar("upload", { base64 });
  if (sessaoExpirou(status)) return null;
  if (!ok) { alert(dados.error || "Erro ao enviar a imagem."); return null; }
  return dados.url;
}

// ================================================================
// ABA CANDIDATOS
// ================================================================
const VAZIO = { id: null, category: "pastor", name: "", description: "", photo_url: "", sort_order: 0 };
let formCand = { ...VAZIO };
let candidatos = [];

async function abaCandidatos(msg = "") {
  const { ok, status, dados } = await chamar("candidates");
  if (sessaoExpirou(status)) return;
  if (ok) candidatos = dados.list;
  desenharCandidatos(msg);
}

function desenharCandidatos(msg = "") {
  const f = formCand;
  $("#aba-candidatos").innerHTML = `
  <div class="grade-2 grade-form">
    <form id="form-cand" class="card pad">
      <div class="titulo-card">${f.id ? "Editar candidato" : "Novo candidato"}</div>
      <div class="grupo">
        <span class="rotulo">Categoria</span>
        <div class="seletor-cat">
          ${CATEGORIAS.map((c) => `<button type="button" data-cat="${c.key}" class="${f.category === c.key ? "ativo" : ""}">${c.singular}</button>`).join("")}
        </div>
      </div>
      <div class="grupo"><label class="rotulo" for="c-nome">Nome</label>
        <input id="c-nome" class="campo" required value="${esc(f.name)}" placeholder="Ex: Diac. João Silva"></div>
      <div class="grupo"><label class="rotulo" for="c-desc">Breve descrição</label>
        <textarea id="c-desc" class="campo" maxlength="240" placeholder="Ex: Candidato à reeleição">${esc(f.description || "")}</textarea></div>
      <div class="grupo"><span class="rotulo">Foto</span>
        <div class="foto-linha">
          <span id="c-foto-prev">${avatar(f.photo_url, f.name || "?", 56)}</span>
          <label class="btn btn-contorno btn-pequeno" style="cursor:pointer">Escolher foto
            <input id="c-foto" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          ${f.photo_url ? `<button type="button" class="link-btn vermelho pequeno" id="c-foto-rem">remover</button>` : ""}
        </div></div>
      <div class="grupo"><label class="rotulo" for="c-ordem">Ordem de exibição</label>
        <input id="c-ordem" type="number" class="campo" value="${esc(f.sort_order)}">
        <p class="pequeno texto-suave" style="margin:4px 0 0">Menor aparece primeiro.</p></div>
      ${msg ? `<div class="alerta info">${esc(msg)}</div>` : ""}
      <div class="linha-botoes">
        ${f.id ? `<button type="button" class="btn btn-contorno flex1" id="c-cancelar">Cancelar</button>` : ""}
        <button class="btn btn-verde flex2">Salvar</button>
      </div>
    </form>

    <div>
      ${CATEGORIAS.map((cat) => {
        const itens = candidatos.filter((c) => c.category === cat.key);
        return `<section class="card" style="margin-bottom:20px">
          <div class="cab-lista">${cat.label} <small>(${itens.length})</small></div>
          ${itens.length === 0 ? `<p class="texto-suave pequeno" style="padding:0 20px 16px">Nenhum cadastrado.</p>` : `
          <ul class="lista-admin">${itens.map((c) => `
            <li>${avatar(c.photo_url, c.name, 44)}
              <div class="meio"><strong>${esc(c.name)}</strong>${c.description ? `<div class="d">${esc(c.description)}</div>` : ""}</div>
              <button class="link-btn verde pequeno" data-editar="${c.id}">Editar</button>
              <button class="link-btn vermelho pequeno" data-excluir="${c.id}">Excluir</button>
            </li>`).join("")}</ul>`}
        </section>`;
      }).join("")}
    </div>
  </div>`;

  const lerCampos = () => {
    formCand.name = $("#c-nome").value;
    formCand.description = $("#c-desc").value;
    formCand.sort_order = $("#c-ordem").value;
  };

  $$("[data-cat]").forEach((b) => b.addEventListener("click", () => { lerCampos(); formCand.category = b.dataset.cat; desenharCandidatos(); }));
  $("#c-foto").addEventListener("change", async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    lerCampos();
    $("#c-foto-prev").innerHTML = '<span class="pequeno">Enviando…</span>';
    const url = await enviarImagem(arq);
    if (url) formCand.photo_url = url;
    desenharCandidatos();
  });
  $("#c-foto-rem")?.addEventListener("click", () => { lerCampos(); formCand.photo_url = ""; desenharCandidatos(); });
  $("#c-cancelar")?.addEventListener("click", () => { formCand = { ...VAZIO }; desenharCandidatos(); });

  $("#form-cand").addEventListener("submit", async (e) => {
    e.preventDefault();
    lerCampos();
    const editando = !!formCand.id;
    const { ok, status, dados } = await chamar("candidate_save", { candidate: formCand });
    if (sessaoExpirou(status)) return;
    if (!ok) return desenharCandidatos(dados.error || "Erro ao salvar.");
    formCand = { ...VAZIO, category: formCand.category };
    abaCandidatos(editando ? "Candidato atualizado." : "Candidato cadastrado.");
  });

  $$("[data-editar]").forEach((b) => b.addEventListener("click", () => {
    const c = candidatos.find((x) => x.id === Number(b.dataset.editar));
    formCand = { ...c, description: c.description || "", photo_url: c.photo_url || "" };
    desenharCandidatos();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  $$("[data-excluir]").forEach((b) => b.addEventListener("click", async () => {
    const c = candidatos.find((x) => x.id === Number(b.dataset.excluir));
    if (!confirm(`Excluir ${c.name}? Os votos que ele recebeu também serão apagados.`)) return;
    const { status } = await chamar("candidate_delete", { id: c.id });
    if (sessaoExpirou(status)) return;
    if (formCand.id === c.id) formCand = { ...VAZIO };
    abaCandidatos("Candidato excluído.");
  }));
}

// ================================================================
// ABA ELEITORES
// ================================================================
let eleitores = [];
const filtroEleitores = { busca: "", situacao: "todos", mostrarDoc: false };

let modoCodigoLigado = false, nomeIgreja = "";
async function abaEleitores(msg = "") {
  const [v, c] = await Promise.all([chamar("voters"), chamar("settings")]);
  if (sessaoExpirou(v.status)) return;
  if (v.ok) eleitores = v.dados.list;
  if (c.ok) { modoCodigoLigado = !!c.dados.usar_codigo; nomeIgreja = c.dados.church_name || ""; }
  desenharEleitores(msg);
}

// eleitores que têm código (gerado aqui ou digitado), sem CPF
const comCodigo = () => eleitores.filter((v) => !/^\d{11}$/.test(v.doc));

function mascarar(doc) {
  return /^\d{11}$/.test(doc) ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**` : doc;
}

function desenharEleitores(msg = "") {
  const votaram = eleitores.filter((v) => v.has_voted).length;
  const pct = eleitores.length ? (votaram / eleitores.length) * 100 : 0;

  $("#aba-eleitores").innerHTML = `
    <div class="resumo">
      <div class="card numero"><div class="r">Eleitores</div><div class="v">${eleitores.length}</div></div>
      <div class="card numero"><div class="r">Já votaram</div><div class="v">${votaram}</div></div>
      <div class="card numero"><div class="r">Faltam votar</div><div class="v">${eleitores.length - votaram}</div></div>
      <div class="card numero destaque"><div class="r">Participação</div><div class="v">${porcentagem(pct)}</div></div>
    </div>

    <section class="card pad mt-g">
      <div class="titulo-card" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        Códigos de votação
        <span class="etiqueta ${modoCodigoLigado ? "eleito" : "neutra"}">${modoCodigoLigado ? "Ligado: os membros votam com código" : "Desligado (ligue em Configurações)"}</span>
      </div>
      <p class="pequeno texto-suave" style="margin-top:0">Gere um código para cada membro presente. Imprima os cartões (com QR Code)
        ou copie a lista para mandar pelo WhatsApp. Entregue os cartões <strong>sem anotar quem recebeu qual</strong>:
        assim nem a mesa sabe de quem é cada código, e o voto continua secreto.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input id="c-qtd" type="number" min="1" max="1000" class="campo" style="width:110px" value="50" aria-label="Quantidade de códigos">
        <button type="button" class="btn btn-verde" id="c-gerar">Gerar códigos</button>
        <button type="button" class="btn btn-contorno" id="c-imprimir" ${comCodigo().length ? "" : "disabled"}>Imprimir cartões (${comCodigo().length})</button>
        <button type="button" class="btn btn-contorno" id="c-copiar" ${comCodigo().length ? "" : "disabled"}>Copiar lista</button>
        <button type="button" class="link-btn vermelho pequeno" id="c-apagar">Apagar códigos gerados</button>
      </div>
    </section>

    <div class="grade-2 mt-g">
      <form id="form-um" class="card pad">
        <div class="titulo-card">Adicionar eleitor</div>
        <div class="grupo"><input id="e-nome" class="campo" placeholder="Nome completo" required></div>
        <div class="grupo"><input id="e-doc" class="campo" placeholder="CPF ou código" required></div>
        <button class="btn btn-verde largura-total mt">Adicionar</button>
      </form>

      <div class="card pad">
        <div class="titulo-card">Importar lista</div>
        <p class="pequeno texto-suave" style="margin-top:0">Um eleitor por linha no formato <code>Nome;CPF</code>.
          Pode colar duas colunas direto do Excel. Quem não tiver CPF: escreva só o nome e clique em “Gerar códigos”.</p>
        <textarea id="e-lote" class="campo" style="min-height:130px;font-family:ui-monospace,Consolas,monospace;font-size:14px"
          placeholder="Maria da Silva;123.456.789-00&#10;João Souza;987.654.321-00&#10;Ana Lima"></textarea>
        <div class="linha-botoes" style="margin-top:12px">
          <button type="button" class="btn btn-contorno flex1" id="e-gerar">Gerar códigos</button>
          <button type="button" class="btn btn-verde flex1" id="e-importar">Importar</button>
        </div>
      </div>
    </div>

    ${msg ? `<div class="alerta info">${esc(msg)}</div>` : ""}

    <section class="card mt-g">
      <div class="filtros">
        <input id="f-busca" class="campo" placeholder="Buscar nome ou CPF/código" value="${esc(filtroEleitores.busca)}">
        <select id="f-sit" class="campo">
          <option value="todos">Todos</option>
          <option value="sim" ${filtroEleitores.situacao === "sim" ? "selected" : ""}>Já votaram</option>
          <option value="nao" ${filtroEleitores.situacao === "nao" ? "selected" : ""}>Ainda não votaram</option>
        </select>
        <label class="pequeno"><input type="checkbox" id="f-doc" ${filtroEleitores.mostrarDoc ? "checked" : ""}> mostrar CPF completo</label>
        ${URL_PLANILHA ? `<a class="btn btn-verde btn-pequeno direita" href="${esc(URL_PLANILHA)}" target="_blank" rel="noopener">Abrir Planilha Google</a>` : ""}
      </div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nome</th><th>CPF / Código</th><th>Situação</th><th></th></tr></thead>
        <tbody id="e-corpo"></tbody>
      </table></div>
    </section>`;

  desenharTabelaEleitores();

  $("#form-um").addEventListener("submit", async (e) => {
    e.preventDefault();
    await cadastrar([{ name: $("#e-nome").value, doc: $("#e-doc").value }]);
  });

  $("#e-importar").addEventListener("click", async () => {
    const linhas = $("#e-lote").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) return;
    const lista = linhas.map((l) => {
      const p = l.split(/[;\t]/);
      if (p.length < 2) { const i = l.lastIndexOf(","); return i > 0 ? { name: l.slice(0, i), doc: l.slice(i + 1) } : { name: l, doc: "" }; }
      return { name: p[0].trim(), doc: (p[1] || "").trim() };
    });
    await cadastrar(lista);
  });

  // gera um código de 6 caracteres para quem não tem CPF
  $("#e-gerar").addEventListener("click", () => {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I para não confundir
    $("#e-lote").value = $("#e-lote").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      if (/[;\t]/.test(l)) return l;
      let cod = "";
      for (let i = 0; i < 6; i++) cod += letras[Math.floor(Math.random() * letras.length)];
      return `${l};${cod}`;
    }).join("\n");
  });

  $("#c-gerar").addEventListener("click", async (e) => {
    const qtd = Number($("#c-qtd").value);
    if (!(qtd >= 1 && qtd <= 1000)) return alert("Informe de 1 a 1000 códigos.");
    e.target.disabled = true;
    const { ok, status, dados } = await chamar("codigos_gerar", { quantidade: qtd });
    if (sessaoExpirou(status)) return;
    abaEleitores(ok ? `${dados.codes.length} código(s) gerado(s). Agora imprima os cartões ou copie a lista.` : dados.error);
  });
  $("#c-imprimir").addEventListener("click", imprimirCartoes);
  $("#c-copiar").addEventListener("click", async (e) => {
    const texto = comCodigo().map((v) => v.doc).join("\n");
    try { await navigator.clipboard.writeText(texto); e.target.textContent = "Lista copiada ✓"; }
    catch { prompt("Copie a lista:", texto); }
  });
  $("#c-apagar").addEventListener("click", async () => {
    if (prompt("Apagar TODOS os códigos gerados (Código 001, 002…)?\nOs eleitores com nome continuam.\n\nDigite APAGAR para confirmar:") !== "APAGAR") return;
    const { ok, status, dados } = await chamar("codigos_apagar", { confirm: "APAGAR" });
    if (sessaoExpirou(status)) return;
    abaEleitores(ok ? `${dados.removed} código(s) apagado(s).` : dados.error);
  });

  $("#f-busca").addEventListener("input", (e) => { filtroEleitores.busca = e.target.value; desenharTabelaEleitores(); });
  $("#f-sit").addEventListener("change", (e) => { filtroEleitores.situacao = e.target.value; desenharTabelaEleitores(); });
  $("#f-doc").addEventListener("change", (e) => { filtroEleitores.mostrarDoc = e.target.checked; desenharTabelaEleitores(); });
}

async function cadastrar(lista) {
  const { ok, status, dados } = await chamar("voters_add", { voters: lista });
  if (sessaoExpirou(status)) return;
  if (!ok) return abaEleitores(dados.error || "Erro ao cadastrar.");
  let m = `${dados.inserted} cadastrado(s).`;
  if (dados.skipped) m += ` ${dados.skipped} já existia(m).`;
  if (dados.invalid) m += ` ${dados.invalid} linha(s) sem nome ou CPF/código.`;
  abaEleitores(m);
}

function desenharTabelaEleitores() {
  const b = filtroEleitores.busca.toLowerCase();
  const lista = eleitores.filter((v) =>
    (filtroEleitores.situacao === "todos" || (filtroEleitores.situacao === "sim" ? v.has_voted : !v.has_voted)) &&
    (!b || v.name.toLowerCase().includes(b) || v.doc.toLowerCase().includes(b))
  );
  $("#e-corpo").innerHTML = lista.length === 0
    ? `<tr><td colspan="4" class="vazio">Nenhum eleitor.</td></tr>`
    : lista.map((v) => `<tr>
        <td><strong>${esc(v.name)}</strong></td>
        <td class="mono">${esc(filtroEleitores.mostrarDoc ? v.doc : mascarar(v.doc))}</td>
        <td>${v.has_voted ? `<span class="etiqueta sim">Votou · ${dataHora(v.voted_at)}</span>` : `<span class="etiqueta neutra">Não votou</span>`}</td>
        <td style="text-align:right"><button class="link-btn vermelho pequeno" data-rem="${v.id}">remover</button></td>
      </tr>`).join("");
  $$("[data-rem]").forEach((btn) => btn.addEventListener("click", async () => {
    const v = eleitores.find((x) => x.id === Number(btn.dataset.rem));
    if (!confirm(`Remover ${v.name} da lista de eleitores?`)) return;
    const { status } = await chamar("voter_delete", { id: v.id });
    if (sessaoExpirou(status)) return;
    abaEleitores("Eleitor removido.");
  }));
}

// ================================================================
// ABA CONFIGURAÇÕES
// ================================================================
// ISO (UTC) -> valor do campo datetime-local (horário do computador)
function paraCampo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const paraISO = (v) => (v ? new Date(v).toISOString() : null);

let cfg = null;

async function abaConfig(msg = "") {
  const { ok, status, dados } = await chamar("settings");
  if (sessaoExpirou(status)) return;
  if (ok) cfg = dados;
  desenharConfig(msg);
}

function desenharConfig(msg = "") {
  $("#aba-config").innerHTML = `
  <form id="form-cfg" class="grade-2">
    <section class="card pad">
      <div class="titulo-card">Identidade</div>
      <div class="grupo"><label class="rotulo" for="g-igreja">Nome da igreja</label>
        <input id="g-igreja" class="campo" value="${esc(cfg.church_name)}"></div>
      <div class="grupo"><label class="rotulo" for="g-titulo">Título da eleição</label>
        <input id="g-titulo" class="campo" value="${esc(cfg.title)}"></div>
      <div class="grupo"><span class="rotulo">Logo (opcional)</span>
        <div class="foto-linha">
          ${seloLogo(cfg.logo_url, 56)}
          <label class="btn btn-contorno btn-pequeno" style="cursor:pointer">Enviar outra logo
            <input id="g-logo" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
          ${cfg.logo_url ? `<button type="button" class="link-btn vermelho pequeno" id="g-logo-rem">voltar à logo padrão</button>` : ""}
        </div></div>
    </section>

    <section class="card pad">
      <div class="titulo-card">Critério de eleição</div>
      <p class="pequeno texto-suave" style="margin-top:0">Cada membro vota <strong>SIM</strong>, <strong>NÃO</strong> ou <strong>BRANCO</strong> em cada candidato.
        É eleito quem tiver a porcentagem de SIM (sobre SIM + NÃO dele) <strong>maior</strong> que o valor abaixo.</p>
      <label class="rotulo" for="g-min">Precisa ter mais de … % de SIM</label>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="g-min" type="number" min="0" max="99" class="campo" style="width:110px;text-align:center" value="${cfg.min_percent}">
        <strong style="font-size:20px">%</strong>
      </div>
      <p class="pequeno texto-suave">50 = maioria simples (metade + 1). Use 66 para dois terços, se o estatuto exigir.
        Vale para a etapa 1 (Pastores, Presbíteros e Diáconos).</p>
      <label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer;margin-top:14px">
        <input id="g-brancos" type="checkbox" style="width:22px;height:22px;margin-top:3px;accent-color:#e8792a" ${cfg.brancos_contam ? "checked" : ""}>
        <span><strong>Contar votos em branco no cálculo</strong><br>
          <span class="pequeno texto-suave">Desligado (padrão): a % para ser eleito usa só SIM + NÃO. Ligado: o branco também entra
          na conta (e dificulta a eleição). O resultado sempre mostra SIM, NÃO e BRANCO com as suas %.</span></span>
      </label>
      <label class="rotulo" for="g-vagas" style="margin-top:14px">Vagas no Exame de Contas (etapa 5)</label>
      <input id="g-vagas" type="number" min="1" max="20" class="campo" style="width:110px;text-align:center" value="${cfg.vagas_exame || 3}">
      <p class="pequeno texto-suave">Os mais votados (por número de SIM) ocupam essas vagas.</p>
    </section>

    <section class="card pad">
      <div class="titulo-card">Período da votação</div>
      <div class="grupo"><label class="rotulo" for="g-ini">Início</label>
        <input id="g-ini" type="datetime-local" class="campo" value="${paraCampo(cfg.start_at)}"></div>
      <div class="grupo"><label class="rotulo" for="g-fim">Fim</label>
        <input id="g-fim" type="datetime-local" class="campo" value="${paraCampo(cfg.end_at)}"></div>
      <p class="pequeno texto-suave">Deixe em branco para não ter limite. Use o horário do seu computador.
        Vale só para a etapa 1 — as etapas seguintes você abre e encerra na aba <strong>Etapas</strong>.</p>
    </section>

    <section class="card pad">
      <div class="titulo-card">Resultados</div>
      <label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer">
        <input id="g-pub" type="checkbox" style="width:22px;height:22px;margin-top:3px;accent-color:#e8792a" ${cfg.results_public ? "checked" : ""}>
        <span><strong>Mostrar resultados ao público</strong><br>
          <span class="pequeno texto-suave">Desligado: só você vê, aqui no painel. Ligado: qualquer pessoa vê em <code>/resultados</code>.</span></span>
      </label>
      <label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer;margin-top:18px">
        <input id="g-id" type="checkbox" style="width:22px;height:22px;margin-top:3px;accent-color:#e8792a" ${cfg.require_id ? "checked" : ""}>
        <span><strong>Pedir nome e CPF antes de votar</strong><br>
          <span class="pequeno texto-suave">Desligado: o membro vai direto para a cédula (só bloqueia um 2º voto no mesmo aparelho).
          Ligado: só vota quem está na lista de Eleitores, uma única vez.</span></span>
      </label>
      <label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer;margin-top:18px">
        <input id="g-cod" type="checkbox" style="width:22px;height:22px;margin-top:3px;accent-color:#e8792a" ${cfg.usar_codigo ? "checked" : ""}>
        <span><strong>Votar com código de votação</strong><br>
          <span class="pequeno texto-suave">Cada membro recebe um código (cartão impresso ou WhatsApp) e digita só o código —
          sem nome nem CPF. Cada código vale <strong>um voto por etapa</strong>, em qualquer celular. Gere os códigos na aba
          <strong>Eleitores</strong>. Ligado, substitui o "Pedir nome e CPF".</span></span>
      </label>
      <div class="zona-perigo mt-g">
        <strong>Zerar votação</strong>
        <p class="pequeno" style="margin:4px 0 12px">Apaga todos os votos. Use para limpar os testes antes da eleição real.</p>
        <button type="button" class="btn btn-perigo btn-pequeno" id="g-zerar">Zerar votação</button>
      </div>
    </section>

    <section class="card pad">
      <div class="titulo-card">Telão entre etapas</div>
      <p class="pequeno texto-suave" style="margin-top:0">Enquanto a mesa prepara a próxima etapa, o telão mostra estas mensagens
        (versículos ou avisos), trocando sozinho a cada 15 segundos. Separe uma mensagem da outra com <strong>uma linha em branco</strong>.
        Para mostrar a referência embaixo, comece a última linha com um travessão: <code>— Salmos 133.1</code></p>
      <textarea id="g-msg" class="campo" maxlength="3000" style="min-height:170px"
        placeholder="Escreva aqui o versículo&#10;— Livro capítulo.versículo&#10;&#10;Aviso: após a assembleia haverá um lanche no salão.">${esc(cfg.telao_mensagens || "")}</textarea>
      <p class="pequeno texto-suave">No telão, use o botão <strong>Mensagem</strong> (tecla M) para mostrar a qualquer momento.
        Entre uma etapa e outra, elas aparecem sozinhas.</p>
    </section>

    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <button class="btn btn-principal">Salvar configurações</button>
      ${msg ? `<strong class="pequeno">${esc(msg)}</strong>` : ""}
    </div>
  </form>`;

  const ler = () => {
    cfg.church_name = $("#g-igreja").value;
    cfg.title = $("#g-titulo").value;
    cfg.min_percent = $("#g-min").value;
    cfg.vagas_exame = $("#g-vagas").value;
    cfg.brancos_contam = $("#g-brancos").checked;
    cfg.start_at = paraISO($("#g-ini").value);
    cfg.end_at = paraISO($("#g-fim").value);
    cfg.results_public = $("#g-pub").checked;
    cfg.require_id = $("#g-id").checked;
    cfg.usar_codigo = $("#g-cod").checked;
    cfg.telao_mensagens = $("#g-msg").value;
  };

  $("#g-logo").addEventListener("change", async (e) => {
    const arq = e.target.files[0];
    if (!arq) return;
    ler();
    const url = await enviarImagem(arq);
    if (url) { cfg.logo_url = url; desenharConfig("Logo enviada. Clique em Salvar configurações."); }
  });
  $("#g-logo-rem")?.addEventListener("click", () => { ler(); cfg.logo_url = ""; desenharConfig("Clique em Salvar configurações."); });

  $("#g-zerar").addEventListener("click", async () => {
    const t = prompt("ATENÇÃO: isso apaga TODOS os votos e libera todos para votar de novo.\nCandidatos e eleitores continuam cadastrados.\n\nDigite ZERAR para confirmar:");
    if (t !== "ZERAR") return;
    const { ok, status, dados } = await chamar("reset", { confirm: "ZERAR" });
    if (sessaoExpirou(status)) return;
    ler();
    desenharConfig(ok ? "Votação zerada." : dados.error);
  });

  $("#form-cfg").addEventListener("submit", async (e) => {
    e.preventDefault();
    ler();
    const { ok, status, dados } = await chamar("settings_save", { settings: cfg });
    if (sessaoExpirou(status)) return;
    if (!ok) return desenharConfig(dados.error || "Erro ao salvar.");
    abaConfig("Configurações salvas.");
  });
}

// ================================================================
// ABA ETAPAS (controle da votação em 4 etapas)
// ================================================================
// "32 de 48 já votaram" (bloco do quórum)
function quorumInfo(votos, presentes) {
  if (!presentes) return `<p class="pequeno texto-suave" style="margin:8px 0 0">Informe quantos membros com direito a voto estão presentes.
    O painel e o telão mostram "X de N já votaram", e o número entra na ata.</p>`;
  const pct = (votos / presentes) * 100;
  return `<p style="margin:10px 0 0"><strong style="font-size:20px">${votos} de ${presentes}</strong>
    já votaram nesta etapa (${porcentagem(pct)})${votos >= presentes ? " — todos votaram ✓" : ""}</p>
    <div class="quorum-barra"><b style="width:${Math.min(100, pct).toFixed(1)}%"></b></div>`;
}

// Gráfico "votos por minuto" + dica para a mesa saber quando dá para encerrar
function htmlRitmo(res, aberta, presentes, votos) {
  const lista = res.ritmo?.minutos || [];
  if (!lista.length) return `<p class="pequeno texto-suave" style="margin:8px 0 0">${aberta ? "Nenhum voto ainda nesta etapa. As barras aparecem conforme os votos chegam." : "Sem votos registrados nesta etapa."}</p>`;
  const porMin = new Map(lista);
  const agoraMin = Math.floor((res.ritmo.agora || Date.now()) / 60000);
  const primeiro = lista[0][0], ultimo = lista[lista.length - 1][0];
  const fim = aberta ? Math.max(agoraMin, ultimo) : ultimo;
  const ini = Math.min(Math.max(primeiro - 1, fim - 29), fim - 9); // até 30 minutos na tela (no mínimo 10)
  const barras = [];
  for (let m = ini; m <= fim; m++) barras.push([m, porMin.get(m) || 0]);
  const max = Math.max(1, ...barras.map((b) => b[1]));
  const W = 600, H = 150, base = 122, topo = 14, lb = W / barras.length;
  const hora = (m) => new Date(m * 60000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const svg = barras.map(([m, n], i) => {
    const h = n ? Math.max(3, ((base - topo) * n) / max) : 0;
    const x = i * lb + lb * 0.15, w = lb * 0.7;
    const cor = aberta && m === agoraMin ? "var(--laranja-500)" : "var(--verde-600)";
    return (h ? `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${cor}"><title>${hora(m)}: ${n} voto${n === 1 ? "" : "s"}</title></rect>` : "")
      + (n && barras.length <= 20 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(base - h - 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${n}</text>` : "");
  }).join("");
  const marcas = [0, Math.floor((barras.length - 1) / 2), barras.length - 1].map((i) =>
    `<text x="${(i * lb + lb / 2).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === barras.length - 1 ? "end" : "middle"}" font-size="12" fill="currentColor" opacity=".65">${hora(barras[i][0])}</text>`).join("");
  // números do ritmo
  const ult5 = lista.filter(([m]) => m > agoraMin - 5).reduce((s, x) => s + x[1], 0);
  const semVotoHa = agoraMin - ultimo;
  const pico = lista.reduce((a, b) => (b[1] > a[1] ? b : a));
  let dica = "";
  if (aberta) {
    if (presentes && votos >= presentes) dica = `<div class="alerta info" style="margin-top:10px">✓ Todos os ${presentes} presentes já votaram. Pode encerrar a etapa.</div>`;
    else if (semVotoHa >= 3) dica = `<div class="alerta aviso" style="margin-top:10px">Nenhum voto há ${semVotoHa} minutos.
      ${presentes ? `Ainda faltam ${presentes - votos} dos ${presentes} presentes: avise quem não votou ou, se eles não forem votar, pode encerrar a etapa.`
        : "Se todos já votaram, pode encerrar a etapa."}</div>`;
    else if (ult5) dica = `<p class="pequeno" style="margin:10px 0 0">Ainda estão chegando votos — aguarde mais um pouco.</p>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Votos por minuto" style="display:block;margin-top:8px;color:inherit">
      <line x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="currentColor" stroke-opacity=".2"/>${svg}${marcas}</svg>
    <div class="pequeno" style="display:flex;gap:18px;flex-wrap:wrap;margin-top:4px">
      <span><strong>${ult5}</strong> nos últimos 5 min</span>
      <span>último voto: <strong>${semVotoHa <= 0 ? "agora" : `há ${semVotoHa} min`}</strong></span>
      <span>pico: <strong>${pico[1]}</strong> às ${hora(pico[0])}</span>
    </div>${dica}`;
}

// enquanto a aba Etapas estiver aberta e a votação rolando, atualiza gráfico e quórum sozinho
let timerRitmo = null;
function vigiarRitmo(aberta, fase, presentes) {
  clearInterval(timerRitmo);
  if (!aberta) return;
  timerRitmo = setInterval(async () => {
    if (!$("#ritmo") || $("#aba-etapas").classList.contains("oculto")) return clearInterval(timerRitmo);
    if (document.visibilityState !== "visible") return;
    const { ok, dados } = await chamar("results");
    if (!ok || !$("#ritmo")) return;
    if (dados.fase !== fase || !dados.faseAberta) return abaEtapas(); // mudou a etapa: redesenha tudo
    const votos = (dados.fases || []).find((x) => x.n === fase)?.ballots || 0;
    $("#ritmo").innerHTML = htmlRitmo(dados, true, presentes, votos);
    if ($("#q-info")) $("#q-info").innerHTML = quorumInfo(votos, presentes);
  }, 15000);
}

async function abaEtapas(msg = "", tipoMsg = "info") {
  const caixa = $("#aba-etapas");
  if (!caixa.innerHTML) caixa.innerHTML = '<p class="texto-suave">Carregando…</p>';
  const [c, r] = await Promise.all([chamar("settings"), chamar("results")]);
  if (sessaoExpirou(c.status) || sessaoExpirou(r.status)) return;
  if (!c.ok || !r.ok) { caixa.innerHTML = `<div class="alerta erro">${esc((c.dados || r.dados).error || "Erro ao carregar.")}</div>`; return; }
  const s = c.dados, res = r.dados;
  const cand = await chamar("candidates");
  const todos = cand.ok ? cand.dados.list : [];
  const atual = s.fase, aberta = s.fase_aberta;
  const prox = FASES[atual]; // próxima etapa (ou undefined na última)

  const nomesDaFase = (n) => todos.filter((x) => CATEGORIAS.find((k) => k.key === x.category).fase === n);
  const cargosTexto = (n) => res.categories.filter((k) => k.fase === n).flatMap((k) =>
    k.candidates.filter((x) => x.status === "eleito").map((x) => `${x.cargo || "Eleito"}: ${x.name}`));

  const cartoes = FASES.map((f) => {
    const estadoF = f.n < atual ? "concluida" : f.n === atual ? "atual" : "futura";
    const nomes = nomesDaFase(f.n);
    const votos = (res.fases || []).find((x) => x.n === f.n)?.ballots || 0;
    let lista = "";
    if (f.n === 1) lista = "";
    else if (estadoF === "futura") lista = `<p class="pequeno texto-suave">A lista será montada quando você avançar para esta etapa.</p>`;
    else lista = nomes.length
      ? `<ul class="pequeno" style="margin:8px 0 0;padding-left:18px">${nomes.map((x) => `<li>${esc(x.name)}</li>`).join("")}</ul>`
      : `<p class="pequeno" style="color:var(--nao-tx,var(--vermelho-700))">Nenhum candidato ainda — cadastre na aba Candidatos.</p>`;
    const resultado = f.n > 1 && estadoF !== "futura" && cargosTexto(f.n).length
      ? `<p class="pequeno" style="margin:8px 0 0"><strong>Resultado:</strong> ${cargosTexto(f.n).map(esc).join(" · ")}</p>` : "";
    const selo = estadoF === "concluida" ? '<span class="etiqueta eleito">Concluída</span>'
      : estadoF === "atual" ? `<span class="etiqueta ${aberta ? "primeiro" : "neutra"}">${aberta ? "Votação aberta" : "Votação encerrada"}</span>`
      : '<span class="etiqueta neutra">Próxima</span>';
    return `<div class="card pad" style="${estadoF === "atual" ? "border:2px solid var(--laranja-500)" : estadoF === "futura" ? "opacity:.7" : ""}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <strong style="font-size:18px">Etapa ${f.n} · ${f.label}</strong>${selo}</div>
      <p class="pequeno texto-suave" style="margin:6px 0 0">${f.como}</p>
      ${estadoF !== "futura" ? `<p class="pequeno" style="margin:6px 0 0">${votos} voto(s) recebido(s)</p>` : ""}
      ${lista}${resultado}
    </div>`;
  }).join("");

  // botões conforme a situação
  let botoes = "";
  if (aberta) {
    botoes = `<button class="btn btn-principal btn-grande" data-acao="fase_encerrar">Encerrar votação da etapa ${atual}</button>
      <p class="pequeno texto-suave">Encerre quando todos tiverem votado. O resultado fica salvo e você confere antes de seguir.</p>`;
  } else {
    botoes = `<button class="btn btn-verde btn-grande" data-acao="fase_abrir">Abrir votação da etapa ${atual} · ${FASES[atual - 1].label}</button>`;
    const votosAtual = (res.fases || []).find((x) => x.n === atual)?.ballots || 0;
    if (prox && !votosAtual) botoes += `<p class="pequeno texto-suave">Esta etapa ainda não tem votos. Abra a votação; depois de encerrar,
      aparece aqui o botão para preparar a etapa ${prox.n} (${prox.label}).</p>`;
    if (prox && votosAtual) botoes += `<button class="btn btn-principal btn-grande" data-acao="fase_avancar">Preparar etapa ${prox.n} · ${prox.label} →</button>
      <p class="pequeno texto-suave">"Preparar" monta a lista da próxima etapa com base no resultado desta. Ela começa
      <strong>encerrada</strong>: confira os nomes e depois clique em "Abrir votação".</p>`;
  }

  // quórum: quantos dos presentes já votaram nesta etapa
  const presentes = s.presentes || 0;
  const votosAgora = (res.fases || []).find((x) => x.n === atual)?.ballots || 0;
  const pctQ = presentes ? (votosAgora / presentes) * 100 : 0;
  const quorum = `<div class="quorum" style="border-top:1px solid var(--borda);padding-top:14px;margin-top:16px">
      <label class="rotulo" for="q-pres">Membros presentes (quórum)</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="q-pres" type="number" min="0" class="campo" style="width:120px" value="${presentes || ""}" placeholder="Ex: 48">
        <button class="btn btn-contorno btn-pequeno" id="q-salvar">Salvar</button>
        <button class="link-btn verde pequeno" id="q-atualizar">Atualizar contagem</button>
      </div>
      <div id="q-info">${quorumInfo(votosAgora, presentes)}</div>
    </div>
    <div style="border-top:1px solid var(--borda);padding-top:14px;margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span class="rotulo" style="margin:0">Votos chegando por minuto</span>
        <span class="pequeno texto-suave">${aberta ? "atualiza sozinho a cada 15 segundos" : "etapa encerrada"}</span>
      </div>
      <div id="ritmo">${htmlRitmo(res, aberta, presentes, votosAgora)}</div>
    </div>`;
  const eleitosLib = !!s.eleitos_publicos;
  const linkEleitos = new URL("eleitos.html", enderecoDoSite()).href;

  caixa.innerHTML = `
    ${msg ? `<div class="alerta ${tipoMsg}" style="margin-top:0;margin-bottom:16px">${esc(msg)}</div>` : ""}
    <section class="card pad" style="margin-bottom:20px">
      <div class="titulo-card">Etapa atual: ${atual} · ${esc(FASES[atual - 1].label)}</div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">${botoes}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">
        ${atual > 1 ? `<button class="link-btn verde pequeno" data-acao="fase_voltar">← Voltar para a etapa ${atual - 1}</button>` : ""}
        <button class="link-btn vermelho pequeno" data-acao="fase_zerar">Zerar votos desta etapa</button>
      </div>
      <p class="pequeno texto-suave" style="margin-bottom:0">Os membros usam sempre o mesmo link. Quando abrir uma etapa nova, avise no grupo
        para que todos abram o site de novo.</p>
      ${quorum}
    </section>
    <section class="card pad" style="margin-bottom:20px">
      <div class="titulo-card">Telão, QR Code e Ata</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn-verde" href="telao.html" target="_blank" rel="noopener">Abrir telão</a>
        <button class="btn btn-contorno" id="b-qrcode">QR Code do site</button>
        <button class="btn btn-contorno" id="b-ata">Gerar ata da assembleia</button>
      </div>
      <p class="pequeno texto-suave" style="margin-bottom:0"><strong>Telão:</strong> abra neste computador e projete. Mostra os votos
        chegando e o QR Code, e muda sozinho: ao encerrar a etapa mostra o resultado (com suspense) e, ao abrir a próxima, volta ao QR Code.
        <strong>Ata:</strong> gera o rascunho com os votos de todas as etapas, em Word ou PDF.</p>
    </section>
    <section class="card pad" style="margin-bottom:20px">
      <div class="titulo-card" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        Página pública dos eleitos
        <span class="etiqueta ${eleitosLib ? "eleito" : "neutra"}">${eleitosLib ? "Liberada" : "Bloqueada"}</span></div>
      <p class="pequeno texto-suave" style="margin-top:0">Uma página bonita com a nova liderança (foto e cargo) para mandar no grupo da igreja.
        Mostra só nomes e cargos — nunca votos — e só das etapas já <strong>encerradas</strong>. Ninguém vê nada enquanto estiver bloqueada.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn ${eleitosLib ? "btn-contorno" : "btn-principal"}" id="el-liberar">${eleitosLib ? "Bloquear página" : "Liberar página"}</button>
        <a class="btn btn-contorno" href="eleitos.html" target="_blank" rel="noopener">Abrir página</a>
        <button class="btn btn-contorno" id="el-copiar">Copiar link</button>
      </div>
    </section>
    <div style="display:grid;gap:14px">${cartoes}</div>`;

  $$("[data-acao]", caixa).forEach((b) => b.addEventListener("click", () => acaoEtapa(b.dataset.acao, b)));
  $("#b-qrcode").addEventListener("click", abrirQRCode);
  $("#b-ata").addEventListener("click", abrirFormularioAta);
  $("#q-salvar").addEventListener("click", async (e) => {
    const n = Number($("#q-pres").value || 0);
    if (!(n >= 0)) return;
    e.target.disabled = true;
    const { ok, status, dados } = await chamar("presentes_salvar", { presentes: n });
    if (sessaoExpirou(status)) return;
    abaEtapas(ok ? (n ? `Quórum salvo: ${n} membros presentes.` : "Quórum apagado.") : dados.error, ok ? "info" : "erro");
  });
  $("#q-atualizar").addEventListener("click", () => abaEtapas());
  vigiarRitmo(aberta, atual, presentes);
  $("#el-liberar").addEventListener("click", async (e) => {
    const liberar = !eleitosLib;
    if (liberar && !confirm("Liberar a página pública dos eleitos? Qualquer pessoa com o link verá os eleitos das etapas encerradas.")) return;
    e.target.disabled = true;
    const { ok, status, dados } = await chamar("eleitos_liberar", { liberar });
    if (sessaoExpirou(status)) return;
    abaEtapas(ok ? (liberar ? "Página dos eleitos liberada. Copie o link e mande no grupo." : "Página dos eleitos bloqueada.") : dados.error, ok ? "info" : "erro");
  });
  $("#el-copiar").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(linkEleitos); e.target.textContent = "Link copiado ✓"; }
    catch { prompt("Copie o link:", linkEleitos); }
  });
}

// QR Code grande para mostrar na tela, imprimir ou mandar no grupo
function abrirQRCode() {
  const url = enderecoDoSite();
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  fundo.innerHTML = `<div class="modal qr-grande">
    <div class="titulo-card" style="margin-bottom:0">Aponte a câmera do celular para votar</div>
    <div class="qr-caixa">${svgQR(url)}</div>
    <p class="mono pequeno" style="word-break:break-all;margin:0">${esc(url)}</p>
    <div class="linha-botoes" style="flex-wrap:wrap">
      <button class="btn btn-contorno flex1" id="qr-fechar">Fechar</button>
      <button class="btn btn-verde flex1" id="qr-baixar">Baixar imagem</button>
      <button class="btn btn-contorno flex1" id="qr-copiar">Copiar link</button>
    </div></div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  $("#qr-fechar", fundo).addEventListener("click", fechar);
  $("#qr-baixar", fundo).addEventListener("click", () => baixarQR(url));
  $("#qr-copiar", fundo).addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(url); e.target.textContent = "Link copiado ✓"; }
    catch { prompt("Copie o link:", url); }
  });
}

async function acaoEtapa(acao, botao) {
  const extra = {};
  if (acao === "fase_encerrar" && !confirm("Encerrar a votação desta etapa? Ninguém mais conseguirá votar nela.")) return;
  if (acao === "fase_voltar" && !confirm("Voltar uma etapa? Nada é apagado; a etapa anterior fica encerrada.")) return;
  if (acao === "fase_zerar") {
    if (prompt("Isso apaga os votos SÓ da etapa atual (as outras continuam).\nDigite ZERAR para confirmar:") !== "ZERAR") return;
    extra.confirm = "ZERAR";
  }
  botao.disabled = true;
  const { ok, status, dados } = await chamar(acao, extra);
  if (sessaoExpirou(status)) return;
  const mensagens = {
    fase_encerrar: "Votação encerrada. Confira o resultado e, quando quiser, prepare a próxima etapa.",
    fase_abrir: "Votação aberta! Avise os membros para abrirem o link de novo.",
    fase_voltar: "Voltou uma etapa.",
    fase_zerar: "Votos desta etapa apagados.",
  };
  if (!ok) return abaEtapas(dados.error || "Não foi possível concluir.", "erro");
  abaEtapas(acao === "fase_avancar" ? `Etapa ${dados.fase} preparada. ${dados.aviso || ""} Confira os nomes e clique em "Abrir votação".` : mensagens[acao]);
}

// Cartões de código para imprimir e recortar (10 por folha A4), cada um com QR Code que já abre a cédula
function imprimirCartoes() {
  const lista = comCodigo();
  if (!lista.length) return;
  const janela = window.open("", "_blank");
  if (!janela) return alert("O navegador bloqueou a nova janela. Permita pop-ups para este site.");
  const base = new URL("votar.html", enderecoDoSite()).href;
  const site = enderecoDoSite().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const igreja = nomeIgreja || "Eleição de Liderança";
  const cartoes = lista.map((v) => {
    const nome = /^Código \d+$/.test(v.name) ? "" : v.name;
    return `<div class="cartao">
      <div class="txt">
        <div class="ig">${esc(igreja)}</div>
        <div class="rot">Código de votação</div>
        <div class="cod">${esc(v.doc)}</div>
        ${nome ? `<div class="nome">${esc(nome)}</div>` : ""}
        <div class="inst">Aponte a câmera para o QR Code<br>ou acesse <b>${esc(site)}</b> e digite o código.<br>
          Vale <b>1 voto em cada etapa</b>. Não empreste.</div>
      </div>
      <div class="qr">${svgQR(base + "?codigo=" + encodeURIComponent(v.doc), "#000")}</div>
    </div>`;
  }).join("");
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cartões de votação</title>
    <style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
      .barra { padding: 12px; background: #22341a; color: #fff; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .barra button { font: inherit; font-weight: 700; border: 0; border-radius: 8px; padding: 8px 16px; background: #e8792a; color: #fff; cursor: pointer; }
      .grade { display: grid; grid-template-columns: 1fr 1fr; }
      .cartao { height: 55mm; border: 1px dashed #999; padding: 4mm 5mm; display: flex; gap: 4mm; align-items: center; break-inside: avoid; }
      .txt { flex: 1; min-width: 0; }
      .ig { font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #555; }
      .rot { font-size: 9pt; font-weight: 700; margin-top: 2mm; color: #6f901b; text-transform: uppercase; }
      .cod { font-family: "Courier New", monospace; font-size: 22pt; font-weight: 700; letter-spacing: .12em; margin: 1mm 0; }
      .nome { font-size: 9pt; font-weight: 700; }
      .inst { font-size: 7.5pt; line-height: 1.35; color: #333; margin-top: 1.5mm; }
      .qr { width: 32mm; height: 32mm; flex: none; }
      .qr svg { width: 100%; height: 100%; display: block; }
      @media print { .barra { display: none; } }
    </style></head><body>
    <div class="barra"><span>${lista.length} cartões · recorte nas linhas tracejadas</span><button onclick="print()">Imprimir</button></div>
    <div class="grade">${cartoes}</div>
    <script>setTimeout(function () { print(); }, 600);<\/script></body></html>`);
  janela.document.close();
}
