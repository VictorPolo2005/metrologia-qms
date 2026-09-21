/* ==========================================================================
   API.JS — Camada de acesso a dados (Supabase) + Estado compartilhado
   ==========================================================================

   Este é o ÚNICO arquivo do sistema que fala com o Supabase. Ele também é
   o dono do estado em memória (os registros vindos do banco).

   Conceitos que você vai encontrar aqui:
     - import de URL (ES Modules usando CDN)
     - classe com campos privados (#)
     - extends EventTarget (herança)
     - getters (get registros())
     - dispatchEvent (avisar quem escuta)
     - async/await
   ========================================================================== */


/* --------------------------------------------------------------------------
   1. Import da lib do Supabase como módulo ES
   --------------------------------------------------------------------------
   O "+esm" no final faz o jsdelivr servir a versão "ES Module" do pacote.
   Sem isso, o jsdelivr devolveria a versão UMD (que só funciona como
   <script> clássico, sem export).

   Importante: essa URL é a "fonte da verdade" da dependência. Se um dia
   você migrar pra bundler (Vite, Webpack), isso vira:
       import { createClient } from '@supabase/supabase-js';
   Sem mudar mais nada no resto do arquivo.
   -------------------------------------------------------------------------- */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';


/* --------------------------------------------------------------------------
   2. Configuração
   --------------------------------------------------------------------------
   Troque pelos valores do SEU projeto (Project Settings > API no painel).
   A "anon key" é segura para expor no navegador, DESDE QUE você tenha
   configurado RLS na tabela. NUNCA coloque a "service_role key" aqui.
   -------------------------------------------------------------------------- */
const SUPABASE_URL = 'https://fnoxaplrfnicutakostv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZub3hhcGxyZm5pY3V0YWtvc3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NDMyMTQsImV4cCI6MjEwNTAxOTIxNH0.mQbqXpp73S1jUmsHJTmsB9LoZKfKud7XEGMJWdQAQw4';

const NOME_TABELA = 'inspecoes_aeronauticas';

// Cliente do Supabase — criado uma vez, usado em toda a classe abaixo.
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* --------------------------------------------------------------------------
   3. A classe Api
   --------------------------------------------------------------------------
   Estende EventTarget pra poder disparar eventos ("carregando",
   "atualizados") que outros módulos vão escutar.

   Campos privados (#) — impossíveis de acessar de fora da classe:
     #registros     -> cache local dos dados vindos do banco
     #carregando    -> trava pra evitar duas buscas simultâneas
   -------------------------------------------------------------------------- */
class Api extends EventTarget {

    // Campo privado. Nem "api.#registros" nem "api.registros = []" funcionam
    // de fora — a única forma de mudar isso é por um método DESTA classe.
    #registros = [];

    // Evita que dois cliques seguidos no menu disparem duas buscas em paralelo.
    #carregando = false;


    /* ----------------------------------------------------------------------
       Getter público — forma CONTROLADA de ler o array de dentro.
       Quem usa faz "api.registros" (sem parênteses, parece propriedade).
       ---------------------------------------------------------------------- */
    get registros() {
        return this.#registros;
    }


    /* ----------------------------------------------------------------------
       4. CRUD — cada método devolve o resultado do Supabase, sem decidir
          o que fazer com erro. Quem chamou decide (alert, toast, etc.).
       ---------------------------------------------------------------------- */

    // INSERT — recebe um objeto com os campos da tabela
    async inserir(registro) {
        const { error } = await supabaseClient
            .from(NOME_TABELA)
            .insert([registro]);

        if (error) {
            throw new Error(`Erro ao inserir registro: ${error.message}`);
        }
    }

    // UPDATE por id
    async atualizar(id, dados) {
        const { error } = await supabaseClient
            .from(NOME_TABELA)
            .update(dados)
            .eq('id', id);

        if (error) {
            throw new Error(`Erro ao atualizar registro: ${error.message}`);
        }
    }

    // DELETE por id
    async excluir(id) {
        const { error } = await supabaseClient
            .from(NOME_TABELA)
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(`Erro ao excluir registro: ${error.message}`);
        }
    }


    /* ----------------------------------------------------------------------
       5. Busca paginada — o PostgREST devolve no máximo 1000 linhas por
          requisição. Buscamos em "páginas" até vir uma incompleta.
       ---------------------------------------------------------------------- */
    async #buscarTodos() {
        const TAMANHO_PAGINA = 1000;
        let todos = [];
        let pagina = 0;
        let continuar = true;

        while (continuar) {
            const inicio = pagina * TAMANHO_PAGINA;
            const fim = inicio + TAMANHO_PAGINA - 1; // .range() é inclusivo

            const { data, error } = await supabaseClient
                .from(NOME_TABELA)
                .select('*')
                .order('data_hora_inspecao', { ascending: false })
                .range(inicio, fim);

            if (error) {
                throw new Error(`Erro ao carregar registros: ${error.message}`);
            }

            todos = todos.concat(data);
            this.dispatchEvent(new CustomEvent('progresso', {
            detail: { carregados: todos.length, paginaCompleta: data.length === TAMANHO_PAGINA }
        }));
            continuar = data.length === TAMANHO_PAGINA;
            pagina++;
        }

        return todos;
    }


    /* ----------------------------------------------------------------------
       6. carregar() — o método público que ORQUESTRA:
          a) avisa que vai começar ('carregando')
          b) busca no banco
          c) atualiza o cache interno
          d) avisa que terminou ('atualizados')

       É o coração da comunicação entre módulos. Ninguém "chama" outro
       arquivo: quem quiser saber que os dados mudaram, escuta o evento.
       ---------------------------------------------------------------------- */
    async carregar() {
        // Evita duas buscas simultâneas (ex: cliques rápidos no menu)
        if (this.#carregando) return;
        this.#carregando = true;

        // Avisa "vou começar". Quem quiser mostrar "carregando..." escuta.
        this.dispatchEvent(new CustomEvent('carregando'));

        try {
            const dados = await this.#buscarTodos();
            this.#registros = dados;

            // Avisa "terminei", mandando os registros dentro de detail.
            this.dispatchEvent(new CustomEvent('atualizados', {
                detail: { registros: dados },
            }));
        } finally {
            // finally roda mesmo se der erro no try acima
            this.#carregando = false;
        }
    }
}


/* --------------------------------------------------------------------------
   7. Export
   --------------------------------------------------------------------------
   Exportamos uma INSTÂNCIA única (singleton). Isso garante que todos os
   módulos compartilhem o MESMO objeto Api — mesma lista de registros,
   mesmos eventos. Se exportássemos a classe, cada importador faria
   "new Api()" e teria sua própria cópia isolada.
   -------------------------------------------------------------------------- */
export const api = new Api();