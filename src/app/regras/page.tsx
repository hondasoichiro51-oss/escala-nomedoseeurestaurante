"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Configuracao, type Regra, type Turno } from "@/lib/tipos";
import { DIAS_SEMANA } from "@/lib/datas";
import { CHAVE_FECHAR_ABRIR, CHAVE_FOLGAS, lerConfiguracoes, nomeDoDia } from "@/lib/regras";

type NovaRegra = { turnoId: string; dia: string; funcao: string; minimo: number };

export default function Regras() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [folgas, setFolgas] = useState(1);
  const [bloquear, setBloquear] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState<NovaRegra | null>(null);

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setErro("O banco de dados não está configurado. Veja a tela Início.");
      setCarregando(false);
      return;
    }
    const db = supabase();
    const [t, r, c] = await Promise.all([
      db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
      db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
      db.from("configuracoes").select("chave, valor"),
    ]);
    const falha = t.error ?? r.error ?? c.error;
    if (falha) {
      setErro(`Não foi possível carregar as regras: ${falha.message}`);
    } else {
      setErro(null);
      setTurnos(t.data as Turno[]);
      setRegras(r.data as Regra[]);
      const conf = lerConfiguracoes(c.data as Configuracao[]);
      setFolgas(conf.folgasMinimas);
      setBloquear(conf.bloquearFecharEAbrir);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  /** Executa uma gravação no banco, mostra o erro se houver e recarrega. */
  async function gravar(acao: () => PromiseLike<{ error: { message: string } | null }>) {
    setOcupado(true);
    setErro(null);
    const { error } = await acao();
    if (error) setErro(`Não foi possível salvar: ${error.message}`);
    await carregar();
    setOcupado(false);
  }

  function salvarConfiguracao(chave: string, valor: string) {
    return gravar(() => supabase().from("configuracoes").upsert({ chave, valor }));
  }

  function mudarMinimo(regra: Regra, minimo: number) {
    if (minimo < 0) return;
    return gravar(() => supabase().from("regras").update({ minimo }).eq("id", regra.id));
  }

  function remover(regra: Regra) {
    if (!confirm("Remover esta regra?")) return;
    return gravar(() => supabase().from("regras").delete().eq("id", regra.id));
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova) return;
    const dia = nova.dia === "" ? null : Number(nova.dia);
    // Se já existe regra para o mesmo turno, dia e função, só atualiza o mínimo.
    const existente = regras.find(
      (r) => r.turno_id === nova.turnoId && r.dia_semana === dia && r.funcao === nova.funcao,
    );
    await gravar(() =>
      existente
        ? supabase().from("regras").update({ minimo: nova.minimo }).eq("id", existente.id)
        : supabase()
            .from("regras")
            .insert({ turno_id: nova.turnoId, dia_semana: dia, funcao: nova.funcao, minimo: nova.minimo }),
    );
    setNova(null);
  }

  // Ordena: turno, depois "todos os dias" antes dos dias específicos, depois função.
  const ordemTurno = (id: string) => turnos.find((t) => t.id === id)?.ordem ?? 0;
  const ordenadas = [...regras].sort(
    (a, b) =>
      ordemTurno(a.turno_id) - ordemTurno(b.turno_id) ||
      (a.dia_semana ?? -1) - (b.dia_semana ?? -1) ||
      a.funcao.localeCompare(b.funcao),
  );

  if (carregando) return <p className="text-neutral-600">Carregando regras...</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Regras da casa</h1>
        <p className="mt-1 text-neutral-700">
          A Escala da semana confere estas regras e mostra alertas em vermelho. As mudanças
          valem na hora.
        </p>
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      <section className="cartao space-y-3">
        <h2 className="text-lg font-semibold">Folgas por semana</h2>
        <p className="text-sm text-neutral-600">
          Cada funcionário precisa de pelo menos este número de dias sem trabalhar na semana.
          Use 0 para não conferir.
        </p>
        <div className="flex items-center gap-3">
          <button
            className="botao-secundario w-14"
            disabled={ocupado || folgas <= 0}
            onClick={() => salvarConfiguracao(CHAVE_FOLGAS, String(folgas - 1))}
            aria-label="Diminuir folgas"
          >
            −
          </button>
          <span className="w-12 text-center text-2xl font-bold">{folgas}</span>
          <button
            className="botao-secundario w-14"
            disabled={ocupado || folgas >= 7}
            onClick={() => salvarConfiguracao(CHAVE_FOLGAS, String(folgas + 1))}
            aria-label="Aumentar folgas"
          >
            +
          </button>
        </div>
      </section>

      <section className="cartao space-y-3">
        <h2 className="text-lg font-semibold">Fechar e abrir no dia seguinte</h2>
        <p className="text-sm text-neutral-600">
          Quando ligado, avisa se alguém trabalha no último turno de um dia e no primeiro turno
          do dia seguinte.
        </p>
        <button
          className={bloquear ? "botao w-full" : "botao-secundario w-full"}
          disabled={ocupado}
          onClick={() => salvarConfiguracao(CHAVE_FECHAR_ABRIR, String(!bloquear))}
        >
          {bloquear ? "Ligado: não pode fechar e abrir" : "Desligado: pode fechar e abrir"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mínimo de pessoas por turno</h2>
        <p className="text-sm text-neutral-600">
          Uma regra de um dia específico (ex.: Sexta) vale no lugar da regra de &quot;Todos os
          dias&quot; para a mesma função.
        </p>

        {!nova && turnos.length > 0 && (
          <button
            className="botao w-full"
            onClick={() =>
              setNova({ turnoId: turnos[0].id, dia: "", funcao: FUNCOES_PADRAO[0], minimo: 1 })
            }
          >
            + Adicionar regra de mínimo
          </button>
        )}

        {nova && (
          <form onSubmit={adicionar} className="cartao space-y-3">
            <h3 className="font-semibold">Nova regra</h3>
            <label className="block">
              <span className="mb-1 block font-medium">Turno</span>
              <select
                className="campo"
                value={nova.turnoId}
                onChange={(e) => setNova({ ...nova, turnoId: e.target.value })}
              >
                {turnos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Dia</span>
              <select
                className="campo"
                value={nova.dia}
                onChange={(e) => setNova({ ...nova, dia: e.target.value })}
              >
                <option value="">Todos os dias</option>
                {DIAS_SEMANA.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Função</span>
              <select
                className="campo"
                value={nova.funcao}
                onChange={(e) => setNova({ ...nova, funcao: e.target.value })}
              >
                {FUNCOES_PADRAO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Mínimo de pessoas</span>
              <input
                className="campo"
                type="number"
                inputMode="numeric"
                min={0}
                value={nova.minimo}
                onChange={(e) => setNova({ ...nova, minimo: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="botao-secundario" onClick={() => setNova(null)}>
                Cancelar
              </button>
              <button type="submit" className="botao" disabled={ocupado}>
                Salvar
              </button>
            </div>
          </form>
        )}

        {ordenadas.length === 0 && (
          <p className="text-neutral-600">Nenhuma regra de mínimo cadastrada.</p>
        )}
        {ordenadas.map((r) => (
          <div key={r.id} className="cartao space-y-3">
            <div>
              <p className="font-semibold">
                {turnos.find((t) => t.id === r.turno_id)?.nome ?? "Turno"} · {nomeDoDia(r.dia_semana)}
              </p>
              <p className="text-neutral-700">{r.funcao}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="botao-secundario w-14"
                disabled={ocupado || r.minimo <= 0}
                onClick={() => mudarMinimo(r, r.minimo - 1)}
                aria-label="Diminuir mínimo"
              >
                −
              </button>
              <span className="w-10 text-center text-2xl font-bold">{r.minimo}</span>
              <button
                className="botao-secundario w-14"
                disabled={ocupado}
                onClick={() => mudarMinimo(r, r.minimo + 1)}
                aria-label="Aumentar mínimo"
              >
                +
              </button>
              <button
                className="botao-secundario ml-auto"
                disabled={ocupado}
                onClick={() => remover(r)}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
