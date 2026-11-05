// ================================================================
// PAINEL ADMINISTRATIVO
// Abas: Resultados | Candidatos | Eleitores | Configurações
// ================================================================
const CATEGORIAS = [
  { key: "pastor", label: "Pastores", singular: "Pastor" },
  { key: "presbitero", label: "Presbíteros", singular: "Presbítero" },
  { key: "diacono", label: "Diáconos", singular: "Diácono" },
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

async function abaEleitores(msg = "") {
  const { ok, status, dados } = await chamar("voters");
  if (sessaoExpirou(status)) return;
  if (ok) eleitores = dados.list;
  desenharEleitores(msg);
}

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
      <p class="pequeno texto-suave" style="margin-top:0">Cada membro vota <strong>SIM</strong> ou <strong>NÃO</strong> em cada candidato.
        É eleito quem tiver a porcentagem de SIM (sobre SIM + NÃO dele) <strong>maior</strong> que o valor abaixo.</p>
      <label class="rotulo" for="g-min">Precisa ter mais de … % de SIM</label>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="g-min" type="number" min="0" max="99" class="campo" style="width:110px;text-align:center" value="${cfg.min_percent}">
        <strong style="font-size:20px">%</strong>
      </div>
      <p class="pequeno texto-suave">50 = maioria simples (metade + 1). Use 66 para dois terços, se o estatuto exigir.</p>
    </section>

    <section class="card pad">
      <div class="titulo-card">Período da votação</div>
      <div class="grupo"><label class="rotulo" for="g-ini">Início</label>
        <input id="g-ini" type="datetime-local" class="campo" value="${paraCampo(cfg.start_at)}"></div>
      <div class="grupo"><label class="rotulo" for="g-fim">Fim</label>
        <input id="g-fim" type="datetime-local" class="campo" value="${paraCampo(cfg.end_at)}"></div>
      <p class="pequeno texto-suave">Deixe em branco para não ter limite. Use o horário do seu computador.</p>
    </section>

    <section class="card pad">
      <div class="titulo-card">Resultados</div>
      <label style="display:flex;gap:12px;align-items:flex-start;cursor:pointer">
        <input id="g-pub" type="checkbox" style="width:22px;height:22px;margin-top:3px;accent-color:#e8792a" ${cfg.results_public ? "checked" : ""}>
        <span><strong>Mostrar resultados ao público</strong><br>
          <span class="pequeno texto-suave">Desligado: só você vê, aqui no painel. Ligado: qualquer pessoa vê em <code>/resultados</code>.</span></span>
      </label>
      <div class="zona-perigo mt-g">
        <strong>Zerar votação</strong>
        <p class="pequeno" style="margin:4px 0 12px">Apaga todos os votos. Use para limpar os testes antes da eleição real.</p>
        <button type="button" class="btn btn-perigo btn-pequeno" id="g-zerar">Zerar votação</button>
      </div>
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
    cfg.start_at = paraISO($("#g-ini").value);
    cfg.end_at = paraISO($("#g-fim").value);
    cfg.results_public = $("#g-pub").checked;
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
