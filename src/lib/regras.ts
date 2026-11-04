// Verificação das regras da casa na escala da semana.
// As regras vêm do banco (tabelas `regras` e `configuracoes`) e são editadas na tela Regras.
// Este arquivo só calcula os alertas; não lê nem grava nada no banco.

import type { Configuracao, Escala, Funcionario, Regra, Turno } from "./tipos";
import { DIAS_SEMANA, paraData, somarDias } from "./datas";

export type ConfigRegras = {
  minimos: Regra[];
  folgasMinimas: number;
  bloquearFecharEAbrir: boolean;
};

export type Alerta = {
  tipo: "minimo" | "folga" | "fechar-abrir";
  mensagem: string;
  // Célula da grade onde o alerta aparece (vazio no alerta de folga).
  data?: string;
  turnoId?: string;
};

// Chaves usadas na tabela `configuracoes`.
export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_ABRIR = "bloquear_fechar_e_abrir";

/** Lê os valores da tabela `configuracoes`, com padrão seguro se faltar algum. */
export function lerConfiguracoes(lista: Configuracao[]) {
  const valor = (chave: string) => lista.find((c) => c.chave === chave)?.valor;
  const folgas = Number(valor(CHAVE_FOLGAS));
  return {
    folgasMinimas: Number.isFinite(folgas) && folgas >= 0 ? folgas : 1,
    bloquearFecharEAbrir: valor(CHAVE_FECHAR_ABRIR) !== "false",
  };
}

/**
 * Mínimos que valem para um dia e turno, por função.
 * Uma regra de um dia específico substitui a regra de "todos os dias" da mesma função.
 */
export function minimosDoDia(minimos: Regra[], diaSemana: number, turnoId: string) {
  const resultado = new Map<string, number>();
  for (const r of minimos) {
    if (r.turno_id === turnoId && r.dia_semana === null) resultado.set(r.funcao, r.minimo);
  }
  for (const r of minimos) {
    if (r.turno_id === turnoId && r.dia_semana === diaSemana) resultado.set(r.funcao, r.minimo);
  }
  return resultado;
}

function primeiroNome(nome: string) {
  return nome.split(" ")[0];
}

/**
 * Confere a escala da semana.
 * `escalas` deve incluir também o domingo anterior e a segunda seguinte,
 * para conferir o "fechar e abrir" na virada de semana.
 */
export function verificarEscala(params: {
  dias: string[]; // os 7 dias da semana (segunda a domingo)
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  config: ConfigRegras;
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas, config } = params;
  const alertas: Alerta[] = [];
  const porId = new Map(funcionarios.map((f) => [f.id, f]));

  const escaladosNa = (data: string, turnoId: string) =>
    escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => porId.get(e.funcionario_id))
      .filter((f): f is Funcionario => Boolean(f));

  // 1. Mínimo de pessoas por turno e função.
  for (const data of dias) {
    const diaSemana = paraData(data).getDay();
    for (const turno of turnos) {
      const pessoas = escaladosNa(data, turno.id);
      for (const [funcao, minimo] of minimosDoDia(config.minimos, diaSemana, turno.id)) {
        const tem = pessoas.filter((p) => p.funcao === funcao).length;
        if (tem < minimo) {
          alertas.push({
            tipo: "minimo",
            data,
            turnoId: turno.id,
            mensagem: `Falta${minimo - tem > 1 ? "m" : ""} ${minimo - tem} de ${funcao}`,
          });
        }
      }
    }
  }

  // 2. Fechar um dia (último turno) e abrir o dia seguinte (primeiro turno).
  if (config.bloquearFecharEAbrir && turnos.length > 1) {
    const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
    const abertura = ordenados[0];
    const fechamento = ordenados[ordenados.length - 1];
    const dentroDaSemana = new Set(dias);
    // Do domingo anterior até o domingo da semana.
    for (const dia of [somarDias(dias[0], -1), ...dias]) {
      const seguinte = somarDias(dia, 1);
      if (!dentroDaSemana.has(dia) && !dentroDaSemana.has(seguinte)) continue;
      const fecharam = new Set(escaladosNa(dia, fechamento.id).map((f) => f.id));
      for (const f of escaladosNa(seguinte, abertura.id)) {
        if (!fecharam.has(f.id)) continue;
        if (dentroDaSemana.has(seguinte)) {
          alertas.push({
            tipo: "fechar-abrir",
            data: seguinte,
            turnoId: abertura.id,
            mensagem: `${primeiroNome(f.nome)} fechou ontem`,
          });
        } else {
          // Segunda da semana seguinte: o alerta aparece no domingo desta semana.
          alertas.push({
            tipo: "fechar-abrir",
            data: dia,
            turnoId: fechamento.id,
            mensagem: `${primeiroNome(f.nome)} abre amanhã`,
          });
        }
      }
    }
  }

  // 3. Folgas mínimas por semana.
  if (config.folgasMinimas > 0) {
    const dentroDaSemana = new Set(dias);
    for (const f of funcionarios) {
      const diasTrabalhados = new Set(
        escalas
          .filter((e) => e.funcionario_id === f.id && dentroDaSemana.has(e.data))
          .map((e) => e.data),
      ).size;
      if (diasTrabalhados === 0) continue;
      const folgas = dias.length - diasTrabalhados;
      if (folgas < config.folgasMinimas) {
        alertas.push({
          tipo: "folga",
          mensagem:
            folgas === 0
              ? `${f.nome} está sem folga na semana`
              : `${f.nome} tem só ${folgas} folga${folgas > 1 ? "s" : ""} (mínimo ${config.folgasMinimas})`,
        });
      }
    }
  }

  return alertas;
}

/** "Sexta" ou "Todos os dias" */
export function nomeDoDia(diaSemana: number | null) {
  return diaSemana === null ? "Todos os dias" : DIAS_SEMANA[diaSemana];
}
