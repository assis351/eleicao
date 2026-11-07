// ================================================================
// PÁGINA PÚBLICA DOS ELEITOS
// Só aparece depois que o admin clica em "Liberar página" (aba Etapas).
// Mostra nomes, cargos e fotos — nunca votos — das etapas já encerradas.
// ================================================================
const corpo = $("#el-corpo");
const ORDEM_DIRETORIA = ["Presidente", "Vice-presidente", "Tesoureiro", "1º Secretário", "2º Secretário"];
const SECOES = [
  { key: "pastor", titulo: "Pastores" },
  { key: "presbitero", titulo: "Presbíteros" },
  { key: "diacono", titulo: "Diáconos" },
  { key: "exame", titulo: "Exame de Contas" },
];

// iniciais sem os títulos (Pr., Pb., Rev., Diac.…)
function iniciais(nome) {
  const partes = nome.replace(/\b(Rev|Pr|Pb|Presb|Diac|Dc|Ir|Irm[ãa]|Sr|Sra|Dr|Dra)\.?\s+/gi, "").trim().split(/\s+/);
  const p = partes[0] || "", u = partes.length > 1 ? partes[partes.length - 1] : "";
  return (p.charAt(0) + u.charAt(0)).toUpperCase();
}

function foto(p) {
  const ini = iniciais(p.name).replace(/[^A-ZÀ-Ý]/g, "");
  if (!p.photo_url) return `<span class="el-foto" aria-hidden="true">${ini}</span>`;
  // se a foto não carregar, mostra as iniciais
  return `<img class="el-foto" src="${esc(p.photo_url)}" alt="Foto de ${esc(p.name)}" data-ini="${ini}"
    onerror="const s=document.createElement('span');s.className='el-foto';s.textContent=this.dataset.ini;this.replaceWith(s)">`;
}

async function carregar() {
  const { ok, dados } = await chamar("eleitos");
  if (!ok) {
    corpo.innerHTML = `<div class="card pad el-espera"><h2 class="titulo-etapa">Ops!</h2>
      <p class="texto-suave">${esc(dados.error || "Não foi possível carregar. Verifique sua internet.")}</p></div>`;
    return;
  }
  if (dados.logo_url) $("#el-logo").src = dados.logo_url;
  $("#el-igreja").textContent = dados.church_name || "";
  $("#el-sub").textContent = dados.title ? `${dados.title} · eleita em assembleia` : "Eleita em assembleia";
  document.title = `Nova Liderança · ${dados.church_name || "Igreja"}`;

  const cats = dados.categorias || [];
  const temAlguem = cats.some((c) => c.pessoas.length);
  if (!dados.liberado || !temAlguem) {
    corpo.innerHTML = `<div class="card pad el-espera">
      <h2 class="titulo-etapa" style="font-size:28px">Em breve</h2>
      <p class="texto-suave">A nova liderança será divulgada assim que a apuração for concluída. Volte a abrir este link mais tarde.</p>
    </div>`;
    return;
  }

  // diretoria: presidência, tesoureiro e secretários
  const cargoDe = {};   // nome -> cargos da diretoria (para a etiqueta)
  const diretoria = [];
  cats.filter((c) => c.fase > 1 && c.key !== "exame").forEach((c) => c.pessoas.forEach((p) => {
    diretoria.push(p);
    (cargoDe[p.name] = cargoDe[p.name] || []).push(p.cargo);
  }));
  diretoria.sort((a, b) => ORDEM_DIRETORIA.indexOf(a.cargo) - ORDEM_DIRETORIA.indexOf(b.cargo));

  const secaoDiretoria = diretoria.length ? `
    <div class="el-diretoria">
      ${diretoria.map((p) => `<div class="el-cargo">${foto(p)}<div class="c">${esc(p.cargo)}</div><div class="n">${esc(p.name)}</div></div>`).join("")}
    </div>` : "";

  const secoes = SECOES.map((s) => {
    const cat = cats.find((c) => c.key === s.key);
    if (!cat || !cat.pessoas.length) return "";
    return `<section class="el-secao"><h2>${esc(s.titulo)}</h2><div class="el-grade">
      ${cat.pessoas.map((p) => `<div class="el-pessoa">${foto(p)}<div class="n">${esc(p.name)}</div>
        ${s.key !== "exame" ? (cargoDe[p.name] || []).map((c) => `<span class="tag">${esc(c)}</span>`).join(" ") : ""}</div>`).join("")}
    </div></section>`;
  }).join("");

  corpo.innerHTML = `
    ${secaoDiretoria || '<div style="height:8px"></div>'}
    ${secoes}
    <div class="el-acoes">
      <button class="btn btn-principal" id="el-compartilhar">Compartilhar</button>
      <a class="btn btn-verde" id="el-whats" target="_blank" rel="noopener">Mandar no WhatsApp</a>
      <button class="btn btn-contorno" id="el-copiar">Copiar link</button>
    </div>
    <p class="pequeno texto-suave el-rodape">Que o Senhor abençoe a nova liderança.</p>`;

  const url = location.href.split("#")[0].split("?")[0];
  const texto = `Conheça a nova liderança da ${dados.church_name || "nossa igreja"}:`;
  $("#el-whats").href = "https://wa.me/?text=" + encodeURIComponent(`${texto} ${url}`);
  $("#el-compartilhar").addEventListener("click", async () => {
    if (navigator.share) { try { await navigator.share({ title: document.title, text: texto, url }); return; } catch { return; } }
    $("#el-whats").click();
  });
  $("#el-copiar").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(url); e.target.textContent = "Link copiado ✓"; }
    catch { prompt("Copie o link:", url); }
  });
}

carregar();
