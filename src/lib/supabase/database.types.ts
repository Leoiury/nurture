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
        ]
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
          nome: string
          observacoes: string | null
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
          nome: string
          observacoes?: string | null
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
          nome?: string
          observacoes?: string | null
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
          cor: string | null
          criado_em: string
          especialidade: string | null
          id: string
          nome: string
          nome_legado: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cor?: string | null
          criado_em?: string
          especialidade?: string | null
          id?: string
          nome: string
          nome_legado?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cor?: string | null
          criado_em?: string
          especialidade?: string | null
          id?: string
          nome?: string
          nome_legado?: string | null
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
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          area?: string | null
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          area?: string | null
          ativo?: boolean
          atualizado_em?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      formatar_periodo: {
        Args: { fim: string; inicio: string }
        Returns: string
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
      planejamento_confere: {
        Args: { p_esperado: Json; p_id: string }
        Returns: boolean
      }
    }
    Enums: {
      alcance_serie: "este" | "seguintes" | "todos"
      frequencia_recorrencia: "semanal" | "quinzenal" | "mensal"
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

