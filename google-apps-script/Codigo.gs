/* ================================================================
   SISTEMA DE VOTAÇÃO - ELEIÇÃO DE LIDERANÇA
   Igreja Cristã Presbiteriana Missionária

   Este script fica DENTRO da Planilha Google e faz o papel de
   servidor: confere o eleitor, grava o voto e calcula o resultado.
   As telas (HTML) ficam no GitHub Pages e conversam com ele.

   Abas da planilha (criadas sozinhas pela função "configurar"):
     Resultado      -> apuração pronta (atualiza a cada voto)
     Candidatos     -> nome, categoria e total de votos SIM / NÃO
     Eleitores      -> quem pode votar, se já votou e quando
     Configurações  -> nome da igreja, % mínimo, período etc.

   VOTO SECRETO: a planilha guarda só o TOTAL de SIM e NÃO de cada
   candidato. Não existe nenhuma linha ligando um eleitor ao voto.
   ================================================================ */

// ===== SENHA DO PAINEL ADMINISTRATIVO (troque se quiser) =====
var ADMIN_USUARIO = "admin";
var ADMIN_SENHA = "3524";

// Quanto tempo o admin fica logado (horas)
var SESSAO_HORAS = 12;

var CATEGORIAS = [
  { key: "pastor", label: "Pastores", singular: "Pastor" },
  { key: "presbitero", label: "Presbíteros", singular: "Presbítero" },
  { key: "diacono", label: "Diáconos", singular: "Diácono" }
];

var CANDIDATOS_INICIAIS = [
  ["pastor", "Pr. Fábio Formagini", "Candidato à reeleição"],
  ["pastor", "Pb. Edilson Souza", ""],
  ["pastor", "Pb. Marcelo Cândida", ""],
  ["presbitero", "Pb. Rubem Oliveira", "Candidato à reeleição"],
  ["presbitero", "Pb. Daniel Bertuchi", "Candidato à reeleição"],
  ["presbitero", "Pb. Rosivaldo Santos", "Candidato à reeleição"],
  ["diacono", "Diac. Sergio Lopes", "Candidato à reeleição"],
  ["diacono", "Diac. Daniel Santos", "Candidato à reeleição"],
  ["diacono", "Diac. Humberto dos Santos", "Candidato à reeleição"],
  ["diacono", "Diac. Edvaldo Barbosa", "Candidato à reeleição"],
  ["diacono", "Diac. Isaias Formagini", "Candidato à reeleição"]
];

// Linhas da aba Configurações: [chave interna, rótulo na planilha, valor padrão]
var CONFIG = [
  ["church_name", "Nome da igreja", "Igreja Cristã Presbiteriana Missionária"],
  ["title", "Título da eleição", "Eleição de Liderança 2026"],
  ["logo_url", "Logo (endereço da imagem)", ""],
  ["min_percent", "% mínimo de SIM para ser eleito (precisa ser MAIOR)", 50],
  ["start_at", "Início da votação (horário de Brasília)", ""],
  ["end_at", "Fim da votação (horário de Brasília)", ""],
  ["results_public", "Mostrar resultado ao público (Sim/Não)", "Não"]
];

var ABA_RES = "Resultado", ABA_CAND = "Candidatos", ABA_ELE = "Eleitores", ABA_CFG = "Configurações";
var VERDE = "#22341a", VERDE_CLARO = "#eef2e2", LARANJA = "#e8792a", VERMELHO_CLARO = "#fee2e2";

/* ================================================================
   1) RODE ESTA FUNÇÃO UMA VEZ (botão "Executar" no editor)
   ================================================================ */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone("America/Sao_Paulo");
  garantirAbas(ss);
  montarResultado(lerTudo(ss));
  segredo(); // cria a chave do login do admin
  Logger.log("Pronto! Agora clique em Implantar > Nova implantação > App da Web.");
}

function garantirAbas(ss) {
  if (!ss.getSheetByName(ABA_CAND)) {
    var c = ss.insertSheet(ABA_CAND);
    cabecalho(c, ["ID", "Categoria", "Nome", "Descrição", "Foto", "Ordem", "Votos SIM", "Votos NÃO"], [50, 100, 230, 230, 260, 60, 90, 90]);
    var ordem = {};
    var linhas = CANDIDATOS_INICIAIS.map(function (x, i) {
      ordem[x[0]] = (ordem[x[0]] || 0) + 1;
      return [i + 1, singular(x[0]), x[1], x[2], "", ordem[x[0]], 0, 0];
    });
    c.getRange(2, 1, linhas.length, 8).setValues(linhas);
  }
  if (!ss.getSheetByName(ABA_ELE)) {
    var e = ss.insertSheet(ABA_ELE);
    cabecalho(e, ["ID", "Nome", "CPF / Código", "Já votou", "Votou em"], [50, 260, 130, 80, 140]);
    e.getRange("C:C").setNumberFormat("@");          // CPF como texto (não perde o zero)
    e.getRange("E:E").setNumberFormat("dd/MM/yyyy HH:mm");
  }
  if (!ss.getSheetByName(ABA_CFG)) {
    var g = ss.insertSheet(ABA_CFG);
    cabecalho(g, ["Configuração", "Valor"], [380, 320]);
    g.getRange(2, 1, CONFIG.length, 2).setValues(CONFIG.map(function (x) { return [x[1], x[2]]; }));
    g.getRange(6, 2, 2, 1).setNumberFormat("dd/MM/yyyy HH:mm");
  }
  if (!ss.getSheetByName(ABA_RES)) {
    var r = ss.insertSheet(ABA_RES, 0);
    [160, 240, 70, 70, 70, 80, 110].forEach(function (w, i) { r.setColumnWidth(i + 1, w); });
  }
  // apaga a aba vazia "Página1"/"Sheet1" criada junto com a planilha
  ["Página1", "Sheet1", "Planilha1"].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
}

function cabecalho(aba, titulos, larguras) {
  aba.getRange(1, 1, 1, titulos.length).setValues([titulos])
    .setBackground(VERDE).setFontColor("#ffffff").setFontWeight("bold");
  aba.setFrozenRows(1);
  larguras.forEach(function (w, i) { aba.setColumnWidth(i + 1, w); });
}

/* ================================================================
   2) ENTRADA DO SITE (o GitHub Pages chama estas funções)
   ================================================================ */
function doGet(e) {
  return responder(tratar((e && e.parameter) || {}));
}

function doPost(e) {
  var dados = {};
  try { dados = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { dados = {}; }
  return responder(tratar(dados));
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function erro(msg, status, extra) {
  var r = { error: msg, status: status || 400 };
  if (extra) for (var k in extra) r[k] = extra[k];
  return r;
}

var ACOES_PUBLICAS = {
  info: acaoInfo, check: acaoConferir, vote: acaoVotar, results: acaoResultados, login: acaoLogin, me: acaoEu
};
var ACOES_ADMIN = {
  candidates: acaoCandidatos, candidate_save: acaoSalvarCandidato, candidate_delete: acaoExcluirCandidato,
  voters: acaoEleitores, voters_add: acaoAdicionarEleitores, voter_delete: acaoExcluirEleitor,
  settings: acaoLerConfig, settings_save: acaoSalvarConfig, reset: acaoZerar, upload: acaoUpload
};

function tratar(d) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss.getSheetByName(ABA_CAND)) garantirAbas(ss);
    if (ACOES_PUBLICAS[d.action]) return ACOES_PUBLICAS[d.action](d, ss);
    if (ACOES_ADMIN[d.action]) {
      if (!tokenValido(d.token)) return erro("Não autorizado", 401);
      return ACOES_ADMIN[d.action](d, ss);
    }
    return erro("Ação desconhecida", 404);
  } catch (err) {
    console.error(err);
    return erro("Erro no servidor. Tente novamente.", 500);
  }
}

/* ================================================================
   3) LEITURA E GRAVAÇÃO NA PLANILHA
   ================================================================ */
function singular(chave) {
  for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].key === chave) return CATEGORIAS[i].singular;
  return "";
}
function chaveCategoria(texto) {
  var t = semAcento(texto);
  for (var i = 0; i < CATEGORIAS.length; i++) if (semAcento(CATEGORIAS[i].singular) === t || CATEGORIAS[i].key === t) return CATEGORIAS[i].key;
  return null;
}
function semAcento(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}
function numero(v, padrao) { var n = parseInt(v, 10); return isNaN(n) ? padrao : n; }
function ehSim(v) { return ["sim", "s", "true", "1", "x", "yes"].indexOf(semAcento(v)) >= 0; }
function paraISO(v) {
  if (!v) return null;
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function dadosDaAba(aba, colunas) {
  var n = aba.getLastRow() - 1;
  return n > 0 ? aba.getRange(2, 1, n, colunas).getValues() : [];
}

function lerTudo(ss) {
  var cfg = {};
  CONFIG.forEach(function (x) { cfg[x[0]] = x[2]; });
  var porRotulo = {};
  CONFIG.forEach(function (x) { porRotulo[x[1]] = x[0]; });
  dadosDaAba(ss.getSheetByName(ABA_CFG), 2).forEach(function (l) {
    var chave = porRotulo[String(l[0]).trim()];
    if (chave) cfg[chave] = l[1];
  });
  var settings = {
    church_name: String(cfg.church_name || CONFIG[0][2]),
    title: String(cfg.title || CONFIG[1][2]),
    logo_url: cfg.logo_url ? String(cfg.logo_url) : null,
    min_percent: Math.max(0, Math.min(99, numero(cfg.min_percent, 50))),
    start_at: paraISO(cfg.start_at),
    end_at: paraISO(cfg.end_at),
    results_public: ehSim(cfg.results_public)
  };

  var candidatos = [];
  dadosDaAba(ss.getSheetByName(ABA_CAND), 8).forEach(function (l, i) {
    var cat = chaveCategoria(l[1]);
    if (!numero(l[0], 0) || !cat || !String(l[2]).trim()) return;
    candidatos.push({
      id: numero(l[0], 0), category: cat, name: String(l[2]).trim(),
      description: String(l[3] || "").trim() || null, photo_url: String(l[4] || "").trim() || null,
      sort_order: numero(l[5], 0), yes: numero(l[6], 0), no: numero(l[7], 0), linha: i + 2
    });
  });

  var eleitores = [];
  dadosDaAba(ss.getSheetByName(ABA_ELE), 5).forEach(function (l, i) {
    if (!numero(l[0], 0) || !String(l[1]).trim() || l[2] === "") return;
    var doc = typeof l[2] === "number" ? ("00000000000" + l[2]).slice(-11) : String(l[2]).trim();
    eleitores.push({
      id: numero(l[0], 0), name: String(l[1]).trim(), doc: doc,
      has_voted: ehSim(l[3]), voted_at: paraISO(l[4]), linha: i + 2
    });
  });

  return { ss: ss, settings: settings, candidates: candidatos, voters: eleitores };
}

function ordenarCandidatos(lista) {
  var ordem = { pastor: 0, presbitero: 1, diacono: 2 };
  return lista.slice().sort(function (a, b) {
    return ordem[a.category] - ordem[b.category] || a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  });
}

// Regrava a aba Candidatos inteira (usado pelo painel admin)
function gravarCandidatos(ss, lista) {
  var aba = ss.getSheetByName(ABA_CAND);
  if (aba.getLastRow() > 1) aba.getRange(2, 1, aba.getLastRow() - 1, 8).clearContent();
  var linhas = ordenarCandidatos(lista).map(function (c) {
    return [c.id, singular(c.category), c.name, c.description || "", c.photo_url || "", c.sort_order, c.yes, c.no];
  });
  if (linhas.length) aba.getRange(2, 1, linhas.length, 8).setValues(linhas);
}

// Regrava a aba Eleitores inteira (usado pelo painel admin)
function gravarEleitores(ss, lista) {
  var aba = ss.getSheetByName(ABA_ELE);
  if (aba.getLastRow() > 1) aba.getRange(2, 1, aba.getLastRow() - 1, 5).clearContent();
  var ordenada = lista.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var linhas = ordenada.map(function (v) {
    return [v.id, v.name, String(v.doc), v.has_voted ? "Sim" : "Não", v.voted_at ? new Date(v.voted_at) : ""];
  });
  if (linhas.length) {
    aba.getRange(2, 3, linhas.length, 1).setNumberFormat("@");
    aba.getRange(2, 1, linhas.length, 5).setValues(linhas);
    aba.getRange(2, 5, linhas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm");
  }
}

function proximoId(lista) {
  return lista.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
}

/* ================================================================
   4) APURAÇÃO
   ================================================================ */
function apurar(d) {
  var minimo = d.settings.min_percent;
  var categorias = CATEGORIAS.map(function (cat) {
    var lista = d.candidates.filter(function (c) { return c.category === cat.key; }).map(function (c) {
      var total = c.yes + c.no;
      var pct = total ? (c.yes / total) * 100 : 0;
      return {
        id: c.id, category: c.category, name: c.name, description: c.description, photo_url: c.photo_url,
        yes: c.yes, no: c.no, total: total, percent: pct, noPercent: total ? 100 - pct : 0,
        status: total === 0 ? null : (pct > minimo ? "eleito" : "nao_eleito")
      };
    });
    lista.sort(function (a, b) { return b.yes - a.yes || b.percent - a.percent || a.name.localeCompare(b.name); });
    lista.forEach(function (c) { c.position = lista.filter(function (o) { return o.yes > c.yes; }).length + 1; });
    return { key: cat.key, label: cat.label, singular: cat.singular, candidates: lista };
  });
  var votaram = d.voters.filter(function (v) { return v.has_voted; }).length;
  return {
    minPercent: minimo,
    totalVoters: d.voters.length,
    totalBallots: votaram,
    participation: d.voters.length ? (votaram / d.voters.length) * 100 : 0,
    categories: categorias,
    updatedAt: new Date().toISOString(),
    settings: { church_name: d.settings.church_name, title: d.settings.title, logo_url: d.settings.logo_url }
  };
}

// Redesenha a aba "Resultado" (poucas chamadas, para ser rápido)
function montarResultado(d) {
  var r = apurar(d);
  var aba = d.ss.getSheetByName(ABA_RES);
  var V = [], BG = [], FC = [], FW = [], PCT = [];
  function linha(valores, bg, fc, fw, colunaPct) {
    while (valores.length < 7) valores.push("");
    V.push(valores);
    BG.push(Array(7).fill(bg || null));
    FC.push(Array(7).fill(fc || "#22341a"));
    FW.push(Array(7).fill(fw || "normal"));
    if (colunaPct) PCT.push(colunaPct + V.length); // ex.: "F12" (célula com porcentagem)
  }
  linha([d.settings.church_name], null, VERDE, "bold");
  linha([d.settings.title + " — Apuração"], null, LARANJA, "bold");
  linha([]);
  linha(["Atualizado em", Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm")]);
  linha(["Eleitores cadastrados", r.totalVoters]);
  linha(["Votos computados", r.totalBallots]);
  linha(["Participação", r.participation / 100], null, null, null, "B");
  linha(["Critério", "Eleito com MAIS de " + r.minPercent + "% de SIM"]);
  linha([]);
  r.categories.forEach(function (cat) {
    linha([cat.label.toUpperCase()], LARANJA, "#ffffff", "bold");
    linha(["Posição", "Candidato", "SIM", "NÃO", "Total", "% SIM", "Situação"], VERDE, "#ffffff", "bold");
    if (!cat.candidates.length) linha(["", "Nenhum candidato"]);
    cat.candidates.forEach(function (c) {
      var sit = c.status === "eleito" ? "ELEITO" : c.status === "nao_eleito" ? "Não eleito" : "Sem votos";
      var bg = c.status === "eleito" ? VERDE_CLARO : c.status === "nao_eleito" ? VERMELHO_CLARO : null;
      linha([c.position + "º", c.name, c.yes, c.no, c.total, c.total ? c.percent / 100 : "", sit],
        bg, null, c.status === "eleito" ? "bold" : "normal", "F");
    });
    linha([]);
  });
  aba.clear();
  var faixa = aba.getRange(1, 1, V.length, 7);
  faixa.setValues(V);
  faixa.setBackgrounds(BG);
  faixa.setFontColors(FC);
  faixa.setFontWeights(FW);
  if (PCT.length) aba.getRangeList(PCT).setNumberFormat("0.0%");
  aba.getRange(1, 1).setFontSize(15);
  aba.getRange(2, 1).setFontSize(12);
}

/* ================================================================
   5) AÇÕES PÚBLICAS (eleitores)
   ================================================================ */
function situacao(s) {
  var agora = new Date();
  if (s.start_at && agora < new Date(s.start_at)) return "not_started";
  if (s.end_at && agora > new Date(s.end_at)) return "closed";
  return "open";
}

function normalizarDoc(v) {
  var bruto = String(v == null ? "" : v).trim();
  var digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 11 && /^[\d.\-\s]+$/.test(bruto)) return digitos;
  return bruto.replace(/\s+/g, "").toUpperCase();
}

function mesmoPrimeiroNome(a, b) {
  var x = semAcento(a).split(" ")[0], y = semAcento(b).split(" ")[0];
  return !!x && x === y;
}

function candidatosPublicos(d) {
  return ordenarCandidatos(d.candidates).map(function (c) {
    return { id: c.id, category: c.category, name: c.name, description: c.description, photo_url: c.photo_url, sort_order: c.sort_order };
  });
}

function buscarEleitor(d, nome, doc) {
  var docNorm = normalizarDoc(doc);
  if (!String(nome || "").trim() || !docNorm) return { falha: erro("Preencha seu nome completo e o CPF ou código.") };
  var v = null;
  for (var i = 0; i < d.voters.length; i++) if (normalizarDoc(d.voters[i].doc) === docNorm) { v = d.voters[i]; break; }
  // mesma mensagem nos dois casos para não revelar quais CPFs estão cadastrados
  if (!v || !mesmoPrimeiroNome(nome, v.name))
    return { falha: erro("Eleitor não encontrado. Confira o nome e o CPF/código ou procure a secretaria da igreja.", 404) };
  if (v.has_voted) return { falha: erro("Você já votou. Cada membro pode votar apenas uma vez.", 409, { alreadyVoted: true }) };
  return { eleitor: v };
}

function acaoInfo(p, ss) {
  var d = lerTudo(ss), s = d.settings;
  return {
    ok: true, church_name: s.church_name, title: s.title, logo_url: s.logo_url,
    start_at: s.start_at, end_at: s.end_at, results_public: s.results_public, status: situacao(s),
    categories: CATEGORIAS, candidates: candidatosPublicos(d)
  };
}

function acaoConferir(p, ss) {
  var d = lerTudo(ss), st = situacao(d.settings);
  if (st === "not_started") return erro("A votação ainda não começou.", 403);
  if (st === "closed") return erro("Votação encerrada.", 403);
  var r = buscarEleitor(d, p.name, p.doc);
  if (r.falha) return r.falha;
  return { ok: true, firstName: r.eleitor.name.split(" ")[0] };
}

function acaoVotar(p, ss) {
  var respostas = p.answers;
  if (!respostas || typeof respostas !== "object") return erro("Voto inválido.");
  var ids = Object.keys(respostas);
  for (var i = 0; i < ids.length; i++) if (typeof respostas[ids[i]] !== "boolean") return erro("Voto inválido.");

  // TRAVA: só um voto é gravado por vez. Quem chega junto espera na fila.
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(25000)) return erro("Muitas pessoas votando agora. Tente de novo em alguns segundos.", 503, { busy: true });
  try {
    var d = lerTudo(ss), st = situacao(d.settings);
    if (st !== "open") return erro(st === "not_started" ? "A votação ainda não começou." : "Votação encerrada.", 403);
    var r = buscarEleitor(d, p.name, p.doc);
    if (r.falha) return r.falha;

    // precisa ter exatamente uma resposta para CADA candidato
    var porId = {};
    d.candidates.forEach(function (c) { porId[c.id] = c; });
    var completo = ids.length === d.candidates.length && ids.every(function (k) { return porId[numero(k, -1)]; });
    if (!completo) return erro("Responda SIM ou NÃO para todos os candidatos. Se a lista mudou, recarregue a página.");

    // soma no TOTAL de cada candidato (não guarda quem votou em quem)
    ids.forEach(function (k) { porId[numero(k, -1)][respostas[k] ? "yes" : "no"] += 1; });
    // grava as colunas "Votos SIM" e "Votos NÃO" de uma vez só
    var abaCand = ss.getSheetByName(ABA_CAND);
    var faixa = abaCand.getRange(2, 7, abaCand.getLastRow() - 1, 2);
    var totais = faixa.getValues();
    d.candidates.forEach(function (c) { totais[c.linha - 2] = [c.yes, c.no]; });
    faixa.setValues(totais);

    var agora = new Date();
    r.eleitor.has_voted = true;
    r.eleitor.voted_at = agora.toISOString();
    ss.getSheetByName(ABA_ELE).getRange(r.eleitor.linha, 4, 1, 2).setValues([["Sim", agora]]);

    montarResultado(d);
    SpreadsheetApp.flush();
    return { ok: true, protocol: Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase(), at: agora.toISOString() };
  } finally {
    trava.releaseLock();
  }
}

function acaoResultados(p, ss) {
  var d = lerTudo(ss);
  if (!d.settings.results_public && !tokenValido(p.token)) return { ok: true, hidden: true };
  var r = apurar(d);
  r.ok = true;
  return r;
}

/* ================================================================
   6) LOGIN DO ADMIN
   ================================================================ */
function segredo() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty("SEGREDO");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("SEGREDO", s); }
  return s;
}

function assinar(texto) {
  return Utilities.computeHmacSha256Signature(texto, segredo()).map(function (b) {
    return ("0" + (b & 0xff).toString(16)).slice(-2);
  }).join("");
}

function tokenValido(token) {
  if (!token || String(token).indexOf(".") < 0) return false;
  var partes = String(token).split(".");
  return assinar(partes[0]) === partes[1] && Number(partes[0]) > Date.now();
}

function acaoLogin(p) {
  if (String(p.user || "") !== ADMIN_USUARIO || String(p.password || "") !== ADMIN_SENHA) {
    Utilities.sleep(800); // dificulta tentativas em massa
    return erro("Usuário ou senha incorretos.", 401);
  }
  var exp = String(Date.now() + SESSAO_HORAS * 3600 * 1000);
  return { ok: true, token: exp + "." + assinar(exp) };
}

function acaoEu(p) {
  return { ok: true, admin: tokenValido(p.token) };
}

/* ================================================================
   7) AÇÕES DO ADMIN
   ================================================================ */
function comTrava(fn) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(25000)) return erro("Sistema ocupado. Tente de novo.", 503, { busy: true });
  try { return fn(); } finally { SpreadsheetApp.flush(); trava.releaseLock(); }
}

function acaoCandidatos(p, ss) {
  return { ok: true, list: candidatosPublicos(lerTudo(ss)) };
}

function acaoSalvarCandidato(p, ss) {
  var c = p.candidate || {};
  var dados = {
    category: c.category, name: String(c.name || "").trim(),
    description: String(c.description || "").trim() || null, photo_url: String(c.photo_url || "").trim() || null,
    sort_order: numero(c.sort_order, 0)
  };
  if (!dados.name || !singular(dados.category)) return erro("Informe nome e categoria.");
  return comTrava(function () {
    var d = lerTudo(ss);
    if (c.id) {
      var alvo = d.candidates.filter(function (x) { return x.id === numero(c.id, -1); })[0];
      if (!alvo) return erro("Candidato não encontrado.", 404);
      for (var k in dados) alvo[k] = dados[k]; // mantém os votos dele
    } else {
      dados.id = proximoId(d.candidates); dados.yes = 0; dados.no = 0;
      d.candidates.push(dados);
    }
    gravarCandidatos(ss, d.candidates);
    montarResultado(d);
    return { ok: true };
  });
}

function acaoExcluirCandidato(p, ss) {
  return comTrava(function () {
    var d = lerTudo(ss);
    d.candidates = d.candidates.filter(function (x) { return x.id !== numero(p.id, -1); });
    gravarCandidatos(ss, d.candidates);
    montarResultado(d);
    return { ok: true };
  });
}

function acaoEleitores(p, ss) {
  var lista = lerTudo(ss).voters.map(function (v) {
    return { id: v.id, name: v.name, doc: v.doc, has_voted: v.has_voted, voted_at: v.voted_at };
  });
  return { ok: true, list: lista };
}

function acaoAdicionarEleitores(p, ss) {
  var lista = p.voters;
  if (!lista || !lista.length) return erro("Nenhum eleitor enviado.");
  return comTrava(function () {
    var d = lerTudo(ss);
    var docs = {};
    d.voters.forEach(function (v) { docs[normalizarDoc(v.doc)] = true; });
    var ins = 0, exist = 0, inval = 0;
    lista.forEach(function (v) {
      var nome = String((v && v.name) || "").trim(), doc = normalizarDoc(v && v.doc);
      if (!nome || !doc) { inval++; return; }
      if (docs[doc]) { exist++; return; }
      docs[doc] = true;
      d.voters.push({ id: proximoId(d.voters), name: nome, doc: doc, has_voted: false, voted_at: null });
      ins++;
    });
    if (ins) { gravarEleitores(ss, d.voters); montarResultado(d); }
    return { ok: true, inserted: ins, skipped: exist, invalid: inval };
  });
}

function acaoExcluirEleitor(p, ss) {
  return comTrava(function () {
    var d = lerTudo(ss);
    d.voters = d.voters.filter(function (v) { return v.id !== numero(p.id, -1); });
    gravarEleitores(ss, d.voters);
    montarResultado(d);
    return { ok: true };
  });
}

function acaoLerConfig(p, ss) {
  var r = lerTudo(ss).settings;
  r.ok = true;
  r.spreadsheet_url = ss.getUrl();
  return r;
}

function acaoSalvarConfig(p, ss) {
  var b = p.settings || {};
  var ini = b.start_at ? new Date(b.start_at) : null, fim = b.end_at ? new Date(b.end_at) : null;
  if (ini && fim && fim <= ini) return erro("O fim precisa ser depois do início.");
  var valores = {
    church_name: String(b.church_name || CONFIG[0][2]).trim(),
    title: String(b.title || CONFIG[1][2]).trim(),
    logo_url: String(b.logo_url || "").trim(),
    min_percent: Math.max(0, Math.min(99, numero(b.min_percent, 50))),
    start_at: ini || "", end_at: fim || "",
    results_public: b.results_public ? "Sim" : "Não"
  };
  return comTrava(function () {
    var aba = ss.getSheetByName(ABA_CFG);
    aba.getRange(2, 1, CONFIG.length, 2).setValues(CONFIG.map(function (x) { return [x[1], valores[x[0]]]; }));
    aba.getRange(6, 2, 2, 1).setNumberFormat("dd/MM/yyyy HH:mm");
    montarResultado(lerTudo(ss));
    return { ok: true };
  });
}

function acaoZerar(p, ss) {
  if (p.confirm !== "ZERAR") return erro("Confirmação inválida.");
  return comTrava(function () {
    var d = lerTudo(ss);
    d.candidates.forEach(function (c) { c.yes = 0; c.no = 0; });
    d.voters.forEach(function (v) { v.has_voted = false; v.voted_at = null; });
    gravarCandidatos(ss, d.candidates);
    gravarEleitores(ss, d.voters);
    montarResultado(d);
    return { ok: true };
  });
}

// Foto do candidato ou logo: salva no Google Drive e devolve o link
function acaoUpload(p) {
  if (!p.base64) return erro("Nenhum arquivo.");
  var bytes = Utilities.base64Decode(String(p.base64));
  if (bytes.length > 5 * 1024 * 1024) return erro("Imagem muito grande (máximo 5 MB).");
  var pastas = DriveApp.getFoldersByName("Fotos - Votação");
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder("Fotos - Votação");
  var arquivo = pasta.createFile(Utilities.newBlob(bytes, "image/jpeg", "foto-" + Date.now() + ".jpg"));
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: "https://drive.google.com/thumbnail?id=" + arquivo.getId() + "&sz=w600" };
}
