// ================================================================
// Funções usadas em todas as páginas
// ================================================================

// ---------- Login do admin (guardado neste navegador) ----------
let tokenMemoria = null;
function tokenAdmin() {
  try { return localStorage.getItem("votacao_token") || tokenMemoria; } catch { return tokenMemoria; }
}
function guardarToken(t) {
  tokenMemoria = t;
  try { t ? localStorage.setItem("votacao_token", t) : localStorage.removeItem("votacao_token"); } catch { /* sem armazenamento */ }
}

// Chama o script do Google (Apps Script) e devolve { ok, status, dados }
// Usa "text/plain" para o navegador não bloquear a chamada (CORS).
async function chamar(acao, dados = {}) {
  if (typeof API_URL === "undefined" || !/^https?:\/\//.test(API_URL)) {
    return { ok: false, status: 0, dados: { error: "Sistema ainda não configurado: cole o endereço do Google Apps Script no arquivo js/config.js." } };
  }
  const corpo = { action: acao, ...dados };
  const token = tokenAdmin();
  if (token) corpo.token = token;
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(corpo),
      redirect: "follow",
    });
    const d = await r.json();
    if (d.error) return { ok: false, status: d.status || 400, dados: d };
    return { ok: true, status: 200, dados: d };
  } catch {
    return { ok: false, status: 0, dados: { error: "Falha de conexão. Verifique sua internet e tente de novo." } };
  }
}

// Evita que textos digitados quebrem o HTML (segurança)
function esc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Data/hora no formato brasileiro (horário de Brasília)
function dataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  });
}

function porcentagem(n) {
  return `${Number(n || 0).toFixed(1).replace(".", ",")}%`;
}

// Foto do candidato (ou iniciais, se não tiver foto)
function avatar(url, nome, tamanho = 56) {
  const estilo = `width:${tamanho}px;height:${tamanho}px;font-size:${Math.round(tamanho * 0.36)}px`;
  if (url) return `<img class="avatar" src="${esc(url)}" alt="Foto de ${esc(nome)}" style="${estilo}" loading="lazy">`;
  const iniciais = String(nome || "?")
    .replace(/^(Pr|Pb|Diac)\.\s*/i, "")
    .split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  return `<span class="avatar" style="${estilo}" aria-hidden="true">${esc(iniciais)}</span>`;
}

// Selo redondo com o símbolo da igreja (ou a logo enviada pelo admin)
function seloLogo(url, tamanho = 44) {
  return `<span class="selo-logo" style="width:${tamanho}px;height:${tamanho}px">
    <img src="${esc(url || "img/simbolo.png")}" alt="Logo da igreja"></span>`;
}

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Endereço da página inicial do site (é o que vai no QR Code)
function enderecoDoSite() {
  return new URL("./", location.href).href.split("?")[0].split("#")[0];
}

// Desenha um QR Code (SVG nítido em qualquer tamanho). Precisa do js/qrcode.js na página.
function svgQR(texto, cor = "#22341a") {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount(), m = 4; // m = margem branca exigida pelo leitor
  let caminho = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) caminho += `M${c + m} ${r + m}h1v1h-1z`;
  const t = n + m * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img"
    aria-label="QR Code para ${esc(texto)}"><rect width="${t}" height="${t}" fill="#fff"/><path d="${caminho}" fill="${cor}"/></svg>`;
}

// Baixa o QR Code como imagem PNG (para imprimir ou mandar no grupo)
function baixarQR(texto, nomeArquivo = "qrcode-votacao.png") {
  const img = new Image();
  img.onload = () => {
    const tam = 1200, cv = document.createElement("canvas");
    cv.width = tam; cv.height = tam + 140;
    const g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, tam, tam);
    g.fillStyle = "#22341a"; g.textAlign = "center";
    g.font = "bold 56px sans-serif"; g.fillText("Aponte a câmera para votar", tam / 2, tam + 50);
    g.font = "36px sans-serif"; g.fillText(texto.replace(/^https?:\/\//, ""), tam / 2, tam + 110);
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png"); a.download = nomeArquivo; a.click();
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgQR(texto, "#000"));
}

// Botão "A+": aumenta a letra da página (3 tamanhos). Fica guardado no aparelho.
const TAMANHOS_LETRA = [1, 1.2, 1.4];
function aplicarLetra(n) {
  const z = TAMANHOS_LETRA[n] || 1;
  document.documentElement.style.setProperty("--zoom-letra", z);
  const b = document.getElementById("btn-letra");
  if (b) {
    b.textContent = n === 0 ? "A+" : n === 1 ? "A++" : "A";
    b.setAttribute("aria-label", n === 2 ? "Voltar a letra ao tamanho normal" : "Aumentar o tamanho da letra");
    b.classList.toggle("ativo", n > 0);
  }
}
(function iniciarBotaoLetra() {
  let n = 0;
  try { n = Number(localStorage.getItem("tamanho_letra")) || 0; } catch { /* ok */ }
  const iniciar = () => {
    if (!document.getElementById("btn-letra")) return;
    aplicarLetra(n);
    document.getElementById("btn-letra").addEventListener("click", () => {
      n = (n + 1) % TAMANHOS_LETRA.length;
      try { localStorage.setItem("tamanho_letra", n); } catch { /* ok */ }
      aplicarLetra(n);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();

// Tema claro/escuro (escuro é o padrão). O <head> das páginas já aplica o tema antes de desenhar,
// para não piscar; aqui fica o botão ☀/☾ (id="btn-tema"). Fica guardado no aparelho.
const ICONE_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>';
const ICONE_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
function temaAtual() { return document.documentElement.dataset.tema === "claro" ? "claro" : "escuro"; }
function aplicarTema(t) {
  document.documentElement.dataset.tema = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === "escuro" ? "#182612" : "#22341a";
  const b = document.getElementById("btn-tema");
  if (b) {
    b.innerHTML = t === "escuro" ? ICONE_SOL : ICONE_LUA;
    b.title = b.ariaLabel = t === "escuro" ? "Usar tema claro" : "Usar tema escuro";
  }
  document.dispatchEvent(new CustomEvent("temamudou", { detail: t }));
}
(function iniciarBotaoTema() {
  const iniciar = () => {
    const b = document.getElementById("btn-tema");
    if (!b) return;
    aplicarTema(temaAtual());
    b.addEventListener("click", () => {
      const novo = temaAtual() === "escuro" ? "claro" : "escuro";
      try { localStorage.setItem("tema", novo); } catch { /* ok */ }
      aplicarTema(novo);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();

// Chamada "paciente": quando muita gente usa ao mesmo tempo, o Google recusa algumas conexões
// (limite de execuções simultâneas) ou responde "ocupado". Aqui tenta de novo sozinho, com pausas
// um pouco diferentes em cada celular, para a fila andar. aoEsperar(tentativa, msDecorridos) atualiza a tela.
async function chamarComFila(acao, dados = {}, { limiteMs = 240000, aoEsperar } = {}) {
  const ini = Date.now();
  let incerto = false, tentativa = 0, r;
  for (;;) {
    tentativa++;
    r = await chamar(acao, dados);
    if (r.ok) return r;
    // o voto pode ter sido gravado numa tentativa cuja resposta se perdeu: "já votou" aí quer dizer que entrou
    if (acao === "vote" && r.dados.alreadyVoted && incerto) return { ok: true, status: 200, dados: { jaRegistrado: true } };
    const repetir = r.status === 0 || r.dados.busy;
    if (!repetir || Date.now() - ini > limiteMs) return r;
    if (r.status === 0) incerto = true;
    if (aoEsperar) aoEsperar(tentativa, Date.now() - ini);
    await new Promise((ok) => setTimeout(ok, 1500 + Math.random() * 2500 + Math.min(tentativa, 6) * 400));
  }
}

// ---------- Abertura rápida ----------
// Guarda neste aparelho os dados da votação (título, etapa, candidatos). Na próxima vez
// o site já aparece na hora com eles e, em segundo plano, confere se algo mudou.
function guardarInfo(d) {
  try { localStorage.setItem("info_cache", JSON.stringify({ em: Date.now(), d })); } catch { /* sem armazenamento */ }
}
function lerInfoGuardada(idadeMaxMs) {
  try {
    const x = JSON.parse(localStorage.getItem("info_cache") || "null");
    if (!x || !x.d || Date.now() - x.em > idadeMaxMs) return null;
    if (typeof API_URL !== "undefined" && x.d._api && x.d._api !== API_URL) return null;
    return x.d;
  } catch { return null; }
}
