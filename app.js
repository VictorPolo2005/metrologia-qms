/* ==========================================================================
   APP.JS — Sistema de Qualidade e Metrologia
   ==========================================================================
   Este arquivo está organizado nas mesmas 7 "camadas" que explicamos:
   1. Seleção de elementos do DOM
   2. Eventos (motivo automático quando o status muda)
   3. Cálculo automático de status pela tolerância
   4. Captura do submit do formulário
   5. Armazenamento dos registros em memória
   6. Cálculo dos KPIs
   7. Gráficos com Chart.js

   Dica de estudo: leia de cima pra baixo, uma camada por vez. Cada bloco
   comentado corresponde exatamente ao que já vimos na conversa.
   ========================================================================== */


/* --------------------------------------------------------------------------
   CAMADA 0 — Conexão com o Supabase
   Troque pelos valores do SEU projeto: Project Settings > API no painel.
   A "anon key" é segura para expor aqui NO NAVEGADOR, desde que você
   tenha configurado RLS na tabela (veja criar_tabela_supabase.sql).
   NUNCA coloque a "service_role key" em código de front-end.
   -------------------------------------------------------------------------- */
const SUPABASE_URL = 'https://fnoxaplrfnicutakostv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZub3hhcGxyZm5pY3V0YWtvc3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NDMyMTQsImV4cCI6MjEwNTAxOTIxNH0.mQbqXpp73S1jUmsHJTmsB9LoZKfKud7XEGMJWdQAQw4';

// "supabase" aqui vem do script CDN carregado no HTML antes deste arquivo.
// createClient devolve o objeto que usamos para toda chamada à API.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NOME_TABELA = 'inspecoes_aeronauticas';


/* --------------------------------------------------------------------------
   CAMADA 1 — Seleção de elementos do DOM
   Guardamos a referência de cada elemento em uma constante, uma única vez,
   pra não ficar chamando document.getElementById toda hora.
   -------------------------------------------------------------------------- */
const form = document.getElementById('form-inspecao');

const opInput = document.getElementById('op');
const aeronaveInput = document.getElementById('aeronave');
const pecaInput = document.getElementById('codigo_peca');
const caracteristicaSelect = document.getElementById('caracteristica_gdt');

const nominalInput = document.getElementById('nominal');
const medidoInput = document.getElementById('medido');
const tolSupInput = document.getElementById('tol_sup');
const tolInfInput = document.getElementById('tol_inf');

const statusSelect = document.getElementById('status');
const motivoInput = document.getElementById('motivo');

// KPIs (ficam na tela de dashboards)
const kpiTotalEl = document.getElementById('kpi-total');
const kpiFpyEl = document.getElementById('kpi-fpy');
const kpiRetrabalhoEl = document.getElementById('kpi-retrabalho');
const kpiSucataEl = document.getElementById('kpi-sucata');

// Painel de Filtros
const formFiltros = document.getElementById('form-filtros');
const filtroDataInicioInput = document.getElementById('filtro-data-inicio');
const filtroDataFimInput = document.getElementById('filtro-data-fim');
const filtroOpInput = document.getElementById('filtro-op');
const filtroInspetorInput = document.getElementById('filtro-inspetor');
const filtroStatusSelect = document.getElementById('filtro-status');
const filtroPecaSelect = document.getElementById('filtro-peca');
const filtroGdtSelect = document.getElementById('filtro-gdt');
const listaOpDatalist = document.getElementById('lista-op');
const listaInspetorDatalist = document.getElementById('lista-inspetor');

// Aba "Consultar Inspeções"
const consultaFormFiltros = document.getElementById('consulta-form-filtros');
const consultaFiltroDataInicio = document.getElementById('consulta-filtro-data-inicio');
const consultaFiltroDataFim = document.getElementById('consulta-filtro-data-fim');
const consultaFiltroOp = document.getElementById('consulta-filtro-op');
const consultaFiltroInspetor = document.getElementById('consulta-filtro-inspetor');
const consultaFiltroStatus = document.getElementById('consulta-filtro-status');
const consultaFiltroPeca = document.getElementById('consulta-filtro-peca');
const consultaFiltroGdt = document.getElementById('consulta-filtro-gdt');
const consultaBtnLimpar = document.getElementById('consulta-btn-limpar');
const consultaResumoEl = document.getElementById('consulta-resumo');
const consultaTabelaCorpo = document.getElementById('consulta-tabela-corpo');
const consultaBtnAnterior = document.getElementById('consulta-btn-anterior');
const consultaBtnProxima = document.getElementById('consulta-btn-proxima');
const consultaInfoPagina = document.getElementById('consulta-info-pagina');

// Modal de edição
const modalEditar = document.getElementById('modal-editar');
const formEditar = document.getElementById('form-editar');
const editarBtnCancelar = document.getElementById('editar-btn-cancelar');

// Modal de exclusão
const modalExcluir = document.getElementById('modal-excluir');
const excluirDetalhesEl = document.getElementById('excluir-detalhes');
const excluirBtnConfirmar = document.getElementById('excluir-btn-confirmar');
const excluirBtnCancelar = document.getElementById('excluir-btn-cancelar');
const filtroResumoEl = document.getElementById('filtro-resumo');
const filtroDataHintEl = document.getElementById('filtro-data-hint');
const btnLimparFiltros = document.getElementById('btn-limpar-filtros');


/* --------------------------------------------------------------------------
   CAMADA 5 (adiantada) — Armazenamento
   Este array agora funciona como um "cache local" dos dados que estão no
   Supabase. Ele é preenchido pela função carregarRegistros() ao abrir a
   página, e atualizado a cada novo registro salvo com sucesso no banco.
   As funções de KPI e gráfico continuam lendo DESTE array — elas não
   sabem (nem precisam saber) que os dados vieram de um banco remoto.
   -------------------------------------------------------------------------- */
let registros = [];

// registrosFiltrados é o subconjunto de "registros" que respeita os filtros
// ativos no momento. Sem nenhum filtro aplicado, é uma cópia idêntica a
// "registros" (mostra tudo). É ESTE array que os KPIs e gráficos leem.
let registrosFiltrados = [];

// Busca todos os registros já salvos no Supabase e preenche o array local.
// Chamada uma vez quando a página carrega (veja a Inicialização, no final).
async function carregarRegistros() {
    // O PostgREST (motor de API do Supabase) devolve NO MÁXIMO 1000 linhas
    // por requisição, por padrão — mesmo que a tabela tenha muito mais.
    // Pra trazer a tabela inteira, buscamos em "páginas" de 1000 até que
    // uma página venha incompleta (sinal de que chegamos ao fim).
    const TAMANHO_PAGINA = 1000;
    let todosOsRegistros = [];
    let pagina = 0;
    let continuarBuscando = true;

    filtroResumoEl.textContent = 'Atualizando dados do banco...';

    while (continuarBuscando) {
        const inicio = pagina * TAMANHO_PAGINA;
        const fim = inicio + TAMANHO_PAGINA - 1; // .range() é inclusivo nas duas pontas

        const { data, error } = await supabaseClient
            .from(NOME_TABELA)
            .select('*')
            .order('data_hora_inspecao', { ascending: false })
            .range(inicio, fim);

        if (error) {
            console.error('Erro ao carregar registros do Supabase:', error);
            alert('Não foi possível carregar os dados do banco. Veja o console (F12).');
            return;
        }

        todosOsRegistros = todosOsRegistros.concat(data);

        // Se essa página voltou com MENOS que 1000 linhas, não existe
        // próxima página — chegamos ao final da tabela.
        continuarBuscando = data.length === TAMANHO_PAGINA;
        pagina++;
    }

    registros = todosOsRegistros;
    registrosFiltrados = todosOsRegistros; // ao (re)carregar, nenhum filtro fica ativo
    atualizarOpcoesDisponiveis(); // preenche selects, datalists e intervalo de data com os valores totais
    atualizarDashboard();
    atualizarResumoFiltro();

    // Aba "Consultar Inspeções" também parte do zerado (sem filtro) a
    // cada recarga — mesma decisão de design que já vale para os filtros
    // do Painel de KPIs.
    registrosFiltradosConsulta = todosOsRegistros;
    paginaAtualConsulta = 0;
    popularSelectsConsulta(todosOsRegistros);
    renderizarTabelaConsulta();
    atualizarResumoConsulta();
}


/* --------------------------------------------------------------------------
   CAMADA 3 — Cálculo automático de status pela tolerância
   Função "pura": recebe números, devolve uma string. Não mexe em nada da
   tela sozinha — quem chama ela é que decide o que fazer com o resultado.
   -------------------------------------------------------------------------- */
function calcularStatus(nominal, medido, tolSup, tolInf) {
    // Se algum valor ainda não foi digitado, não dá pra calcular nada
    if ([nominal, medido, tolSup, tolInf].some(v => Number.isNaN(v))) {
        return null;
    }

    const limiteSuperior = nominal + tolSup;
    const limiteInferior = nominal - tolInf;

    // Dentro da faixa de tolerância -> CONFORME
    if (medido >= limiteInferior && medido <= limiteSuperior) {
        return 'CONFORME';
    }

    // Fora da faixa: calculamos o quanto passou do limite (desvio)
    const desvio = Math.abs(medido - nominal);
    const toleranciaDeReferencia = medido > nominal ? tolSup : tolInf;

    // Regra de negócio (a mesma usada no gerador Python):
    // até 3x a tolerância = recuperável (RETRABALHO)
    // acima disso = sem recuperação (SUCATA)
    if (desvio <= toleranciaDeReferencia * 3) {
        return 'RETRABALHO';
    }
    return 'SUCATA';
}

// Função que lê os 4 campos de medição, calcula e atualiza o select de status
function atualizarStatusAutomatico() {
    const nominal = parseFloat(nominalInput.value);
    const medido = parseFloat(medidoInput.value);
    const tolSup = parseFloat(tolSupInput.value);
    const tolInf = parseFloat(tolInfInput.value);

    const statusCalculado = calcularStatus(nominal, medido, tolSup, tolInf);

    if (statusCalculado) {
        statusSelect.value = statusCalculado;
        // Como mudamos o .value "na mão", o evento 'change' do select
        // NÃO dispara sozinho — por isso chamamos a função da Camada 2
        // manualmente aqui embaixo, pra manter o campo Motivo sincronizado.
        atualizarCampoMotivo();
    }
}

// Sempre que o operador digitar em qualquer um dos 4 campos de medição,
// recalculamos o status automaticamente.
[nominalInput, medidoInput, tolSupInput, tolInfInput].forEach((input) => {
    input.addEventListener('input', atualizarStatusAutomatico);
});


/* --------------------------------------------------------------------------
   CAMADA 2 — Eventos: Motivo automático quando o status muda
   -------------------------------------------------------------------------- */
function atualizarCampoMotivo() {
    if (statusSelect.value === 'CONFORME') {
        motivoInput.value = 'N/A';
        motivoInput.disabled = true;
        motivoInput.required = false;
    } else if (statusSelect.value === 'RETRABALHO' || statusSelect.value === 'SUCATA') {
        // Só limpa o campo se ele ainda estiver com o "N/A" padrão,
        // pra não apagar um motivo que o operador já tenha digitado.
        if (motivoInput.value === 'N/A') {
            motivoInput.value = '';
        }
        motivoInput.disabled = false;
        motivoInput.required = true;
    } else {
        // Nenhum status selecionado ainda
        motivoInput.value = 'N/A';
        motivoInput.disabled = true;
    }
}

// Caso o operador mude o status manualmente pelo próprio <select>
// (em vez de deixar o cálculo automático fazer isso), o campo Motivo
// também precisa reagir. Por isso este listener também existe.
statusSelect.addEventListener('change', atualizarCampoMotivo);


/* --------------------------------------------------------------------------
   CAMADA 6 — Cálculo dos KPIs

   Cada função abaixo agora recebe "lista" como parâmetro, em vez de usar
   sempre o array "registros" inteiro. O valor padrão (lista = registrosFiltrados)
   funciona igual a um argumento padrão do Python (def f(lista=None)):
   se você chamar atualizarDashboard() sem nada, ela usa o que estiver
   filtrado no momento. Se quiser forçar outra lista, é só passar por fora.
   -------------------------------------------------------------------------- */
function calcularKpis(lista = registrosFiltrados) {
    const total = lista.length;
    const conformes = lista.filter((r) => r.status === 'CONFORME').length;
    const retrabalhos = lista.filter((r) => r.status === 'RETRABALHO').length;
    const sucatas = lista.filter((r) => r.status === 'SUCATA').length;

    return { total, conformes, retrabalhos, sucatas };
}

function atualizarPainelKpis(lista = registrosFiltrados) {
    const { total, conformes, retrabalhos, sucatas } = calcularKpis(lista);

    kpiTotalEl.textContent = total;

    // Evita divisão por zero quando o filtro não encontra nenhum registro
    if (total === 0) {
        kpiFpyEl.textContent = '---%';
        kpiRetrabalhoEl.textContent = '---%';
        kpiSucataEl.textContent = '---%';
        return;
    }

    kpiFpyEl.textContent = `${((conformes / total) * 100).toFixed(1)}%`;
    kpiRetrabalhoEl.textContent = `${((retrabalhos / total) * 100).toFixed(1)}%`;
    kpiSucataEl.textContent = `${((sucatas / total) * 100).toFixed(1)}%`;
}


/* --------------------------------------------------------------------------
   CAMADA 7 — Gráficos (Chart.js)
   Criamos os gráficos UMA vez, fora de qualquer função, e depois só
   atualizamos os dados deles (grafico.update()) — nunca recriamos do zero.
   -------------------------------------------------------------------------- */
const ctxStatus = document.getElementById('graficoStatus').getContext('2d');
const graficoStatus = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
        labels: ['Conforme', 'Retrabalho', 'Sucata'],
        datasets: [{
            data: [0, 0, 0],
            backgroundColor: ['#22c55e', '#eab308', '#dc2626'],
        }],
    },
    options: {
        responsive: true,
        plugins: {
            legend: { position: 'bottom' },
        },
    },
});

const ctxPareto = document.getElementById('graficoPareto').getContext('2d');
const graficoPareto = new Chart(ctxPareto, {
    type: 'bar',
    data: {
        labels: [], // vai ser preenchido dinamicamente com os motivos
        datasets: [{
            label: 'Ocorrências',
            data: [],
            backgroundColor: '#2563eb',
        }],
    },
    options: {
        responsive: true,
        plugins: {
            legend: { display: false },
        },
        scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
        },
    },
});

// Gráfico de TENDÊNCIA: linha de FPY (% conforme) por mês. É o gráfico que
// responde "a qualidade está melhorando ou piorando?", em vez de só "como
// está agora?" (que é o que os outros dois gráficos já mostram).
// Gráfico de TENDÊNCIA: agora é um gráfico MISTO (estilo Power BI) — barras
// para Volume Total e Volume Conforme (eixo esquerdo, contagem), e uma
// linha para Efetividade % (eixo direito, 0-100%). O type: 'bar' aqui em
// cima é o "tipo padrão"; o dataset da linha sobrescreve com type: 'line'.
const seletorAgrupamentoTendencia = document.getElementById('tendencia-agrupamento');

const ctxTendencia = document.getElementById('graficoTendencia').getContext('2d');
const graficoTendencia = new Chart(ctxTendencia, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [
            {
                type: 'bar',
                label: 'Volume Total',
                data: [],
                backgroundColor: '#cbd5e1', // slate-300
                yAxisID: 'y',
                order: 2, // desenhado atrás da linha
            },
            {
                type: 'bar',
                label: 'Volume Conforme',
                data: [],
                backgroundColor: '#86efac', // green-300
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
                pointRadius: 4,
                pointBackgroundColor: '#2563eb',
                order: 1, // desenhado na frente das barras
            },
        ],
    },
    options: {
        responsive: true,
        // "index" faz o tooltip mostrar os 3 valores daquele período juntos,
        // em vez de precisar passar o mouse exatamente em cima de cada barra
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { position: 'bottom' },
        },
        scales: {
            y: {
                type: 'linear',
                position: 'left',
                beginAtZero: true,
                ticks: { precision: 0 }, // sem casas decimais em contagem de peças
                title: { display: true, text: 'Volume de Inspeções' },
            },
            y1: {
                type: 'linear',
                position: 'right',
                min: 0,
                max: 100,
                grid: { drawOnChartArea: false }, // evita duas grades sobrepostas
                ticks: { callback: (valor) => `${valor}%` },
                title: { display: true, text: 'Efetividade (%)' },
            },
        },
    },
});

seletorAgrupamentoTendencia.addEventListener('change', () => atualizarGraficoTendencia());

function atualizarGraficoStatus(lista = registrosFiltrados) {
    const { conformes, retrabalhos, sucatas } = calcularKpis(lista);
    graficoStatus.data.datasets[0].data = [conformes, retrabalhos, sucatas];
    graficoStatus.update();
}

function atualizarGraficoPareto(lista = registrosFiltrados) {
    // Pareto = "quais motivos de não conformidade aparecem mais".
    // 1. Pegamos só os registros não conformes DENTRO da lista filtrada
    const naoConformes = lista.filter((r) => r.status !== 'CONFORME');

    // 2. Contamos quantas vezes cada motivo aparece (equivalente a um
    //    Counter do Python: Counter(r.motivo for r in nao_conformes))
    const contagemPorMotivo = {};
    naoConformes.forEach((r) => {
        const motivo = r.motivo_nao_conformidade || 'Não informado';
        contagemPorMotivo[motivo] = (contagemPorMotivo[motivo] || 0) + 1;
    });

    // 3. Ordenamos do motivo mais frequente para o menos frequente
    const motivosOrdenados = Object.entries(contagemPorMotivo)
        .sort((a, b) => b[1] - a[1]);

    graficoPareto.data.labels = motivosOrdenados.map((item) => item[0]);
    graficoPareto.data.datasets[0].data = motivosOrdenados.map((item) => item[1]);
    graficoPareto.update();
}

// Converte "2026-08" (AAAA-MM) para "ago/2026" (leitura humana em pt-BR)
function formatarMesBR(anoMes) {
    const [ano, mes] = anoMes.split('-');
    const data = new Date(Number(ano), Number(mes) - 1, 1);
    return data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

// Descobre a segunda-feira da semana em que uma data cai — usamos essa
// data como "chave" de agrupamento semanal (equivalente a um
// df['data'].dt.to_period('W') do pandas, mas calculado na mão)
function obterInicioSemana(dataIso) {
    const data = new Date(`${dataIso}T00:00:00`);
    const diaDaSemana = data.getDay(); // 0 = domingo, 1 = segunda, ... 6 = sábado
    const diferencaParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    data.setDate(data.getDate() + diferencaParaSegunda);
    return data.toISOString().slice(0, 10);
}

// Decide a "chave" de agrupamento (o que define se dois registros caem no
// mesmo ponto do gráfico) de acordo com o período escolhido no seletor
function obterChaveAgrupamento(dataIso, periodo) {
    if (periodo === 'dia') return dataIso; // já é "AAAA-MM-DD"
    if (periodo === 'semana') return obterInicioSemana(dataIso);
    return dataIso.slice(0, 7); // 'mes' -> "AAAA-MM"
}

// Formata a chave de volta pra algo legível, de acordo com o período
function formatarRotuloAgrupamento(chave, periodo) {
    if (periodo === 'mes') return formatarMesBR(chave);
    if (periodo === 'semana') return `Sem. ${formatarDataBR(chave)}`;
    return formatarDataBR(chave); // 'dia'
}

function atualizarGraficoTendencia(lista = registrosFiltrados) {
    const periodo = seletorAgrupamentoTendencia.value; // 'dia' | 'semana' | 'mes'

    // 1. Agrupamos os registros pela chave do período escolhido, contando
    //    total e quantos foram CONFORME em cada grupo — equivalente a um
    //    groupby do pandas: df.groupby(df['data'].dt.to_period(periodo))
    const grupos = {};
    lista.forEach((r) => {
        if (!r.data_hora_inspecao) return;
        const dataIso = r.data_hora_inspecao.slice(0, 10);
        const chave = obterChaveAgrupamento(dataIso, periodo);
        if (!grupos[chave]) grupos[chave] = { total: 0, conformes: 0 };
        grupos[chave].total += 1;
        if (r.status === 'CONFORME') grupos[chave].conformes += 1;
    });

    // 2. As chaves ("AAAA-MM-DD" ou "AAAA-MM") ordenam corretamente como
    //    texto simples, então um .sort() já entrega a ordem cronológica certa
    const chavesOrdenadas = Object.keys(grupos).sort();

    const labels = chavesOrdenadas.map((chave) => formatarRotuloAgrupamento(chave, periodo));
    const volumeTotal = chavesOrdenadas.map((chave) => grupos[chave].total);
    const volumeConforme = chavesOrdenadas.map((chave) => grupos[chave].conformes);
    const efetividade = chavesOrdenadas.map((chave) => {
        const { total, conformes } = grupos[chave];
        return total > 0 ? Number(((conformes / total) * 100).toFixed(1)) : 0;
    });

    graficoTendencia.data.labels = labels;
    graficoTendencia.data.datasets[0].data = volumeTotal;
    graficoTendencia.data.datasets[1].data = volumeConforme;
    graficoTendencia.data.datasets[2].data = efetividade;
    graficoTendencia.update();
}

function atualizarDashboard(lista = registrosFiltrados) {
    atualizarPainelKpis(lista);
    atualizarGraficoStatus(lista);
    atualizarGraficoPareto(lista);
    atualizarGraficoTendencia(lista);
}


/* --------------------------------------------------------------------------
   CAMADA 8 — Filtros do Dashboard

   popularOpcoesFiltros / atualizarOpcoesDisponiveis: recalculam as opções
   válidas de CADA campo de filtro com base em todos os OUTROS filtros já
   selecionados. Exemplo: se você escolher Peça = "Flap", os campos de
   Data, Status, Inspetor e OP passam a mostrar só o que existe para Flap.
   É "cascata" porque mudar um campo qualquer recalcula os outros todos.

   aplicarFiltros: lê o que está preenchido em cada campo do formulário de
   filtro, e reduz "registros" (o array cheio) para "registrosFiltrados"
   (só o que passa em TODAS as condições preenchidas). Campo vazio = não
   filtra por aquele critério ("Mostrar todos se não filtrar").
   -------------------------------------------------------------------------- */

// Lê o valor atual de cada campo do formulário de filtro, num único objeto
function obterValoresFiltro() {
    return {
        dataInicio: filtroDataInicioInput.value, // "AAAA-MM-DD" ou "" se vazio
        dataFim: filtroDataFimInput.value,
        op: filtroOpInput.value.trim().toLowerCase(),
        inspetor: filtroInspetorInput.value.trim().toLowerCase(),
        status: filtroStatusSelect.value,
        peca: filtroPecaSelect.value,
        gdt: filtroGdtSelect.value,
    };
}

// Testa se UM registro passa nos filtros ativos, pulando o campo indicado
// em "campoExcluido". É essa peça que permite reaproveitar a mesma lógica
// tanto para "aplicar filtro de verdade" (campoExcluido = null, aplica tudo)
// quanto para "descobrir opções válidas de um campo" (excluindo ele mesmo).
function registroPassaNoFiltro(r, valores, campoExcluido) {
    const dataRegistro = r.data_hora_inspecao ? r.data_hora_inspecao.slice(0, 10) : '';

    if (campoExcluido !== 'data') {
        if (valores.dataInicio && dataRegistro < valores.dataInicio) return false;
        if (valores.dataFim && dataRegistro > valores.dataFim) return false;
    }
    if (campoExcluido !== 'op' && valores.op && !r.ordem_fabricacao.toLowerCase().includes(valores.op)) {
        return false;
    }
    if (campoExcluido !== 'inspetor' && valores.inspetor && !r.nome_inspetor.toLowerCase().includes(valores.inspetor)) {
        return false;
    }
    if (campoExcluido !== 'status' && valores.status && r.status !== valores.status) {
        return false;
    }
    if (campoExcluido !== 'peca' && valores.peca && r.codigo_peca !== valores.peca) {
        return false;
    }
    if (campoExcluido !== 'gdt' && valores.gdt && r.caracteristica_gdt !== valores.gdt) {
        return false;
    }

    return true;
}

// Devolve os registros que batem com TODOS os filtros ativos, EXCETO o
// campo passado em "campoExcluido". Usado pra responder: "dado que os
// outros filtros já estão escolhidos, o que esse campo específico
// ainda pode oferecer como opção válida?"
function obterCandidatos(campoExcluido) {
    const valores = obterValoresFiltro();
    return registros.filter((r) => registroPassaNoFiltro(r, valores, campoExcluido));
}

// Repopula um <select> com os valores fornecidos, mantendo a seleção
// anterior se ela continuar sendo uma opção válida (senão, volta pra "Todas")
function popularSelect(selectEl, valores, textoPadrao) {
    const valorAtual = selectEl.value;
    selectEl.innerHTML =
        `<option value="">${textoPadrao}</option>` +
        valores.map((v) => `<option value="${v}">${v}</option>`).join('');

    if (valores.includes(valorAtual)) {
        selectEl.value = valorAtual;
    }
}

// Para o Status (enum fixo de 3 valores), em vez de remover opções,
// desabilitamos as que não existem na combinação atual — assim o usuário
// ainda vê que "SUCATA" existe como conceito, só não pra esse filtro.
function atualizarOpcoesStatus(statusDisponiveis) {
    const valorAtual = filtroStatusSelect.value;

    Array.from(filtroStatusSelect.options).forEach((opcao) => {
        if (opcao.value === '') return; // "Todos" sempre fica disponível
        opcao.disabled = !statusDisponiveis.includes(opcao.value);
    });

    if (valorAtual && !statusDisponiveis.includes(valorAtual)) {
        filtroStatusSelect.value = ''; // seleção anterior ficou inválida -> volta pra "Todos"
    }
}

// Preenche um <datalist> (autocomplete de um <input type="text">) — usado
// pra OP e Inspetor, que são texto livre, não um <select> fechado
function popularDatalist(datalistEl, valores) {
    datalistEl.innerHTML = valores.map((v) => `<option value="${v}"></option>`).join('');
}

// Converte "2026-08-03" (formato do <input type="date">) para "03/08/2026" (leitura humana)
function formatarDataBR(dataIso) {
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Recalcula o intervalo de datas selecionável (min/max do calendário) com
// base numa lista de candidatos já filtrada (vem de obterCandidatos('data'))
function atualizarLimitesData(candidatos) {
    if (candidatos.length === 0) {
        filtroDataInicioInput.removeAttribute('min');
        filtroDataInicioInput.removeAttribute('max');
        filtroDataFimInput.removeAttribute('min');
        filtroDataFimInput.removeAttribute('max');
        filtroDataHintEl.textContent = 'Nenhum registro encontrado para os demais filtros selecionados.';
        return;
    }

    const datasOrdenadas = candidatos.map((r) => r.data_hora_inspecao.slice(0, 10)).sort();
    const dataMin = datasOrdenadas[0];
    const dataMax = datasOrdenadas[datasOrdenadas.length - 1];

    // O atributo min/max do <input type="date"> é nativo do HTML5: o
    // seletor de calendário do navegador desabilita sozinho qualquer dia
    // fora desse intervalo — não precisamos validar isso na mão depois.
    //
    // REGRA DE NEGÓCIO: Data Fim >= Data Início. Combinamos isso com o
    // intervalo que já vem da cascata (dataMin/dataMax) usando o maior
    // dos mínimos e o menor dos máximos — assim as duas regras valem ao
    // mesmo tempo, sem uma "atropelar" a outra.
    const inicioSelecionado = filtroDataInicioInput.value;
    const fimSelecionado = filtroDataFimInput.value;

    filtroDataInicioInput.min = dataMin;
    filtroDataInicioInput.max =
        fimSelecionado && fimSelecionado < dataMax ? fimSelecionado : dataMax;

    filtroDataFimInput.min =
        inicioSelecionado && inicioSelecionado > dataMin ? inicioSelecionado : dataMin;
    filtroDataFimInput.max = dataMax;

    filtroDataHintEl.textContent =
        `Datas disponíveis para os filtros atuais: ${formatarDataBR(dataMin)} a ${formatarDataBR(dataMax)}`;
}

// FUNÇÃO PRINCIPAL DA CASCATA: chamada sempre que QUALQUER campo de filtro
// muda. Para cada campo, calcula "quais valores ainda fazem sentido dado
// que os outros já estão escolhidos" e atualiza a interface — sem, no
// entanto, aplicar o filtro nos KPIs/gráficos ainda (isso só acontece
// quando o usuário clica em "Aplicar", em aplicarFiltros()).
function atualizarOpcoesDisponiveis() {
    const candidatosPeca = obterCandidatos('peca');
    popularSelect(
        filtroPecaSelect,
        [...new Set(candidatosPeca.map((r) => r.codigo_peca))].sort(),
        'Todas',
    );

    const candidatosGdt = obterCandidatos('gdt');
    popularSelect(
        filtroGdtSelect,
        [...new Set(candidatosGdt.map((r) => r.caracteristica_gdt))].sort(),
        'Todas',
    );

    const candidatosStatus = obterCandidatos('status');
    atualizarOpcoesStatus([...new Set(candidatosStatus.map((r) => r.status))]);

    const candidatosOp = obterCandidatos('op');
    popularDatalist(
        listaOpDatalist,
        [...new Set(candidatosOp.map((r) => r.ordem_fabricacao))].sort(),
    );

    const candidatosInspetor = obterCandidatos('inspetor');
    popularDatalist(
        listaInspetorDatalist,
        [...new Set(candidatosInspetor.map((r) => r.nome_inspetor))].sort(),
    );

    const candidatosData = obterCandidatos('data');
    atualizarLimitesData(candidatosData);
}

function atualizarResumoFiltro() {
    const total = registros.length;
    const filtrados = registrosFiltrados.length;

    filtroResumoEl.textContent =
        filtrados === total
            ? `Mostrando todos os ${total} registros.`
            : `Mostrando ${filtrados} de ${total} registros (filtro aplicado).`;
}

function aplicarFiltros(evento) {
    if (evento) evento.preventDefault(); // evita reload da página no submit do form de filtro

    // Validação de segurança: mesmo com o min/max travando o calendário
    // visualmente, alguns navegadores permitem digitar a data na mão
    // (ex: colar um valor). Essa checagem garante a regra de negócio
    // mesmo nesse caso — Data Fim nunca pode vir antes de Data Início.
    const dataInicio = filtroDataInicioInput.value;
    const dataFim = filtroDataFimInput.value;

    if (dataInicio && dataFim && dataFim < dataInicio) {
        alert('A Data Fim não pode ser anterior à Data Início. Ajuste o período antes de aplicar o filtro.');
        return;
    }

    // campoExcluido = null -> nenhum campo é pulado, todos os filtros valem
    registrosFiltrados = obterCandidatos(null);

    atualizarDashboard(registrosFiltrados);
    atualizarResumoFiltro();
}

function limparFiltros() {
    formFiltros.reset();
    registrosFiltrados = registros; // volta a mostrar tudo
    atualizarOpcoesDisponiveis(); // recalcula tudo sem nenhum filtro ativo (= intervalo/opções totais)
    atualizarDashboard(registrosFiltrados);
    atualizarResumoFiltro();
}

formFiltros.addEventListener('submit', aplicarFiltros);
btnLimparFiltros.addEventListener('click', limparFiltros);

// Sempre que QUALQUER campo de filtro mudar — incluindo as datas agora —
// recalculamos as opções válidas de TODOS os outros campos (cascata nos
// dois sentidos). O usuário ainda precisa clicar em "Aplicar" para de
// fato filtrar os KPIs/gráficos; isso aqui só atualiza o que cada campo
// permite escolher.
[filtroOpInput, filtroInspetorInput].forEach((input) => {
    input.addEventListener('input', atualizarOpcoesDisponiveis);
});
[filtroStatusSelect, filtroPecaSelect, filtroGdtSelect].forEach((select) => {
    select.addEventListener('change', atualizarOpcoesDisponiveis);
});
[filtroDataInicioInput, filtroDataFimInput].forEach((input) => {
    input.addEventListener('change', atualizarOpcoesDisponiveis);
});


/* --------------------------------------------------------------------------
   CAMADA 4 — Captura do submit do formulário
   Junta tudo: lê os dados, valida, guarda no array, atualiza o dashboard
   e limpa o formulário para o próximo apontamento.
   -------------------------------------------------------------------------- */
form.addEventListener('submit', async (evento) => {
    // Impede o navegador de recarregar a página (comportamento padrão do form)
    evento.preventDefault();

    // Object.fromEntries + FormData lê automaticamente todos os campos
    // que têm o atributo name="..." no HTML
    const registro = Object.fromEntries(new FormData(form));

    // Pequena validação extra: garante que um status foi de fato escolhido
    if (!registro.status) {
        alert('Selecione um status antes de salvar.');
        return;
    }

    // Os campos numéricos chegam como STRING do FormData — convertemos
    // antes de mandar pro banco, já que as colunas lá são numeric.
    registro.valor_nominal = parseFloat(registro.valor_nominal);
    registro.valor_medido = parseFloat(registro.valor_medido);
    registro.tolerancia_superior = parseFloat(registro.tolerancia_superior);
    registro.tolerancia_inferior = parseFloat(registro.tolerancia_inferior);

    // Timestamp do momento em que o inspetor está gravando o apontamento.
    // toISOString() gera um formato que o Postgres (coluna timestamptz)
    // entende sem ambiguidade, ex: "2026-09-16T14:32:07.123Z"
    registro.data_hora_inspecao = new Date().toISOString();

    // Trava o botão enquanto a gravação acontece, pra evitar duplo clique
    const botaoSalvar = form.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando...';

    // await pausa aqui até o Supabase responder (sucesso ou erro)
    const { error } = await supabaseClient
        .from(NOME_TABELA)
        .insert([registro]);

    botaoSalvar.disabled = false;
    botaoSalvar.textContent = 'Salvar Apontamento';

    if (error) {
        console.error('Erro ao salvar no Supabase:', error);
        alert(`Erro ao salvar: ${error.message}`);
        return; // não limpa o formulário nem atualiza o dashboard se falhou
    }

    console.log('Registro salvo no Supabase:', registro);

    // Recarrega a lista completa do banco (garante que o dashboard
    // reflita exatamente o que está gravado, não só o que a tela acha)
    await carregarRegistros();

    // Limpa o formulário para o próximo apontamento
    form.reset();
    atualizarCampoMotivo(); // reseta o campo motivo para o estado inicial (N/A, disabled)
});


/* --------------------------------------------------------------------------
   CAMADA 9 — Atualização automática ao entrar no Painel de KPIs

   Usamos "btnMenuDashboards" (nome diferente de "btnDashboards", que já
   existe no <script> inline do HTML) porque scripts clássicos comuns
   compartilham o mesmo escopo de let/const — declarar o mesmo nome de
   novo geraria erro "Identifier has already been declared".

   Este listener é ADICIONAL ao que já existe no HTML (que só troca a
   classe hidden/visível entre as telas). Um clique agora dispara os DOIS:
   o HTML troca a tela na hora, e este aqui busca dados frescos do banco
   em paralelo — assim você nunca vê um KPI desatualizado ao entrar na aba.
   -------------------------------------------------------------------------- */
const btnMenuDashboards = document.getElementById('btn-menu-dashboards');
btnMenuDashboards.addEventListener('click', () => {
    carregarRegistros();
});

const btnMenuConsulta = document.getElementById('btn-menu-consulta');
btnMenuConsulta.addEventListener('click', () => {
    carregarRegistros();
});


/* --------------------------------------------------------------------------
   CAMADA 10 — Aba "Consultar Inspeções": filtros, tabela paginada,
   editar e excluir registros.

   Esta aba tem seus PRÓPRIOS filtros, separados dos filtros do Painel de
   KPIs — não são em cascata (mais simples de propósito, pra não duplicar
   toda a complexidade da Camada 8). Se um campo vier vazio, esse critério
   não filtra nada ("mostrar todos se não filtrar").
   -------------------------------------------------------------------------- */

const TAMANHO_PAGINA_CONSULTA = 25;
let registrosFiltradosConsulta = [];
let paginaAtualConsulta = 0;

function obterValoresFiltroConsulta() {
    return {
        dataInicio: consultaFiltroDataInicio.value,
        dataFim: consultaFiltroDataFim.value,
        op: consultaFiltroOp.value.trim().toLowerCase(),
        inspetor: consultaFiltroInspetor.value.trim().toLowerCase(),
        status: consultaFiltroStatus.value,
        peca: consultaFiltroPeca.value,
        gdt: consultaFiltroGdt.value,
    };
}

function registroPassaFiltroConsulta(r, valores) {
    const dataRegistro = r.data_hora_inspecao ? r.data_hora_inspecao.slice(0, 10) : '';

    if (valores.dataInicio && dataRegistro < valores.dataInicio) return false;
    if (valores.dataFim && dataRegistro > valores.dataFim) return false;
    if (valores.op && !r.ordem_fabricacao.toLowerCase().includes(valores.op)) return false;
    if (valores.inspetor && !r.nome_inspetor.toLowerCase().includes(valores.inspetor)) return false;
    if (valores.status && r.status !== valores.status) return false;
    if (valores.peca && r.codigo_peca !== valores.peca) return false;
    if (valores.gdt && r.caracteristica_gdt !== valores.gdt) return false;

    return true;
}

// Preenche os <select> de Peça e GD&T desta aba com os valores reais que
// existem na tabela (versão simples, não recalcula em cascata como a
// Camada 8 — populada uma vez a cada carregarRegistros())
function popularSelectsConsulta(lista) {
    const pecas = [...new Set(lista.map((r) => r.codigo_peca))].sort();
    const gdts = [...new Set(lista.map((r) => r.caracteristica_gdt))].sort();

    consultaFiltroPeca.innerHTML =
        '<option value="">Todas</option>' +
        pecas.map((p) => `<option value="${p}">${p}</option>`).join('');

    consultaFiltroGdt.innerHTML =
        '<option value="">Todas</option>' +
        gdts.map((g) => `<option value="${g}">${g}</option>`).join('');
}

function atualizarResumoConsulta() {
    const total = registros.length;
    const filtrados = registrosFiltradosConsulta.length;

    consultaResumoEl.textContent =
        filtrados === total
            ? `Mostrando todos os ${total} registros.`
            : `Mostrando ${filtrados} de ${total} registros (filtro aplicado).`;
}

function aplicarFiltrosConsulta(evento) {
    if (evento) evento.preventDefault();

    const valores = obterValoresFiltroConsulta();

    // Mesma regra de negócio da Camada 8: Data Fim não pode vir antes de Data Início
    if (valores.dataInicio && valores.dataFim && valores.dataFim < valores.dataInicio) {
        alert('A Data Fim não pode ser anterior à Data Início. Ajuste o período antes de aplicar o filtro.');
        return;
    }

    registrosFiltradosConsulta = registros.filter((r) => registroPassaFiltroConsulta(r, valores));
    paginaAtualConsulta = 0; // toda vez que o filtro muda, volta pra primeira página
    renderizarTabelaConsulta();
    atualizarResumoConsulta();
}

function limparFiltrosConsulta() {
    consultaFormFiltros.reset();
    registrosFiltradosConsulta = registros;
    paginaAtualConsulta = 0;
    renderizarTabelaConsulta();
    atualizarResumoConsulta();
}

consultaFormFiltros.addEventListener('submit', aplicarFiltrosConsulta);
consultaBtnLimpar.addEventListener('click', limparFiltrosConsulta);

// Pequena "etiqueta" colorida de status, reaproveitada na tabela
function badgeStatusHtml(status) {
    const cores = {
        CONFORME: 'bg-green-100 text-green-700',
        RETRABALHO: 'bg-yellow-100 text-yellow-700',
        SUCATA: 'bg-red-100 text-red-700',
    };
    const classe = cores[status] || 'bg-slate-100 text-slate-600';
    return `<span class="px-2 py-1 rounded-full text-xs font-semibold ${classe}">${status}</span>`;
}

function renderizarTabelaConsulta() {
    const inicio = paginaAtualConsulta * TAMANHO_PAGINA_CONSULTA;
    const fim = inicio + TAMANHO_PAGINA_CONSULTA;
    const paginaDeRegistros = registrosFiltradosConsulta.slice(inicio, fim);

    if (paginaDeRegistros.length === 0) {
        consultaTabelaCorpo.innerHTML =
            '<tr><td colspan="10" class="p-6 text-center text-slate-400">Nenhum registro encontrado para esses filtros.</td></tr>';
    } else {
        // .map(...).join('') monta o HTML de todas as linhas de uma vez só,
        // e escrevemos no DOM uma única vez (bem mais rápido que fazer
        // um appendChild por linha, dentro de um loop)
        consultaTabelaCorpo.innerHTML = paginaDeRegistros
            .map((r) => {
                const dataFormatada = r.data_hora_inspecao
                    ? formatarDataBR(r.data_hora_inspecao.slice(0, 10))
                    : '-';

                return `
                    <tr class="hover:bg-slate-50">
                        <td class="p-3">${r.ordem_fabricacao}</td>
                        <td class="p-3">${r.numero_aeronave}</td>
                        <td class="p-3">${r.codigo_peca}</td>
                        <td class="p-3">${r.caracteristica_gdt}</td>
                        <td class="p-3">${r.valor_nominal}</td>
                        <td class="p-3">${r.valor_medido}</td>
                        <td class="p-3">${badgeStatusHtml(r.status)}</td>
                        <td class="p-3">${dataFormatada}</td>
                        <td class="p-3">${r.nome_inspetor}</td>
                        <td class="p-3 text-center whitespace-nowrap">
                            <button type="button" class="btn-editar-linha text-blue-600 hover:underline mr-3" data-id="${r.id}">Editar</button>
                            <button type="button" class="btn-excluir-linha text-red-600 hover:underline" data-id="${r.id}">Excluir</button>
                        </td>
                    </tr>
                `;
            })
            .join('');
    }

    const totalPaginas = Math.max(1, Math.ceil(registrosFiltradosConsulta.length / TAMANHO_PAGINA_CONSULTA));
    consultaInfoPagina.textContent = `Página ${paginaAtualConsulta + 1} de ${totalPaginas} — ${registrosFiltradosConsulta.length} registro(s)`;

    consultaBtnAnterior.disabled = paginaAtualConsulta === 0;
    consultaBtnProxima.disabled = paginaAtualConsulta >= totalPaginas - 1;
}

consultaBtnAnterior.addEventListener('click', () => {
    if (paginaAtualConsulta > 0) {
        paginaAtualConsulta -= 1;
        renderizarTabelaConsulta();
    }
});

consultaBtnProxima.addEventListener('click', () => {
    const totalPaginas = Math.ceil(registrosFiltradosConsulta.length / TAMANHO_PAGINA_CONSULTA);
    if (paginaAtualConsulta < totalPaginas - 1) {
        paginaAtualConsulta += 1;
        renderizarTabelaConsulta();
    }
});

// EVENT DELEGATION: em vez de colocar um addEventListener em cada botão
// "Editar"/"Excluir" de cada linha (o que exigiria refazer isso toda vez
// que a tabela é redesenhada), colocamos UM listener no <tbody> inteiro.
// Cliques em qualquer botão dentro dele "borbulham" até aqui, e
// evento.target.closest('button') identifica qual botão foi clicado.
consultaTabelaCorpo.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button');
    if (!botao) return;

    const id = botao.dataset.id;
    const registro = registrosFiltradosConsulta.find((r) => String(r.id) === id);
    if (!registro) return;

    if (botao.classList.contains('btn-editar-linha')) {
        abrirModalEditar(registro);
    } else if (botao.classList.contains('btn-excluir-linha')) {
        abrirModalExcluir(registro);
    }
});


/* --------------------------------------------------------------------------
   Modal de EDIÇÃO
   -------------------------------------------------------------------------- */
let idRegistroEmEdicao = null;

function abrirModalEditar(registro) {
    idRegistroEmEdicao = registro.id;

    document.getElementById('editar-op').value = registro.ordem_fabricacao;
    document.getElementById('editar-aeronave').value = registro.numero_aeronave;
    document.getElementById('editar-peca').value = registro.codigo_peca;
    document.getElementById('editar-gdt').value = registro.caracteristica_gdt;
    document.getElementById('editar-nominal').value = registro.valor_nominal;
    document.getElementById('editar-medido').value = registro.valor_medido;
    document.getElementById('editar-tol-sup').value = registro.tolerancia_superior;
    document.getElementById('editar-tol-inf').value = registro.tolerancia_inferior;
    document.getElementById('editar-status').value = registro.status;
    document.getElementById('editar-motivo').value = registro.motivo_nao_conformidade;
    document.getElementById('editar-registro-inspetor').value = registro.registro_inspetor;
    document.getElementById('editar-nome-inspetor').value = registro.nome_inspetor;

    modalEditar.classList.remove('hidden');
}

function fecharModalEditar() {
    modalEditar.classList.add('hidden');
    idRegistroEmEdicao = null;
}

editarBtnCancelar.addEventListener('click', fecharModalEditar);

formEditar.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const dadosAtualizados = Object.fromEntries(new FormData(formEditar));
    dadosAtualizados.valor_nominal = parseFloat(dadosAtualizados.valor_nominal);
    dadosAtualizados.valor_medido = parseFloat(dadosAtualizados.valor_medido);
    dadosAtualizados.tolerancia_superior = parseFloat(dadosAtualizados.tolerancia_superior);
    dadosAtualizados.tolerancia_inferior = parseFloat(dadosAtualizados.tolerancia_inferior);

    const botaoSalvar = formEditar.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando...';

    const { error } = await supabaseClient
        .from(NOME_TABELA)
        .update(dadosAtualizados)
        .eq('id', idRegistroEmEdicao);

    botaoSalvar.disabled = false;
    botaoSalvar.textContent = 'Salvar Alterações';

    if (error) {
        console.error('Erro ao atualizar registro:', error);
        alert(
            `Erro ao salvar alterações: ${error.message}\n\n` +
            'Se a mensagem mencionar "row-level security", falta habilitar a ' +
            'política de UPDATE no Supabase (veja o SQL de RLS que te passei).',
        );
        return;
    }

    fecharModalEditar();
    await carregarRegistros(); // recarrega tudo, já que um registro mudou no banco
});


/* --------------------------------------------------------------------------
   Modal de EXCLUSÃO
   -------------------------------------------------------------------------- */
let idRegistroParaExcluir = null;

function abrirModalExcluir(registro) {
    idRegistroParaExcluir = registro.id;

    const dataFormatada = registro.data_hora_inspecao
        ? formatarDataBR(registro.data_hora_inspecao.slice(0, 10))
        : 'data não informada';

    excluirDetalhesEl.textContent =
        `OP ${registro.ordem_fabricacao} — ${registro.codigo_peca} (${registro.caracteristica_gdt}) — ` +
        `Status ${registro.status} — inspecionado em ${dataFormatada} por ${registro.nome_inspetor}.`;

    modalExcluir.classList.remove('hidden');
}

function fecharModalExcluir() {
    modalExcluir.classList.add('hidden');
    idRegistroParaExcluir = null;
}

excluirBtnCancelar.addEventListener('click', fecharModalExcluir);

excluirBtnConfirmar.addEventListener('click', async () => {
    excluirBtnConfirmar.disabled = true;
    excluirBtnConfirmar.textContent = 'Excluindo...';

    const { error } = await supabaseClient
        .from(NOME_TABELA)
        .delete()
        .eq('id', idRegistroParaExcluir);

    excluirBtnConfirmar.disabled = false;
    excluirBtnConfirmar.textContent = 'Sim, excluir';

    if (error) {
        console.error('Erro ao excluir registro:', error);
        alert(
            `Erro ao excluir: ${error.message}\n\n` +
            'Se a mensagem mencionar "row-level security", falta habilitar a ' +
            'política de DELETE no Supabase (veja o SQL de RLS que te passei).',
        );
        return;
    }

    fecharModalExcluir();
    await carregarRegistros();
});


/* --------------------------------------------------------------------------
   Inicialização
   Em vez de começar com o dashboard zerado, buscamos no Supabase os
   registros que você já carregou na tabela e populamos tudo com dados
   reais assim que a página abre.
   -------------------------------------------------------------------------- */
atualizarCampoMotivo();
carregarRegistros(); // busca no banco e chama atualizarDashboard() internamente
