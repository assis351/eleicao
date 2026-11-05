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
