import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Product, Entry, Reason } from '@/types/database';
import { databaseService } from './database';

class FileService {
  private getAppDocumentDirectory() {
    return `${FileSystem.documentDirectory}motivos/`;
  }

  private getMotivoDirectory(motivoCode: string) {
    return `${this.getAppDocumentDirectory()}motivo${motivoCode.padStart(2, '0')}/`;
  }

  private getFileName(motivoCode: string, date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}${month}${day}`;
    return `motivo${motivoCode.padStart(2, '0')}_${formattedDate}.txt`;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
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

  private formatProductCode(code: string): string {
    return code.padStart(13, '0');
  }

  private formatQuantity(quantity: number, unitType: string): string {
    if (unitType === 'UN') {
      return `${Math.floor(quantity)}.000`;
    } else {
      return quantity.toFixed(3);
    }
  }

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

  async exportMotivosEntries(): Promise<{ 
    success: boolean; 
    message: string; 
    exportedMotivos: string[];
    errors: string[];
  }> {
    const exportedMotivos: string[] = [];
    const errors: string[] = [];
    
    try {
      const activeReasons = await databaseService.getActiveReasons();
      
      if (activeReasons.length === 0) {
        return {
          success: false,
          message: 'Nenhum motivo encontrado no sistema',
          exportedMotivos: [],
          errors: []
        };
      }

      for (const reason of activeReasons) {
        try {
          const consolidatedEntries = await databaseService.getConsolidatedEntriesByReason(reason.id!);
          
          if (consolidatedEntries.length === 0) {
            console.log(`Motivo ${reason.codigo} - Nenhum lançamento pendente, ignorando`);
            continue;
          }

          const motivoDir = this.getMotivoDirectory(reason.codigo);
          await this.ensureDirectoryExists(motivoDir);

          const currentDate = new Date();
          const fileName = this.getFileName(reason.codigo, currentDate);
          const filePath = `${motivoDir}${fileName}`;

          const fileLines: string[] = [];
          
          for (const entry of consolidatedEntries) {
            const formattedCode = this.formatProductCode(entry.product_code);
            const formattedQuantity = this.formatQuantity(entry.total_quantity, entry.unit_type);
            const line = `Inventario ${formattedCode} ${formattedQuantity}`;
            fileLines.push(line);
          }

          const fileContent = fileLines.join('\n') + '\n';
          await FileSystem.writeAsStringAsync(filePath, fileContent);

          await databaseService.markEntriesAsSynchronized(reason.id!);

          exportedMotivos.push(`motivo${reason.codigo.padStart(2, '0')}`);
          console.log(`Motivo ${reason.codigo} exportado: ${fileName} (${consolidatedEntries.length} produtos)`);

        } catch (motivoError) {
          const errorMessage = `Erro ao exportar motivo ${reason.codigo}: ${motivoError}`;
          errors.push(errorMessage);
          console.error(errorMessage);
        }
      }

      if (exportedMotivos.length === 0 && errors.length === 0) {
        return {
          success: false,
          message: 'Nenhum motivo com lançamentos pendentes encontrado',
          exportedMotivos: [],
          errors: []
        };
      }

      let message = '';
      if (exportedMotivos.length > 0) {
        message = `${exportedMotivos.length} motivo(s) exportado(s): ${exportedMotivos.join(', ')}`;
      }
      
      if (errors.length > 0) {
        if (message) message += '\n';
        message += `${errors.length} erro(s) encontrado(s)`;
      }

      return {
        success: exportedMotivos.length > 0,
        message,
        exportedMotivos,
        errors
      };

    } catch (globalError) {
      const errorMessage = `Erro geral na exportação: ${globalError}`;
      console.error(errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        exportedMotivos,
        errors: [errorMessage]
      };
    }
  }

  async saveEntryToFile(
    entry: Entry,
    motivoCodigo: string,
    productUnitType: 'UN' | 'KG'
  ): Promise<void> {
    // Esta função não é mais necessária pois a exportação é feita de forma consolidada
    // Mantendo para compatibilidade, mas pode ser removida futuramente
    console.log('saveEntryToFile chamada, mas exportação é feita via exportMotivosEntries');
  }

  async shareExportedFiles(): Promise<{ success: boolean; message: string }> {
    try {
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        
        if (permissions.granted) {
          const motivosDir = this.getAppDocumentDirectory();
          const dirInfo = await FileSystem.getInfoAsync(motivosDir);
          
          if (!dirInfo.exists) {
            return {
              success: false,
              message: 'Nenhum arquivo encontrado para compartilhar'
            };
          }

          const motivoDirs = await FileSystem.readDirectoryAsync(motivosDir);
          let sharedCount = 0;

          for (const motivoDir of motivoDirs) {
            try {
              const motivoDirPath = `${motivosDir}${motivoDir}/`;
              const files = await FileSystem.readDirectoryAsync(motivoDirPath);
              
              for (const file of files) {
                if (file.endsWith('.txt')) {
                  const sourceFilePath = `${motivoDirPath}${file}`;
                  const fileContent = await FileSystem.readAsStringAsync(sourceFilePath);
                  
                  await FileSystem.StorageAccessFramework.createFileAsync(
                    permissions.directoryUri, 
                    file, 
                    'text/plain'
                  ).then(async (uri) => {
                    await FileSystem.writeAsStringAsync(uri, fileContent);
                    sharedCount++;
                  });
                }
              }
            } catch (error) {
              console.error(`Erro ao compartilhar arquivos do motivo ${motivoDir}:`, error);
            }
          }

          return {
            success: sharedCount > 0,
            message: sharedCount > 0 
              ? `${sharedCount} arquivo(s) compartilhado(s) com sucesso`
              : 'Nenhum arquivo foi compartilhado'
          };
        } else {
          return {
            success: false,
            message: 'Permissão negada para acesso ao storage'
          };
        }
      } else {
        const motivosDir = this.getAppDocumentDirectory();
        await Sharing.shareAsync(motivosDir);
        
        return {
          success: true,
          message: 'Diretório de motivos compartilhado'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Erro ao compartilhar arquivos: ${error}`
      };
    }
  }

  async listExistingFiles(): Promise<{ motivo: string; files: string[] }[]> {
    try {
      const motivosDir = this.getAppDocumentDirectory();
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