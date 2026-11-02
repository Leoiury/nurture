// Leitura de atendimentos sem os valores: a única permitida ao perfil profissional.
// A visão tem as mesmas colunas da tabela, menos o valor; o "as" reaproveita os tipos
// da tabela, porque nos tipos gerados todas as colunas de uma visão podem ser nulas.
export const ATENDIMENTOS_SEM_VALOR = "atendimentos_equipe" as "atendimentos";
