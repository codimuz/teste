import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { ProductSearchInput } from '@/components/ProductSearchInput';
import { databaseService } from '@/services/database';
import { fileService } from '@/services/fileService';
import { Product, Reason } from '@/types/database';

export default function HomeScreen() {
  // Estados principais
  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [currentTotal, setCurrentTotal] = useState(0);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Inicialização do banco de dados
  useEffect(() => {
    initializeDatabase();
  }, []);

  const initializeDatabase = async () => {
    try {
      setIsLoading(true);
      await databaseService.init();
      await loadReasons();
      setIsInitialized(true);
    } catch (error) {
      console.error('Erro ao inicializar banco:', error);
      Alert.alert('Erro', 'Erro ao inicializar aplicativo');
    } finally {
      setIsLoading(false);
    }
  };

  const loadReasons = async () => {
    try {
      const reasonsList = await databaseService.getAllReasons();
      setReasons(reasonsList);
    } catch (error) {
      console.error('Erro ao carregar motivos:', error);
    }
  };

  // Atualiza total quando produto, motivo ou quantidade mudam
  useEffect(() => {
    updateCurrentTotal();
  }, [selectedProduct, selectedReasonId, quantity]);

  const updateCurrentTotal = async () => {
    if (!selectedProduct || !selectedReasonId) {
      setCurrentTotal(0);
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const total = await databaseService.getTotalQuantityForProductAndReason(
        selectedProduct.codigo,
        selectedReasonId,
        today
      );
      
      // Adiciona a quantidade digitada ao total atual
      const newQuantity = parseFloat(quantity) || 0;
      setCurrentTotal(total + newQuantity);
    } catch (error) {
      console.error('Erro ao calcular total:', error);
      setCurrentTotal(0);
    }
  };

  // Handlers
  const handleImportProducts = async () => {
    try {
      setIsLoading(true);
      const result = await fileService.importProducts();
      
      if (result.success) {
        Alert.alert(
          'Importação Concluída',
          result.message,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Erro na Importação', result.message);
      }
    } catch (error) {
      Alert.alert('Erro', 'Erro durante a importação de produtos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportEntries = async () => {
    try {
      setIsLoading(true);
      const result = await fileService.exportTodaysEntries();
      
      if (result.success) {
        Alert.alert(
          'Exportação Concluída',
          `${result.message}\n\nArquivos: ${result.files.join(', ')}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Aviso', result.message);
      }
    } catch (error) {
      Alert.alert('Erro', 'Erro durante a exportação');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelected = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleQuantityChange = (text: string) => {
    // Remove caracteres não numéricos exceto ponto e vírgula
    const cleanText = text.replace(/[^0-9.,]/g, '').replace(',', '.');
    
    // Para produtos UN, não permite mais de 3 casas decimais (mas aceita entrada)
    if (selectedProduct?.unit_type === 'UN') {
      const parts = cleanText.split('.');
      if (parts.length > 2) {
        return; // Não permite múltiplos pontos
      }
    }
    
    setQuantity(cleanText);
  };

  const validateAndFormatQuantity = (inputQuantity: string, unitType: 'UN' | 'KG'): number => {
    const numericQuantity = parseFloat(inputQuantity);
    
    if (isNaN(numericQuantity) || numericQuantity <= 0) {
      throw new Error('Quantidade deve ser um número positivo');
    }
    
    if (unitType === 'UN') {
      // Para unidades, aplica floor conforme especificado
      return Math.floor(numericQuantity);
    }
    
    return numericQuantity;
  };

  const handleSave = async () => {
    try {
      // Validações
      if (!selectedReasonId) {
        Alert.alert('Erro', 'Selecione um motivo');
        return;
      }
      
      if (!selectedProduct) {
        Alert.alert('Erro', 'Selecione um produto');
        return;
      }
      
      if (!quantity.trim()) {
        Alert.alert('Erro', 'Digite uma quantidade');
        return;
      }

      setIsLoading(true);

      // Valida e formata quantidade
      const validatedQuantity = validateAndFormatQuantity(quantity, selectedProduct.unit_type);
      
      const today = new Date().toISOString().split('T')[0];
      
      // Salva no banco de dados
      await databaseService.insertOrUpdateEntry({
        product_code: selectedProduct.codigo,
        reason_id: selectedReasonId,
        quantity: validatedQuantity,
        entry_date: today,
        is_exported: false,
        is_synchronized: false,
      });

      // Busca o motivo para obter o código
      const selectedReason = reasons.find(r => r.id === selectedReasonId);
      if (!selectedReason) {
        throw new Error('Motivo não encontrado');
      }

      // Salva/atualiza arquivo .txt
      await fileService.saveEntryToFile(
        {
          product_code: selectedProduct.codigo,
          reason_id: selectedReasonId,
          quantity: validatedQuantity,
          entry_date: today,
          is_exported: false,
          is_synchronized: false,
        },
        selectedReason.codigo,
        selectedProduct.unit_type
      );

      // Feedback e limpeza
      Alert.alert(
        'Sucesso',
        `Lançamento salvo com sucesso!\nQuantidade: ${validatedQuantity} ${selectedProduct.unit_type}`,
        [{ text: 'OK' }]
      );
      
      // Limpa apenas a quantidade, mantém produto e motivo selecionados
      setQuantity('');
      
    } catch (error) {
      console.error('Erro ao salvar:', error);
      Alert.alert('Erro', `Erro ao salvar lançamento: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrentTotal = () => {
    if (!selectedProduct) return '';
    
    if (selectedProduct.unit_type === 'UN') {
      return `${Math.floor(currentTotal)} unidades`;
    } else {
      return `${currentTotal.toFixed(3)} kg`;
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Inicializando aplicativo...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <Text style={styles.title}>Gestão de Quebras</Text>
      </View>

      {/* Botões de Importação e Exportação */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.importButton]}
          onPress={handleImportProducts}
          disabled={isLoading}
        >
          <IconSymbol name="square.and.arrow.down" size={20} color="#fff" />
          <Text style={styles.buttonText}>Importar Produtos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.exportButton]}
          onPress={handleExportEntries}
          disabled={isLoading}
        >
          <IconSymbol name="square.and.arrow.up" size={20} color="#fff" />
          <Text style={styles.buttonText}>Exportar Lançamentos</Text>
        </TouchableOpacity>
      </View>

      {/* Seleção de Motivo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motivo da Quebra</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedReasonId}
            onValueChange={(itemValue) => setSelectedReasonId(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Selecione um motivo..." value={null} />
            {reasons.map((reason) => (
              <Picker.Item
                key={reason.id}
                label={`${reason.codigo} - ${reason.descricao}`}
                value={reason.id}
              />
            ))}
          </Picker>
        </View>
      </View>

      {/* Busca de Produto */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Produto</Text>
        <ProductSearchInput
          onProductSelected={handleProductSelected}
          placeholder="Digite o código ou nome do produto..."
        />
      </View>

      {/* Informações do Produto Selecionado */}
      {selectedProduct && (
        <View style={styles.productInfo}>
          <Text style={styles.productTitle}>Produto Selecionado:</Text>
          <Text style={styles.productDetail}>
            <Text style={styles.productLabel}>Código:</Text> {selectedProduct.codigo}
          </Text>
          <Text style={styles.productDetail}>
            <Text style={styles.productLabel}>Nome:</Text> {selectedProduct.nome}
          </Text>
          <Text style={styles.productDetail}>
            <Text style={styles.productLabel}>Unidade:</Text> {selectedProduct.unit_type}
          </Text>
          {selectedProduct.preco_regular && (
            <Text style={styles.productDetail}>
              <Text style={styles.productLabel}>Preço:</Text> R$ {selectedProduct.preco_regular.toFixed(2)}
              {selectedProduct.preco_clube && ` / R$ ${selectedProduct.preco_clube.toFixed(2)} (Clube)`}
            </Text>
          )}
        </View>
      )}

      {/* Entrada de Quantidade */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Quantidade {selectedProduct ? `(${selectedProduct.unit_type === 'UN' ? 'Unidades' : 'Quilos'})` : ''}
        </Text>
        <TextInput
          style={styles.quantityInput}
          value={quantity}
          onChangeText={handleQuantityChange}
          placeholder={selectedProduct?.unit_type === 'KG' ? 'Ex: 1.500' : 'Ex: 10'}
          keyboardType="numeric"
          editable={!!selectedProduct}
        />
        
        {/* Exibição do Total Atualizado */}
        {selectedProduct && selectedReasonId && currentTotal > 0 && (
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total previsto para hoje:</Text>
            <Text style={styles.totalValue}>{formatCurrentTotal()}</Text>
          </View>
        )}
      </View>

      {/* Botão Salvar */}
      <TouchableOpacity
        style={[
          styles.saveButton,
          (!selectedReasonId || !selectedProduct || !quantity.trim() || isLoading) && styles.saveButtonDisabled
        ]}
        onPress={handleSave}
        disabled={!selectedReasonId || !selectedProduct || !quantity.trim() || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <IconSymbol name="checkmark.circle.fill" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>Salvar Lançamento</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  importButton: {
    backgroundColor: '#28a745',
  },
  exportButton: {
    backgroundColor: '#007bff',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  picker: {
    height: 50,
  },
  productInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  productDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  productLabel: {
    fontWeight: '600',
    color: '#333',
  },
  quantityInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  totalContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  totalLabel: {
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 16,
    color: '#0d47a1',
    fontWeight: 'bold',
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 24,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
