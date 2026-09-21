/* ==========================================================================
   DASHBOARDS.JS — Painel executivo (KPIs + 3 gráficos)
   ==========================================================================

   Responsabilidade: escutar o evento 'atualizados' do api.js e desenhar
   os 3 gráficos + os cards complementares.

   Nesta FASE 1 não tem filtros ainda — mostra todos os registros que
   vieram do banco. A Fase 2 adiciona as segmentações reativas (Power BI).

   Conceitos que você vai ver aqui:
     - import de outro módulo (./api.js)
     - gráficos Chart.js com barras empilhadas + linha + linha de referência
     - formatação de datas em pt-BR
     - cálculo de "variação vs período anterior"
   ========================================================================== */

import { api } from './api.js';

/* --------------------------------------------------------------------------
   ESTADO DOS FILTROS (privado deste módulo)

   Este objeto guarda o valor atual de cada segmentação. Sempre que o
   usuário mexer em um campo, atualizamos a propriedade correspondente
   aqui ANTES de recalcular o dashboard.

   Campo vazio ("") significa "não filtrar por este critério".
   -------------------------------------------------------------------------- */
const filtrosAtivos = {
    dataInicio: '',
    dataFim: '',
    op: '',
    inspetor: '',
    status: '',
    peca: '',
    gdt: '',
};


/* --------------------------------------------------------------------------
   1. Constantes de negócio
   -------------------------------------------------------------------------- */
const META_EFETIVIDADE = 98; // %


/* --------------------------------------------------------------------------
   2. Referências do DOM
   -------------------------------------------------------------------------- */

// KPIs de topo
const kpiTotalEl = document.getElementById('kpi-total');
const kpiEfetividadeEl = document.getElementById('kpi-efetividade');

// Cards do Status
const dashTaxaRetrabalhoEl = document.getElementById('dash-taxa-retrabalho');
const dashTaxaSucataEl = document.getElementById('dash-taxa-sucata');
const dashMetaGapEl = document.getElementById('dash-meta-gap');

// Cards da Tendência
const dashVariacaoMesEl = document.getElementById('dash-variacao-mes');
const dashMelhorPeriodoEl = document.getElementById('dash-melhor-periodo');

// Cards do Pareto
const dashTotalNcEl = document.getElementById('dash-total-nc');
const dashOfensor1El = document.getElementById('dash-ofensor-1');
const dashTop3PctEl = document.getElementById('dash-top3-pct');
// dash-acao-sugerida é preenchido manualmente no HTML — não mexemos nele.

// Seletor de granularidade da Tendência
const tendenciaGranularidadeEl = document.getElementById('tendencia-granularidade');

// Filtros do dashboard
const filtrosDataInicioEl = document.getElementById('dash-filtro-data-inicio');
const filtrosDataFimEl    = document.getElementById('dash-filtro-data-fim');
const filtrosOpEl         = document.getElementById('dash-filtro-op');
const filtrosInspetorEl   = document.getElementById('dash-filtro-inspetor');
const filtrosStatusEl     = document.getElementById('dash-filtro-status');
const filtrosPecaEl       = document.getElementById('dash-filtro-peca');
const filtrosGdtEl        = document.getElementById('dash-filtro-gdt');
const listaOpEl           = document.getElementById('dash-lista-op');
const listaInspetorEl     = document.getElementById('dash-lista-inspetor');
const dashFiltroHintEl    = document.getElementById('dash-filtro-hint');
const dashFiltroResumoEl  = document.getElementById('dash-filtro-resumo');
const dashBtnLimparEl     = document.getElementById('dash-btn-limpar');


/* --------------------------------------------------------------------------
   3. Helpers de formatação
   -------------------------------------------------------------------------- */

// "2026-08-03" -> "03/08/2026"
function formatarDataBR(dataIso) {
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

// "2026-08-03" -> "03/08/26" (formato curto, do eixo X do gráfico)
function formatarDataCurta(dataIso) {
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano.slice(-2)}`;
}

// "2026-08" -> "ago/2026"
function formatarMesBR(anoMes) {
    const [ano, mes] = anoMes.split('-');
    const data = new Date(Number(ano), Number(mes) - 1, 1);
    return data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

// +3.2 -> "▲ +3,2 p.p."   |   -1.8 -> "▼ −1,8 p.p."
function formatarVariacao(valorPp) {
    const seta = valorPp > 0 ? '▲' : valorPp < 0 ? '▼' : '—';
    const sinal = valorPp > 0 ? '+' : '';
    return `${seta} ${sinal}${valorPp.toFixed(1).replace('.', ',')} p.p.`;
}

// Pinta o texto do card de variação (verde melhora, vermelho piora, cinza neutro)
function colorirVariacao(el, valorPp) {
    el.classList.remove('text-green-600', 'text-red-600', 'text-slate-800');
    if (valorPp > 0.05) el.classList.add('text-green-600');
    else if (valorPp < -0.05) el.classList.add('text-red-600');
    else el.classList.add('text-slate-800');
}

/* --------------------------------------------------------------------------
   FILTRAGEM — testa se UM registro passa nos filtros ativos

   O parâmetro "campoExcluido" permite ignorar um filtro específico.
   É a peça-chave da CASCATA: quando queremos descobrir "quais Peças
   existem dado os filtros atuais de Data, OP, Status...", passamos
   campoExcluido = 'peca' — assim a própria Peça não se auto-restringe.

   Com campoExcluido = null, nenhum filtro é ignorado: é o uso normal,
   para aplicar TODOS os filtros e obter o subconjunto real.
   -------------------------------------------------------------------------- */
function registroPassaNosFiltros(r, campoExcluido = null) {
    const dataRegistro = r.data_hora_inspecao ? r.data_hora_inspecao.slice(0, 10) : '';

    if (campoExcluido !== 'data') {
        if (filtrosAtivos.dataInicio && dataRegistro < filtrosAtivos.dataInicio) return false;
        if (filtrosAtivos.dataFim && dataRegistro > filtrosAtivos.dataFim) return false;
    }

    if (campoExcluido !== 'op' && filtrosAtivos.op &&
        !r.ordem_fabricacao.toLowerCase().includes(filtrosAtivos.op)) {
        return false;
    }

    if (campoExcluido !== 'inspetor' && filtrosAtivos.inspetor &&
        !r.nome_inspetor.toLowerCase().includes(filtrosAtivos.inspetor)) {
        return false;
    }

    if (campoExcluido !== 'status' && filtrosAtivos.status &&
        r.status !== filtrosAtivos.status) {
        return false;
    }

    if (campoExcluido !== 'peca' && filtrosAtivos.peca &&
        r.codigo_peca !== filtrosAtivos.peca) {
        return false;
    }

    if (campoExcluido !== 'gdt' && filtrosAtivos.gdt &&
        r.caracteristica_gdt !== filtrosAtivos.gdt) {
        return false;
    }

    return true;
}

/* --------------------------------------------------------------------------
   CANDIDATOS — devolve os registros que passam em TODOS os filtros,
   EXCETO o campo indicado em "campoExcluido".

   Usos:
     obterCandidatos(null)     -> aplica todos os filtros (subconjunto real)
     obterCandidatos('peca')   -> aplica todos os filtros MENOS Peça
                                   (usado pra saber quais Peças ainda
                                    fazem sentido dado os outros filtros)
   -------------------------------------------------------------------------- */
function obterCandidatos(campoExcluido = null) {
    return api.registros.filter((r) => registroPassaNosFiltros(r, campoExcluido));
}

/* --------------------------------------------------------------------------
   HELPERS DE UI — popular selects e datalists
   -------------------------------------------------------------------------- */

// Repopula um <select> mantendo a seleção anterior se ela ainda for válida.
function popularSelect(selectEl, valores, textoPadrao) {
    const valorAtual = selectEl.value;

    selectEl.innerHTML =
        `<option value="">${textoPadrao}</option>` +
        valores.map((v) => `<option value="${v}">${v}</option>`).join('');

    if (valores.includes(valorAtual)) {
        selectEl.value = valorAtual;
    }
}

// Popula um <datalist> (autocomplete de um <input type="text">).
// Limitamos a 100 sugestões para não deixar o navegador pesado.
function popularDatalist(datalistEl, valores) {
    const LIMITE = 100;
    const amostra = valores.slice(0, LIMITE);
    datalistEl.innerHTML = amostra.map((v) => `<option value="${v}"></option>`).join('');
}

// Para o Status (enum fixo de 3 valores), em vez de remover opções,
// desabilitamos as que não existem no subconjunto atual. Assim o usuário
// vê que "SUCATA" existe como conceito, só não na combinação atual.
function atualizarOpcoesStatus(statusDisponiveis) {
    const valorAtual = filtrosAtivos.status;

    Array.from(filtrosStatusEl.options).forEach((opcao) => {
        if (opcao.value === '') return;
        opcao.disabled = !statusDisponiveis.includes(opcao.value);
    });

    if (valorAtual && !statusDisponiveis.includes(valorAtual)) {
        filtrosAtivos.status = '';
        filtrosStatusEl.value = '';
    }
}
/* --------------------------------------------------------------------------
   LIMITES DE DATA — recalcula min/max dos inputs de data
   -------------------------------------------------------------------------- */
function atualizarLimitesData(candidatos) {
    if (candidatos.length === 0) {
        filtrosDataInicioEl.removeAttribute('min');
        filtrosDataInicioEl.removeAttribute('max');
        filtrosDataFimEl.removeAttribute('min');
        filtrosDataFimEl.removeAttribute('max');
        dashFiltroHintEl.textContent = 'Nenhum registro encontrado para os filtros atuais.';
        return;
    }

    const datas = candidatos.map((r) => r.data_hora_inspecao.slice(0, 10)).sort();
    const dataMin = datas[0];
    const dataMax = datas[datas.length - 1];

    filtrosDataInicioEl.min = dataMin;
    filtrosDataInicioEl.max = filtrosAtivos.dataFim && filtrosAtivos.dataFim < dataMax
        ? filtrosAtivos.dataFim
        : dataMax;

    filtrosDataFimEl.min = filtrosAtivos.dataInicio && filtrosAtivos.dataInicio > dataMin
        ? filtrosAtivos.dataInicio
        : dataMin;
    filtrosDataFimEl.max = dataMax;

    dashFiltroHintEl.textContent =
        `Datas disponíveis para os filtros atuais: ${formatarDataBR(dataMin)} a ${formatarDataBR(dataMax)}`;
}

/* --------------------------------------------------------------------------
   CASCATA — repopula as opções de CADA filtro com base nos candidatos
   de TODOS os OUTROS (excluindo ele mesmo).
   -------------------------------------------------------------------------- */
function atualizarOpcoesDisponiveis() {
    // Peça
    const candidatosPeca = obterCandidatos('peca');
    const pecas = [...new Set(candidatosPeca.map((r) => r.codigo_peca))].sort();
    popularSelect(filtrosPecaEl, pecas, 'Todas');

    // GD&T
    const candidatosGdt = obterCandidatos('gdt');
    const gdts = [...new Set(candidatosGdt.map((r) => r.caracteristica_gdt))].sort();
    popularSelect(filtrosGdtEl, gdts, 'Todas');

    // Status
    const candidatosStatus = obterCandidatos('status');
    const statusDisponiveis = [...new Set(candidatosStatus.map((r) => r.status))];
    atualizarOpcoesStatus(statusDisponiveis);

    // OP (datalist)
    const candidatosOp = obterCandidatos('op');
    const ops = [...new Set(candidatosOp.map((r) => r.ordem_fabricacao))].sort();
    popularDatalist(listaOpEl, ops);

    // Inspetor (datalist)
    const candidatosInspetor = obterCandidatos('inspetor');
    const inspetores = [...new Set(candidatosInspetor.map((r) => r.nome_inspetor))].sort();
    popularDatalist(listaInspetorEl, inspetores);

    // Datas (min/max)
    const candidatosData = obterCandidatos('data');
    atualizarLimitesData(candidatosData);
}

/* --------------------------------------------------------------------------
   RESUMO DO FILTRO — escreve "Mostrando X de Y" no rodapé da barra
   -------------------------------------------------------------------------- */
function atualizarResumoFiltro() {
    const total = api.registros.length;
    const filtrados = obterCandidatos(null).length;

    dashFiltroResumoEl.textContent =
        filtrados === total
            ? `Mostrando todos os ${total} registros.`
            : `Mostrando ${filtrados} de ${total} registros (filtro aplicado).`;
}

/* --------------------------------------------------------------------------
   4. Estatísticas básicas
   -------------------------------------------------------------------------- */

function calcularKpis(lista) {
    const total = lista.length;
    const conformes = lista.filter((r) => r.status === 'CONFORME').length;
    const retrabalhos = lista.filter((r) => r.status === 'RETRABALHO').length;
    const sucatas = lista.filter((r) => r.status === 'SUCATA').length;

    const efetividade = total > 0 ? (conformes / total) * 100 : 0;
    const taxaRetrabalho = total > 0 ? (retrabalhos / total) * 100 : 0;
    const taxaSucata = total > 0 ? (sucatas / total) * 100 : 0;

    return { total, conformes, retrabalhos, sucatas, efetividade, taxaRetrabalho, taxaSucata };
}


/* --------------------------------------------------------------------------
   5. Atualização dos KPIs de topo e cards complementares do Status
   -------------------------------------------------------------------------- */
function atualizarKpis(lista) {
    const { total, efetividade, taxaRetrabalho, taxaSucata } = calcularKpis(lista);

    // KPIs de topo
    kpiTotalEl.textContent = total;
    kpiEfetividadeEl.textContent = total > 0
        ? `${efetividade.toFixed(1).replace('.', ',')}%`
        : '---%';

    // Cards do Status
    dashTaxaRetrabalhoEl.textContent = total > 0
        ? `${taxaRetrabalho.toFixed(1).replace('.', ',')}%`
        : '---%';
    dashTaxaSucataEl.textContent = total > 0
        ? `${taxaSucata.toFixed(1).replace('.', ',')}%`
        : '---%';

    // Card da meta (gap em p.p.)
    if (total === 0) {
        dashMetaGapEl.textContent = '---';
        colorirVariacao(dashMetaGapEl, 0);
    } else {
        const gap = efetividade - META_EFETIVIDADE;
        dashMetaGapEl.textContent = `${gap >= 0 ? '+' : ''}${gap.toFixed(1).replace('.', ',')} p.p.`;
        colorirVariacao(dashMetaGapEl, gap);
    }
}


/* --------------------------------------------------------------------------
   6. Cálculo do Pareto (motivos mais frequentes entre não conformes)
   -------------------------------------------------------------------------- */
function calcularPareto(lista) {
    const naoConformes = lista.filter((r) => r.status !== 'CONFORME');

    const contagem = {};
    naoConformes.forEach((r) => {
        const motivo = r.motivo_nao_conformidade || 'Não informado';
        contagem[motivo] = (contagem[motivo] || 0) + 1;
    });

    const ordenado = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    const totalNC = naoConformes.length;

    // Top 3: quanto os 3 mais frequentes concentram do total de NC
    const top3 = ordenado.slice(0, 3).reduce((soma, [, qtd]) => soma + qtd, 0);
    const top3Pct = totalNC > 0 ? (top3 / totalNC) * 100 : 0;

    return { ordenado, totalNC, top3Pct };
}


/* --------------------------------------------------------------------------
   7. Tendência — agrupamento por dia/semana/mês
   -------------------------------------------------------------------------- */

// Segunda-feira da semana em que a data cai (chave de agrupamento semanal)
function obterInicioSemana(dataIso) {
    const data = new Date(`${dataIso}T00:00:00`);
    const dia = data.getDay(); // 0=dom ... 6=sáb
    const diff = dia === 0 ? -6 : 1 - dia;
    data.setDate(data.getDate() + diff);
    return data.toISOString().slice(0, 10);
}

function obterChaveAgrupamento(dataIso, granularidade) {
    if (granularidade === 'dia') return dataIso;
    if (granularidade === 'semana') return obterInicioSemana(dataIso);
    return dataIso.slice(0, 7); // 'mes' -> AAAA-MM
}

function rotularChave(chave, granularidade) {
    if (granularidade === 'mes') return formatarMesBR(chave);
    if (granularidade === 'semana') return `Sem ${formatarDataCurta(chave)}`;
    return formatarDataCurta(chave);
}

function calcularTendencia(lista, granularidade) {
    const grupos = {};
    lista.forEach((r) => {
        if (!r.data_hora_inspecao) return;
        const dataIso = r.data_hora_inspecao.slice(0, 10);
        const chave = obterChaveAgrupamento(dataIso, granularidade);

        if (!grupos[chave]) grupos[chave] = { total: 0, conformes: 0 };
        grupos[chave].total += 1;
        if (r.status === 'CONFORME') grupos[chave].conformes += 1;
    });

    const chavesOrdenadas = Object.keys(grupos).sort();

    const labels = chavesOrdenadas.map((c) => rotularChave(c, granularidade));
    const volumeTotal = chavesOrdenadas.map((c) => grupos[c].total);
    const volumeConforme = chavesOrdenadas.map((c) => grupos[c].conformes);
    // Não conforme = gap da barra (total - conforme)
    const volumeNc = chavesOrdenadas.map((c) => grupos[c].total - grupos[c].conformes);
    const efetividade = chavesOrdenadas.map((c) => {
        const { total, conformes } = grupos[c];
        return total > 0 ? Number(((conformes / total) * 100).toFixed(1)) : 0;
    });

    // Média histórica de efetividade (linha horizontal de referência)
    const efetividadeMedia = efetividade.length > 0
        ? efetividade.reduce((soma, v) => soma + v, 0) / efetividade.length
        : 0;

    return { labels, volumeTotal, volumeConforme, volumeNc, efetividade, efetividadeMedia };
}


/* --------------------------------------------------------------------------
   8. Card da Tendência: Variação vs Mês Anterior + Melhor Período
   -------------------------------------------------------------------------- */
function calcularVariaveisTendencia(lista) {
    // --- Variação vs mês anterior ---
    // Agrupa por mês (AAAA-MM), pega os 2 últimos meses e compara efetividade
    const porMes = {};
    lista.forEach((r) => {
        if (!r.data_hora_inspecao) return;
        const mes = r.data_hora_inspecao.slice(0, 7);
        if (!porMes[mes]) porMes[mes] = { total: 0, conformes: 0 };
        porMes[mes].total += 1;
        if (r.status === 'CONFORME') porMes[mes].conformes += 1;
    });

    const meses = Object.keys(porMes).sort();
    let variacao = null;

    if (meses.length >= 2) {
        const mesAtual = meses[meses.length - 1];
        const mesAnterior = meses[meses.length - 2];
        const efetAtual = (porMes[mesAtual].conformes / porMes[mesAtual].total) * 100;
        const efetAnterior = (porMes[mesAnterior].conformes / porMes[mesAnterior].total) * 100;
        variacao = efetAtual - efetAnterior;
    }

    // --- Melhor período (mês com maior efetividade) ---
    let melhorMes = null;
    let melhorEfet = -1;
    meses.forEach((mes) => {
        const { total, conformes } = porMes[mes];
        if (total === 0) return;
        const efet = (conformes / total) * 100;
        if (efet > melhorEfet) {
            melhorEfet = efet;
            melhorMes = mes;
        }
    });

    return { variacao, melhorMes, melhorEfet };
}


/* --------------------------------------------------------------------------
   9. Criação dos gráficos (uma vez)
   -------------------------------------------------------------------------- */

// --- STATUS (rosca) ---
const ctxStatus = document.getElementById('graficoStatus').getContext('2d');
const graficoStatus = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
        labels: ['Conforme', 'Retrabalho', 'Sucata'],
        datasets: [{
            data: [0, 0, 0],
            backgroundColor: ['#15803d', '#ca8a04', '#b91c1c'], // verde escuro, amarelo neutro, vermelho
            borderWidth: 2,
            borderColor: '#ffffff',
        }],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' }, // legenda centralizada embaixo
        },
    },
});

// --- PARETO (barras) ---
const ctxPareto = document.getElementById('graficoPareto').getContext('2d');
const graficoPareto = new Chart(ctxPareto, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [{
            label: 'Ocorrências',
            data: [],
            backgroundColor: '#2563eb',
        }],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
        },
    },
});

// --- TENDÊNCIA (barras empilhadas + linha + linha de referência) ---
const ctxTendencia = document.getElementById('graficoTendencia').getContext('2d');
const graficoTendencia = new Chart(ctxTendencia, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [
            {
                type: 'bar',
                label: 'Conforme',
                data: [],
                backgroundColor: '#86efac', // green-300
                stack: 'volume',
                yAxisID: 'y',
                order: 2,
            },
            {
                type: 'bar',
                label: 'Não Conforme',
                data: [],
                backgroundColor: '#fca5a5', // red-300
                stack: 'volume',
                yAxisID: 'y',
                order: 2,
            },
            {
                type: 'line',
                label: 'Efetividade (%)',
                data: [],
                borderColor: '#2563eb',
                backgroundColor: '#2563eb',
                yAxisID: 'y1',
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: '#2563eb',
                order: 1,
            },
        ],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom' },
            annotation: {
                annotations: {
                    linhaReferencia: {
                        type: 'line',
                        yMin: 0,          // valor preenchido em runtime
                        yMax: 0,
                        yScaleID: 'y1',
                        borderColor: '#64748b',
                        borderWidth: 2,
                        borderDash: [6, 6],
                        label: {
                            display: true,
                            content: 'Média histórica',
                            position: 'end',
                            backgroundColor: 'rgba(100, 116, 139, 0.85)',
                            color: '#ffffff',
                            font: { size: 10 },
                        },
                    },
                },
            },
        },
        scales: {
            y: {
                type: 'linear',
                position: 'left',
                beginAtZero: true,
                stacked: true,
                ticks: { precision: 0 },
                title: { display: true, text: 'Volume' },
            },
            y1: {
                type: 'linear',
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { callback: (v) => `${v}%` },
                title: { display: true, text: 'Efetividade' },
                // "relevante": Chart.js ajusta automaticamente
                // ao range real dos dados (não força 0-100)
            },
            x: {
                stacked: true,
                ticks: {
                    maxRotation: 45,
                    minRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 15,
                },
            },
        },
    },
});


/* --------------------------------------------------------------------------
   10. Atualização dos 3 gráficos + cards
   -------------------------------------------------------------------------- */
function atualizarGraficoStatus(lista) {
    const { conformes, retrabalhos, sucatas } = calcularKpis(lista);
    graficoStatus.data.datasets[0].data = [conformes, retrabalhos, sucatas];
    graficoStatus.update();
}

function atualizarGraficoPareto(lista) {
    const { ordenado, totalNC, top3Pct } = calcularPareto(lista);

    graficoPareto.data.labels = ordenado.map(([motivo]) => motivo);
    graficoPareto.data.datasets[0].data = ordenado.map(([, qtd]) => qtd);
    graficoPareto.update();

    // Cards complementares
    dashTotalNcEl.textContent = totalNC;
    dashOfensor1El.textContent = ordenado.length > 0
        ? `${ordenado[0][0]} (${ordenado[0][1]})`
        : '—';
    dashTop3PctEl.textContent = totalNC > 0
        ? `${top3Pct.toFixed(0)}%`
        : '—';
}

function atualizarGraficoTendencia(lista) {
    const granularidade = tendenciaGranularidadeEl.value;
    const { labels, volumeConforme, volumeNc, efetividade, efetividadeMedia } =
        calcularTendencia(lista, granularidade);

    graficoTendencia.data.labels = labels;
    graficoTendencia.data.datasets[0].data = volumeConforme; // barra de baixo
    graficoTendencia.data.datasets[1].data = volumeNc;       // barra de cima (gap)
    graficoTendencia.data.datasets[2].data = efetividade;    // linha

    // Atualiza a linha de referência (média histórica)
    graficoTendencia.options.plugins.annotation.annotations.linhaReferencia.yMin = efetividadeMedia;
    graficoTendencia.options.plugins.annotation.annotations.linhaReferencia.yMax = efetividadeMedia;

    graficoTendencia.update();
}

function atualizarCardsTendencia(lista) {
    const { variacao, melhorMes, melhorEfet } = calcularVariaveisTendencia(lista);

    if (variacao === null) {
        dashVariacaoMesEl.textContent = '—';
        dashVariacaoMesEl.classList.remove('text-green-600', 'text-red-600');
        dashVariacaoMesEl.classList.add('text-slate-800');
    } else {
        dashVariacaoMesEl.textContent = formatarVariacao(variacao);
        colorirVariacao(dashVariacaoMesEl, variacao);
    }

    if (melhorMes === null) {
        dashMelhorPeriodoEl.textContent = '—';
    } else {
        dashMelhorPeriodoEl.textContent = `${formatarMesBR(melhorMes)} · ${melhorEfet.toFixed(1).replace('.', ',')}%`;
    }
}


/* --------------------------------------------------------------------------
   11. Atualização geral
   -------------------------------------------------------------------------- */
function atualizarDashboard() {
    // Aplica os filtros ativos (cascata) e usa só o subconjunto
    const lista = obterCandidatos(null);
    atualizarKpis(lista);
    atualizarGraficoStatus(lista);
    atualizarGraficoPareto(lista);
    atualizarGraficoTendencia(lista);
    atualizarCardsTendencia(lista);
}


/* --------------------------------------------------------------------------
   12. Listeners
   -------------------------------------------------------------------------- */

// Quando os dados chegarem do banco, redesenha tudo
api.addEventListener('atualizados', () => {
    // Ao chegar dados novos do banco, primeiro recalcula as opções de
    // filtro (porque o "universo" de valores pode ter mudado), depois
    // redesenha o dashboard com o que estiver filtrado no momento.
    atualizarOpcoesDisponiveis();
    atualizarDashboard();
    atualizarResumoFiltro();
});

/* --------------------------------------------------------------------------
   LISTENERS DOS FILTROS — reagem a cada mudança (reativo, sem botão Aplicar)
   -------------------------------------------------------------------------- */

// Atualiza filtrosAtivos a partir do que está na tela, e redesenha tudo
function sincronizarFiltrosEAtualizar() {
    filtrosAtivos.dataInicio = filtrosDataInicioEl.value;
    filtrosAtivos.dataFim    = filtrosDataFimEl.value;
    filtrosAtivos.op         = filtrosOpEl.value.trim().toLowerCase();
    filtrosAtivos.inspetor   = filtrosInspetorEl.value.trim().toLowerCase();
    filtrosAtivos.status     = filtrosStatusEl.value;
    filtrosAtivos.peca       = filtrosPecaEl.value;
    filtrosAtivos.gdt        = filtrosGdtEl.value;

    atualizarOpcoesDisponiveis();
    atualizarDashboard();
    atualizarResumoFiltro();
}

// Textos: atualizam "na hora" enquanto digita/digita
[filtrosOpEl, filtrosInspetorEl, filtrosDataInicioEl, filtrosDataFimEl].forEach((el) => {
    el.addEventListener('change', sincronizarFiltrosEAtualizar);
});

// Selects: disparam no "change" (quando escolhe uma opção)
[filtrosPecaEl, filtrosGdtEl, filtrosStatusEl].forEach((el) => {
    el.addEventListener('change', sincronizarFiltrosEAtualizar);
});

// Botão "Limpar": zera todos os filtros e volta ao estado "sem filtro"
dashBtnLimparEl.addEventListener('click', () => {
    filtrosDataInicioEl.value = '';
    filtrosDataFimEl.value = '';
    filtrosOpEl.value = '';
    filtrosInspetorEl.value = '';
    filtrosStatusEl.value = '';
    filtrosPecaEl.value = '';
    filtrosGdtEl.value = '';

    filtrosAtivos.dataInicio = '';
    filtrosAtivos.dataFim = '';
    filtrosAtivos.op = '';
    filtrosAtivos.inspetor = '';
    filtrosAtivos.status = '';
    filtrosAtivos.peca = '';
    filtrosAtivos.gdt = '';

    atualizarOpcoesDisponiveis();
    atualizarDashboard();
    atualizarResumoFiltro();
});

// Quando o usuário troca a granularidade (dia/semana/mês), só o gráfico
// de Tendência precisa ser redesenhado — não os outros
tendenciaGranularidadeEl.addEventListener('change', () => {
    atualizarGraficoTendencia(api.registros);
});