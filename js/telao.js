// ================================================================
// MODO TELÃO (para projetar no templo)
// Usa o login do Painel do Administrador feito NESTE computador.
//  - Contador: votos chegando ao vivo + QR Code para os membros entrarem
//  - Resultado: só aparece quando você clicar em "Mostrar resultado" (ou tecla R)
//  - Todos os eleitos: resumo de todos os cargos definidos até agora (tecla T)
// Os controles aparecem ao mexer o mouse ou tocar na tela.
// ================================================================
const TELAO_INTERVALO_MS = 5000;
const palco = $("#palco");
const endereco = enderecoDoSite();

let dados = null;           // último resultado vindo do servidor
let desenhado = "";         // assinatura do que está na tela (evita piscar)
let mostrarQR = lerPref("telao_qr", "1") === "1";
let modo = "contador";      // contador | resultado | resumo
let faseDoModo = 0;

function lerPref(chave, padrao) { try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; } }
function gravarPref(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ } }

// o modo escolhido vale só para a etapa atual: quando a etapa muda, volta para o contador
function lerModo() {
  try { const m = JSON.parse(sessionStorage.getItem("telao_modo") || "{}"); modo = m.modo || "contador"; faseDoModo = m.fase || 0; }
  catch { modo = "contador"; }
}
function mudarModo(novo) {
  modo = novo; faseDoModo = dados ? dados.fase : 0;
  try { sessionStorage.setItem("telao_modo", JSON.stringify({ modo, fase: faseDoModo })); } catch { /* ok */ }
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
  const novaFase = !dados || dados.fase !== d.fase;
  dados = d;
  if (novaFase && faseDoModo !== d.fase) { modo = "contador"; faseDoModo = d.fase; }
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

  const votos = votosDaEtapa(d);
  if (modo === "contador") {
    const assin = ["contador", d.fase, d.faseAberta, mostrarQR, d.settings?.presentes || 0].join("|");
    if (assin === desenhado) return atualizarNumero(votos);
    desenhado = assin;
    return desenharContador(d, votos);
  }
  const assin = [modo, d.fase, d.faseAberta, JSON.stringify(d.categories)].join("|");
  if (assin === desenhado) return;
  desenhado = assin;
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
$("#b-cheia").addEventListener("click", telaCheia);

function alternarQR() {
  mostrarQR = !mostrarQR;
  gravarPref("telao_qr", mostrarQR ? "1" : "0");
  desenhado = "";
  desenhar();
}
function telaCheia() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "c") mudarModo("contador");
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
