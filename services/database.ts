import * as SQLite from 'expo-sqlite';
import { Product, Reason, Entry, EntryChange } from '@/types/database';

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async init() {
    try {
      this.db = await SQLite.openDatabaseAsync('quebras.db');
      await this.createTables();
      await this.insertDefaultReasons();
      await this.insertDefaultProducts();
    } catch (error) {
      console.error('Erro ao inicializar banco de dados:', error);
      throw error;
    }
  }

  private async createTables() {
    if (!this.db) throw new Error('Database not initialized');

    // Tabela de produtos
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        unit_type TEXT CHECK(unit_type IN ('UN', 'KG')) NOT NULL,
        preco_regular REAL,
        preco_clube REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de motivos
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS reasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        descricao TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de lançamentos
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_code TEXT NOT NULL,
        reason_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        entry_date DATE NOT NULL,
        is_exported BOOLEAN DEFAULT FALSE,
        is_synchronized BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reason_id) REFERENCES reasons (id),
        UNIQUE(product_code, reason_id, entry_date)
      );
    `);

    // Tabela de mudanças
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS entry_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT NOT NULL,
        change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entry_id) REFERENCES entries (id)
      );
    `);
  }

  private async insertDefaultReasons() {
    if (!this.db) throw new Error('Database not initialized');

    const defaultReasons = [
      { codigo: '01', descricao: 'Produto Vencido' },
      { codigo: '02', descricao: 'Avaria no Transporte' },
      { codigo: '03', descricao: 'Quebra no Manuseio' },
      { codigo: '04', descricao: 'Problema de Qualidade' },
      { codigo: '05', descricao: 'Devolução Cliente' },
    ];

    for (const reason of defaultReasons) {
      try {
        await this.db.runAsync(
          'INSERT OR IGNORE INTO reasons (codigo, descricao) VALUES (?, ?)',
          [reason.codigo, reason.descricao]
        );
      } catch (error) {
        console.log(`Motivo ${reason.codigo} já existe ou erro ao inserir:`, error);
      }
    }
  }

  private async insertDefaultProducts() {
    if (!this.db) throw new Error('Database not initialized');

    const defaultProducts = [
      { codigo: '7891000053607', nome: 'ARROZ BRANCO TIPO 1 5KG', unit_type: 'KG' as const, preco_regular: 12.90, preco_clube: 11.61 },
      { codigo: '7891000315507', nome: 'FEIJAO PRETO TIPO 1 1KG', unit_type: 'KG' as const, preco_regular: 8.50, preco_clube: 7.65 },
      { codigo: '7891118400171', nome: 'ACUCAR CRISTAL 1KG', unit_type: 'KG' as const, preco_regular: 4.20, preco_clube: 3.78 },
      { codigo: '7891000100103', nome: 'LEITE INTEGRAL 1L', unit_type: 'UN' as const, preco_regular: 4.85, preco_clube: 4.36 },
      { codigo: '7891118401017', nome: 'CAFE TORRADO MOIDO 500G', unit_type: 'UN' as const, preco_regular: 15.90, preco_clube: 14.31 },
      { codigo: '7891234567890', nome: 'OLEO DE SOJA 900ML', unit_type: 'UN' as const, preco_regular: 6.50, preco_clube: 5.85 },
      { codigo: '7891987654321', nome: 'FARINHA DE TRIGO 1KG', unit_type: 'KG' as const, preco_regular: 3.80, preco_clube: 3.42 },
      { codigo: '7891111222333', nome: 'MACARRAO ESPAGUETE 500G', unit_type: 'UN' as const, preco_regular: 3.20, preco_clube: 2.88 },
      { codigo: '7891444555666', nome: 'MOLHO DE TOMATE 340G', unit_type: 'UN' as const, preco_regular: 2.45, preco_clube: 2.20 },
      { codigo: '7891777888999', nome: 'BISCOITO CREAM CRACKER 400G', unit_type: 'UN' as const, preco_regular: 4.90, preco_clube: 4.41 },
      { codigo: '1234567890123', nome: 'BANANA NANICA KG', unit_type: 'KG' as const, preco_regular: 5.80, preco_clube: 5.22 },
      { codigo: '2345678901234', nome: 'CEBOLA BRANCA KG', unit_type: 'KG' as const, preco_regular: 4.20, preco_clube: 3.78 },
      { codigo: '3456789012345', nome: 'BATATA INGLESA KG', unit_type: 'KG' as const, preco_regular: 6.50, preco_clube: 5.85 },
      { codigo: '4567890123456', nome: 'REFRIGERANTE COLA 2L', unit_type: 'UN' as const, preco_regular: 8.90, preco_clube: 8.01 },
      { codigo: '5678901234567', nome: 'SABAO EM PO 1KG', unit_type: 'UN' as const, preco_regular: 12.50, preco_clube: 11.25 },
    ];

    for (const product of defaultProducts) {
      try {
        await this.db.runAsync(
          'INSERT OR IGNORE INTO products (codigo, nome, unit_type, preco_regular, preco_clube) VALUES (?, ?, ?, ?, ?)',
          [product.codigo, product.nome, product.unit_type, product.preco_regular, product.preco_clube]
        );
      } catch (error) {
        console.log(`Produto ${product.codigo} já existe ou erro ao inserir:`, error);
      }
    }
  }

  // Métodos para produtos
  async insertOrUpdateProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(`
        INSERT OR REPLACE INTO products (codigo, nome, unit_type, preco_regular, preco_clube, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [product.codigo, product.nome, product.unit_type, product.preco_regular || null, product.preco_clube || null]);
    } catch (error) {
      console.error('Erro ao inserir/atualizar produto:', error);
      throw error;
    }
  }

  async searchProducts(query: string, limit: number = 10): Promise<Product[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM products 
        WHERE codigo LIKE ? OR nome LIKE ? 
        ORDER BY 
          CASE 
            WHEN codigo = ? THEN 1
            WHEN codigo LIKE ? THEN 2
            WHEN nome LIKE ? THEN 3
            ELSE 4
          END
        LIMIT ?
      `, [
        `%${query}%`, `%${query}%`, query, `${query}%`, `${query}%`, limit
      ]) as Product[];
      
      return result;
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      return [];
    }
  }

  async getProductByCode(codigo: string): Promise<Product | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync(
        'SELECT * FROM products WHERE codigo = ?',
        [codigo]
      ) as Product | null;
      
      return result;
    } catch (error) {
      console.error('Erro ao buscar produto por código:', error);
      return null;
    }
  }

  // Métodos para motivos
  async getAllReasons(): Promise<Reason[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getAllAsync(
        'SELECT * FROM reasons ORDER BY codigo'
      ) as Reason[];
      
      return result;
    } catch (error) {
      console.error('Erro ao buscar motivos:', error);
      return [];
    }
  }

  // Métodos para lançamentos
  async insertOrUpdateEntry(entry: Omit<Entry, 'id' | 'created_at' | 'updated_at'>) {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Primeiro, tenta buscar entry existente
      const existingEntry = await this.db.getFirstAsync(`
        SELECT * FROM entries 
        WHERE product_code = ? AND reason_id = ? AND entry_date = ?
      `, [entry.product_code, entry.reason_id, entry.entry_date]) as Entry | null;

      if (existingEntry) {
        // Registra a mudança
        await this.db.runAsync(`
          INSERT INTO entry_changes (entry_id, field_name, old_value, new_value)
          VALUES (?, ?, ?, ?)
        `, [existingEntry.id!, 'quantity', existingEntry.quantity.toString(), (existingEntry.quantity + entry.quantity).toString()]);

        // Atualiza quantidade somando
        await this.db.runAsync(`
          UPDATE entries
          SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [entry.quantity, existingEntry.id!]);

        return existingEntry.id!;
      } else {
        // Insere novo registro
        const result = await this.db.runAsync(`
          INSERT INTO entries (product_code, reason_id, quantity, entry_date, is_exported, is_synchronized)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [entry.product_code, entry.reason_id, entry.quantity, entry.entry_date, entry.is_exported, entry.is_synchronized]);

        return result.lastInsertRowId;
      }
    } catch (error) {
      console.error('Erro ao inserir/atualizar entry:', error);
      throw error;
    }
  }

  async getTotalQuantityForProductAndReason(productCode: string, reasonId: number, date: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync(`
        SELECT COALESCE(SUM(quantity), 0) as total
        FROM entries 
        WHERE product_code = ? AND reason_id = ? AND entry_date = ?
      `, [productCode, reasonId, date]) as { total: number } | null;

      return result?.total || 0;
    } catch (error) {
      console.error('Erro ao buscar total:', error);
      return 0;
    }
  }

  async getEntriesByReasonAndDate(reasonId: number, date: string): Promise<Entry[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM entries 
        WHERE reason_id = ? AND entry_date = ?
        ORDER BY product_code
      `, [reasonId, date]) as Entry[];

      return result;
    } catch (error) {
      console.error('Erro ao buscar entries:', error);
      return [];
    }
  }

  async markEntriesAsExported(reasonId: number, date: string) {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(`
        UPDATE entries 
        SET is_exported = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE reason_id = ? AND entry_date = ?
      `, [reasonId, date]);
    } catch (error) {
      console.error('Erro ao marcar como exportado:', error);
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();