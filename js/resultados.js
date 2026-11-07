// ================================================================
// PAINEL DE RESULTADOS (usado no admin e na página /resultados)
// Atualiza sozinho a cada 10 segundos.
// Gráfico: Chart.js | PDF: jsPDF | Excel: SheetJS (carregados da internet)
// ================================================================
const INTERVALO_MS = 10000; // a cada 10 segundos
const CDN = {
  chart: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  autotable: "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
};

// carrega um script externo só quando for preciso
const carregados = {};
function carregarScript(url) {
  if (!carregados[url]) {
    carregados[url] = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = url; s.onload = ok; s.onerror = () => falha(new Error("Falha ao carregar " + url));
      document.head.appendChild(s);
    });
  }
  return carregados[url];
}

// opcoes.planilhaUrl: no admin, mostra o botão que abre a Planilha Google
function iniciarResultados(container, opcoes = {}) {
  let ultimo = null;
  let assinatura = "";
  const graficos = {};
  let brancosContam = false;

  async function buscar() {
    const { ok, dados } = await chamar("results");
    if (!ok) {
      if (!ultimo) container.innerHTML = `<div class="card pad alerta erro">${esc(dados.error || "Erro ao carregar resultados.")}</div>`;
      return;
    }
    if (dados.hidden) {
      container.innerHTML = `<div class="card pad" style="text-align:center;padding:48px 24px">
        <h2 style="font-size:28px">Resultados ainda não divulgados</h2>
        <p class="texto-suave">Os resultados serão publicados ao final da votação.</p></div>`;
      return;
    }
    // só redesenha se algo mudou (evita a tela "piscar")
    const nova = JSON.stringify(dados.categories) + dados.totalBallots + dados.totalVoters + dados.minPercent + dados.requireId
      + dados.fase + dados.faseAberta;
    ultimo = dados;
    if (nova === assinatura) {
      const hora = $(".hora-atualizacao", container);
      if (hora) hora.textContent = dataHora(dados.updatedAt);
      return;
    }
    assinatura = nova;
    desenhar(dados);
  }

  function desenhar(r) {
    brancosContam = r.brancosContam;
    container.innerHTML = `
      <div class="resumo">
        <div class="card numero"><div class="r">Etapa atual</div>
          <div class="v" style="font-size:22px;line-height:1.2;margin-top:6px">${r.fase}. ${esc(r.faseLabel)}</div>
          <span class="etiqueta ${r.faseAberta ? "eleito" : "neutra"}" style="margin-top:6px">${r.faseAberta ? "Votação aberta" : "Votação encerrada"}</span></div>
        <div class="card numero destaque"><div class="r">Votos nesta etapa</div><div class="v">${r.totalBallots}</div></div>
        ${r.requireId ? `
        <div class="card numero"><div class="r">Eleitores cadastrados</div><div class="v">${r.totalVoters}</div></div>
        <div class="card numero"><div class="r">Participação</div><div class="v">${porcentagem(r.participation)}</div></div>` : ""}
      </div>

      <div class="barra-acoes">
        <span class="ao-vivo"><i></i> Atualizado em tempo real · <span class="hora-atualizacao">${dataHora(r.updatedAt)}</span></span>
        <span style="display:flex;gap:8px">
          <button class="btn btn-contorno btn-pequeno" data-exportar="pdf">Exportar PDF</button>
          <button class="btn btn-contorno btn-pequeno" data-exportar="xlsx">Exportar Excel</button>
          ${opcoes.planilhaUrl ? `<a class="btn btn-verde btn-pequeno" href="${esc(opcoes.planilhaUrl)}" target="_blank" rel="noopener">Abrir Planilha Google</a>` : ""}
        </span>
      </div>

      <p class="pequeno texto-suave">Os percentuais de SIM, NÃO e BRANCO são sobre todos os votos daquele nome.
        Etapa 1: é <strong>eleito</strong> quem tiver <strong>mais de ${r.minPercent}%</strong> de SIM
        ${r.brancosContam ? "contando os votos em branco" : "sobre os votos válidos (SIM + NÃO; o branco não entra nessa conta)"}.
        ${r.fase > 1 ? "Da etapa 2 em diante, os cargos vão para os mais votados (1º lugar, 2º lugar…)." : ""}</p>

      ${r.fase > 1 ? quadroCargos(r) : ""}
      ${r.categories.slice().reverse().map(blocoCategoria).join("")}`;

    $$("[data-exportar]", container).forEach((b) =>
      b.addEventListener("click", async () => {
        const texto = b.textContent;
        b.disabled = true; b.textContent = "Gerando…";
        try { b.dataset.exportar === "pdf" ? await exportarPDF(ultimo) : await exportarExcel(ultimo); }
        catch (e) { alert("Não foi possível gerar o arquivo. Verifique a internet e tente de novo."); }
        b.disabled = false; b.textContent = texto;
      })
    );

    desenharGraficos(r);
  }

  // resumo "quem ficou com cada cargo" (etapas 2 a 4)
  function quadroCargos(r) {
    const linhas = [];
    r.categories.filter((c) => c.fase > 1).forEach((cat) => {
      const ganhos = cat.candidates.filter((c) => c.status === "eleito");
      const empate = cat.candidates.some((c) => c.status === "empate");
      if (ganhos.length) ganhos.filter((c) => !cat.demais || c.cargo !== cat.demais).forEach((c) => linhas.push([c.cargo, c.name]));
      else linhas.push([cat.label, empate ? "Empate — refazer a votação" : (cat.fase === r.fase && r.faseAberta ? "Votação em andamento" : "Aguardando votos")]);
      if (empate && ganhos.length) linhas.push([cat.label, "Empate em uma das vagas"]);
    });
    return `<section class="card pad mt">
      <div class="titulo-card" style="margin-bottom:8px">Cargos definidos até agora</div>
      <table class="tabela"><tbody>${linhas.map(([cargo, nome]) =>
        `<tr><td style="width:45%"><strong>${esc(cargo)}</strong></td><td>${esc(nome)}</td></tr>`).join("")}</tbody></table>
    </section>`;
  }

  function blocoCategoria(cat) {
    const eleitos = cat.candidates.filter((c) => c.status === "eleito").length;
    const totalBrancos = cat.tipo === "escolha" ? cat.blanks || 0 : cat.candidates.reduce((s, c) => s + (c.blank || 0), 0);
    const info = (cat.fase > 1 ? `${cat.ballots} voto(s)` : `${eleitos} eleito(s) de ${cat.candidates.length}`)
      + ` · ${totalBrancos} em branco`;
    return `<section class="card categoria-res">
      <header><h2><small style="font-size:13px;opacity:.75;display:block">Etapa ${cat.fase}</small>${cat.label}</h2><span>${info}</span></header>
      ${cat.candidates.length === 0 ? `<p style="padding:20px" class="texto-suave">Nenhum candidato cadastrado.</p>` : `
      <div class="categoria-corpo">
        <div>
          <ol class="ranking">${cat.candidates.map((c) => itemRanking(c, cat)).join("")}</ol>
          ${cat.tipo === "escolha" ? linhaBrancoEscolha(cat) : ""}
        </div>
        <div class="grafico" style="height:${Math.max(240, cat.candidates.length * 56 + 50)}px">
          <canvas id="grafico-${cat.key}" aria-label="Gráfico de ${cat.label}"></canvas>
        </div>
      </div>`}
    </section>`;
  }

  // no "escolher 1 nome" (tesoureiro) o branco é um total da categoria
  function linhaBrancoEscolha(cat) {
    const tv = cat.candidates.length ? cat.candidates[0].totalVotos : 0;
    const pct = tv ? (cat.blanks / tv) * 100 : 0;
    return `<div class="ranking" style="margin-top:10px"><div style="border-radius:12px;padding:10px;background:var(--caixa-cinza,#f3f4f6)">
      <div class="nome-l" style="font-weight:700">Votos em branco <span class="etiqueta branco">BRANCO</span></div>
      <div class="barra-sn"><div class="b" style="width:${pct}%"></div></div>
      <div class="numeros-sn"><span class="b"><strong>${cat.blanks} voto${cat.blanks === 1 ? "" : "s"}</strong> (${porcentagem(pct)})</span></div>
    </div></div>`;
  }

  function itemRanking(c, cat) {
    const escolha = cat.tipo === "escolha";
    const selos = cat.fase === 1
      ? `${c.status === "eleito" ? '<span class="etiqueta eleito">Eleito</span>' : ""}
         ${c.status === "nao_eleito" ? '<span class="etiqueta nao-eleito">Não eleito</span>' : ""}`
      : `${c.status === "eleito" ? `<span class="etiqueta eleito">${esc(c.cargo)}</span>` : ""}
         ${c.status === "empate" ? '<span class="etiqueta nao-eleito">Empate</span>' : ""}`;
    return `<li class="${c.status === "eleito" ? "eleito" : ""}">
      <div class="linha1">
        <span class="pos">${c.position}º</span>
        ${avatar(c.photo_url, c.name, 44)}
        <div class="info">
          <div class="nome-l">${esc(c.name)}
            ${c.position === 1 && c.yes > 0 ? '<span class="etiqueta primeiro">1º Lugar</span>' : ""}
            ${selos}
            ${c.status === null ? '<span class="etiqueta neutra">Sem votos</span>' : ""}
          </div>
          <div class="barra-sn" role="img" aria-label="${escolha ? `${c.yes} votos` : `${c.yes} SIM, ${c.no} NÃO e ${c.blank} BRANCO`}">
            <div class="s" style="width:${c.pctSim}%"></div><div class="n" style="width:${c.pctNao}%"></div><div class="b" style="width:${escolha ? 0 : c.pctBranco}%"></div>
          </div>
          <div class="numeros-sn">${escolha
            ? `<span class="s"><strong>${c.yes} voto${c.yes === 1 ? "" : "s"}</strong> (${porcentagem(c.pctSim)})</span>`
            : `<span class="s"><strong>SIM ${c.yes}</strong> (${porcentagem(c.pctSim)})</span>
               <span class="n"><strong>NÃO ${c.no}</strong> (${porcentagem(c.pctNao)})</span>
               <span class="b"><strong>BRANCO ${c.blank}</strong> (${porcentagem(c.pctBranco)})</span>`}
          </div>
          ${(escolha ? cat.blanks : c.blank) && !brancosContam && c.total
            ? `<div class="pequeno texto-suave" style="margin-top:2px">${escolha ? "Sobre os votos válidos" : "SIM sobre os votos válidos"}: ${porcentagem(c.percent)}</div>` : ""}
        </div>
      </div>
    </li>`;
  }

  async function desenharGraficos(r) {
    try { await carregarScript(CDN.chart); } catch { return; } // sem internet: fica só o ranking
    const escuro = document.documentElement.dataset.tema === "escuro";
    const corTexto = escuro ? "#e9eedf" : "#22341a", corGrade = escuro ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)";
    for (const cat of r.categories) {
      const canvas = document.getElementById(`grafico-${cat.key}`);
      if (!canvas) continue;
      if (graficos[cat.key]) graficos[cat.key].destroy();
      graficos[cat.key] = new Chart(canvas, {
        type: "bar",
        data: {
          labels: cat.candidates.map((c) => c.name),
          datasets: cat.tipo === "escolha"
            ? [{ label: "Votos", data: cat.candidates.map((c) => c.yes), backgroundColor: "#556b18", borderRadius: 4 }]
            : [
                { label: "SIM", data: cat.candidates.map((c) => c.yes), backgroundColor: "#556b18", borderRadius: 4 },
                { label: "NÃO", data: cat.candidates.map((c) => c.no), backgroundColor: "#dc2626", borderRadius: 4 },
                { label: "BRANCO", data: cat.candidates.map((c) => c.blank || 0), backgroundColor: "#9ca3af", borderRadius: 4 },
              ],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: corTexto }, grid: { color: corGrade } },
            y: { stacked: true, ticks: { color: corTexto, font: { size: 13, weight: "600" } }, grid: { color: corGrade } },
          },
          plugins: { legend: { position: "bottom", labels: { color: corTexto } } },
        },
      });
    }
  }

  buscar();
  setInterval(buscar, INTERVALO_MS);
  document.addEventListener("temamudou", () => { if (ultimo) desenharGraficos(ultimo); });
}

// ---------- Exportação ----------
const selo = (s) => (s === "eleito" ? "Eleito" : s === "nao_eleito" ? "Não eleito" : s === "empate" ? "Empate" : "Sem votos");
const situacaoTexto = (c, cat) => (cat.fase > 1 && c.status === "eleito" ? c.cargo : cat.fase > 1 && c.status === "nao_eleito" ? "—" : selo(c.status));
const hoje = () => new Date().toISOString().slice(0, 10);

async function exportarPDF(r) {
  await carregarScript(CDN.jspdf);
  await carregarScript(CDN.autotable);
  const doc = new window.jspdf.jsPDF();
  const verde = [34, 52, 26], laranja = [232, 121, 42];

  doc.setFillColor(...verde); doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.text(r.settings.church_name || "Igreja", 14, 14);
  doc.setFontSize(11); doc.text(`${r.settings.title || "Eleição"} - Resultado`, 14, 23);
  doc.setFillColor(...laranja); doc.rect(0, 32, 210, 1.5, "F");

  doc.setTextColor(...verde); doc.setFontSize(10);
  doc.text(`Gerado em ${dataHora(r.updatedAt)}  |  Votos por etapa: ${(r.fases || []).filter((f) => f.n <= r.fase).map((f) => `${f.label}: ${f.ballots}`).join(" | ")}`, 14, 42);
  doc.text(`Critério: eleito com mais de ${r.minPercent}% de SIM ${r.brancosContam ? "(brancos contam)" : "(sobre SIM + NÃO; brancos não contam)"}. % da tabela = sobre todos os votos.`, 14, 48);

  let y = 58;
  for (const cat of r.categories) {
    if (y > 250) { doc.addPage(); y = 20; }
    const escolha = cat.tipo === "escolha";
    doc.setFontSize(13); doc.setTextColor(...verde); doc.text(`Etapa ${cat.fase} - ${cat.label}`, 14, y);
    doc.autoTable({
      startY: y + 3,
      head: [escolha ? ["Pos.", "Candidato", "Votos", "% votos", "Cargo"]
        : ["Pos.", "Candidato", "SIM", "%", "NÃO", "%", "BRANCO", "%", cat.fase > 1 ? "Cargo" : "Situação"]],
      body: [...cat.candidates.map((c) => escolha
        ? [`${c.position}º`, c.name, c.yes, porcentagem(c.pctSim), situacaoTexto(c, cat)]
        : [`${c.position}º`, c.name, c.yes, porcentagem(c.pctSim), c.no, porcentagem(c.pctNao), c.blank, porcentagem(c.pctBranco), situacaoTexto(c, cat)]),
        ...(escolha ? [["", "Votos em branco", cat.blanks, porcentagem(cat.candidates.length && cat.candidates[0].totalVotos ? cat.blanks / cat.candidates[0].totalVotos * 100 : 0), ""]] : [])],
      headStyles: { fillColor: verde, textColor: 255 },
      alternateRowStyles: { fillColor: [246, 247, 240] },
      styles: { fontSize: 10 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  doc.save(`resultado-eleicao-${hoje()}.pdf`);
}

async function exportarExcel(r) {
  await carregarScript(CDN.xlsx);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Igreja", r.settings.church_name],
    ["Eleição", r.settings.title],
    ["Gerado em", dataHora(r.updatedAt)],
    ["Etapa atual", `${r.fase} - ${r.faseLabel}`],
    ...(r.fases || []).filter((f) => f.n <= r.fase).map((f) => [`Votos - ${f.label}`, f.ballots]),
    ["Critério", `Eleito com mais de ${r.minPercent}% de SIM`],
  ]), "Resumo");
  for (const cat of r.categories) {
    const n2 = (x) => Number((x || 0).toFixed(2));
    const linhas = cat.candidates.map((c) => (cat.tipo === "escolha"
      ? { "Posição": c.position, "Candidato": c.name, "Votos": c.yes, "% votos": n2(c.pctSim), "Cargo": situacaoTexto(c, cat) }
      : { "Posição": c.position, "Candidato": c.name, "SIM": c.yes, "% SIM": n2(c.pctSim), "NÃO": c.no, "% NÃO": n2(c.pctNao),
          "BRANCO": c.blank, "% BRANCO": n2(c.pctBranco), "% SIM p/ decidir": n2(c.percent),
          [cat.fase > 1 ? "Cargo" : "Situação"]: situacaoTexto(c, cat) }));
    if (cat.tipo === "escolha") linhas.push({ "Posição": "", "Candidato": "Votos em branco", "Votos": cat.blanks || 0 });
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Candidato: "Sem candidatos" }]);
    ws["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 7 }, { wch: 8 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, cat.label);
  }
  XLSX.writeFile(wb, `resultado-eleicao-${hoje()}.xlsx`);
}
