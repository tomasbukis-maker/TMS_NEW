import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

interface AutocompleteTextareaProps {
  fieldType: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
  className?: string;
  rows?: number;
  onBlur?: () => void;
}

const AutocompleteTextarea: React.FC<AutocompleteTextareaProps> = ({
  fieldType,
  value,
  onChange,
  placeholder = '',
  required = false,
  style = {},
  className = '',
  rows = 3,
  onBlur
}) => {
  const [suggestions, setSuggestions] = useState<Array<{ id: number; value: string; usage_count: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ieškoti pasiūlymų (tik jei tekstas trumpas arba pagal paskutinį žodį)
  const searchSuggestions = async (query: string) => {
    // Notes laukams siūlyti pagal paskutinę frazę (paskutiniai žodžiai)
    const words = query.trim().split(/\s+/);
    const lastWords = words.slice(-3).join(' '); // Paskutiniai 3 žodžiai
    
    if (!lastWords || lastWords.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get('/orders/autocomplete/search/', {
        params: {
          field_type: fieldType,
          q: lastWords
        }
      });
      
      setSuggestions(response.data || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Klaida ieškant pasiūlymų:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Išsaugoti pasiūlymą
  const saveSuggestion = async (suggestionValue: string) => {
    if (!suggestionValue || suggestionValue.trim().length < 3) {
      return;
    }

    try {
      await api.post('/orders/autocomplete/save/', {
        field_type: fieldType,
        value: suggestionValue.trim().substring(0, 500) // Apriboti iki 500 simbolių
      });
      console.log(`✓ Išsaugota autocomplete pasiūlymas (textarea): ${fieldType} = ${suggestionValue.trim().substring(0, 50)}...`);
    } catch (error: any) {
      console.error('✗ Klaida išsaugant pasiūlymą:', error);
      console.error('Error details:', error.response?.data || error.message);
    }
  };

  // Handle textarea change
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce search - tik jei tekstas ne per ilgas
    if (newValue.length < 200) {
      timeoutRef.current = setTimeout(() => {
        searchSuggestions(newValue);
      }, 500);
    } else {
      setShowSuggestions(false);
    }
  };

  // Handle suggestion click - įterpti į textarea vietoj dabartinio teksto arba pridėti
  const handleSuggestionClick = (suggestionValue: string) => {
    const currentValue = value || '';
    const words = currentValue.trim().split(/\s+/);
    const lastWords = words.slice(-3).join(' ');
    
    // Rasti paskutinės frazės poziciją ir pakeisti ją
    const lastIndex = currentValue.lastIndexOf(lastWords);
    if (lastIndex >= 0) {
      const newValue = currentValue.substring(0, lastIndex) + suggestionValue + 
                      (currentValue.endsWith(' ') ? ' ' : ' ');
      onChange(newValue);
    } else {
      // Jei nerasta, tiesiog pridėti prie galo
      onChange(currentValue + (currentValue ? ' ' : '') + suggestionValue + ' ');
    }
    
    setShowSuggestions(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    // Išsaugoti pasiūlymą
    saveSuggestion(suggestionValue);
  };

  // Handle textarea focus
  const handleFocus = () => {
    if (value && value.length < 200) {
      searchSuggestions(value);
    }
  };

  // Handle textarea blur
  const handleBlurEvent = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        if (onBlur) {
          onBlur();
        }
        // Išsaugoti pasiūlymą, jei yra reikšmė
        if (value && value.trim().length >= 3) {
          // Išsaugoti tik pirmąsias 500 simbolių
          saveSuggestion(value.substring(0, 500));
        }
      }
    }, 200);
  };

  // Handle key down
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'ArrowDown' && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      const firstSuggestion = dropdownRef.current?.querySelector('.suggestion-item') as HTMLElement;
      if (firstSuggestion) {
        firstSuggestion.focus();
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
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    resize: 'vertical',
    ...style
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onFocus={handleFocus}
        onBlur={handleBlurEvent}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        rows={rows}
        style={textareaStyle}
        className={className}
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

export default AutocompleteTextarea;


