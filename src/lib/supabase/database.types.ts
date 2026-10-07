export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      atendimento_profissionais: {
        Row: {
          atendimento_id: string
          profissional_id: string
        }
        Insert: {
          atendimento_id: string
          profissional_id: string
        }
        Update: {
          atendimento_id?: string
          profissional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_profissionais_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_profissionais_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "guias_dos_atendimentos"
            referencedColumns: ["atendimento_id"]
          },
          {
            foreignKeyName: "atendimento_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          atualizado_em: string
          criado_em: string
          excluido_em: string | null
          excluido_por: string | null
          fim: string
          id: string
          id_legado: number | null
          importado_em: string | null
          inicio: string
          motivo_desmarcacao: string | null
          motivo_exclusao: string | null
          observacao: string | null
          paciente_id: string | null
          plano_id: string | null
          recorrencia_id: string | null
          status: Database["public"]["Enums"]["status_atendimento"]
          tipo_id: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          excluido_em?: string | null
          excluido_por?: string | null
          fim: string
          id?: string
          id_legado?: number | null
          importado_em?: string | null
          inicio: string
          motivo_desmarcacao?: string | null
          motivo_exclusao?: string | null
          observacao?: string | null
          paciente_id?: string | null
          plano_id?: string | null
          recorrencia_id?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"]
          tipo_id?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          excluido_em?: string | null
          excluido_por?: string | null
          fim?: string
          id?: string
          id_legado?: number | null
          importado_em?: string | null
          inicio?: string
          motivo_desmarcacao?: string | null
          motivo_exclusao?: string | null
          observacao?: string | null
          paciente_id?: string | null
          plano_id?: string | null
          recorrencia_id?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"]
          tipo_id?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_atendimento"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos_alteracoes: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          antes: Json | null
          atendimento_id: string
          depois: Json | null
          id: number
          operacao: string
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json | null
          atendimento_id: string
          depois?: Json | null
          id?: never
          operacao: string
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json | null
          atendimento_id?: string
          depois?: Json | null
          id?: never
          operacao?: string
        }
        Relationships: []
      }
      atendimentos_observacoes: {
        Row: {
          atendimento_id: string
          automatica: boolean
          autor_id: string | null
          criado_em: string
          id: string
          texto: string
        }
        Insert: {
          atendimento_id: string
          automatica?: boolean
          autor_id?: string | null
          criado_em?: string
          id?: string
          texto: string
        }
        Update: {
          atendimento_id?: string
          automatica?: boolean
          autor_id?: string | null
          criado_em?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_observacoes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_observacoes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "guias_dos_atendimentos"
            referencedColumns: ["atendimento_id"]
          },
        ]
      }
      convenios_legado: {
        Row: {
          criado_em: string
          id: number
          nome: string
          plano_id: string | null
          valor: number | null
        }
        Insert: {
          criado_em?: string
          id?: never
          nome: string
          plano_id?: string | null
          valor?: number | null
        }
        Update: {
          criado_em?: string
          id?: never
          nome?: string
          plano_id?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "convenios_legado_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      datas_comemorativas: {
        Row: {
          criado_em: string
          descricao: string | null
          dia: number | null
          dia_semana: number | null
          id: string
          mes: number | null
          nome: string
          ordem: number | null
          pascoa: number | null
        }
        Insert: {
          criado_em?: string
          descricao?: string | null
          dia?: number | null
          dia_semana?: number | null
          id?: string
          mes?: number | null
          nome: string
          ordem?: number | null
          pascoa?: number | null
        }
        Update: {
          criado_em?: string
          descricao?: string | null
          dia?: number | null
          dia_semana?: number | null
          id?: string
          mes?: number | null
          nome?: string
          ordem?: number | null
          pascoa?: number | null
        }
        Relationships: []
      }
      feriados: {
        Row: {
          atualizado_em: string
          criado_em: string
          data_fim: string
          data_inicio: string
          id: string
          nome: string
          profissional_id: string | null
          tipo: Database["public"]["Enums"]["tipo_feriado"]
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          data_fim: string
          data_inicio: string
          id?: string
          nome: string
          profissional_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_feriado"]
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          nome?: string
          profissional_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_feriado"]
        }
        Relationships: [
          {
            foreignKeyName: "feriados_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      guias: {
        Row: {
          a_partir_de: string
          criado_em: string
          criado_por: string | null
          id: string
          numero: string | null
          ordem: number
          quantidade: number
          recorrencia_id: string
        }
        Insert: {
          a_partir_de: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          numero?: string | null
          ordem: number
          quantidade: number
          recorrencia_id: string
        }
        Update: {
          a_partir_de?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          numero?: string | null
          ordem?: number
          quantidade?: number
          recorrencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guias_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          atualizado_em: string
          criado_em: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          profissional_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          profissional_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          profissional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          bairro: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          cpf: string | null
          criado_em: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          id_legado: number | null
          nivel_cadastral: Database["public"]["Enums"]["nivel_cadastral"]
          nome: string
          observacoes: string | null
          pendencias_cadastrais: string[]
          plano_id: string | null
          profissional_responsavel_id: string | null
          responsavel: string | null
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          id_legado?: number | null
          nivel_cadastral?: Database["public"]["Enums"]["nivel_cadastral"]
          nome: string
          observacoes?: string | null
          pendencias_cadastrais?: string[]
          plano_id?: string | null
          profissional_responsavel_id?: string | null
          responsavel?: string | null
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          id_legado?: number | null
          nivel_cadastral?: Database["public"]["Enums"]["nivel_cadastral"]
          nome?: string
          observacoes?: string | null
          pendencias_cadastrais?: string[]
          plano_id?: string | null
          profissional_responsavel_id?: string | null
          responsavel?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_profissional_responsavel_id_fkey"
            columns: ["profissional_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      planejamento: {
        Row: {
          atualizado_em: string
          criado_em: string
          operacoes: Json
          unico: boolean
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          operacoes?: Json
          unico?: boolean
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          operacoes?: Json
          unico?: boolean
        }
        Relationships: []
      }
      planos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cor: string
          criado_em: string
          duracao_padrao_min: number
          exige_guia: boolean
          id: string
          nome: string
          valor_fonoaudiologia: number | null
          valor_nutricao: number | null
          valor_padrao: number | null
          valor_psicologia: number | null
          valor_psicopedagogia: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cor: string
          criado_em?: string
          duracao_padrao_min?: number
          exige_guia?: boolean
          id?: string
          nome: string
          valor_fonoaudiologia?: number | null
          valor_nutricao?: number | null
          valor_padrao?: number | null
          valor_psicologia?: number | null
          valor_psicopedagogia?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cor?: string
          criado_em?: string
          duracao_padrao_min?: number
          exige_guia?: boolean
          id?: string
          nome?: string
          valor_fonoaudiologia?: number | null
          valor_nutricao?: number | null
          valor_padrao?: number | null
          valor_psicologia?: number | null
          valor_psicopedagogia?: number | null
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean
          atualizado_em: string
          celular: string | null
          cor: string | null
          criado_em: string
          email: string | null
          especialidade: string | null
          id: string
          nome: string
          nome_legado: string | null
          registro: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          celular?: string | null
          cor?: string | null
          criado_em?: string
          email?: string | null
          especialidade?: string | null
          id?: string
          nome: string
          nome_legado?: string | null
          registro?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          celular?: string | null
          cor?: string | null
          criado_em?: string
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          nome_legado?: string | null
          registro?: string | null
        }
        Relationships: []
      }
      recorrencias: {
        Row: {
          atualizado_em: string
          criado_em: string
          data_fim: string | null
          data_inicio: string
          frequencia: Database["public"]["Enums"]["frequencia_recorrencia"]
          id: string
          sessoes: number | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio: string
          frequencia: Database["public"]["Enums"]["frequencia_recorrencia"]
          id?: string
          sessoes?: number | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          frequencia?: Database["public"]["Enums"]["frequencia_recorrencia"]
          id?: string
          sessoes?: number | null
        }
        Relationships: []
      }
      tipos_atendimento: {
        Row: {
          area: string | null
          ativo: boolean
          atualizado_em: string
          cor: string | null
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          area?: string | null
          ativo?: boolean
          atualizado_em?: string
          cor?: string | null
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          area?: string | null
          ativo?: boolean
          atualizado_em?: string
          cor?: string | null
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tipos_atendimento_profissionais: {
        Row: {
          profissional_id: string
          tipo_id: string
        }
        Insert: {
          profissional_id: string
          tipo_id: string
        }
        Update: {
          profissional_id?: string
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_atendimento_profissionais_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipos_atendimento_profissionais_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_atendimento"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          email: string
          id: string
          nome: string
          perfil: Database["public"]["Enums"]["perfil_usuario"]
          profissional_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email: string
          id: string
          nome: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          profissional_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          profissional_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      guias_dos_atendimentos: {
        Row: {
          atendimento_id: string | null
          guia_id: string | null
          numero: string | null
          ordem: number | null
          posicao: number | null
          quantidade: number | null
          recorrencia_id: string | null
          renovada: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_recorrencia_id_fkey"
            columns: ["recorrencia_id"]
            isOneToOne: false
            referencedRelation: "recorrencias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ajustar_valores_do_paciente: {
        Args: {
          p_area: string
          p_escopo: string
          p_ignorar?: string
          p_paciente: string
          p_tipo: string
          p_valor: number
        }
        Returns: number
      }
      aplicar_planejamento: { Args: { p_operacoes: Json }; Returns: number }
      atendimentos_ativos_no_periodo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: string[]
      }
      atendimentos_do_alcance: {
        Args: {
          p_alcance: Database["public"]["Enums"]["alcance_serie"]
          p_id: string
        }
        Returns: string[]
      }
      completar_serie: {
        Args: {
          p_desde: string
          p_necessarios: number
          p_novos: string[]
          p_serie: string
        }
        Returns: number
      }
      criar_atendimentos: {
        Args: {
          p_data_fim?: string
          p_duracao_min: number
          p_frequencia?: Database["public"]["Enums"]["frequencia_recorrencia"]
          p_inicios: string[]
          p_observacao?: string
          p_paciente_id: string
          p_plano_id?: string
          p_profissionais: string[]
          p_sessoes?: number
          p_status?: Database["public"]["Enums"]["status_atendimento"]
          p_tipo_id?: string
          p_valor?: number
        }
        Returns: string[]
      }
      criar_atendimentos_em_sequencia: {
        Args: { p_itens: Json }
        Returns: number
      }
      definir_escala: {
        Args: { p_intervalos: Json; p_profissional: string }
        Returns: number
      }
      desmarcar_atendimentos: {
        Args: {
          p_alcance: Database["public"]["Enums"]["alcance_serie"]
          p_id: string
          p_motivo: string
        }
        Returns: number
      }
      desmarcar_periodo: {
        Args: { p_fim: string; p_inicio: string; p_motivo: string }
        Returns: number
      }
      editar_atendimentos: {
        Args: {
          p_alcance: Database["public"]["Enums"]["alcance_serie"]
          p_data: string
          p_duracao_min: number
          p_hora: string
          p_id: string
          p_paciente_id: string
          p_plano_id?: string
          p_profissionais: string[]
          p_tipo_id?: string
          p_valor?: number
          p_valor_so_neste?: boolean
        }
        Returns: number
      }
      eh_adm: { Args: never; Returns: boolean }
      excluir_atendimentos: {
        Args: {
          p_alcance: Database["public"]["Enums"]["alcance_serie"]
          p_id: string
          p_motivo: string
        }
        Returns: number
      }
      excluir_guia: { Args: { p_guia: string }; Returns: undefined }
      formatar_periodo: {
        Args: { fim: string; inicio: string }
        Returns: string
      }
      gerar_guia: {
        Args: {
          p_atendimento: string
          p_frequencia?: Database["public"]["Enums"]["frequencia_recorrencia"]
          p_novos?: string[]
          p_numero?: string
          p_quantidade: number
        }
        Returns: string
      }
      importar_agenda_legado: {
        Args: { p_linhas: Json; p_simular?: boolean }
        Returns: Json
      }
      modificado_no_app: {
        Args: { p_id: string; p_importado_em: string }
        Returns: boolean
      }
      mover_atendimento: {
        Args: {
          p_de_profissional?: string
          p_id: string
          p_inicio: string
          p_para_profissional?: string
        }
        Returns: undefined
      }
      mudar_plano_dos_futuros: {
        Args: { p_ignorar?: string; p_paciente: string; p_plano: string }
        Returns: number
      }
      planejamento_confere: {
        Args: { p_esperado: Json; p_id: string }
        Returns: boolean
      }
      reajustar_plano: {
        Args: { p_antigos: Json; p_plano: string }
        Returns: number
      }
      relacionar_atendimentos: {
        Args: {
          p_base: string
          p_frequencia?: Database["public"]["Enums"]["frequencia_recorrencia"]
          p_ids: string[]
        }
        Returns: number
      }
      renovar_guia: {
        Args: {
          p_guia: string
          p_novos?: string[]
          p_numero?: string
          p_quantidade: number
        }
        Returns: string
      }
      valor_do_plano: {
        Args: { p_area: string; p_plano: string }
        Returns: number
      }
    }
    Enums: {
      alcance_serie: "este" | "seguintes" | "todos"
      frequencia_recorrencia: "semanal" | "quinzenal" | "mensal"
      nivel_cadastral: "completo" | "falta_informacao" | "critico"
      perfil_usuario: "adm" | "limitado"
      status_atendimento:
        | "marcado"
        | "confirmado"
        | "atendido"
        | "faltou"
        | "desmarcado"
      tipo_feriado: "feriado" | "recesso"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alcance_serie: ["este", "seguintes", "todos"],
      frequencia_recorrencia: ["semanal", "quinzenal", "mensal"],
      nivel_cadastral: ["completo", "falta_informacao", "critico"],
      perfil_usuario: ["adm", "limitado"],
      status_atendimento: [
        "marcado",
        "confirmado",
        "atendido",
        "faltou",
        "desmarcado",
      ],
      tipo_feriado: ["feriado", "recesso"],
    },
  },
} as const

