import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Product, Entry, Reason } from '@/types/database';
import { databaseService } from './database';

class FileService {
  private getMotivosDir() {
    return `${FileSystem.documentDirectory}motivos/`;
  }

  private getMotivoDir(motivoCodigo: string) {
    return `${this.getMotivosDir()}motivo${motivoCodigo.padStart(2, '0')}/`;
  }

  private getFileName(motivoCodigo: string, date: string) {
    const formattedDate = date.replace(/-/g, '');
    return `motivo${motivoCodigo.padStart(2, '0')}_${formattedDate}.txt`;
  }

  private getFilePath(motivoCodigo: string, date: string) {
    return `${this.getMotivoDir(motivoCodigo)}${this.getFileName(motivoCodigo, date)}`;
  }

  async ensureDirectoryExists(dirPath: string) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }
    } catch (error) {
      console.error('Erro ao criar diretório:', error);
      throw error;
    }
  }

  // Importação de produtos
  async importProducts(): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return { success: false, count: 0, message: 'Importação cancelada pelo usuário' };
      }

      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const lines = fileContent.split('\n').filter(line => line.trim());

      let importedCount = 0;
      const errors: string[] = [];

      for (const line of lines) {
        try {
          const parts = line.trim().split('|');
          if (parts.length >= 3) {
            const codigo = parts[0].trim();
            const nome = parts[1].trim();
            const unitType = parts[2].trim().toUpperCase() as 'UN' | 'KG';
            const precoRegular = parts[3] ? parseFloat(parts[3].trim()) : undefined;
            const precoClube = parts[4] ? parseFloat(parts[4].trim()) : undefined;

            if (!['UN', 'KG'].includes(unitType)) {
              errors.push(`Linha "${line}": Tipo de unidade inválido`);
              continue;
            }

            await databaseService.insertOrUpdateProduct({
              codigo,
              nome,
              unit_type: unitType,
              preco_regular: precoRegular,
              preco_clube: precoClube,
            });

            importedCount++;
          } else {
            errors.push(`Linha "${line}": Formato inválido`);
          }
        } catch (error) {
          errors.push(`Linha "${line}": ${error}`);
        }
      }

      let message = `${importedCount} produtos importados com sucesso`;
      if (errors.length > 0) {
        message += `\n${errors.length} erros encontrados`;
      }

      return {
        success: true,
        count: importedCount,
        message,
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        message: `Erro na importação: ${error}`,
      };
    }
  }

  // Formatação de quantidade baseada no tipo de unidade
  private formatQuantity(quantity: number, unitType: 'UN' | 'KG'): string {
    if (unitType === 'UN') {
      // Para unidades, usar floor e formatar como X.000
      return `${Math.floor(quantity)}.000`;
    } else {
      // Para KG, manter as 3 casas decimais
      return quantity.toFixed(3);
    }
  }

  // Formatação do código do produto (13 caracteres com zeros à esquerda)
  private formatProductCode(code: string): string {
    return code.padStart(13, '0');
  }

  // Salvar/atualizar arquivo de motivo
  async saveEntryToFile(
    entry: Entry,
    motivoCodigo: string,
    productUnitType: 'UN' | 'KG'
  ): Promise<void> {
    try {
      const motivoDir = this.getMotivoDir(motivoCodigo);
      await this.ensureDirectoryExists(motivoDir);

      const filePath = this.getFilePath(motivoCodigo, entry.entry_date);
      let fileContent = '';

      // Lê arquivo existente, se houver
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          fileContent = await FileSystem.readAsStringAsync(filePath);
        }
      } catch (error) {
        // Arquivo não existe, criar novo
        console.log('Criando novo arquivo:', filePath);
      }

      const lines = fileContent.split('\n').filter(line => line.trim());
      const formattedCode = this.formatProductCode(entry.product_code);
      
      // Busca se já existe uma linha para este produto
      let lineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(formattedCode)) {
          lineIndex = i;
          break;
        }
      }

      // Busca a quantidade total atual do produto para este motivo e data
      const totalQuantity = await databaseService.getTotalQuantityForProductAndReason(
        entry.product_code,
        entry.reason_id,
        entry.entry_date
      );

      const formattedQuantity = this.formatQuantity(totalQuantity, productUnitType);
      const newLine = `${formattedCode}${formattedQuantity}`;

      if (lineIndex >= 0) {
        // Atualiza linha existente
        lines[lineIndex] = newLine;
      } else {
        // Adiciona nova linha
        lines.push(newLine);
      }

      // Ordena as linhas por código do produto
      lines.sort();

      // Escreve o arquivo com quebras de linha
      const newContent = lines.join('\n') + (lines.length > 0 ? '\n' : '');
      await FileSystem.writeAsStringAsync(filePath, newContent);

    } catch (error) {
      console.error('Erro ao salvar arquivo:', error);
      throw error;
    }
  }

  // Exportar lançamentos do dia
  async exportTodaysEntries(): Promise<{ success: boolean; message: string; files: string[] }> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const reasons = await databaseService.getAllReasons();
      const exportedFiles: string[] = [];

      for (const reason of reasons) {
        const entries = await databaseService.getEntriesByReasonAndDate(reason.id!, today);
        
        if (entries.length > 0) {
          const motivoDir = this.getMotivoDir(reason.codigo);
          await this.ensureDirectoryExists(motivoDir);

          const fileName = this.getFileName(reason.codigo, today);
          const filePath = this.getFilePath(reason.codigo, today);

          // Como os arquivos já devem estar atualizados através dos saveEntryToFile,
          // apenas verifica se existem e marca como exportados
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (fileInfo.exists) {
            exportedFiles.push(fileName);
            await databaseService.markEntriesAsExported(reason.id!, today);
          }
        }
      }

      if (exportedFiles.length === 0) {
        return {
          success: false,
          message: 'Nenhum lançamento encontrado para o dia atual',
          files: [],
        };
      }

      // Opcional: Compartilhar os arquivos usando expo-sharing
      // Para isso, seria necessário criar um ZIP ou compartilhar um por vez
      
      return {
        success: true,
        message: `${exportedFiles.length} arquivo(s) exportado(s) com sucesso`,
        files: exportedFiles,
      };
    } catch (error) {
      return {
        success: false,
        message: `Erro na exportação: ${error}`,
        files: [],
      };
    }
  }

  // Compartilhar arquivo específico
  async shareFile(motivoCodigo: string, date: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(motivoCodigo, date);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (!fileInfo.exists) {
        throw new Error('Arquivo não encontrado');
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filePath);
        return true;
      } else {
        throw new Error('Compartilhamento não disponível nesta plataforma');
      }
    } catch (error) {
      console.error('Erro ao compartilhar arquivo:', error);
      return false;
    }
  }

  // Listar arquivos existentes
  async listExistingFiles(): Promise<{ motivo: string; files: string[] }[]> {
    try {
      const motivosDir = this.getMotivosDir();
      const motivosDirInfo = await FileSystem.getInfoAsync(motivosDir);
      
      if (!motivosDirInfo.exists) {
        return [];
      }

      const motivoDirs = await FileSystem.readDirectoryAsync(motivosDir);
      const result: { motivo: string; files: string[] }[] = [];

      for (const motivoDir of motivoDirs) {
        const motivoDirPath = `${motivosDir}${motivoDir}/`;
        try {
          const files = await FileSystem.readDirectoryAsync(motivoDirPath);
          const txtFiles = files.filter(file => file.endsWith('.txt'));
          
          if (txtFiles.length > 0) {
            result.push({
              motivo: motivoDir,
              files: txtFiles,
            });
          }
        } catch (error) {
          console.log(`Erro ao ler diretório ${motivoDir}:`, error);
        }
      }

      return result;
    } catch (error) {
      console.error('Erro ao listar arquivos:', error);
      return [];
    }
  }
}

export const fileService = new FileService();