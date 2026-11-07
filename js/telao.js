// ================================================================
// MODO TELÃO (para projetar no templo)
// Usa o login do Painel do Administrador feito NESTE computador.
// AUTOMÁTICO: segue o que a mesa faz no painel (aba Etapas):
//    etapa aberta -> Contador (QR Code + votos ao vivo)
//    etapa encerrada -> Resultado (com suspense)
//    próxima etapa ainda fechada -> Mensagens; ao abrir, volta ao Contador
//  - Os botões/teclas abaixo trocam a tela na hora; na próxima mudança da etapa o automático volta a valer.
//  - Contador: votos chegando ao vivo + QR Code para os membros entrarem (tecla C)
//  - Resultado: tecla R
//  - Todos os eleitos: resumo de todos os cargos definidos até agora (tecla T)
//  - Mensagem: versículos/avisos do painel (tecla M). Aparece sozinha entre uma etapa e outra.
//  - Suspense: o resultado revela os eleitos um por um (tecla S liga/desliga;
//    Espaço avança, Esc pula a revelação, R de novo repete)
// Os controles aparecem ao mexer o mouse ou tocar na tela.
// ================================================================
const TELAO_INTERVALO_MS = 4000;
const palco = $("#palco");
const endereco = enderecoDoSite();

let dados = null;           // último resultado vindo do servidor
let desenhado = "";         // assinatura do que está na tela (evita piscar)
let mostrarQR = lerPref("telao_qr", "1") === "1";
let modo = "contador";      // contador | resultado | resumo | mensagem
let suspense = lerPref("telao_suspense", "1") === "1";
let revelacao = null;       // revelação em andamento: { d, votos, passos, i, timer }
let msgTimer = null, msgIdx = 0;
let chaveDoModo = "";       // etapa + aberta/encerrada em que o modo atual foi definido

function lerPref(chave, padrao) { try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; } }
function gravarPref(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ } }

// o modo escolhido vale enquanto a etapa não muda de situação (aberta/encerrada/próxima etapa)
const chaveEtapa = (d) => `${d.fase}|${d.faseAberta ? 1 : 0}`;
function lerModo() {
  try { const m = JSON.parse(sessionStorage.getItem("telao_modo") || "{}"); modo = m.modo || "contador"; chaveDoModo = m.chave || ""; }
  catch { modo = "contador"; }
}
function gravarModo() {
  try { sessionStorage.setItem("telao_modo", JSON.stringify({ modo, chave: chaveDoModo })); } catch { /* ok */ }
}
// aberta: contador · encerrada com votos: resultado · ainda não aberta: contador (que mostra as mensagens)
function modoAutomatico(d) {
  return !d.faseAberta && votosDaEtapa(d) > 0 ? "resultado" : "contador";
}
function mudarModo(novo) {
  // "Mostrar resultado" de novo, já no resultado: repete a revelação com suspense
  if (novo === "resultado" && modo === "resultado" && dados && !revelacao) marcarRevelado(dados, votosDaEtapa(dados), false);
  pararRevelacao();
  modo = novo;
  if (dados) chaveDoModo = chaveEtapa(dados);
  gravarModo();
  desenhado = "";
  desenhar();
}

// ---------- busca ----------
async function buscar() {
  const { ok, status, dados: d } = await chamar("results");
  if (!ok || d.hidden) {
    if (status === 401 || d.hidden) return semLogin();
    if (!dados) palco.innerHTML = `<div class="t-centro"><h2>Sem conexão</h2><p>${esc(d.error || "Tentando de novo…")}</p></div>`;
    return;
  }
  dados = d;
  // a mesa abriu, encerrou ou passou de etapa: o telão troca de tela sozinho
  if (chaveEtapa(d) !== chaveDoModo) {
    if (modo !== "resultado" || modoAutomatico(d) !== "resultado") pararRevelacao();
    modo = modoAutomatico(d);
    chaveDoModo = chaveEtapa(d);
    gravarModo();
    desenhado = "";
  }
  desenhar();
}

function semLogin() {
  dados = null; desenhado = "";
  palco.innerHTML = `<div class="t-centro">
    <h2>Entre no painel primeiro</h2>
    <p>Para usar o telão, entre no Painel do Administrador <strong>neste computador</strong> e depois abra o telão de novo.</p>
    <a class="btn btn-principal btn-grande" href="admin.html">Abrir o Painel</a></div>`;
}

function votosDaEtapa(d) {
  return (d.fases || []).find((f) => f.n === d.fase)?.ballots ?? d.totalBallots ?? 0;
}

// ---------- desenho ----------
function desenhar() {
  if (!dados) return;
  const d = dados;
  $("#igreja").textContent = d.settings?.church_name || "";
  $("#titulo").textContent = d.settings?.title || "Eleição";
  $("#selo").innerHTML = seloLogo(d.settings?.logo_url, 52);
  $("#etapa-n").textContent = `Etapa ${d.fase} de ${(d.fases || []).length || 5}`;
  $("#etapa-l").textContent = d.faseLabel;
  $$("[data-modo]").forEach((b) => b.classList.toggle("ativo", b.dataset.modo === modo));
  $("#b-qr").classList.toggle("ativo", mostrarQR);
  $("#b-susp").classList.toggle("ativo", suspense);

  const votos = votosDaEtapa(d);
  if (modo !== "resultado") pararRevelacao();

  // entre etapas (etapa ainda não aberta e sem votos) o telão mostra as mensagens sozinho
  const entreEtapas = modo === "contador" && !d.faseAberta && votos === 0;
  if (modo === "mensagem" || entreEtapas) {
    const assin = ["mensagem", d.fase, d.faseAberta, votos > 0, d.settings?.telao_mensagens || ""].join("|");
    if (assin === desenhado) return;
    desenhado = assin;
    return desenharMensagem(d, votos);
  }
  pararMensagens();

  if (modo === "contador") {
    const assin = ["contador", d.fase, d.faseAberta, mostrarQR, d.settings?.presentes || 0].join("|");
    if (assin === desenhado) return atualizarNumero(votos);
    desenhado = assin;
    return desenharContador(d, votos);
  }
  if (modo === "resultado" && revelacao) return; // revelação em andamento: não interrompe
  const assin = [modo, d.fase, d.faseAberta, JSON.stringify(d.categories)].join("|");
  if (assin === desenhado) return;
  desenhado = assin;
  if (modo === "resultado" && precisaRevelar(d, votos)) return iniciarRevelacao(d, votos);
  modo === "resultado" ? desenharResultado(d) : desenharResumo(d);
}

function desenharContador(d, votos) {
  const aberta = d.faseAberta;
  const qr = aberta && mostrarQR;
  palco.innerHTML = `
    <section class="t-contador ${qr ? "" : "sem-qr"}">
      <div>
        <span class="t-estado ${aberta ? "" : "fechada"}"><i></i>${aberta ? "Votação aberta" : "Votação encerrada"}</span>
        <div class="t-numero" id="t-numero" data-valor="${votos}">${votos}</div>
        <div class="t-legenda" id="t-legenda">${votos === 1 ? "voto registrado" : "votos registrados"}</div>
        ${d.settings?.presentes ? `<div class="t-quorum" id="t-quorum">${quorumHtml(votos, d.settings.presentes)}</div>` : ""}
        <div class="t-sub">${aberta ? "O voto é secreto. Cada membro vota uma vez." : "Obrigado a todos que votaram. O resultado será apresentado em instantes."}</div>
      </div>
      ${qr ? `<div class="t-qr"><div class="qr">${svgQR(endereco)}</div>
        <strong>Aponte a câmera do celular</strong><span>${esc(endereco.replace(/^https?:\/\//, ""))}</span></div>` : ""}
    </section>`;
}

function atualizarNumero(votos) {
  const el = $("#t-numero");
  if (!el) return;
  const antes = Number(el.dataset.valor);
  if (antes === votos) return;
  el.dataset.valor = votos;
  contarAte(el, antes, votos, 700);
  $("#t-legenda").textContent = votos === 1 ? "voto registrado" : "votos registrados";
  if ($("#t-quorum")) $("#t-quorum").innerHTML = quorumHtml(votos, dados.settings.presentes);
  el.classList.remove("pulo"); void el.offsetWidth; el.classList.add("pulo");
}

// "de 48 presentes · 85%" com barra
function quorumHtml(votos, presentes) {
  const p = presentes ? Math.min(100, (votos / presentes) * 100) : 0;
  return `<div class="t-qbarra"><b style="width:${p.toFixed(1)}%"></b></div>
    <span>de <strong>${presentes}</strong> presentes · ${pct(p)}${votos >= presentes ? " · todos votaram" : ""}</span>`;
}

function contarAte(el, de, para, ms, formato = (n) => String(Math.round(n))) {
  const ini = performance.now();
  const passo = (agora) => {
    const t = Math.min(1, (agora - ini) / ms), e = 1 - Math.pow(1 - t, 3);
    el.textContent = formato(de + (para - de) * e);
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function pct(n) { return `${Number(n || 0).toFixed(1).replace(".", ",")}%`; }

function desenharResultado(d) {
  const cats = d.categories.filter((c) => c.fase === d.fase);
  const votos = votosDaEtapa(d);
  if (!votos) {
    palco.innerHTML = `<div class="t-centro"><h2>Ainda não há votos</h2><p>Nesta etapa nenhum voto foi registrado até agora.</p></div>`;
    return;
  }
  let atraso = 0;
  const prox = (passo = 0.12) => (atraso += passo).toFixed(2);

  if (d.fase === 1) {
    palco.innerHTML = `<section class="t-res" style="grid-template-columns:repeat(${cats.length}, 1fr)">
      ${cats.map((cat) => {
        const eleitos = cat.candidates.filter((c) => c.status === "eleito").length;
        return `<div class="t-col">
          <h3>${esc(cat.label)} <small>${eleitos} eleito${eleitos === 1 ? "" : "s"}</small></h3>
          ${cat.candidates.map((c) => linhaCandidato(c, prox(), "sim")).join("")}
        </div>`;
      }).join("")}
      </section>
      <p class="t-nota">${votos} votos nesta etapa · Eleito quem obtiver mais de ${d.minPercent}% de SIM
        ${d.brancosContam ? "(contando os votos em branco)" : "sobre os votos válidos (o voto em branco não entra nessa conta)"}</p>`;
  } else {
    const cat = cats[0];
    if (!cat || !cat.candidates.length) {
      palco.innerHTML = `<div class="t-centro"><h2>Sem candidatos nesta etapa</h2></div>`;
      return;
    }
    const ganhos = cat.candidates.filter((c) => c.status === "eleito");
    const empate = cat.candidates.some((c) => c.status === "empate");
    const escolha = cat.tipo === "escolha";
    palco.innerHTML = `<section class="t-res">
      <div class="t-vencedores ${ganhos.length + (empate ? 1 : 0) >= 3 ? "compacto" : ""}">
        ${ganhos.map((c, i) => `<div class="t-cargo" style="animation-delay:${(0.3 + i * 0.6).toFixed(1)}s">
          <div class="c">${esc(c.cargo || cat.singular)}</div>
          <div class="n">${esc(c.name)}</div>
          <div class="v">${c.yes} voto${c.yes === 1 ? "" : "s"}${escolha ? "" : " SIM"} · ${pct(c.percent)}</div></div>`).join("")}
        ${empate ? `<div class="t-cargo" style="animation-delay:.3s"><div class="c">${esc(cat.label)}</div>
          <div class="n">Empate</div><div class="v">A votação desta etapa será refeita.</div></div>` : ""}
      </div>
      <div class="t-col" style="max-width:900px;width:100%;justify-self:center">
        <h3>${esc(cat.label)} <small>${votos} votos${cat.blanks ? ` · ${cat.blanks} em branco` : ""}</small></h3>
        ${((atraso = 0.9), cat.candidates.map((c) => linhaCandidato(c, prox(0.1), escolha ? "escolha" : "sim")).join(""))}
      </div></section>`;
  }
  // barras crescem depois de entrar na tela
  setTimeout(() => $$(".t-barra b", palco).forEach((b) => (b.style.width = b.dataset.l + "%")), 250);
}

function linhaCandidato(c, atraso, tipo) {
  const eleito = c.status === "eleito";
  const selo = c.status === "empate" ? '<span class="t-selo empate">Empate</span>'
    : eleito ? `<span class="t-selo sim">${esc(c.cargo || "Eleito")}</span>`
    : c.status ? '<span class="t-selo nao">Não eleito</span>' : "";
  const det = tipo === "escolha"
    ? `<span>${c.yes} voto${c.yes === 1 ? "" : "s"}</span>`
    : `<span>SIM ${c.yes}</span><span>NÃO ${c.no}</span>${c.blank ? `<span>BRANCO ${c.blank}</span>` : ""}`;
  return `<div class="t-linha ${eleito ? "eleito" : ""}" style="animation-delay:${atraso}s">
    <div class="nome">${esc(c.name)}${selo}</div><div class="pct">${pct(c.percent)}</div>
    <div class="t-barra"><b data-l="${Math.max(0, Math.min(100, c.percent || 0)).toFixed(1)}"></b></div>
    <div class="det">${det}</div></div>`;
}

// todos os cargos definidos até agora (as etapas futuras aparecem como "a definir")
function desenharResumo(d) {
  const blocos = [];
  d.categories.forEach((cat) => {
    const eleitos = cat.candidates.filter((c) => c.status === "eleito");
    if (cat.fase === 1) {
      blocos.push([cat.label, eleitos.length ? eleitos.map((c) => esc(c.name)).join("<br>") : "Nenhum eleito"]);
    } else if (eleitos.length) {
      // quem só "continua Pastor" já aparece no bloco de Pastores
      eleitos.filter((c) => !cat.demais || c.cargo !== cat.demais)
        .forEach((c) => blocos.push([c.cargo || cat.singular, esc(c.name)]));
    } else {
      const andamento = cat.fase === d.fase && d.faseAberta;
      blocos.push([cat.label, cat.candidates.some((c) => c.status === "empate") ? "Empate" : andamento ? "Votação em andamento" : "A definir"]);
    }
  });
  const faltam = { 2: ["Presidente", "Vice-presidente"], 3: ["Tesoureiro"], 4: ["1º Secretário", "2º Secretário"], 5: ["Exame de Contas"] };
  for (let f = d.fase + 1; f <= (d.fases || []).length; f++) (faltam[f] || []).forEach((c) => blocos.push([c, '<span style="opacity:.55">A definir</span>']));
  palco.innerHTML = `<section class="t-resumo">
    ${blocos.map(([cargo, nome], i) => `<div class="bloco" style="animation-delay:${(i * 0.12).toFixed(2)}s">
      <div class="c">${esc(cargo)}</div><div class="n">${nome}</div></div>`).join("")}
  </section>`;
}

// ---------- mensagens entre etapas ----------
// No painel: uma mensagem por bloco (separe com linha em branco). Última linha começando com "—" = referência.
function listaMensagens(d) {
  const txt = String(d.settings?.telao_mensagens || "").replace(/\r/g, "").trim();
  const lista = txt ? txt.split(/\n\s*\n/).map((bloco) => {
    const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
    let ref = "";
    if (linhas.length > 1 && /^[—–-]/.test(linhas[linhas.length - 1])) ref = linhas.pop().replace(/^[—–-]+\s*/, "");
    return { texto: linhas.join("\n"), ref };
  }).filter((m) => m.texto) : [];
  if (lista.length) return lista;
  const inicio = d.fase === 1 && !d.faseAberta && !votosDaEtapa(d);
  return [{ texto: inicio ? "Sejam bem-vindos à assembleia!" : "Aguarde um instante: a mesa está preparando a próxima etapa.", ref: "" }];
}

function htmlMensagem(m) {
  const longo = m.texto.length > 200 ? " longo" : "";
  const texto = esc(m.texto).replace(/\n/g, "<br>");
  return m.ref
    ? `<span class="t-msg-aspas" aria-hidden="true">“</span>
       <div class="t-msg-texto${longo}">${texto}</div><div class="t-msg-ref">${esc(m.ref)}</div>`
    : `<div class="t-msg-texto aviso${longo}">${texto}</div>`;
}

function desenharMensagem(d, votos) {
  pararMensagens();
  const lista = listaMensagens(d);
  msgIdx = msgIdx % lista.length;
  const rodape = d.faseAberta
    ? `<span class="t-estado"><i></i>Votação aberta</span><span>Vote pelo celular</span>`
    : votos > 0 ? "Em instantes: o resultado desta etapa"
    : `A seguir: <strong>Etapa ${d.fase} · ${esc(d.faseLabel)}</strong>`;
  palco.innerHTML = `<section class="t-msg">
      <div class="t-msg-caixa" id="t-msg">${htmlMensagem(lista[msgIdx])}</div>
      ${lista.length > 1 ? `<div class="t-msg-pontos" id="t-msg-pontos">${lista.map((_, i) => `<i class="${i === msgIdx ? "on" : ""}"></i>`).join("")}</div>` : ""}
      <div class="t-msg-rodape">${rodape}</div>
    </section>`;
  if (lista.length < 2) return;
  msgTimer = setInterval(() => {
    const caixa = $("#t-msg");
    if (!caixa) return pararMensagens();
    caixa.classList.add("saindo");
    setTimeout(() => {
      msgIdx = (msgIdx + 1) % lista.length;
      caixa.innerHTML = htmlMensagem(lista[msgIdx]);
      caixa.classList.remove("saindo");
      $$("#t-msg-pontos i").forEach((p, i) => p.classList.toggle("on", i === msgIdx));
    }, 650);
  }, 15000);
}

function pararMensagens() { clearInterval(msgTimer); msgTimer = null; }

// ---------- revelação com suspense ----------
const chaveRev = (d, votos) => `telao_rev_${d.fase}_${votos}`;
function jaRevelado(d, votos) { try { return sessionStorage.getItem(chaveRev(d, votos)) === "1"; } catch { return false; } }
function marcarRevelado(d, votos, sim = true) {
  try { sim ? sessionStorage.setItem(chaveRev(d, votos), "1") : sessionStorage.removeItem(chaveRev(d, votos)); } catch { /* ok */ }
}
// só com a etapa encerrada (resultado final), com votos, e uma vez por etapa
function precisaRevelar(d, votos) { return suspense && !d.faseAberta && votos > 0 && !jaRevelado(d, votos); }

function montarPassos(d) {
  const cats = d.categories.filter((c) => c.fase === d.fase);
  const passos = [{ t: "intro", ms: 3400 }];
  if (d.fase === 1) {
    cats.forEach((cat) => {
      const el = cat.candidates.filter((c) => c.status === "eleito");
      passos.push({ t: "grupo", cat, el, k: 0, ms: 2400 });
      el.forEach((_, k) => passos.push({ t: "grupo", cat, el, k: k + 1, ms: k === el.length - 1 ? 3200 : 1500 }));
    });
  } else {
    const cat = cats[0];
    if (!cat) return passos;
    const ganhos = cat.candidates.filter((c) => c.status === "eleito");
    ganhos.forEach((c) => { passos.push({ t: "suspense", cat, c, ms: 2800 }); passos.push({ t: "nome", cat, c, ms: 4200 }); });
    if (cat.candidates.some((c) => c.status === "empate")) passos.push({ t: "empate", cat, ms: 4200 });
    else if (!ganhos.length) passos.push({ t: "nenhum", cat, ms: 3600 });
  }
  return passos;
}

function iniciarRevelacao(d, votos) {
  pararRevelacao();
  revelacao = { d, votos, passos: montarPassos(d), i: -1, timer: null };
  proximoPasso();
}

function proximoPasso() {
  const r = revelacao;
  if (!r) return;
  clearTimeout(r.timer);
  r.i++;
  if (r.i >= r.passos.length) return terminarRevelacao();
  const p = r.passos[r.i];
  desenharPasso(r.d, r.votos, p);
  r.timer = setTimeout(proximoPasso, p.ms);
}

function terminarRevelacao() {
  if (!revelacao) return;
  const { d, votos } = revelacao;
  pararRevelacao();
  marcarRevelado(d, votos);
  desenharResultado(dados || d);
}

function pararRevelacao() {
  if (revelacao) clearTimeout(revelacao.timer);
  revelacao = null;
}

const DICA_REV = '<div class="t-rev-dica">Espaço ou clique: avançar · Esc: pular</div>';
const PONTOS = '<div class="t-rev-pontos" aria-hidden="true"><i></i><i></i><i></i></div>';

function desenharPasso(d, votos, p) {
  if (p.t === "intro") {
    palco.innerHTML = `<section class="t-rev">
      <div class="t-rev-sub">Resultado · Etapa ${d.fase}</div>
      <h2 class="t-rev-titulo">${esc(d.faseLabel)}</h2>
      <p>${votos} ${votos === 1 ? "voto apurado" : "votos apurados"}</p>${PONTOS}</section>${DICA_REV}`;
    return;
  }
  if (p.t === "grupo") {
    const grade = $("#t-rev-grade");
    if (p.k > 0 && grade && grade.dataset.cat === p.cat.key) {
      const c = p.el[p.k - 1];
      grade.insertAdjacentHTML("beforeend", `<div class="t-rev-nome novo">${esc(c.name)}</div>`);
      $("#t-rev-conta").textContent = `${p.k} de ${p.el.length}`;
      return confete(60);
    }
    palco.innerHTML = `<section class="t-rev grupo">
      <div class="t-rev-sub">Eleitos</div>
      <h2 class="t-rev-titulo">${esc(p.cat.label)}</h2>
      ${p.el.length ? `<p id="t-rev-conta">${p.el.length} ${p.el.length === 1 ? "eleito" : "eleitos"}</p>` : "<p>Nenhum eleito nesta etapa</p>"}
      <div class="t-rev-grade ${p.el.length > 8 ? "muitos" : ""}" id="t-rev-grade" data-cat="${esc(p.cat.key)}"></div>
    </section>${DICA_REV}`;
    return;
  }
  const cargo = p.c ? (p.c.cargo || p.cat.singular) : p.cat.label;
  if (p.t === "suspense") {
    palco.innerHTML = `<section class="t-rev">
      <div class="t-rev-cargo">${esc(cargo)}</div>
      <div class="t-rev-card misterio"><span>?</span></div>${PONTOS}</section>${DICA_REV}`;
    return;
  }
  if (p.t === "nome") {
    const escolha = p.cat.tipo === "escolha";
    palco.innerHTML = `<section class="t-rev">
      <div class="t-rev-cargo">${esc(cargo)}</div>
      <div class="t-rev-card revelado"><div class="n">${esc(p.c.name)}</div>
        <div class="v">${p.c.yes} voto${p.c.yes === 1 ? "" : "s"}${escolha ? "" : " SIM"} · ${pct(p.c.percent)}</div></div>
    </section>${DICA_REV}`;
    return confete(180);
  }
  palco.innerHTML = `<section class="t-rev">
    <div class="t-rev-cargo">${esc(p.cat.label)}</div>
    <div class="t-rev-card revelado"><div class="n">${p.t === "empate" ? "Empate" : "Ninguém eleito"}</div>
      <div class="v">${p.t === "empate" ? "A votação desta etapa será refeita." : "Nenhum candidato alcançou o necessário."}</div></div>
  </section>${DICA_REV}`;
}

// chuva de confete (leve, sem biblioteca)
function confete(qtd) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.className = "t-confete";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const cores = ["#e8792a", "#f5b67e", "#a3e635", "#6f901b", "#ffffff", "#fcd34d"];
  const W = innerWidth, H = innerHeight;
  const ps = Array.from({ length: qtd }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
    vx: (Math.random() - 0.5) * W * 0.018, vy: -(Math.random() * H * 0.022 + H * 0.008),
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: cores[(Math.random() * cores.length) | 0],
  }));
  const ini = performance.now();
  const passo = (agora) => {
    const t = agora - ini;
    g.clearRect(0, 0, W, H);
    ps.forEach((p) => {
      p.vy += H * 0.0006; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.globalAlpha = Math.max(0, 1 - t / 2800);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    });
    if (t < 2800) requestAnimationFrame(passo); else cv.remove();
  };
  requestAnimationFrame(passo);
}

// ---------- controles ----------
let timerControles = null;
function mostrarControles() {
  $("#controles").classList.remove("escondido");
  document.body.classList.remove("sem-cursor");
  clearTimeout(timerControles);
  timerControles = setTimeout(() => {
    if ($("#controles").matches(":hover")) return mostrarControles();
    $("#controles").classList.add("escondido");
    document.body.classList.add("sem-cursor");
  }, 3500);
}
["mousemove", "touchstart", "click"].forEach((ev) => document.addEventListener(ev, mostrarControles, { passive: true }));

$$("[data-modo]").forEach((b) => b.addEventListener("click", () => mudarModo(b.dataset.modo)));
$("#b-qr").addEventListener("click", alternarQR);
$("#b-susp").addEventListener("click", alternarSuspense);
palco.addEventListener("click", () => { if (revelacao) proximoPasso(); });
$("#b-cheia").addEventListener("click", telaCheia);

function alternarQR() {
  mostrarQR = !mostrarQR;
  gravarPref("telao_qr", mostrarQR ? "1" : "0");
  desenhado = "";
  desenhar();
}
function alternarSuspense() {
  suspense = !suspense;
  gravarPref("telao_suspense", suspense ? "1" : "0");
  if (!suspense && revelacao) terminarRevelacao();
  desenhar();
}
function telaCheia() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (revelacao && (k === " " || k === "arrowright" || k === "enter")) { e.preventDefault(); return proximoPasso(); }
  if (revelacao && k === "escape") return terminarRevelacao();
  if (k === "c") mudarModo("contador");
  else if (k === "m") mudarModo("mensagem");
  else if (k === "s") alternarSuspense();
  else if (k === "r") mudarModo("resultado");
  else if (k === "t") mudarModo("resumo");
  else if (k === "q") alternarQR();
  else if (k === "f") telaCheia();
  else return;
  mostrarControles();
});

// ---------- início ----------
lerModo();
mostrarControles();
buscar();
setInterval(buscar, TELAO_INTERVALO_MS);
// impede o computador de apagar a tela durante a projeção (se o navegador permitir)
(async () => { try { await navigator.wakeLock?.request("screen"); } catch { /* ok */ } })();
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") { try { await navigator.wakeLock?.request("screen"); } catch { /* ok */ } }
});
