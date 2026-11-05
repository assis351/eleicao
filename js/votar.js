// ================================================================
// FLUXO DE VOTAÇÃO
// Etapas: 0 identificação -> 1 Pastores -> 2 Presbíteros -> 3 Diáconos
//         -> 4 revisão -> 5 comprovante
// Em cada candidato o membro marca SIM ou NÃO (uma resposta por nome).
// ================================================================
const estado = {
  info: null,          // dados vindos do servidor (candidatos, configurações)
  etapa: 0,
  nome: "",
  doc: "",
  primeiroNome: "",
  respostas: {},       // { idDoCandidato: true (SIM) | false (NÃO) }
  erro: "",
  jaVotou: false,
  enviando: false,
  comprovante: null,
};

const app = document.getElementById("app");

// ---------- carregamento ----------
(async function iniciar() {
  const { ok, dados } = await chamar("info");
  if (!ok) return aviso("Ops!", dados.error || "Não foi possível carregar. Verifique sua internet.");
  estado.info = dados;
  $("#selo").innerHTML = seloLogo(dados.logo_url, 42);
  $("#igreja").textContent = dados.church_name;
  $("#titulo").textContent = dados.title;
  desenhar();
})();

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
  if (etapa < 5 && info.status === "not_started") return aviso("Votação ainda não começou", `Início: ${dataHora(info.start_at)}`);
  if (etapa < 5 && info.status === "closed") return aviso("Votação encerrada", "O período de votação terminou.");

  if (etapa === 0) return telaIdentificacao();
  if (etapa >= 1 && etapa <= 3) return telaCedula(info.categories[etapa - 1]);
  if (etapa === 4) return telaRevisao();
  if (etapa === 5) return telaComprovante();
}

function aviso(titulo, texto) {
  app.innerHTML = `<div class="card pad" style="text-align:center">
    <h2 class="titulo-etapa" style="font-size:30px">${esc(titulo)}</h2>
    <p class="texto-suave">${esc(texto)}</p>
    <a class="btn btn-contorno mt" href="index.html">Voltar ao início</a></div>`;
}

function progresso() {
  const nomes = [...estado.info.categories.map((c) => c.label), "Revisão"];
  return `<ol class="progresso" aria-label="Etapas da votação">
    ${nomes.map((n, i) => {
      const num = i + 1;
      const cls = num < estado.etapa ? "feito" : num === estado.etapa ? "feito atual" : "";
      return `<li class="${cls}"><div class="barra"></div><div class="nome">${n}</div></li>`;
    }).join("")}
    <span class="sr">Etapa ${estado.etapa} de 4</span></ol>`;
}

// ---------- 0: identificação ----------
function telaIdentificacao() {
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

// ---------- 1, 2, 3: cédula SIM / NÃO ----------
function telaCedula(cat) {
  const lista = candidatosDa(cat.key);
  const feitos = lista.filter((c) => typeof estado.respostas[c.id] === "boolean").length;
  const completo = feitos === lista.length;
  const faltam = lista.length - feitos;

  app.innerHTML = `
    ${progresso()}
    ${estado.etapa === 1 ? `<p class="texto-suave pequeno">Olá, <strong>${esc(estado.primeiroNome)}</strong>!</p>` : ""}
    <h2 class="titulo-etapa">${cat.label}</h2>
    <p class="texto-suave">Para cada nome, marque <strong style="color:var(--verde-700)">SIM</strong>
      ou <strong style="color:var(--vermelho-700)">NÃO</strong>.</p>

    <div class="contador" aria-live="polite">
      <span class="${completo ? "completo" : ""}">${feitos} de ${lista.length} respondido${lista.length === 1 ? "" : "s"}</span>
    </div>

    ${lista.length === 0
      ? `<p class="card pad texto-suave" style="text-align:center">Nenhum candidato nesta categoria.</p>`
      : `<ul class="lista-candidatos">${lista.map(cartaoCandidato).join("")}</ul>`}

    ${!completo ? `<p class="pequeno texto-suave mt">Responda todos os nomes para continuar. Ainda falta${faltam === 1 ? "" : "m"} ${faltam}.</p>` : ""}

    <div class="linha-botoes">
      <button class="btn btn-contorno flex1" id="voltar">Voltar</button>
      <button class="btn btn-verde flex2" id="avancar" ${completo ? "" : "disabled"}>
        ${estado.etapa === 3 ? "Revisar Voto" : "Próximo"}</button>
    </div>`;

  // cliques nos botões SIM / NÃO
  $$(".botao-voto", app).forEach((b) =>
    b.addEventListener("click", () => {
      estado.respostas[b.dataset.id] = b.dataset.valor === "sim";
      const y = window.scrollY;
      telaCedula(cat);           // redesenha mantendo a posição da tela
      window.scrollTo(0, y);
    })
  );
  $("#voltar").addEventListener("click", () => irPara(estado.etapa - 1));
  $("#avancar").addEventListener("click", () => irPara(estado.etapa + 1));
}

function cartaoCandidato(c) {
  const r = estado.respostas[c.id];
  const marca = r === true ? "marcado-sim" : r === false ? "marcado-nao" : "";
  return `<li class="card candidato ${marca}">
    <div class="dados">
      ${avatar(c.photo_url, c.name, 64)}
      <div style="min-width:0">
        <div class="nome">${esc(c.name)}</div>
        ${c.description ? `<div class="desc">${esc(c.description)}</div>` : ""}
      </div>
    </div>
    <div class="botoes-voto" role="group" aria-label="Voto para ${esc(c.name)}">
      <button type="button" class="botao-voto sim ${r === true ? "ativo" : ""}" data-id="${c.id}" data-valor="sim" aria-pressed="${r === true}">
        ${r === true ? "✓ " : ""}SIM</button>
      <button type="button" class="botao-voto nao ${r === false ? "ativo" : ""}" data-id="${c.id}" data-valor="nao" aria-pressed="${r === false}">
        ${r === false ? "✓ " : ""}NÃO</button>
    </div>
  </li>`;
}

// ---------- 4: revisão ----------
function telaRevisao() {
  const blocos = estado.info.categories.map((cat, i) => {
    const lista = candidatosDa(cat.key);
    return `<div class="card pad revisao-bloco">
      <div class="cabeca"><h3>${cat.label}</h3>
        <button class="link-btn laranja" data-ir="${i + 1}">Alterar</button></div>
      ${lista.length === 0 ? `<p class="texto-suave">Nenhum candidato</p>` : `<ul class="revisao-lista">
        ${lista.map((c) => `<li>${avatar(c.photo_url, c.name, 40)}<span class="nome">${esc(c.name)}</span>
          ${estado.respostas[c.id] ? '<span class="etiqueta sim">SIM</span>' : '<span class="etiqueta nao">NÃO</span>'}</li>`).join("")}
      </ul>`}
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
  for (const c of estado.info.candidates) answers[c.id] = estado.respostas[c.id];
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
  irPara(5);
}

// ---------- 5: comprovante ----------
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
          <div><dt>Eleitor</dt><dd>${esc(estado.nome)}</dd></div>
          <div><dt>Data e hora</dt><dd>${dataHora(c.em)}</dd></div>
          <div><dt>Protocolo</dt><dd class="mono">${esc(c.protocolo)}</dd></div>
        </dl>
        <p class="pequeno texto-suave" style="text-align:center">O comprovante não mostra como você votou. O voto é secreto.</p>
      </div>

      <div class="nao-imprimir">
        <button class="btn btn-contorno mt-g" onclick="window.print()">Imprimir / salvar comprovante</button>
        <p class="mt"><a href="index.html" class="pequeno">Voltar ao início</a></p>
      </div>
    </section>`;
}
