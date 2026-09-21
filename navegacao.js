/* ==========================================================================
   NAVEGACAO.JS — Troca de abas (SPA simples)
   ==========================================================================
   ... comentários do cabeçalho ...
   ========================================================================== */

import { api } from './api.js';

/* ==========================================================================
   NAVEGACAO.JS — Troca de abas (SPA simples)
   ==========================================================================

   Responsabilidade única: escutar cliques nos 3 botões do menu superior e
   alternar as classes CSS (hidden / visível) entre as 3 telas.

   Este arquivo NÃO:
     - fala com o Supabase
     - conhece o api.js
     - sabe o que é um KPI, um filtro ou um gráfico
     - mexe em nenhum dado

   Ele só troca "qual <section> está visível". Nada mais.

   Sobre o "document.getElementById" sem DOMContentLoaded:
   quando o HTML carrega <script type="module" src="...">, o navegador
   ADIA a execução do módulo até o HTML inteiro ter sido parseado. Isso
   significa que quando este arquivo rodar, todos os elementos já existem.
   Não precisa (nem deve) envolver em DOMContentLoaded.
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. Mapa de abas
   --------------------------------------------------------------------------
   Cada item liga um BOTÃO a uma TELA. Se um dia você adicionar uma 4ª
   aba, basta acrescentar um item aqui — o resto do código já funciona
   pra qualquer quantidade de abas.
   -------------------------------------------------------------------------- */
const abas = [
    {
        btn: document.getElementById('btn-menu-apontamento'),
        tela: document.getElementById('tela-apontamento'),
    },
    {
        btn: document.getElementById('btn-menu-dashboards'),
        tela: document.getElementById('tela-dashboards'),
    },
    {
        btn: document.getElementById('btn-menu-tabela'),      
        tela: document.getElementById('tela-tabela'), 
    },
];


/* --------------------------------------------------------------------------
   2. Classe CSS do botão ativo vs inativo
   --------------------------------------------------------------------------
   Guardamos as strings em constantes pra não espalhar "mágica" pelo código.
   Se um dia você quiser mudar a cor do botão ativo, muda só aqui.
   -------------------------------------------------------------------------- */
const CLASSE_BTN_ATIVO = 'bg-blue-600';
const CLASSE_BTN_INATIVO = 'text-slate-300';
const CLASSE_BTN_HOVER = ['hover:bg-slate-700', 'hover:text-white'];


/* --------------------------------------------------------------------------
   3. alterarAba — a única lógica de verdade deste arquivo
   --------------------------------------------------------------------------
   Recebe a <section> que deve ficar visível. Para cada par (botão, tela):
     - se for a tela alvo: remove 'hidden', marca botão como ativo
     - se não for:         adiciona 'hidden', marca botão como inativo
   -------------------------------------------------------------------------- */
function alterarAba(telaAlvo) {
    abas.forEach(({ btn, tela }) => {
        const ativa = tela === telaAlvo;

        // Mostra/esconde a tela
        tela.classList.toggle('hidden', !ativa);

        // Pinta o botão correspondente
        btn.classList.toggle(CLASSE_BTN_ATIVO, ativa);
        btn.classList.toggle(CLASSE_BTN_INATIVO, !ativa);

        // Remove/adiciona o efeito de hover (só faz sentido em botão inativo)
        if (ativa) {
            btn.classList.remove(...CLASSE_BTN_HOVER);
        } else {
            btn.classList.add(...CLASSE_BTN_HOVER);
        }
    });
}


/* --------------------------------------------------------------------------
   4. iniciar() — liga os eventos. É a ÚNICA coisa exportada.
   --------------------------------------------------------------------------
   Quem chama essa função (o api.js via app.js, ou um futuro orquestrador)
   decide QUANDO a navegação entra em ação. Este módulo não se auto-liga —
   ele fica esperando alguém chamar.
   -------------------------------------------------------------------------- */
export function iniciar() {
    abas.forEach(({ btn, tela }) => {
        btn.addEventListener('click', () => alterarAba(tela));
    });
}

/* --------------------------------------------------------------------------
   5. Overlay de carregamento — feedback visual enquanto busca do banco

   Escuta 3 eventos do api.js:
     - 'carregando'  → mostra o overlay e reseta a barra
     - 'progresso'   → atualiza a barra com a contagem atual
     - 'atualizados' → esconde o overlay
   -------------------------------------------------------------------------- */

const overlayEl      = document.getElementById('loading-overlay');
const loadingBarEl   = document.getElementById('loading-bar');
const loadingStatsEl = document.getElementById('loading-stats');

let estimativaTotal = 0;

function mostrarOverlay() {
    estimativaTotal = 0;
    loadingBarEl.style.width = '0%';
    loadingStatsEl.textContent = 'Iniciando busca...';
    overlayEl.classList.remove('hidden');
}

function atualizarProgresso({ carregados, paginaCompleta }) {
    // Estimativa: se a última página veio cheia, ainda tem mais
    const minimoEstimado = paginaCompleta ? carregados + 1000 : carregados;
    if (minimoEstimado > estimativaTotal) {
        estimativaTotal = minimoEstimado;
    }

    const pct = estimativaTotal > 0
        ? Math.min(95, Math.round((carregados / estimativaTotal) * 100))
        : 0;

    loadingBarEl.style.width = `${pct}%`;

    const carregadosFmt = carregados.toLocaleString('pt-BR');
    const totalFmt = estimativaTotal.toLocaleString('pt-BR');

    if (paginaCompleta) {
        loadingStatsEl.textContent =
            `Carregando ${carregadosFmt} de ~${totalFmt} registros (${pct}%)`;
    } else {
        loadingStatsEl.textContent =
            `Carregados ${carregadosFmt} registros (100%)`;
    }
}

function esconderOverlay() {
    loadingBarEl.style.width = '100%';
    setTimeout(() => {
        overlayEl.classList.add('hidden');
    }, 250);
}

api.addEventListener('carregando', mostrarOverlay);
api.addEventListener('progresso', (e) => atualizarProgresso(e.detail));
api.addEventListener('atualizados', esconderOverlay);