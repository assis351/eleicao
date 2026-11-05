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
    const nova = JSON.stringify(dados.categories) + dados.totalBallots + dados.totalVoters + dados.minPercent;
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
    container.innerHTML = `
      <div class="resumo">
        <div class="card numero destaque"><div class="r">Votos computados</div><div class="v">${r.totalBallots}</div></div>
        <div class="card numero"><div class="r">Eleitores cadastrados</div><div class="v">${r.totalVoters}</div></div>
        <div class="card numero"><div class="r">Participação</div><div class="v">${porcentagem(r.participation)}</div></div>
      </div>

      <div class="barra-acoes">
        <span class="ao-vivo"><i></i> Atualizado em tempo real · <span class="hora-atualizacao">${dataHora(r.updatedAt)}</span></span>
        <span style="display:flex;gap:8px">
          <button class="btn btn-contorno btn-pequeno" data-exportar="pdf">Exportar PDF</button>
          <button class="btn btn-contorno btn-pequeno" data-exportar="xlsx">Exportar Excel</button>
          ${opcoes.planilhaUrl ? `<a class="btn btn-verde btn-pequeno" href="${esc(opcoes.planilhaUrl)}" target="_blank" rel="noopener">Abrir Planilha Google</a>` : ""}
        </span>
      </div>

      <p class="pequeno texto-suave">Critério: é <strong>eleito</strong> quem tiver <strong>mais de ${r.minPercent}%</strong>
        de votos SIM (sobre o total de SIM + NÃO daquele nome).</p>

      ${r.categories.map(blocoCategoria).join("")}`;

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

  function blocoCategoria(cat) {
    const eleitos = cat.candidates.filter((c) => c.status === "eleito").length;
    return `<section class="card categoria-res">
      <header><h2>${cat.label}</h2><span>${eleitos} eleito(s) de ${cat.candidates.length}</span></header>
      ${cat.candidates.length === 0 ? `<p style="padding:20px" class="texto-suave">Nenhum candidato cadastrado.</p>` : `
      <div class="categoria-corpo">
        <ol class="ranking">${cat.candidates.map(itemRanking).join("")}</ol>
        <div class="grafico" style="height:${Math.max(240, cat.candidates.length * 56 + 50)}px">
          <canvas id="grafico-${cat.key}" aria-label="Gráfico de ${cat.label}"></canvas>
        </div>
      </div>`}
    </section>`;
  }

  function itemRanking(c) {
    return `<li class="${c.status === "eleito" ? "eleito" : ""}">
      <div class="linha1">
        <span class="pos">${c.position}º</span>
        ${avatar(c.photo_url, c.name, 44)}
        <div class="info">
          <div class="nome-l">${esc(c.name)}
            ${c.position === 1 && c.yes > 0 ? '<span class="etiqueta primeiro">1º Lugar</span>' : ""}
            ${c.status === "eleito" ? '<span class="etiqueta eleito">Eleito</span>' : ""}
            ${c.status === "nao_eleito" ? '<span class="etiqueta nao-eleito">Não eleito</span>' : ""}
            ${c.status === null ? '<span class="etiqueta neutra">Sem votos</span>' : ""}
          </div>
          <div class="barra-sn" role="img" aria-label="${c.yes} SIM e ${c.no} NÃO">
            <div class="s" style="width:${c.percent}%"></div><div class="n" style="width:${c.noPercent}%"></div>
          </div>
          <div class="numeros-sn">
            <span class="s"><strong>SIM ${c.yes}</strong> (${porcentagem(c.percent)})</span>
            <span class="n"><strong>NÃO ${c.no}</strong> (${porcentagem(c.noPercent)})</span>
          </div>
        </div>
      </div>
    </li>`;
  }

  async function desenharGraficos(r) {
    try { await carregarScript(CDN.chart); } catch { return; } // sem internet: fica só o ranking
    for (const cat of r.categories) {
      const canvas = document.getElementById(`grafico-${cat.key}`);
      if (!canvas) continue;
      if (graficos[cat.key]) graficos[cat.key].destroy();
      graficos[cat.key] = new Chart(canvas, {
        type: "bar",
        data: {
          labels: cat.candidates.map((c) => c.name),
          datasets: [
            { label: "SIM", data: cat.candidates.map((c) => c.yes), backgroundColor: "#556b18", borderRadius: 4 },
            { label: "NÃO", data: cat.candidates.map((c) => c.no), backgroundColor: "#dc2626", borderRadius: 4 },
          ],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
            y: { stacked: true, ticks: { color: "#22341a", font: { size: 13, weight: "600" } } },
          },
          plugins: { legend: { position: "bottom" } },
        },
      });
    }
  }

  buscar();
  setInterval(buscar, INTERVALO_MS);
}

// ---------- Exportação ----------
const selo = (s) => (s === "eleito" ? "Eleito" : s === "nao_eleito" ? "Não eleito" : "Sem votos");
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
  doc.text(`Gerado em ${dataHora(r.updatedAt)}  |  Votos computados: ${r.totalBallots} de ${r.totalVoters} eleitores (${porcentagem(r.participation)})`, 14, 42);
  doc.text(`Critério: eleito com mais de ${r.minPercent}% de votos SIM.`, 14, 48);

  let y = 58;
  for (const cat of r.categories) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(13); doc.setTextColor(...verde); doc.text(cat.label, 14, y);
    doc.autoTable({
      startY: y + 3,
      head: [["Pos.", "Candidato", "SIM", "NÃO", "% SIM", "Situação"]],
      body: cat.candidates.map((c) => [`${c.position}º`, c.name, c.yes, c.no, porcentagem(c.percent), selo(c.status)]),
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
    ["Eleitores cadastrados", r.totalVoters],
    ["Votos computados", r.totalBallots],
    ["Participação", porcentagem(r.participation)],
    ["Critério", `Eleito com mais de ${r.minPercent}% de SIM`],
  ]), "Resumo");
  for (const cat of r.categories) {
    const linhas = cat.candidates.map((c) => ({
      "Posição": c.position, "Candidato": c.name, "SIM": c.yes, "NÃO": c.no,
      "% SIM": Number(c.percent.toFixed(2)), "Situação": selo(c.status),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Candidato: "Sem candidatos" }]);
    ws["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, cat.label);
  }
  XLSX.writeFile(wb, `resultado-eleicao-${hoje()}.xlsx`);
}
