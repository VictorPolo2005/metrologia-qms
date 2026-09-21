/* ==========================================================================
   TABELA.JS — Aba 3: Consultar Inspeções
   ==========================================================================

   Responsabilidade:
     - Popular os selects de Peça e GD&T com valores reais do banco
     - Ler filtros próprios desta aba (independentes do dashboard)
     - Filtrar os registros do api.js
     - Renderizar a tabela paginada (25 por página)
     - Atualizar resumo e habilitar/desabilitar paginação
     - Reagir ao evento 'atualizados' do api.js

   Filtros no estilo Power BI:
     - Reativos (aplicam enquanto o usuário digita/escolhe)
     - Inputs de texto com DEBOUNCE de 300ms (evita rodar a cada letra)
     - Datas com min/max calculados a partir dos dados reais

   Este arquivo NÃO:
     - fala com o Supabase diretamente
     - edita nem exclui registros (implementação futura)
     - compartilha estado com dashboards.js (filtros independentes)
   ========================================================================== */

import { api } from './api.js';


/* --------------------------------------------------------------------------
   1. Constantes
   -------------------------------------------------------------------------- */
const PAGINA_TAMANHO = 25;  // registros por página
const DEBOUNCE_MS    = 300; // espera antes de aplicar filtro de texto


/* --------------------------------------------------------------------------
   2. Referências do DOM
   -------------------------------------------------------------------------- */

// Filtros
const tabDataInicioEl   = document.getElementById('tab-filtro-data-inicio');
const tabDataFimEl      = document.getElementById('tab-filtro-data-fim');
const tabOpEl           = document.getElementById('tab-filtro-op');
const tabPecaEl         = document.getElementById('tab-filtro-peca');
const tabGdtEl          = document.getElementById('tab-filtro-gdt');
const tabStatusEl       = document.getElementById('tab-filtro-status');
const tabInspetorEl     = document.getElementById('tab-filtro-inspetor');
const tabBtnLimparEl    = document.getElementById('tab-btn-limpar');
const tabFiltroResumoEl = document.getElementById('tab-filtro-resumo');

// Tabela
const tabCorpoEl         = document.getElementById('tab-corpo');
const tabInfoRegistrosEl = document.getElementById('tab-info-registros');
const tabInfoPaginaEl    = document.getElementById('tab-info-pagina');
const tabBtnAnteriorEl   = document.getElementById('tab-btn-anterior');
const tabBtnProximaEl    = document.getElementById('tab-btn-proxima');


/* --------------------------------------------------------------------------
   3. Estado privado deste módulo
   -------------------------------------------------------------------------- */
let paginaAtual = 0;
let registrosFiltrados = [];


/* --------------------------------------------------------------------------
   4. Helpers de formatação
   -------------------------------------------------------------------------- */

// "2026-08-03" -> "03/08/2026"
function formatarDataBR(dataIso) {
    if (!dataIso) return '-';
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Etiqueta colorida de status
function badgeStatusHtml(status) {
    const cores = {
        CONFORME:   'bg-green-100 text-green-700',
        RETRABALHO: 'bg-yellow-100 text-yellow-700',
        SUCATA:     'bg-red-100 text-red-700',
    };
    const classe = cores[status] || 'bg-slate-100 text-slate-600';
    return `<span class="px-2 py-1 rounded-full text-xs font-semibold ${classe}">${status}</span>`;
}


/* --------------------------------------------------------------------------
   5. DEBOUNCE — técnica pra não disparar uma ação a cada tecla

   Imagine que o usuário digita "OP-2026" no filtro de OP. Isso são 7
   teclas. Sem debounce, a tabela filtraria 7 vezes (uma por letra),
   o que é desperdício.

   Com debounce, cada tecla CANCELA o timer anterior e agenda um novo.
   Só quando o usuário para de digitar por 300ms é que o filtro roda —
   uma vez só. Economia gigante em tabelas grandes.
   -------------------------------------------------------------------------- */
function debounce(fn, esperaMs) {
    let timerId = null;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), esperaMs);
    };
}


/* --------------------------------------------------------------------------
   6. Popular selects de Peça e GD&T com valores reais
   -------------------------------------------------------------------------- */
function popularSelectsDeFiltro() {
    const pecas = [...new Set(api.registros.map((r) => r.codigo_peca))].sort();
    const gdts  = [...new Set(api.registros.map((r) => r.caracteristica_gdt))].sort();

    // Preserva seleção atual, se ainda for válida
    const pecaAtual = tabPecaEl.value;
    tabPecaEl.innerHTML =
        '<option value="">Todas</option>' +
        pecas.map((p) => `<option value="${p}">${p}</option>`).join('');
    if (pecas.includes(pecaAtual)) tabPecaEl.value = pecaAtual;

    const gdtAtual = tabGdtEl.value;
    tabGdtEl.innerHTML =
        '<option value="">Todas</option>' +
        gdts.map((g) => `<option value="${g}">${g}</option>`).join('');
    if (gdts.includes(gdtAtual)) tabGdtEl.value = gdtAtual;
}


/* --------------------------------------------------------------------------
   7. Limites de data — min/max calculados a partir dos dados reais

   Regra de negócio: Data Fim >= Data Início. O atributo min/max é
   nativo do <input type="date"> — o navegador desabilita dias fora
   do intervalo no calendário.
   -------------------------------------------------------------------------- */
function atualizarLimitesData() {
    const datas = api.registros
        .filter((r) => r.data_hora_inspecao)
        .map((r) => r.data_hora_inspecao.slice(0, 10))
        .sort();

    if (datas.length === 0) {
        [tabDataInicioEl, tabDataFimEl].forEach((el) => {
            el.removeAttribute('min');
            el.removeAttribute('max');
        });
        return;
    }

    const dataMin = datas[0];
    const dataMax = datas[datas.length - 1];

    const inicioSel = tabDataInicioEl.value;
    const fimSel    = tabDataFimEl.value;

    tabDataInicioEl.min = dataMin;
    tabDataInicioEl.max = fimSel && fimSel < dataMax ? fimSel : dataMax;

    tabDataFimEl.min = inicioSel && inicioSel > dataMin ? inicioSel : dataMin;
    tabDataFimEl.max = dataMax;
}


/* --------------------------------------------------------------------------
   8. Aplicar filtros — devolve o subconjunto de api.registros
   -------------------------------------------------------------------------- */
function aplicarFiltros() {
    const dataInicio = tabDataInicioEl.value;
    const dataFim    = tabDataFimEl.value;
    const op         = tabOpEl.value.trim().toLowerCase();
    const peca       = tabPecaEl.value;
    const gdt        = tabGdtEl.value;
    const status     = tabStatusEl.value;
    const inspetor   = tabInspetorEl.value.trim().toLowerCase();

    return api.registros.filter((r) => {
        const dataRegistro = r.data_hora_inspecao ? r.data_hora_inspecao.slice(0, 10) : '';

        if (dataInicio && dataRegistro < dataInicio) return false;
        if (dataFim && dataRegistro > dataFim) return false;
        if (op && !r.ordem_fabricacao.toLowerCase().includes(op)) return false;
        if (peca && r.codigo_peca !== peca) return false;
        if (gdt && r.caracteristica_gdt !== gdt) return false;
        if (status && r.status !== status) return false;
        if (inspetor && !r.nome_inspetor.toLowerCase().includes(inspetor)) return false;

        return true;
    });
}


/* --------------------------------------------------------------------------
   9. Renderizar tabela
   -------------------------------------------------------------------------- */
function renderizarTabela() {
    const inicio = paginaAtual * PAGINA_TAMANHO;
    const fim = inicio + PAGINA_TAMANHO;
    const paginaDeRegistros = registrosFiltrados.slice(inicio, fim);

    if (paginaDeRegistros.length === 0) {
        tabCorpoEl.innerHTML = `
            <tr>
                <td colspan="9" class="p-6 text-center text-slate-400">
                    Nenhum registro encontrado para os filtros atuais.
                </td>
            </tr>`;
    } else {
        tabCorpoEl.innerHTML = paginaDeRegistros.map((r) => {
            const data = r.data_hora_inspecao
                ? formatarDataBR(r.data_hora_inspecao.slice(0, 10))
                : '-';

            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-3 text-slate-600">${data}</td>
                    <td class="p-3 font-medium">${r.ordem_fabricacao}</td>
                    <td class="p-3">${r.codigo_peca}</td>
                    <td class="p-3 text-slate-600">${r.caracteristica_gdt}</td>
                    <td class="p-3 text-slate-600">${r.valor_nominal}</td>
                    <td class="p-3 font-medium">${r.valor_medido}</td>
                    <td class="p-3">${badgeStatusHtml(r.status)}</td>
                    <td class="p-3 text-slate-600">${r.nome_inspetor}</td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <button type="button" disabled
                                title="Edição será implementada em uma próxima versão"
                                class="text-slate-400 cursor-not-allowed mr-3">
                            Editar
                        </button>
                        <button type="button" disabled
                                title="Exclusão será implementada em uma próxima versão"
                                class="text-slate-400 cursor-not-allowed">
                            Excluir
                        </button>
                    </td>
                </tr>`;
        }).join('');
    }
}


/* --------------------------------------------------------------------------
   10. Atualizar paginação + resumo
   -------------------------------------------------------------------------- */
function atualizarPaginacao() {
    const totalPaginas = Math.max(1, Math.ceil(registrosFiltrados.length / PAGINA_TAMANHO));

    tabInfoPaginaEl.textContent = `Página ${paginaAtual + 1} de ${totalPaginas}`;

    tabBtnAnteriorEl.disabled = paginaAtual === 0;
    tabBtnProximaEl.disabled  = paginaAtual >= totalPaginas - 1;
}

function atualizarResumo() {
    const total = api.registros.length;
    const filtrados = registrosFiltrados.length;

    tabFiltroResumoEl.textContent =
        filtrados === total
            ? `Mostrando todos os ${total} registros.`
            : `Mostrando ${filtrados} de ${total} registros (filtro aplicado).`;

    tabInfoRegistrosEl.textContent = `${filtrados} registro(s)`;
}


/* --------------------------------------------------------------------------
   11. Recalcular tudo
   -------------------------------------------------------------------------- */
function atualizarTabela(resetarPagina = false) {
    if (resetarPagina) paginaAtual = 0;

    registrosFiltrados = aplicarFiltros();

    // Se a página atual ficou vazia, recua para a última página válida
    const totalPaginas = Math.max(1, Math.ceil(registrosFiltrados.length / PAGINA_TAMANHO));
    if (paginaAtual >= totalPaginas) {
        paginaAtual = totalPaginas - 1;
    }

    renderizarTabela();
    atualizarPaginacao();
    atualizarResumo();
}


/* --------------------------------------------------------------------------
   12. Listeners reativos (estilo Power BI)
   -------------------------------------------------------------------------- */

// Inputs de texto — REATIVOS com debounce (300ms após a última tecla)
const reagirTexto = debounce(() => atualizarTabela(true), DEBOUNCE_MS);
tabOpEl.addEventListener('input', reagirTexto);
tabInspetorEl.addEventListener('input', reagirTexto);

// Datas — change (o navegador já espera fechar o calendário)
[tabDataInicioEl, tabDataFimEl].forEach((el) => {
    el.addEventListener('change', () => atualizarTabela(true));
});

// Selects — change (escolha binária, sem debounce)
[tabPecaEl, tabGdtEl, tabStatusEl].forEach((el) => {
    el.addEventListener('change', () => atualizarTabela(true));
});


/* --------------------------------------------------------------------------
   13. Botão Limpar
   -------------------------------------------------------------------------- */
tabBtnLimparEl.addEventListener('click', () => {
    tabDataInicioEl.value = '';
    tabDataFimEl.value = '';
    tabOpEl.value = '';
    tabPecaEl.value = '';
    tabGdtEl.value = '';
    tabStatusEl.value = '';
    tabInspetorEl.value = '';

    atualizarTabela(true);
});


/* --------------------------------------------------------------------------
   14. Paginação
   -------------------------------------------------------------------------- */
tabBtnAnteriorEl.addEventListener('click', () => {
    if (paginaAtual > 0) {
        paginaAtual -= 1;
        renderizarTabela();
        atualizarPaginacao();
    }
});

tabBtnProximaEl.addEventListener('click', () => {
    const totalPaginas = Math.ceil(registrosFiltrados.length / PAGINA_TAMANHO);
    if (paginaAtual < totalPaginas - 1) {
        paginaAtual += 1;
        renderizarTabela();
        atualizarPaginacao();
    }
});


/* --------------------------------------------------------------------------
   15. Reagir ao api.js
   -------------------------------------------------------------------------- */
api.addEventListener('atualizados', () => {
    popularSelectsDeFiltro();
    atualizarLimitesData();
    atualizarTabela(true);
});