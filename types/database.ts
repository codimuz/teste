export interface Product {
  id?: number;
  codigo: string;
  nome: string;
  unit_type: 'UN' | 'KG';
  preco_regular?: number;
  preco_clube?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Reason {
  id?: number;
  codigo: string;
  descricao: string;
  created_at?: string;
}

export interface Entry {
  id?: number;
  product_code: string;
  reason_id: number;
  quantity: number;
  entry_date: string;
  is_exported: boolean;
  is_synchronized: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EntryChange {
  id?: number;
  entry_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  change_date: string;
}

export interface ProductSuggestion {
  codigo: string;
  nome: string;
  unit_type: 'UN' | 'KG';
  preco_regular?: number;
  preco_clube?: number;
}