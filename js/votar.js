// ================================================================
// FLUXO DE VOTAÇÃO
// A cédula muda conforme a ETAPA atual (o admin controla no painel):
// Em toda cédula há a opção BRANCO (contada, mas fora da porcentagem).
//   Etapa 1: Pastores -> Presbíteros -> Diáconos  (SIM, NÃO ou BRANCO em cada nome)
//   Etapa 2: Tesoureiro                           (escolhe 1 nome)
//   Etapa 3: 1º e 2º Secretário                   (SIM ou NÃO em cada nome)
//   Etapa 4: Exame de Contas                      (SIM ou NÃO em cada nome)
// Telas: 0 identificação (opcional) -> uma tela por categoria -> revisão -> comprovante
// ================================================================
const estado = {
  info: null,          // dados vindos do servidor (candidatos, configurações)
  etapa: 0,            // 0 = identificação; 1..N = categorias; N+1 = revisão; N+2 = comprovante
  nome: "",
  doc: "",
  primeiroNome: "",
  respostas: {},       // { idDoCandidato: true (SIM / escolhido) | false (NÃO / não escolhido) | "branco" }
  erro: "",
  jaVotou: false,
  enviando: false,
  comprovante: null,
  modoCodigo: false,   // "votar com código": o membro digita o código do cartão
  autoConferir: false, // código veio do QR do cartão: confere sozinho
};

const app = document.getElementById("app");
const N = () => estado.info.categories.length;      // quantas telas de cédula
const REVISAO = () => N() + 1;
const COMPROVANTE = () => N() + 2;

// ---------- carregamento ----------
(async function iniciar() {
  const { ok, dados } = await chamar("info");
  if (!ok) return aviso("Ops!", dados.error || "Não foi possível carregar. Verifique sua internet.");
  estado.info = dados;
  // ordem aleatória dos nomes (cada aparelho vê uma ordem diferente; ninguém ganha por aparecer primeiro)
  estado.info.candidates = embaralhar(dados.candidates);
  $("#selo").innerHTML = seloLogo(dados.logo_url, 42);
  $("#igreja").textContent = dados.church_name;
  $("#titulo").textContent = dados.fase > 1 ? `${dados.title} · ${dados.fase_label}` : dados.title;
  if (dados.usar_codigo) {
    // Com código: o próprio código controla 1 voto por etapa (o aparelho pode ser emprestado)
    estado.modoCodigo = true;
    const daUrl = new URLSearchParams(location.search).get("codigo");
    if (daUrl) { guardarCodigo(daUrl); history.replaceState(null, "", location.pathname); }
    estado.doc = lerCodigo();
    estado.autoConferir = !!estado.doc;
  } else if (!dados.require_id) {
    // Sem identificação: vai direto para a cédula (e bloqueia 2º voto neste aparelho, por etapa)
    if (dados.status === "open" && jaVotouNesteAparelho())
      return aviso("Você já votou", `Este aparelho já registrou um voto nesta etapa (${dados.fase_label}). Obrigado!`,
        dados.fase < (dados.fases || []).length);
    estado.etapa = 1;
  }
  desenhar();
})();

// cada etapa tem a sua "marca" de já votou (a 1ª mantém a chave antiga)
function chaveAparelho() {
  const base = "votou_" + estado.info.title;
  return estado.info.fase > 1 ? `${base}_etapa${estado.info.fase}` : base;
}
function jaVotouNesteAparelho() {
  try { return !!localStorage.getItem(chaveAparelho()); } catch { return false; }
}
function marcarAparelho() {
  try { localStorage.setItem(chaveAparelho(), new Date().toISOString()); } catch { /* sem armazenamento */ }
}
// o código fica guardado neste aparelho para as próximas etapas
function guardarCodigo(c) { try { localStorage.setItem("codigo_votacao", String(c).trim().toUpperCase()); } catch { /* ok */ } }
function lerCodigo() { try { return localStorage.getItem("codigo_votacao") || ""; } catch { return ""; } }
function esquecerCodigo() { try { localStorage.removeItem("codigo_votacao"); } catch { /* ok */ } }

// embaralha (Fisher-Yates) com números aleatórios do próprio aparelho
function embaralhar(lista) {
  const v = lista.slice();
  const rnd = new Uint32Array(v.length);
  try { crypto.getRandomValues(rnd); } catch { for (let i = 0; i < v.length; i++) rnd[i] = Math.floor(Math.random() * 4294967296); }
  for (let i = v.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}

function candidatosDa(cat) {
  return estado.info.candidates.filter((c) => c.category === cat);
}

function irPara(etapa) {
  estado.etapa = etapa;
  estado.erro = "";
  desenhar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- desenha a etapa atual ----------
function desenhar() {
  const { info, etapa } = estado;
  if (etapa < COMPROVANTE()) {
    if (info.status === "not_started") return aviso("Votação ainda não começou", `Início: ${dataHora(info.start_at)}`);
    if (info.status === "closed") return aviso("Votação encerrada", "O período de votação terminou.");
    if (info.status === "paused") return aviso("Aguarde a próxima etapa",
      "A votação desta etapa está encerrada. Assim que a próxima for aberta, esta tela avisa você.", true);
  }
  if (etapa === 0) return telaIdentificacao();
  if (etapa >= 1 && etapa <= N()) return telaCedula(info.categories[etapa - 1]);
  if (etapa === REVISAO()) return telaRevisao();
  if (etapa === COMPROVANTE()) return telaComprovante();
}

// vigiar = true: a tela fica esperando e avisa quando a próxima votação abrir
function aviso(titulo, texto, vigiar = false) {
  app.innerHTML = `<div class="card pad" style="text-align:center">
    <h2 class="titulo-etapa" style="font-size:30px">${esc(titulo)}</h2>
    <p class="texto-suave">${esc(texto)}</p>
    ${vigiar ? '<div id="vigia" class="mt"></div>' : ""}
    <a class="btn btn-contorno mt" href="index.html">Voltar ao início</a></div>`;
  if (vigiar) vigiarProximaEtapa($("#vigia"));
}

function progresso() {
  const nomes = [...estado.info.categories.map((c) => c.label), "Revisão"];
  return `<ol class="progresso" aria-label="Etapas da votação">
    ${nomes.map((n, i) => {
      const num = i + 1;
      const cls = num < estado.etapa ? "feito" : num === estado.etapa ? "feito atual" : "";
      return `<li class="${cls}"><div class="barra"></div><div class="nome">${n}</div></li>`;
    }).join("")}
    <span class="sr">Passo ${estado.etapa} de ${nomes.length}</span></ol>`;
}

// ---------- 0: identificação ----------
function telaCodigo() {
  const erroHtml = estado.erro
    ? `<div class="alerta ${estado.jaVotou ? "aviso" : "erro"}" role="alert">
         ${estado.jaVotou ? '<strong class="grande">Este código já votou</strong>' : ""}${esc(estado.erro)}</div>`
    : "";
  app.innerHTML = `
    <form id="form-id" class="card pad" autocomplete="off">
      <h2 class="titulo-etapa">Seu código de votação</h2>
      <p class="texto-suave">Digite o código que está no seu cartão. Ele vale <strong>um voto em cada etapa</strong>.</p>
      <div class="grupo mt-g">
        <label class="rotulo" for="doc">Código</label>
        <input id="doc" class="campo campo-codigo" inputmode="text" autocapitalize="characters" spellcheck="false"
          maxlength="14" placeholder="EX: K7PD4X" required value="${esc(estado.doc)}">
      </div>
      ${erroHtml}
      <button class="btn btn-verde largura-total mt-g" ${estado.enviando ? "disabled" : ""}>
        ${estado.enviando ? "Conferindo…" : "Continuar"}</button>
      ${estado.doc && !estado.enviando ? `<p style="text-align:center;margin:14px 0 0">
        <button type="button" class="link-btn pequeno" id="outro-codigo">Usar outro código</button></p>` : ""}
      <p class="pequeno texto-suave" style="margin-bottom:0">O código só confere que você pode votar. O seu voto continua secreto.</p>
    </form>`;

  const conferir = async () => {
    estado.erro = ""; estado.jaVotou = false; estado.enviando = true;
    desenhar();
    const { ok, dados } = await chamar("check", { doc: estado.doc });
    estado.enviando = false;
    if (!ok) {
      estado.erro = dados.error || "Erro inesperado.";
      estado.jaVotou = !!dados.alreadyVoted;
      return desenhar();
    }
    guardarCodigo(estado.doc);
    irPara(1);
  };
  $("#form-id").addEventListener("submit", (e) => {
    e.preventDefault();
    estado.doc = $("#doc").value.trim().toUpperCase();
    conferir();
  });
  $("#outro-codigo")?.addEventListener("click", () => {
    esquecerCodigo(); estado.doc = ""; estado.erro = ""; estado.jaVotou = false;
    desenhar(); $("#doc").focus();
  });
  if (estado.autoConferir) { estado.autoConferir = false; conferir(); }
}

function telaIdentificacao() {
  if (estado.modoCodigo) return telaCodigo();
  const erroHtml = estado.erro
    ? `<div class="alerta ${estado.jaVotou ? "aviso" : "erro"}" role="alert">
         ${estado.jaVotou ? '<strong class="grande">Você já votou</strong>' : ""}${esc(estado.erro)}</div>`
    : "";
  app.innerHTML = `
    <form id="form-id" class="card pad">
      <h2 class="titulo-etapa">Identificação</h2>
      <p class="texto-suave pequeno">Informe seus dados para confirmar que você está na lista de membros votantes.</p>
      <div class="grupo mt-g">
        <label class="rotulo" for="nome">Nome completo</label>
        <input id="nome" class="campo" autocomplete="name" placeholder="Ex: Maria da Silva" required value="${esc(estado.nome)}">
      </div>
      <div class="grupo">
        <label class="rotulo" for="doc">CPF ou código de eleitor</label>
        <input id="doc" class="campo" autocomplete="off" placeholder="000.000.000-00 ou código" required value="${esc(estado.doc)}">
      </div>
      ${erroHtml}
      <button class="btn btn-verde largura-total mt-g" ${estado.enviando ? "disabled" : ""}>
        ${estado.enviando ? "Verificando…" : "Continuar"}</button>
    </form>`;

  $("#form-id").addEventListener("submit", async (e) => {
    e.preventDefault();
    estado.nome = $("#nome").value.trim();
    estado.doc = $("#doc").value.trim();
    estado.erro = ""; estado.jaVotou = false; estado.enviando = true;
    desenhar();
    const { ok, dados } = await chamar("check", { name: estado.nome, doc: estado.doc });
    estado.enviando = false;
    if (!ok) {
      estado.erro = dados.error || "Erro inesperado.";
      estado.jaVotou = !!dados.alreadyVoted;
      return desenhar();
    }
    estado.primeiroNome = dados.firstName;
    irPara(1);
  });
}

// ---------- cédula de uma categoria ----------
function telaCedula(cat) {
  const lista = candidatosDa(cat.key);
  const escolha = cat.tipo === "escolha";
  const emBranco = escolha && lista.length > 0 && lista.every((c) => estado.respostas[c.id] === "branco");
  const feitos = escolha
    ? (emBranco || lista.some((c) => estado.respostas[c.id] === true) ? lista.length : 0)
    : lista.filter((c) => estado.respostas[c.id] !== undefined).length;
  const completo = lista.length > 0 && feitos === lista.length;
  const faltam = lista.length - feitos;

  app.innerHTML = `
    ${progresso()}
    ${estado.etapa === 1 && estado.primeiroNome ? `<p class="texto-suave pequeno">Olá, <strong>${esc(estado.primeiroNome)}</strong>!</p>` : ""}
    <h2 class="titulo-etapa">${cat.label}</h2>
    <p class="texto-suave">${escolha
      ? `Toque no nome de <strong>um</strong> candidato para escolher o seu voto, ou vote em branco.`
      : `Para cada nome, marque <strong style="color:var(--sim-tx,var(--verde-700))">SIM</strong>,
         <strong style="color:var(--nao-tx,var(--vermelho-700))">NÃO</strong> ou <strong style="color:var(--branco-tx,#4b5563)">BRANCO</strong>.`}</p>

    <div class="contador" aria-live="polite">
      <span class="${completo ? "completo" : ""}">${escolha
        ? (emBranco ? "Voto em branco" : completo ? "1 nome escolhido" : "Nenhum nome escolhido")
        : `${feitos} de ${lista.length} respondido${lista.length === 1 ? "" : "s"}`}</span>
    </div>

    ${lista.length === 0
      ? `<p class="card pad texto-suave" style="text-align:center">Nenhum candidato nesta categoria.</p>`
      : `<ul class="lista-candidatos">${lista.map((c) => (escolha ? cartaoEscolha(c) : cartaoCandidato(c))).join("")}
         ${escolha ? cartaoBrancoEscolha(emBranco) : ""}</ul>`}

    ${!completo && lista.length ? `<p class="pequeno texto-suave mt">${escolha
      ? "Escolha um nome (ou vote em branco) para continuar."
      : `Responda todos os nomes para continuar. Ainda falta${faltam === 1 ? "" : "m"} ${faltam}.`}</p>` : ""}

    <div class="linha-botoes">
      <button class="btn btn-contorno flex1" id="voltar">Voltar</button>
      <button class="btn btn-verde flex2" id="avancar" ${completo ? "" : "disabled"}>
        ${estado.etapa === N() ? "Revisar Voto" : "Próximo"}</button>
    </div>`;

  const redesenhar = () => { const y = window.scrollY; telaCedula(cat); window.scrollTo(0, y); };
  // SIM / NÃO / BRANCO
  $$(".botao-voto[data-valor]", app).forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.dataset.valor;
      estado.respostas[b.dataset.id] = v === "sim" ? true : v === "nao" ? false : "branco";
      redesenhar();
    })
  );
  // em branco no "escolher 1 nome": marca todos da categoria como "branco"
  $$(".botao-branco-escolha", app).forEach((b) =>
    b.addEventListener("click", () => { lista.forEach((c) => { estado.respostas[c.id] = "branco"; }); redesenhar(); })
  );
  // escolher 1 nome: marca este e desmarca os outros da mesma categoria
  $$(".botao-escolha", app).forEach((b) =>
    b.addEventListener("click", () => {
      lista.forEach((c) => { estado.respostas[c.id] = String(c.id) === b.dataset.id; });
      redesenhar();
    })
  );
  $("#voltar").addEventListener("click", () => {
    if (estado.etapa === 1 && !estado.info.require_id) location.href = "index.html";
    else irPara(estado.etapa - 1);
  });
  $("#avancar").addEventListener("click", () => irPara(estado.etapa + 1));
}

function dadosCandidato(c) {
  return `<div class="dados">
      ${avatar(c.photo_url, c.name, 64)}
      <div style="min-width:0">
        <div class="nome">${esc(c.name)}</div>
        ${c.description ? `<div class="desc">${esc(c.description)}</div>` : ""}
      </div>
    </div>`;
}

function cartaoCandidato(c) {
  const r = estado.respostas[c.id];
  const marca = r === true ? "marcado-sim" : r === false ? "marcado-nao" : r === "branco" ? "marcado-branco" : "";
  return `<li class="card candidato ${marca}">
    ${dadosCandidato(c)}
    <div class="botoes-voto tres" role="group" aria-label="Voto para ${esc(c.name)}">
      <button type="button" class="botao-voto sim ${r === true ? "ativo" : ""}" data-id="${c.id}" data-valor="sim" aria-pressed="${r === true}">
        ${r === true ? "✓ " : ""}SIM</button>
      <button type="button" class="botao-voto nao ${r === false ? "ativo" : ""}" data-id="${c.id}" data-valor="nao" aria-pressed="${r === false}">
        ${r === false ? "✓ " : ""}NÃO</button>
      <button type="button" class="botao-voto branco ${r === "branco" ? "ativo" : ""}" data-id="${c.id}" data-valor="branco" aria-pressed="${r === "branco"}">
        ${r === "branco" ? "✓ " : ""}BRANCO</button>
    </div>
  </li>`;
}

function cartaoEscolha(c) {
  const marcado = estado.respostas[c.id] === true;
  return `<li class="card candidato ${marcado ? "marcado-sim" : ""}">
    ${dadosCandidato(c)}
    <div class="botoes-voto" style="grid-template-columns:1fr">
      <button type="button" class="botao-voto sim botao-escolha ${marcado ? "ativo" : ""}" data-id="${c.id}"
        role="radio" aria-checked="${marcado}">${marcado ? "✓ Escolhido" : "Escolher"}</button>
    </div>
  </li>`;
}

function cartaoBrancoEscolha(ativo) {
  return `<li class="card candidato ${ativo ? "marcado-branco" : ""}">
    <div class="dados"><div style="min-width:0"><div class="nome">Voto em branco</div>
      <div class="desc">Não escolher nenhum nome</div></div></div>
    <div class="botoes-voto" style="grid-template-columns:1fr">
      <button type="button" class="botao-voto branco botao-branco-escolha ${ativo ? "ativo" : ""}" role="radio" aria-checked="${ativo}">
        ${ativo ? "✓ Em branco" : "Votar em branco"}</button>
    </div>
  </li>`;
}

const etiquetaResposta = (v) => v === true ? '<span class="etiqueta sim">SIM</span>'
  : v === false ? '<span class="etiqueta nao">NÃO</span>' : '<span class="etiqueta branco">BRANCO</span>';

// ---------- revisão ----------
function telaRevisao() {
  const blocos = estado.info.categories.map((cat, i) => {
    const lista = candidatosDa(cat.key);
    const branco = cat.tipo === "escolha" && lista.every((c) => estado.respostas[c.id] === "branco");
    const itens = cat.tipo === "escolha"
      ? (branco ? ['<li><span class="nome">Voto em branco</span><span class="etiqueta branco">BRANCO</span></li>']
        : lista.filter((c) => estado.respostas[c.id] === true).map((c) =>
          `<li>${avatar(c.photo_url, c.name, 40)}<span class="nome">${esc(c.name)}</span><span class="etiqueta sim">SEU VOTO</span></li>`))
      : lista.map((c) => `<li>${avatar(c.photo_url, c.name, 40)}<span class="nome">${esc(c.name)}</span>
          ${etiquetaResposta(estado.respostas[c.id])}</li>`);
    return `<div class="card pad revisao-bloco">
      <div class="cabeca"><h3>${cat.label}</h3>
        <button class="link-btn laranja" data-ir="${i + 1}">Alterar</button></div>
      ${lista.length === 0 ? `<p class="texto-suave">Nenhum candidato</p>` : `<ul class="revisao-lista">${itens.join("")}</ul>`}
    </div>`;
  }).join("");

  app.innerHTML = `
    ${progresso()}
    <h2 class="titulo-etapa">Revise seu voto</h2>
    <p class="texto-suave">Confira com atenção. Depois de confirmar não será possível alterar.</p>
    <div class="mt">${blocos}</div>
    ${estado.erro ? `<div class="alerta erro" role="alert">${esc(estado.erro)}</div>` : ""}
    <div class="linha-botoes" style="flex-wrap:wrap-reverse">
      <button class="btn btn-contorno flex1" id="corrigir" ${estado.enviando ? "disabled" : ""}>Voltar para corrigir</button>
      <button class="btn btn-principal btn-grande flex2" id="confirmar" ${estado.enviando || estado.jaVotou ? "disabled" : ""}>
        ${estado.enviando ? "Registrando…" : "Confirmar Voto"}</button>
    </div>`;

  $$("[data-ir]", app).forEach((b) => b.addEventListener("click", () => irPara(Number(b.dataset.ir))));
  $("#corrigir").addEventListener("click", () => irPara(1));
  $("#confirmar").addEventListener("click", confirmar);
}

async function confirmar() {
  estado.enviando = true; estado.erro = "";
  desenhar();
  const answers = {};
  for (const c of estado.info.candidates) {
    const v = estado.respostas[c.id];
    answers[c.id] = v === true || v === "branco" ? v : false;
  }
  // se muita gente votar no mesmo segundo, o Google pede para esperar: tenta de novo sozinho
  let resp;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    resp = await chamar("vote", { name: estado.nome, doc: estado.doc, answers });
    if (resp.ok || !resp.dados.busy) break;
    await new Promise((r) => setTimeout(r, 2000 * tentativa));
  }
  const { ok, dados } = resp;
  estado.enviando = false;
  if (!ok) {
    estado.erro = dados.error || "Erro ao registrar. Seu voto NÃO foi registrado. Tente novamente.";
    if (dados.alreadyVoted) estado.jaVotou = true;
    return desenhar();
  }
  estado.comprovante = { protocolo: dados.protocol, em: dados.at };
  marcarAparelho();
  irPara(COMPROVANTE());
}

// ---------- comprovante ----------
function telaComprovante() {
  const c = estado.comprovante;
  app.innerHTML = `
    <section class="confirmado">
      <div class="check">✓</div>
      <h2 class="titulo-etapa mt-g">Seu voto foi registrado com sucesso!</h2>
      <p class="texto-suave" style="font-size:19px">Obrigado por participar. Deus abençoe!</p>

      <div class="card pad comprovante">
        <div class="rotulo-c">Comprovante de votação</div>
        <dl>
          <div><dt>Igreja</dt><dd>${esc(estado.info.church_name)}</dd></div>
          <div><dt>Etapa</dt><dd>${esc(estado.info.fase_label)}</dd></div>
          ${estado.nome ? `<div><dt>Eleitor</dt><dd>${esc(estado.nome)}</dd></div>` : ""}
          <div><dt>Data e hora</dt><dd>${dataHora(c.em)}</dd></div>
          <div><dt>Protocolo</dt><dd class="mono">${esc(c.protocolo)}</dd></div>
        </dl>
        <p class="pequeno texto-suave" style="text-align:center">O comprovante não mostra como você votou. O voto é secreto.</p>
      </div>

      ${estado.info.fase < (estado.info.fases || []).length ? `<p class="texto-suave mt-g">Fique atento: haverá uma próxima etapa de votação.</p>
        <div id="vigia" class="nao-imprimir" style="max-width:420px;margin:0 auto"></div>` : ""}

      <div class="nao-imprimir">
        <button class="btn btn-contorno mt-g" onclick="window.print()">Imprimir / salvar comprovante</button>
        <p class="mt"><a href="index.html" class="pequeno">Voltar ao início</a></p>
      </div>
    </section>`;
  if (estado.info.fase < (estado.info.fases || []).length) vigiarProximaEtapa($("#vigia"));
}
