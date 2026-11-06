// ================================================================
// ATA DA ASSEMBLEIA (rascunho automático)
// O admin preenche os dados da reunião (data, presidente, secretário,
// membros presentes...) e o sistema monta a ata com os votos de cada
// etapa e os eleitos. Sai em Word (.doc, dá para editar) ou PDF (imprimir).
// ================================================================
const ATA_PADRAO = {
  tipo: "Assembleia Geral Extraordinária",
  data: "", hora: "", hora_fim: "",
  local: "", cidade: "",
  presidente: "", secretario: "",
  presentes: "", arrolados: "",
  observacoes: "",
};

function lerDadosAta() {
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem("ata_dados") || "{}"); } catch { /* ok */ }
  const d = { ...ATA_PADRAO, ...salvo };
  if (!d.data) d.data = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  return d;
}
function gravarDadosAta(d) { try { localStorage.setItem("ata_dados", JSON.stringify(d)); } catch { /* ok */ } }

// ---------- formulário (janela no painel) ----------
function abrirFormularioAta() {
  const d = lerDadosAta();
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  fundo.innerHTML = `
    <form class="modal" id="form-ata">
      <div class="titulo-card">Ata da assembleia</div>
      <p class="pequeno texto-suave" style="margin-top:0">Preencha os dados da reunião. Os votos e os eleitos de cada etapa
        entram sozinhos. O documento sai como <strong>rascunho</strong>: confira, ajuste no Word se precisar e assine.</p>
      <div class="grade-campos">
        <div class="grupo inteira"><label class="rotulo" for="a-tipo">Tipo de reunião</label>
          <input id="a-tipo" class="campo" value="${esc(d.tipo)}"></div>
        <div class="grupo"><label class="rotulo" for="a-data">Data</label>
          <input id="a-data" type="date" class="campo" value="${esc(d.data)}" required></div>
        <div class="grupo"><label class="rotulo" for="a-hora">Horário de início</label>
          <input id="a-hora" type="time" class="campo" value="${esc(d.hora)}"></div>
        <div class="grupo"><label class="rotulo" for="a-hora-fim">Horário de encerramento</label>
          <input id="a-hora-fim" type="time" class="campo" value="${esc(d.hora_fim)}"></div>
        <div class="grupo"><label class="rotulo" for="a-cidade">Cidade / UF</label>
          <input id="a-cidade" class="campo" value="${esc(d.cidade)}" placeholder="Ex: São Paulo/SP"></div>
        <div class="grupo inteira"><label class="rotulo" for="a-local">Local</label>
          <input id="a-local" class="campo" value="${esc(d.local)}" placeholder="Ex: no templo da igreja, Rua …, nº …"></div>
        <div class="grupo"><label class="rotulo" for="a-presidente">Presidente da assembleia</label>
          <input id="a-presidente" class="campo" value="${esc(d.presidente)}" placeholder="Ex: Rev. Fulano de Tal"></div>
        <div class="grupo"><label class="rotulo" for="a-secretario">Secretário(a) da assembleia</label>
          <input id="a-secretario" class="campo" value="${esc(d.secretario)}"></div>
        <div class="grupo"><label class="rotulo" for="a-presentes">Membros presentes (quórum)</label>
          <input id="a-presentes" type="number" min="0" class="campo" value="${esc(d.presentes)}"></div>
        <div class="grupo"><label class="rotulo" for="a-arrolados">Total de membros com direito a voto</label>
          <input id="a-arrolados" type="number" min="0" class="campo" value="${esc(d.arrolados)}" placeholder="opcional"></div>
        <div class="grupo inteira"><label class="rotulo" for="a-obs">Observações (opcional)</label>
          <textarea id="a-obs" class="campo" rows="3" placeholder="Ex: leitura bíblica, oração, outros assuntos…">${esc(d.observacoes)}</textarea></div>
      </div>
      <div id="a-erro" class="alerta erro oculto" role="alert"></div>
      <div class="linha-botoes" style="flex-wrap:wrap">
        <button type="button" class="btn btn-contorno flex1" id="a-fechar">Fechar</button>
        <button type="button" class="btn btn-verde flex1" id="a-word">Baixar em Word</button>
        <button type="button" class="btn btn-principal flex1" id="a-pdf">Gerar PDF / imprimir</button>
      </div>
    </form>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  fundo.querySelector("#a-fechar").addEventListener("click", fechar);

  const coletar = () => {
    const v = (id) => fundo.querySelector(id).value.trim();
    const dados = {
      tipo: v("#a-tipo") || ATA_PADRAO.tipo, data: v("#a-data"), hora: v("#a-hora"), hora_fim: v("#a-hora-fim"),
      local: v("#a-local"), cidade: v("#a-cidade"), presidente: v("#a-presidente"), secretario: v("#a-secretario"),
      presentes: v("#a-presentes"), arrolados: v("#a-arrolados"), observacoes: v("#a-obs"),
    };
    gravarDadosAta(dados);
    return dados;
  };
  const erro = (msg) => { const e = fundo.querySelector("#a-erro"); e.textContent = msg; e.classList.remove("oculto"); };

  fundo.querySelector("#a-word").addEventListener("click", async (ev) => {
    const b = ev.currentTarget, dados = coletar();
    b.disabled = true; b.textContent = "Gerando…";
    try { baixarAtaWord(await montarAta(dados)); }
    catch (e) { erro(e.message || "Não foi possível gerar a ata."); }
    b.disabled = false; b.textContent = "Baixar em Word";
  });
  fundo.querySelector("#a-pdf").addEventListener("click", async (ev) => {
    const b = ev.currentTarget, dados = coletar();
    const janela = window.open("", "_blank"); // abre já (no clique) para o navegador não bloquear
    if (!janela) return erro("O navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.");
    janela.document.write("<p style='font-family:sans-serif;padding:24px'>Gerando a ata…</p>");
    b.disabled = true;
    try { abrirAtaParaImprimir(janela, await montarAta(dados)); }
    catch (e) { janela.close(); erro(e.message || "Não foi possível gerar a ata."); }
    b.disabled = false;
  });
}

// ---------- números e datas por extenso ----------
const EXT_U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const EXT_D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const EXT_C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function extenso(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 20) return EXT_U[n];
  if (n < 100) return EXT_D[Math.floor(n / 10)] + (n % 10 ? " e " + EXT_U[n % 10] : "");
  if (n === 100) return "cem";
  if (n < 1000) return EXT_C[Math.floor(n / 100)] + (n % 100 ? " e " + extenso(n % 100) : "");
  const mil = Math.floor(n / 1000), resto = n % 1000;
  const m = mil === 1 ? "mil" : extenso(mil) + " mil";
  if (!resto) return m;
  return m + (resto < 100 || resto % 100 === 0 ? " e " : " ") + extenso(resto);
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataPorExtenso(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = d === 1 ? "Ao primeiro dia" : `Aos ${extenso(d)} dias`;
  return `${dia} do mês de ${MESES[m - 1]} do ano de ${extenso(a)}`;
}
function horaPorExtenso(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const hs = h === 1 ? "uma hora" : h === 2 ? "duas horas" : h === 21 ? "vinte e uma horas" : h === 22 ? "vinte e duas horas"
    : `${extenso(h)} horas`;
  return m ? `${hs} e ${extenso(m)} minuto${m === 1 ? "" : "s"}` : hs;
}
const qtd = (n) => `${n} (${extenso(n)})`;
const listaE = (nomes) => nomes.length <= 1 ? nomes.join("") : nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
const pctAta = (n) => `${Number(n || 0).toFixed(1).replace(".", ",")}%`;

// ---------- monta o texto da ata ----------
async function montarAta(a) {
  const { ok, status, dados: r } = await chamar("results");
  if (status === 401) throw new Error("Sua sessão expirou. Entre de novo no painel.");
  if (!ok || r.hidden) throw new Error((r && r.error) || "Não foi possível carregar os resultados.");
  if (!a.data) throw new Error("Informe a data da assembleia.");

  const igreja = r.settings?.church_name || "Igreja";
  const tit = (s) => esc(s);
  const fases = r.fases || [];
  const votosFase = (n) => fases.find((f) => f.n === n)?.ballots || 0;
  const realizadas = fases.filter((f) => f.n <= r.fase && votosFase(f.n) > 0);
  const naoRealizadas = fases.filter((f) => !realizadas.includes(f));
  const quadro = []; // [cargo, nome]
  const partes = [];

  // abertura
  const presentes = parseInt(a.presentes, 10), arrolados = parseInt(a.arrolados, 10);
  let abertura = `${dataPorExtenso(a.data)}`;
  if (a.hora) abertura += `, às ${horaPorExtenso(a.hora)}`;
  if (a.local) abertura += `, ${esc(a.local)}`;
  if (a.cidade) abertura += `, na cidade de ${esc(a.cidade)}`;
  abertura += `, reuniu-se em ${esc(a.tipo)} a ${esc(igreja)}, convocada para a eleição de sua liderança`;
  abertura += a.presidente ? `, sob a presidência de ${esc(a.presidente)}` : ", sob a presidência de ______________________";
  abertura += a.secretario ? `, servindo como secretário(a) ${esc(a.secretario)}.` : ", servindo como secretário(a) ______________________.";
  if (presentes) {
    abertura += ` Estando presentes ${qtd(presentes)} membros com direito a voto`;
    if (arrolados) abertura += `, de um total de ${qtd(arrolados)} membros arrolados (${pctAta((presentes / arrolados) * 100)})`;
    abertura += ", verificou-se o quórum e foi declarada aberta a sessão.";
  } else {
    abertura += " Verificado o quórum com a presença de ____ membros com direito a voto, foi declarada aberta a sessão.";
  }
  abertura += ` A eleição foi realizada por voto secreto, em sistema eletrônico de votação,`;
  abertura += realizadas.length > 1 ? ` em ${extenso(realizadas.length).replace(/dois$/, "duas")} etapas, com os resultados a seguir.` : " com os resultados a seguir.";
  partes.push(`<p>${abertura}</p>`);

  const tabela = (cab, linhas) => `<table border="1" cellspacing="0" cellpadding="4"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const situacao = (c) => c.status === "eleito" ? `<strong>${esc(c.cargo || "Eleito")}</strong>`
    : c.status === "empate" ? "Empate" : c.status ? "Não eleito" : "—";

  realizadas.forEach((f, idx) => {
    const cats = r.categories.filter((c) => c.fase === f.n);
    const v = votosFase(f.n);
    partes.push(`<h2>${idx + 1}ª etapa: ${tit(f.label)}</h2>`);
    if (f.n === 1) {
      partes.push(`<p>Votaram nesta etapa ${qtd(v)} membros. Cada candidato recebeu voto SIM, NÃO ou EM BRANCO, sendo considerado
        eleito quem obteve mais de ${r.minPercent}% de votos SIM ${r.brancosContam ? "sobre o total de votos, incluídos os votos em branco"
        : "sobre os votos válidos (SIM e NÃO), não sendo os votos em branco computados nesse cálculo"}.</p>`);
      cats.forEach((cat) => {
        partes.push(`<h3>${tit(cat.label)}</h3>`);
        partes.push(tabela(["Candidato", "SIM", "NÃO", "BRANCO", "% SIM", "Resultado"],
          cat.candidates.map((c) => [esc(c.name), c.yes, c.no, c.blank || 0, pctAta(c.percent), situacao(c)])));
        const eleitos = cat.candidates.filter((c) => c.status === "eleito").map((c) => c.name);
        eleitos.forEach((n) => quadro.push([cat.singular, n]));
        partes.push(`<p>${eleitos.length
          ? `${eleitos.length > 1 ? "Foram eleitos" : "Foi eleito"} para ${tit(cat.label)}: ${esc(listaE(eleitos))}.`
          : `Nenhum candidato a ${tit(cat.singular)} alcançou o percentual necessário.`}</p>`);
      });
    } else {
      const cat = cats[0];
      if (!cat) return;
      const escolha = cat.tipo === "escolha";
      if (escolha) {
        partes.push(`<p>Votaram nesta etapa ${qtd(v)} membros, cada um escolhendo um único nome entre os candidatos${cat.blanks
          ? `, havendo ${qtd(cat.blanks)} voto${cat.blanks === 1 ? "" : "s"} em branco` : ""}.</p>`);
        const linhas = cat.candidates.map((c) => [esc(c.name), c.yes, pctAta(c.percent), situacao(c)]);
        if (cat.blanks) linhas.push(["<em>Votos em branco</em>", cat.blanks, "", ""]);
        partes.push(tabela(["Candidato", "Votos", "% dos válidos", "Resultado"], linhas));
      } else {
        partes.push(`<p>Votaram nesta etapa ${qtd(v)} membros, com voto SIM, NÃO ou EM BRANCO para cada candidato,
          ocupando os cargos os mais votados.</p>`);
        partes.push(tabela(["Candidato", "SIM", "NÃO", "BRANCO", "% SIM", "Resultado"],
          cat.candidates.map((c) => [esc(c.name), c.yes, c.no, c.blank || 0, pctAta(c.percent), situacao(c)])));
      }
      const eleitos = cat.candidates.filter((c) => c.status === "eleito");
      eleitos.forEach((c) => quadro.push([c.cargo || cat.singular, c.name]));
      const empate = cat.candidates.filter((c) => c.status === "empate").map((c) => c.name);
      // agrupa por cargo: "para Tesoureiro: Fulano, com 4 (quatro) votos" / "para Exame de Contas: A, com …; B, com …"
      const grupos = [];
      eleitos.forEach((c) => {
        const cargo = c.cargo || cat.singular;
        let g = grupos.find((x) => x.cargo === cargo);
        if (!g) grupos.push((g = { cargo, nomes: [] }));
        g.nomes.push(`${esc(c.name)}, com ${qtd(c.yes)} voto${c.yes === 1 ? "" : "s"}${escolha ? "" : " SIM"}`);
      });
      const juntar = (l) => l.length <= 1 ? l.join("") : l.slice(0, -1).join("; ") + "; e " + l[l.length - 1];
      const texto = grupos.map((g) => `para ${esc(g.cargo)}: ${juntar(g.nomes)}`);
      partes.push(`<p>${texto.length ? `${eleitos.length > 1 ? "Foram eleitos" : "Foi eleito"} ${juntar(texto)}.` : ""}
        ${empate.length ? ` Houve empate entre ${esc(listaE(empate))}, devendo a votação ser refeita.` : ""}</p>`);
    }
  });

  if (!realizadas.length) partes.push("<p><em>Nenhuma etapa com votos registrados até o momento.</em></p>");
  if (naoRealizadas.length && realizadas.length)
    partes.push(`<p class="nota">Etapa(s) não realizada(s) até a geração deste documento: ${esc(listaE(naoRealizadas.map((f) => f.label)))}.</p>`);

  if (quadro.length) {
    partes.push(`<h2>Quadro de eleitos</h2>`);
    partes.push(tabela(["Cargo", "Nome"], quadro.map(([c, n]) => [esc(c), esc(n)])).replace(/ class="num"/g, ""));
  }
  if (a.observacoes) partes.push(`<h2>Observações</h2><p>${esc(a.observacoes).replace(/\n/g, "<br>")}</p>`);

  const fim = a.hora_fim ? `às ${horaPorExtenso(a.hora_fim)}` : "às ______";
  const sec = a.secretario ? esc(a.secretario) : "______________________";
  partes.push(`<p>Nada mais havendo a tratar, o(a) presidente encerrou a sessão ${fim}, e eu, ${sec}, secretário(a),
    lavrei a presente ata, que, lida e aprovada, vai por mim assinada e pelo(a) presidente.</p>`);
  const [ano, mes, dia] = a.data.split("-").map(Number);
  partes.push(`<p class="direita">${a.cidade ? esc(a.cidade) + ", " : ""}${dia} de ${MESES[mes - 1]} de ${ano}.</p>`);
  partes.push(`<table class="assinaturas"><tr>
    <td>______________________________<br>${a.presidente ? esc(a.presidente) : "&nbsp;"}<br>Presidente</td>
    <td>______________________________<br>${a.secretario ? esc(a.secretario) : "&nbsp;"}<br>Secretário(a)</td></tr></table>`);
  partes.push(`<p class="rodape">Rascunho gerado pelo sistema de votação em ${dataHora(new Date().toISOString())}. Confira os dados antes de assinar.</p>`);

  return {
    titulo: `Ata da ${a.tipo} – ${igreja}`,
    arquivo: `Ata-Eleicao-${a.data}`,
    corpo: `<h1>ATA DA ${esc(a.tipo).toUpperCase()} DA ${esc(igreja).toUpperCase()}<br><span>Eleição de Liderança</span></h1>${partes.join("\n")}`,
  };
}

const ATA_CSS = `
  @page { size: A4; margin: 2.2cm 2.2cm 2cm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; color: #000; }
  h1 { font-size: 13pt; text-align: center; margin: 0 0 16pt; line-height: 1.3; }
  h1 span { font-weight: normal; font-size: 12pt; }
  h2 { font-size: 12pt; margin: 16pt 0 4pt; text-transform: uppercase; }
  h3 { font-size: 12pt; margin: 10pt 0 4pt; }
  p { text-align: justify; margin: 0 0 8pt; }
  table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; font-size: 10.5pt; }
  th, td { border: 1px solid #000; padding: 3pt 6pt; text-align: left; vertical-align: top; }
  th { background: #e8e8e8; }
  td.num { text-align: center; }
  .direita { text-align: right; margin-top: 16pt; }
  .nota { font-style: italic; }
  table.assinaturas, table.assinaturas td { border: 0; text-align: center; padding-top: 36pt; font-size: 12pt; }
  .rodape { font-size: 8.5pt; color: #555; margin-top: 24pt; text-align: center; }`;

// Word abre arquivos .doc em HTML normalmente (e dá para editar tudo)
function baixarAtaWord(ata) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(ata.titulo)}</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
    <style>${ATA_CSS} @page Section1 { size: 21cm 29.7cm; margin: 2.2cm; } div.Section1 { page: Section1; }</style></head>
    <body><div class="Section1">${ata.corpo}</div></body></html>`;
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ata.arquivo + ".doc";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// abre a ata numa janela e chama a impressão (escolha "Salvar como PDF")
function abrirAtaParaImprimir(janela, ata) {
  janela.document.open();
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(ata.arquivo)}</title>
    <style>${ATA_CSS}
      @media screen { body { max-width: 21cm; margin: 0 auto; padding: 24px 20px 80px; background: #fff; }
        .barra { position: sticky; top: 0; background: #22341a; color: #fff; padding: 10px 14px; margin: -24px -20px 20px;
          font-family: sans-serif; font-size: 14px; display: flex; gap: 10px; align-items: center; justify-content: space-between; }
        .barra button { font: inherit; font-weight: 700; border: 0; border-radius: 8px; padding: 8px 14px; background: #e8792a; color: #fff; cursor: pointer; } }
      @media print { .barra { display: none; } }
    </style></head><body>
    <div class="barra"><span>Para PDF: Imprimir → destino "Salvar como PDF"</span><button onclick="print()">Imprimir / Salvar PDF</button></div>
    ${ata.corpo}
    <script>setTimeout(function () { print(); }, 500);<\/script></body></html>`);
  janela.document.close();
}
