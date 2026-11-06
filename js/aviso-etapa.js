// ================================================================
// AVISO DE ETAPA ABERTA
// Enquanto o membro espera (etapa encerrada, ou já votou nesta etapa),
// a tela consulta o servidor sozinha. Quando o admin abrir uma votação
// em que este aparelho ainda não votou: toca um som, vibra e mostra
// um aviso grande com o botão "Votar agora".
// ================================================================
const AVISO_INTERVALO_MS = 15000; // consulta a cada ~15 s (+ um pouco aleatório para não chegar todo mundo junto)

let avisoAudio = null;   // som liberado pelo toque do membro
let avisoTravaTela = null;
let avisoTimer = null;
let avisoDisparado = false;

function vigiarProximaEtapa(caixa) {
  if (!caixa) return;
  caixa.innerHTML = `
    <div class="vigia">
      <div class="vigia-linha"><span class="vigia-sino" aria-hidden="true">🔔</span>
        <div><strong>Esta tela avisa sozinha quando a próxima votação abrir.</strong>
          <span class="pequeno texto-suave">Deixe o site aberto. Não precisa recarregar.</span></div></div>
      <button type="button" class="btn btn-contorno btn-pequeno" id="vigia-som">Ativar som do aviso</button>
      <p class="pequeno texto-suave vigia-status" id="vigia-status" aria-live="polite">Aguardando…</p>
    </div>`;
  const botao = caixa.querySelector("#vigia-som");
  botao.addEventListener("click", () => {
    liberarSom();
    tocarSino(1);
    if (navigator.vibrate) navigator.vibrate(150);
    botao.textContent = "Som ativado ✓";
    botao.disabled = true;
  });
  manterTelaLigada();
  agendarVerificacao(4000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !avisoDisparado) { manterTelaLigada(); agendarVerificacao(300); }
  });
}

function agendarVerificacao(espera) {
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(verificarEtapa, espera ?? AVISO_INTERVALO_MS + Math.random() * 5000);
}

async function verificarEtapa() {
  if (avisoDisparado) return;
  if (document.visibilityState === "hidden") return; // volta a verificar quando a tela voltar
  const { ok, dados } = await chamar("info");
  const status = document.getElementById("vigia-status");
  if (ok && dados.status === "open" && !aparelhoJaVotou(dados)) return dispararAviso(dados);
  if (status) {
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    status.textContent = ok ? `Ainda não abriu · verificado às ${hora}` : "Sem conexão no momento · tentando de novo…";
  }
  agendarVerificacao();
}

// mesma "marca" que o votar.js grava quando o voto é confirmado
function aparelhoJaVotou(info) {
  const base = "votou_" + info.title;
  const chave = info.fase > 1 ? `${base}_etapa${info.fase}` : base;
  try { return !!localStorage.getItem(chave); } catch { return false; }
}

function dispararAviso(info) {
  avisoDisparado = true;
  clearTimeout(avisoTimer);
  const fundo = document.createElement("div");
  fundo.className = "aviso-etapa";
  fundo.setAttribute("role", "alertdialog");
  fundo.setAttribute("aria-label", "Votação aberta");
  fundo.innerHTML = `
    <div class="aviso-etapa-caixa">
      <div class="aviso-etapa-sino" aria-hidden="true">🔔</div>
      <h2>A votação está aberta!</h2>
      <p>Etapa ${info.fase} de ${(info.fases || []).length || 5}<br><strong>${esc(info.fase_label)}</strong></p>
      <a class="btn btn-principal btn-grande largura-total" href="votar.html">Votar agora</a>
    </div>`;
  document.body.appendChild(fundo);
  fundo.querySelector("a").focus();
  if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 900]);
  tocarSino(3);
  piscarTitulo();
}

// ---------- som (Web Audio: não precisa de arquivo de áudio) ----------
function liberarSom() {
  try {
    if (!avisoAudio) avisoAudio = new (window.AudioContext || window.webkitAudioContext)();
    if (avisoAudio.state === "suspended") avisoAudio.resume();
  } catch { avisoAudio = null; }
}

function tocarSino(vezes) {
  liberarSom(); // em muitos celulares só funciona se o membro já tocou na tela antes
  if (!avisoAudio) return;
  const notas = [784, 988, 1175]; // sol, si, ré: um "plim-plim-plim" suave
  let t = avisoAudio.currentTime + 0.05;
  for (let v = 0; v < vezes; v++) {
    notas.forEach((freq, i) => {
      const osc = avisoAudio.createOscillator(), vol = avisoAudio.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      const ini = t + i * 0.18;
      vol.gain.setValueAtTime(0.0001, ini);
      vol.gain.exponentialRampToValueAtTime(0.35, ini + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ini + 0.6);
      osc.connect(vol).connect(avisoAudio.destination);
      osc.start(ini); osc.stop(ini + 0.65);
    });
    t += 1.1;
  }
}

function piscarTitulo() {
  const original = document.title;
  let ligado = false;
  const timer = setInterval(() => {
    ligado = !ligado;
    document.title = ligado ? "🔔 Votação aberta!" : original;
  }, 1000);
  const parar = () => { clearInterval(timer); document.title = original; };
  window.addEventListener("focus", parar, { once: true });
  setTimeout(parar, 60000);
}

// pede ao celular para não apagar a tela enquanto espera (se o aparelho permitir)
async function manterTelaLigada() {
  try {
    if ("wakeLock" in navigator && !avisoTravaTela) {
      avisoTravaTela = await navigator.wakeLock.request("screen");
      avisoTravaTela.addEventListener("release", () => { avisoTravaTela = null; });
    }
  } catch { /* aparelho não permite: tudo bem, ao voltar para a tela ele verifica na hora */ }
}
