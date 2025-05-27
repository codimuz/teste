import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Product } from '@/types/database';
import { databaseService } from '@/services/database';

interface ProductSearchInputProps {
  onProductSelected: (product: Product) => void;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
}

export const ProductSearchInput: React.FC<ProductSearchInputProps> = ({
  onProductSelected,
  placeholder = "Digite o código ou nome do produto...",
  value = "",
  onChangeText,
}) => {
  const [searchText, setSearchText] = useState(value);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const searchProducts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const results = await databaseService.searchProducts(query, 10);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      Alert.alert('Erro', 'Erro ao buscar produtos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchProducts(searchText);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchText, searchProducts]);

  const handleTextChange = (text: string) => {
    setSearchText(text);
    onChangeText?.(text);
  };

  const handleProductSelect = (product: Product) => {
    setSearchText(`${product.codigo} - ${product.nome}`);
    setShowSuggestions(false);
    setSuggestions([]);
    onProductSelected(product);
  };

  const renderSuggestionItem = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => handleProductSelect(item)}
    >
      <View style={styles.suggestionContent}>
        <Text style={styles.suggestionCode}>{item.codigo}</Text>
        <Text style={styles.suggestionName} numberOfLines={2}>
          {item.nome}
        </Text>
        <Text style={styles.suggestionType}>
          {item.unit_type} {item.preco_regular ? `- R$ ${item.preco_regular.toFixed(2)}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={searchText}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
      />
      
      {isLoading && (
        <Text style={styles.loadingText}>Buscando...</Text>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            renderItem={renderSuggestionItem}
            keyExtractor={(item) => item.codigo}
            style={styles.suggestionsList}
            maxToRenderPerBatch={10}
            initialNumToRender={5}
            nestedScrollEnabled
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    zIndex: 1000,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  suggestionName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  suggestionType: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});