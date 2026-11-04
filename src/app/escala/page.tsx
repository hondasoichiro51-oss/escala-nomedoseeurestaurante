"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Configuracao, Escala, Funcionario, Regra, Turno } from "@/lib/tipos";
import { type Alerta, type ConfigRegras, lerConfiguracoes, verificarEscala } from "@/lib/regras";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

type CelulaAberta = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigRegras | null>(null);

  const dias = diasDaSemana(segunda);
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) {
        setErro("O banco de dados não está configurado. Veja a tela Início.");
        setCarregando(false);
        return;
      }
      const db = supabase();
      const [t, f, r, c] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
        db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
        db.from("configuracoes").select("chave, valor"),
      ]);
      if (t.error || f.error) {
        setErro(`Não foi possível carregar os dados: ${(t.error ?? f.error)?.message}`);
        return;
      }
      setTurnos(t.data as Turno[]);
      setFuncionarios(f.data as Funcionario[]);
      if (r.error || c.error) {
        setErro(`Não foi possível carregar as regras: ${(r.error ?? c.error)?.message}`);
        return;
      }
      setConfig({
        minimos: r.data as Regra[],
        ...lerConfiguracoes(c.data as Configuracao[]),
      });
    }
    carregarBase();
  }, []);

  // Escala da semana: recarrega ao trocar de semana.
  // Inclui o domingo anterior e a segunda seguinte para a regra "fechar e abrir".
  const carregarSemana = useCallback(async (inicio: string) => {
    if (!variaveisConfiguradas()) return;
    setCarregando(true);
    const { data, error } = await supabase()
      .from("escalas")
      .select("id, data, turno_id, funcionario_id")
      .gte("data", somarDias(inicio, -1))
      .lte("data", somarDias(inicio, 7));
    if (error) setErro(`Não foi possível carregar a escala: ${error.message}`);
    else setEscalas(data as Escala[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarSemana(segunda);
  }, [segunda, carregarSemana]);

  const alertas = useMemo<Alerta[]>(
    () =>
      config ? verificarEscala({ dias, turnos, funcionarios, escalas, config }) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, segunda, turnos, funcionarios, escalas],
  );

  function alertasNa(data: string, turnoId: string) {
    return alertas.filter((a) => a.data === data && a.turnoId === turnoId);
  }

  function escaladosNa(data: string, turnoId: string): Funcionario[] {
    const ids = escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => e.funcionario_id);
    return funcionarios.filter((f) => ids.includes(f.id));
  }

  async function alternar(funcionario: Funcionario) {
    if (!aberta) return;
    const { data, turno } = aberta;
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id,
    );
    setSalvandoId(funcionario.id);
    setErro(null);
    const db = supabase().from("escalas");
    if (existente) {
      const { error } = await db.delete().eq("id", existente.id);
      if (error) setErro(`Não foi possível tirar da escala: ${error.message}`);
      else setEscalas((lista) => lista.filter((e) => e.id !== existente.id));
    } else {
      const { data: nova, error } = await db
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível colocar na escala: ${error.message}`);
      else setEscalas((lista) => [...lista, nova as Escala]);
    }
    setSalvandoId(null);
  }

  const ultimoDia = dias[6];
  const tituloSemana = `${diaMes(segunda)} a ${diaMes(ultimoDia)}/${paraData(ultimoDia).getFullYear()}`;

  // Na lista da célula aparecem os ativos e também inativos que já estavam escalados.
  const opcoes = aberta
    ? funcionarios.filter(
        (f) =>
          f.ativo ||
          escalas.some(
            (e) =>
              e.data === aberta.data &&
              e.turno_id === aberta.turno.id &&
              e.funcionario_id === f.id,
          ),
      )
    : [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">Semana de {tituloSemana}</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="botao-secundario" onClick={() => setSegunda(somarDias(segunda, -7))}>
            ◀ Semana anterior
          </button>
          <button className="botao-secundario" onClick={() => setSegunda(somarDias(segunda, 7))}>
            Próxima semana ▶
          </button>
        </div>
        {segunda !== inicioDaSemana(hoje) && (
          <button className="botao w-full" onClick={() => setSegunda(inicioDaSemana(hoje))}>
            Voltar para esta semana
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {config && !carregando && (
        <div
          className={`cartao ${alertas.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}
        >
          <p className={`text-lg font-semibold ${alertas.length > 0 ? "text-red-800" : "text-green-800"}`}>
            {alertas.length === 0
              ? "✓ Nenhum alerta nesta semana"
              : `⚠ ${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"} nesta semana`}
          </p>
          {alertas.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-red-800">
              {alertas.map((a, i) => {
                const turno = turnos.find((t) => t.id === a.turnoId);
                return (
                  <li key={i}>
                    • {a.data && turno ? `${rotuloDia(a.data)} · ${turno.nome}: ` : ""}
                    {a.mensagem}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/regras" className="mt-2 inline-block text-sm underline">
            Ver ou mudar as regras
          </Link>
        </div>
      )}

      <p className="text-sm text-neutral-600">
        Toque em uma célula para escolher quem trabalha. Arraste a grade para o lado para ver
        todos os dias.
      </p>

      <div className={`overflow-x-auto rounded-3xl border border-stone-200/70 bg-white shadow-sm ${carregando ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-24 border-b border-r border-neutral-200 bg-white p-2 text-sm">
                Turno
              </th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-32 border-b border-neutral-200 p-2 text-center text-sm ${
                    d === hoje ? "bg-amber-100" : ""
                  }`}
                >
                  {rotuloDia(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <th className="sticky left-0 z-[1] border-r border-b border-neutral-200 bg-white p-2 align-top">
                  <span className="block font-semibold">{t.nome}</span>
                  <span className="block text-xs font-normal text-neutral-600">
                    {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const pessoas = escaladosNa(d, t.id);
                  const avisos = alertasNa(d, t.id);
                  return (
                    <td key={d} className="border-b border-neutral-200 p-1 align-top">
                      <button
                        className={`flex min-h-24 w-full flex-col items-start gap-1 rounded-xl border p-2 text-left text-sm ${
                          avisos.length > 0
                            ? "border-red-400 bg-red-50 active:bg-red-100"
                            : "border-dashed border-neutral-300 active:bg-neutral-100"
                        }`}
                        onClick={() => setAberta({ data: d, turno: t })}
                        disabled={carregando}
                      >
                        {pessoas.length === 0 ? (
                          <span className="text-neutral-400">+ Escolher</span>
                        ) : (
                          pessoas.map((p) => (
                            <span key={p.id} className="leading-tight">
                              {p.nome.split(" ")[0]}
                              <span className="block text-xs text-neutral-500">{p.funcao}</span>
                            </span>
                          ))
                        )}
                        {avisos.map((a, i) => (
                          <span key={i} className="text-xs font-semibold leading-tight text-red-700">
                            ⚠ {a.mensagem}
                          </span>
                        ))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberta && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setAberta(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              {aberta.turno.nome} · {DIAS_SEMANA[paraData(aberta.data).getDay()]} {diaMes(aberta.data)}
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Toque no nome para colocar ou tirar da escala. Salva na hora.
            </p>
            <div className="space-y-2">
              {opcoes.map((f) => {
                const marcado = escalas.some(
                  (e) =>
                    e.data === aberta.data &&
                    e.turno_id === aberta.turno.id &&
                    e.funcionario_id === f.id,
                );
                return (
                  <button
                    key={f.id}
                    onClick={() => alternar(f)}
                    disabled={salvandoId !== null}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left disabled:opacity-60 ${
                      marcado ? "border-transparent text-white" : "border-neutral-300 bg-white"
                    }`}
                    style={marcado ? { background: "var(--cor-principal)" } : undefined}
                  >
                    <span className="text-xl">{marcado ? "✓" : "○"}</span>
                    <span className="flex-1">
                      <span className="block font-semibold">{f.nome}</span>
                      <span className={`block text-sm ${marcado ? "text-white/80" : "text-neutral-600"}`}>
                        {f.funcao}
                        {!f.ativo && " · inativo"}
                      </span>
                    </span>
                    {salvandoId === f.id && <span className="text-sm">Salvando...</span>}
                  </button>
                );
              })}
              {opcoes.length === 0 && (
                <p className="text-neutral-600">Nenhum funcionário ativo. Cadastre na tela Equipe.</p>
              )}
            </div>
            <button className="botao mt-4 w-full" onClick={() => setAberta(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
