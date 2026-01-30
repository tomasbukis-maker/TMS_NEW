import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

interface AutocompleteInputProps {
  fieldType: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
  className?: string;
  listId?: string;
  minLength?: number;
  onBlur?: () => void;
}

const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  fieldType,
  value,
  onChange,
  placeholder = '',
  required = false,
  style = {},
  className = '',
  listId,
  minLength = 2,
  onBlur
}) => {
  const [suggestions, setSuggestions] = useState<Array<{ id: number; value: string; usage_count: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ieškoti pasiūlymų
  const searchSuggestions = async (query: string) => {
    if (!query || query.length < minLength) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get('/orders/autocomplete/search/', {
        params: {
          field_type: fieldType,
          q: query
        }
      });
      
      setSuggestions(response.data || []);
      setShowSuggestions(true);
    } catch (error) {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Išsaugoti pasiūlymą (padidinti usage_count arba sukurti naują)
  const saveSuggestion = async (suggestionValue: string) => {
    if (!suggestionValue || suggestionValue.trim().length < minLength) {
      return;
    }

    try {
      await api.post('/orders/autocomplete/save/', {
        field_type: fieldType,
        value: suggestionValue.trim()
      });
    } catch (error) {
      // Silent fail for background operations
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce search
    timeoutRef.current = setTimeout(() => {
      searchSuggestions(newValue);
    }, 300);
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestionValue: string) => {
    onChange(suggestionValue);
    setShowSuggestions(false);
    if (inputRef.current) {
      inputRef.current.blur();
    }
    // Išsaugoti pasiūlymą
    saveSuggestion(suggestionValue);
  };

  // Handle input focus
  const handleFocus = () => {
    if (value && value.length >= minLength) {
      searchSuggestions(value);
    }
  };

  // Handle input blur
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Delay to allow suggestion click to fire first
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        if (onBlur) {
          onBlur();
        }
        // Išsaugoti pasiūlymą, jei yra reikšmė
        if (value && value.trim().length >= minLength) {
          saveSuggestion(value);
        }
      }
    }, 200);
  };

  // Handle key down
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        const firstSuggestion = dropdownRef.current?.querySelector('.suggestion-item') as HTMLElement;
        if (firstSuggestion) {
          firstSuggestion.focus();
        }
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 6px',
    fontSize: '12px',
    ...style
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
        className={className}
        list={listId}
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="autocomplete-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: '#fff',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            marginTop: '2px',
            maxHeight: '200px',
            overflowY: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}
        >
          {isLoading && (
            <div style={{ padding: '8px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
              Kraunama...
            </div>
          )}
          {!isLoading && suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="suggestion-item"
              onClick={() => handleSuggestionClick(suggestion.value)}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                borderBottom: '1px solid #f0f0f0',
                transition: 'background-color 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
              }}
            >
              <span>{suggestion.value}</span>
              {suggestion.usage_count > 1 && (
                <span style={{ fontSize: '10px', color: '#666', marginLeft: '8px' }}>
                  ({suggestion.usage_count}x)
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutocompleteInput;

