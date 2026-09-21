/* ==========================================================================
   APONTAMENTO.JS — Aba 1: Registrar Inspeção
   ==========================================================================

   Responsabilidade:
     - Ouvir os campos de medição (nominal, medido, tolerâncias)
     - Calcular o status automaticamente pela regra de negócio
     - Travar/destravar o campo "Motivo" conforme o status
     - Ao submeter, chamar api.inserir() e api.carregar()
     - Limpar o formulário após salvar

   Este arquivo NÃO:
     - fala com o Supabase diretamente (usa api.inserir)
     - sabe que dashboards.js ou tabela.js existem
     - mexe em gráficos, tabela ou filtros

   Quando o submit termina com sucesso, chamamos api.carregar() e o
   api.js dispara 'atualizados' — quem quiser reagir (dashboards.js,
   tabela.js), escuta. Este módulo não precisa saber quem são.
   ========================================================================== */

import { api } from './api.js';


/* --------------------------------------------------------------------------
   1. Referências do DOM
   -------------------------------------------------------------------------- */
const formInspecao = document.getElementById('form-inspecao');

const nominalEl = document.getElementById('nominal');
const medidoEl  = document.getElementById('medido');
const tolSupEl  = document.getElementById('tol_sup');
const tolInfEl  = document.getElementById('tol_inf');

const statusEl  = document.getElementById('status');
const motivoEl  = document.getElementById('motivo');


/* --------------------------------------------------------------------------
   2. Cálculo do status (função pura — recebe números, devolve string)
   -------------------------------------------------------------------------- */
function calcularStatus(nominal, medido, tolSup, tolInf) {
    // Se algum valor ainda não foi digitado (NaN), não dá pra decidir
    if ([nominal, medido, tolSup, tolInf].some((v) => Number.isNaN(v))) {
        return null;
    }

    const limiteSuperior = nominal + tolSup;
    const limiteInferior = nominal - tolInf;

    // Dentro da faixa → CONFORME
    if (medido >= limiteInferior && medido <= limiteSuperior) {
        return 'CONFORME';
    }

    // Fora da faixa: calcula desvio e compara com 3x a tolerância
    const desvio = Math.abs(medido - nominal);
    const toleranciaDeReferencia = medido > nominal ? tolSup : tolInf;

    // Até 3x a tolerância → RETRABALHO; acima → SUCATA
    if (desvio <= toleranciaDeReferencia * 3) {
        return 'RETRABALHO';
    }
    return 'SUCATA';
}


/* --------------------------------------------------------------------------
   3. Reação em cadeia: recalcular status → atualizar campo Motivo
   -------------------------------------------------------------------------- */
function atualizarStatusAutomatico() {
    const nominal = parseFloat(nominalEl.value);
    const medido  = parseFloat(medidoEl.value);
    const tolSup  = parseFloat(tolSupEl.value);
    const tolInf  = parseFloat(tolInfEl.value);

    const statusCalculado = calcularStatus(nominal, medido, tolSup, tolInf);

    if (statusCalculado) {
        statusEl.value = statusCalculado;
        // Como mudamos o .value na mão, o evento 'change' do select não
        // dispara sozinho — então chamamos a função do Motivo manualmente.
        atualizarCampoMotivo();
    }
}

function atualizarCampoMotivo() {
    if (statusEl.value === 'CONFORME') {
        motivoEl.value = 'N/A';
        motivoEl.disabled = true;
        motivoEl.required = false;
    } else if (statusEl.value === 'RETRABALHO' || statusEl.value === 'SUCATA') {
        if (motivoEl.value === 'N/A') {
            motivoEl.value = '';
        }
        motivoEl.disabled = false;
        motivoEl.required = true;
    } else {
        motivoEl.value = 'N/A';
        motivoEl.disabled = true;
    }
}


/* --------------------------------------------------------------------------
   4. Listeners dos campos de medição + do select de status
   -------------------------------------------------------------------------- */
[nominalEl, medidoEl, tolSupEl, tolInfEl].forEach((el) => {
    el.addEventListener('input', atualizarStatusAutomatico);
});

// Se o operador mudar o status manualmente, o Motivo reage também
statusEl.addEventListener('change', atualizarCampoMotivo);


/* --------------------------------------------------------------------------
   5. Submit do formulário — insere no banco via api.js
   -------------------------------------------------------------------------- */
formInspecao.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    // Coleta todos os campos que têm name="" no HTML
    const registro = Object.fromEntries(new FormData(formInspecao));

    // Validação mínima
    if (!registro.status) {
        alert('Selecione um status antes de salvar.');
        return;
    }

    // Converte os numéricos (FormData entrega tudo como string)
    registro.valor_nominal       = parseFloat(registro.valor_nominal);
    registro.valor_medido        = parseFloat(registro.valor_medido);
    registro.tolerancia_superior = parseFloat(registro.tolerancia_superior);
    registro.tolerancia_inferior = parseFloat(registro.tolerancia_inferior);

    // Timestamp atual (o banco espera timestamptz)
    registro.data_hora_inspecao = new Date().toISOString();

    // Trava o botão enquanto salva (evita duplo clique)
    const botaoSalvar = formInspecao.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando...';

    try {
        await api.inserir(registro);

        // Sucesso: recarrega os dados do banco. Isso dispara
        // 'atualizados' no api.js — dashboard e tabela reagem sozinhos.
        await api.carregar();

        // Limpa o formulário para o próximo apontamento
        formInspecao.reset();
        atualizarCampoMotivo();

        console.log('Registro salvo com sucesso:', registro);
    } catch (erro) {
        console.error('Erro ao salvar:', erro);
        alert(`Erro ao salvar: ${erro.message}`);
    } finally {
        // finally roda mesmo em caso de erro — o botão sempre volta
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = 'Salvar Apontamento';
    }
});


/* --------------------------------------------------------------------------
   6. Estado inicial ao carregar a página
   -------------------------------------------------------------------------- */
atualizarCampoMotivo();