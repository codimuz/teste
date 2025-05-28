import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Product, Entry, Reason } from '@/types/database';
import { databaseService } from './database';

class FileService {
  private async getAppDocumentDirectory() {
    // Em produção, usar o diretório de documentos do Android
    if (!__DEV__) {
      const externalDir = FileSystem.documentDirectory;
      // Verifica se temos permissão de escrita
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        console.log(`[DEBUG] Using SAF directory: ${permissions.directoryUri}`);
        return permissions.directoryUri;
      }
      console.log(`[DEBUG] Using external directory: ${externalDir}`);
      return `${externalDir}motivos/`;
    }
    
    // No modo de desenvolvimento (Expo Go), usar o diretório do app
    const devDir = FileSystem.documentDirectory;
    console.log(`[DEBUG] Using development directory: ${devDir}`);
    return `${devDir}motivos/`;
  }

  private async getMotivoDirectory(motivoCode: string) {
    const baseDir = await this.getAppDocumentDirectory();
    if (!__DEV__ && baseDir.startsWith('content://')) {
      // Em produção com SAF, usar URI específica para o motivo
      return `${baseDir}/motivo${motivoCode.padStart(2, '0')}/`;
    }
    // Em desenvolvimento ou sem SAF
    return `${baseDir}motivo${motivoCode.padStart(2, '0')}/`;
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

  private generateFileContent(entries: Array<{
    product_code: string;
    total_quantity: number;
    unit_type: string;
  }>): string {
    const lines = entries.map(entry => {
      const formattedCode = entry.product_code.padStart(13, '0');
      const formattedQuantity = entry.unit_type === 'UN'
        ? `${Math.floor(entry.total_quantity)}.000`
        : entry.total_quantity.toFixed(3);
      
      return `Inventario ${formattedCode} ${formattedQuantity}`;
    });
    
    return lines.join('\n') + '\n';
  }

  private getFormattedDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
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

  async exportEntriesToPublicDirectory(): Promise<{
    success: boolean;
    message: string;
    savedFiles: string[];
    location: string;
    errors: string[];
  }> {
    console.log(`[DEBUG] exportEntriesToPublicDirectory ENTRY - Thread: ${Date.now()}`);
    console.log(`[DEBUG] Platform: ${Platform.OS}`);
    console.log(`[DEBUG] Initial state - savedFiles: [], errors: [], directoryUri: ''`);
    
    const savedFiles: string[] = [];
    const errors: string[] = [];
    let directoryUri = '';

    try {
      console.log(`[DEBUG] Step 1: Platform validation`);
      // 1. Solicitar permissões usando StorageAccessFramework (baseado no exemplo.txt)
      if (Platform.OS !== 'android') {
        console.log(`[DEBUG] exportEntriesToPublicDirectory EXIT - Platform not supported: ${Platform.OS}`);
        return {
          success: false,
          message: 'Exportação pública disponível apenas no Android',
          savedFiles: [],
          location: '',
          errors: ['Plataforma não suportada']
        };
      }

      console.log(`[DEBUG] Step 2: Requesting directory permissions via StorageAccessFramework`);
      const startPermissionTime = Date.now();
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      const permissionTime = Date.now() - startPermissionTime;
      console.log(`[DEBUG] Permission request completed in ${permissionTime}ms`);
      console.log(`[DEBUG] Permission granted: ${permissions.granted}`);
      console.log(`[DEBUG] Directory URI: ${permissions.granted ? permissions.directoryUri : 'none'}`);
      
      if (!permissions.granted) {
        console.log(`[DEBUG] exportEntriesToPublicDirectory EXIT - Permission denied by user`);
        return {
          success: false,
          message: 'Acesso ao diretório negado pelo usuário',
          savedFiles: [],
          location: '',
          errors: ['Permissão negada']
        };
      }

      directoryUri = permissions.directoryUri;
      console.log(`[DEBUG] Step 3: Directory URI set to: ${directoryUri}`);

      console.log(`[DEBUG] Step 4: Fetching active reasons from database`);
      // 2. Buscar motivos ativos com lançamentos não sincronizados
      const startReasonsTime = Date.now();
      const activeReasons = await databaseService.getActiveReasons();
      const reasonsTime = Date.now() - startReasonsTime;
      console.log(`[DEBUG] Active reasons fetched in ${reasonsTime}ms - Count: ${activeReasons.length}`);
      console.log(`[DEBUG] Reasons list:`, activeReasons.map(r => `${r.codigo}-${r.descricao}`));
      
      if (activeReasons.length === 0) {
        console.log(`[DEBUG] exportEntriesToPublicDirectory EXIT - No reasons found`);
        return {
          success: false,
          message: 'Nenhum motivo encontrado no sistema',
          savedFiles: [],
          location: directoryUri,
          errors: []
        };
      }

      console.log(`[DEBUG] Step 5: Processing each reason for export`);
      // 3. Para cada motivo, verificar lançamentos não sincronizados e exportar
      for (let i = 0; i < activeReasons.length; i++) {
        const reason = activeReasons[i];
        console.log(`[DEBUG] Processing reason ${i + 1}/${activeReasons.length}: ${reason.codigo} - ${reason.descricao}`);
        console.log(`[DEBUG] Reason processing ENTRY - reasonId: ${reason.id}`);
        
        try {
          console.log(`[DEBUG] Fetching consolidated entries for reason ${reason.codigo}`);
          const startEntriesTime = Date.now();
          const consolidatedEntries = await databaseService.getConsolidatedEntriesByReason(reason.id!);
          const entriesTime = Date.now() - startEntriesTime;
          console.log(`[DEBUG] Consolidated entries fetched in ${entriesTime}ms - Count: ${consolidatedEntries.length}`);
          
          // Ignorar motivos sem lançamentos pendentes
          if (consolidatedEntries.length === 0) {
            console.log(`[DEBUG] Reason ${reason.codigo} - No pending entries, skipping`);
            console.log(`Motivo ${reason.codigo} - Nenhum lançamento pendente, ignorando`);
            continue;
          }

          console.log(`[DEBUG] Entries preview:`, consolidatedEntries.slice(0, 3).map(e => `${e.product_code}:${e.total_quantity}${e.unit_type}`));

          // 4. Gerar nome do arquivo: motivoXX_YYYYMMDD.txt
          const currentDate = new Date();
          const fileName = `motivo${reason.codigo.padStart(2, '0')}_${this.getFormattedDate(currentDate)}.txt`;
          console.log(`[DEBUG] Generated filename: ${fileName}`);

          // 5. Gerar conteúdo do arquivo com formato correto
          console.log(`[DEBUG] Generating file content`);
          const startContentTime = Date.now();
          const fileContent = this.generateFileContent(consolidatedEntries);
          const contentTime = Date.now() - startContentTime;
          console.log(`[DEBUG] File content generated in ${contentTime}ms - Length: ${fileContent.length} chars`);
          console.log(`[DEBUG] Content preview:`, fileContent.substring(0, 100) + '...');

          // 6. Criar arquivo usando StorageAccessFramework (baseado no exemplo.txt)
          console.log(`[DEBUG] Creating file via StorageAccessFramework`);
          const startCreateTime = Date.now();
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            directoryUri,
            fileName,
            'text/plain'
          );
          const createTime = Date.now() - startCreateTime;
          console.log(`[DEBUG] File created in ${createTime}ms - URI: ${fileUri}`);

          // 7. Escrever conteúdo no arquivo (baseado no exemplo.txt)
          console.log(`[DEBUG] Writing content to file`);
          const startWriteTime = Date.now();
          await FileSystem.writeAsStringAsync(fileUri, fileContent);
          const writeTime = Date.now() - startWriteTime;
          console.log(`[DEBUG] Content written in ${writeTime}ms`);

          // 8. Marcar lançamentos como sincronizados APENAS após sucesso da escrita
          console.log(`[DEBUG] Marking entries as synchronized for reason ${reason.codigo}`);
          const startSyncTime = Date.now();
          await databaseService.markEntriesAsSynchronized(reason.id!);
          const syncTime = Date.now() - startSyncTime;
          console.log(`[DEBUG] Entries marked as synchronized in ${syncTime}ms`);

          savedFiles.push(fileName);
          console.log(`[DEBUG] Reason processing SUCCESS - File: ${fileName}`);
          console.log(`Motivo ${reason.codigo} exportado para público: ${fileName} (${consolidatedEntries.length} produtos)`);

        } catch (motivoError) {
          // Tratamento de erro isolado por motivo (não interrompe outros motivos)
          console.log(`[DEBUG] Reason processing ERROR - Reason: ${reason.codigo}`);
          console.error(`[DEBUG] Error details:`, motivoError);
          console.error(`[DEBUG] Error type: ${motivoError instanceof Error ? motivoError.constructor.name : typeof motivoError}`);
          console.error(`[DEBUG] Error message: ${motivoError instanceof Error ? motivoError.message : String(motivoError)}`);
          
          const errorMessage = `Erro ao exportar motivo ${reason.codigo}: ${motivoError}`;
          errors.push(errorMessage);
          console.error(errorMessage);
          console.log(`[DEBUG] NOT marking as synchronized due to error - continuing with next reason`);
          // NÃO marcar como sincronizado em caso de erro
          // Continuar com próximos motivos
        }
        
        console.log(`[DEBUG] Reason processing EXIT - reasonId: ${reason.id}`);
      }

      console.log(`[DEBUG] Step 6: Preparing final result`);
      console.log(`[DEBUG] Final state - savedFiles: ${savedFiles.length}, errors: ${errors.length}`);
      console.log(`[DEBUG] Saved files list:`, savedFiles);
      console.log(`[DEBUG] Errors list:`, errors);
      
      // 9. Preparar resultado final
      if (savedFiles.length === 0 && errors.length === 0) {
        console.log(`[DEBUG] exportEntriesToPublicDirectory EXIT - No pending entries found`);
        return {
          success: false,
          message: 'Nenhum motivo com lançamentos pendentes encontrado',
          savedFiles: [],
          location: directoryUri,
          errors: []
        };
      }

      let message = '';
      if (savedFiles.length > 0) {
        message = `${savedFiles.length} arquivo(s) exportado(s) com sucesso`;
        console.log(`[DEBUG] Success message: ${message}`);
      }
      
      if (errors.length > 0) {
        if (message) message += '\n';
        message += `${errors.length} erro(s) encontrado(s)`;
        console.log(`[DEBUG] Error message appended: ${message}`);
      }

      const finalResult = {
        success: savedFiles.length > 0,
        message,
        savedFiles,
        location: directoryUri,
        errors
      };
      
      console.log(`[DEBUG] Final result:`, finalResult);
      console.log(`[DEBUG] exportEntriesToPublicDirectory EXIT - Success with results`);

      return finalResult;

    } catch (globalError) {
      console.log(`[DEBUG] exportEntriesToPublicDirectory EXIT - Global error occurred`);
      console.error(`[DEBUG] Global error details:`, globalError);
      console.error(`[DEBUG] Global error type: ${globalError instanceof Error ? globalError.constructor.name : typeof globalError}`);
      console.error(`[DEBUG] Global error message: ${globalError instanceof Error ? globalError.message : String(globalError)}`);
      
      const errorMessage = `Erro geral na exportação pública: ${globalError}`;
      console.error(errorMessage);
      
      const errorResult = {
        success: false,
        message: errorMessage,
        savedFiles,
        location: directoryUri,
        errors: [errorMessage]
      };
      
      console.log(`[DEBUG] Error result:`, errorResult);
      
      return errorResult;
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
          // Usa includeAll=true para exportação interna incluir todos os registros
          const consolidatedEntries = await databaseService.getConsolidatedEntriesByReason(reason.id!, true);
          
          if (consolidatedEntries.length === 0) {
            console.log(`Motivo ${reason.codigo} - Nenhum lançamento pendente, ignorando`);
            continue;
          }

          // Garante que o diretório base existe
          const baseDir = await this.getAppDocumentDirectory();
          console.log(`[DEBUG] Using base directory: ${baseDir}`);

          // Em produção com SAF, não precisamos criar diretórios
          if (!__DEV__ && baseDir.startsWith('content://')) {
            console.log(`[DEBUG] Using SAF, skipping directory creation`);
          } else {
            console.log(`[DEBUG] Creating base directory: ${baseDir}`);
            await this.ensureDirectoryExists(baseDir);
          }

          // Obtém o diretório específico do motivo
          const motivoDir = await this.getMotivoDirectory(reason.codigo);
          console.log(`[DEBUG] Using motivo directory: ${motivoDir}`);

          if (!__DEV__ && baseDir.startsWith('content://')) {
            console.log(`[DEBUG] Using SAF, skipping motivo directory creation`);
          } else {
            console.log(`[DEBUG] Creating motivo directory: ${motivoDir}`);
            await this.ensureDirectoryExists(motivoDir);
          }

          const currentDate = new Date();
          const fileName = this.getFileName(reason.codigo, currentDate);
          const filePath = `${motivoDir}${fileName}`;

          console.log(`[DEBUG] ========== Expo Go File Details ==========`);
          console.log(`[DEBUG] File name: ${fileName}`);
          console.log(`[DEBUG] Full path: ${filePath}`);
          
          // Verifica se o arquivo existe antes de tentar criar
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          console.log(`[DEBUG] File exists: ${fileInfo.exists}`);
          console.log(`[DEBUG] File info:`, fileInfo);

          const fileLines: string[] = [];
          
          for (const entry of consolidatedEntries) {
            const formattedCode = this.formatProductCode(entry.product_code);
            const formattedQuantity = this.formatQuantity(entry.total_quantity, entry.unit_type);
            const line = `Inventario ${formattedCode} ${formattedQuantity}`;
            fileLines.push(line);
          }

          const fileContent = fileLines.join('\n') + '\n';
          console.log(`[DEBUG] Writing file content (${fileContent.length} bytes)`);
          await FileSystem.writeAsStringAsync(filePath, fileContent, {
            encoding: FileSystem.EncodingType.UTF8
          });
          console.log(`[DEBUG] File written successfully`);

          // Verifica se o arquivo foi criado
          const finalFileInfo = await FileSystem.getInfoAsync(filePath);
          console.log(`[DEBUG] Final file exists: ${finalFileInfo.exists}`);
          console.log(`[DEBUG] Final file info:`, finalFileInfo);
          console.log(`[DEBUG] =======================================`);

          // Não marcar como sincronizado para permitir múltiplas exportações internas
          // await databaseService.markEntriesAsSynchronized(reason.id!);

          exportedMotivos.push(`motivo${reason.codigo.padStart(2, '0')}`);
          console.log(`Motivo ${reason.codigo} exportado internamente: ${fileName} (${consolidatedEntries.length} produtos)`);

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
          const motivosDir = await this.getAppDocumentDirectory();
          console.log(`[DEBUG] Sharing files from directory: ${motivosDir}`);
          
          // Em produção com SAF
          if (!__DEV__ && motivosDir.startsWith('content://')) {
            return {
              success: true,
              message: 'Arquivos disponíveis no diretório selecionado'
            };
          }

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
                  
                  const uri = await FileSystem.StorageAccessFramework.createFileAsync(
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
        const motivosDir = await this.getAppDocumentDirectory();
        if (!__DEV__ && motivosDir.startsWith('content://')) {
          // Em produção com SAF, compartilhar o diretório selecionado
          return {
            success: true,
            message: 'Arquivos disponíveis no diretório selecionado'
          };
        }
        
        // Em desenvolvimento, compartilhar o diretório do app
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
      const motivosDir = await this.getAppDocumentDirectory();
      // Em desenvolvimento
      if (!__DEV__) {
        console.log('[DEBUG] Running in production mode, files are managed by SAF');
        return [];
      }

      // Verifica se o diretório existe
      const dirInfo = await FileSystem.getInfoAsync(motivosDir);
      
      if (!dirInfo.exists) {
        console.log('[DEBUG] Directory does not exist:', motivosDir);
        return [];
      }

      // Lista os subdiretórios
      const dirs = await FileSystem.readDirectoryAsync(motivosDir);
      console.log('[DEBUG] Found directories:', dirs);
      const result: { motivo: string; files: string[] }[] = [];

      for (const motivoDir of dirs) {
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