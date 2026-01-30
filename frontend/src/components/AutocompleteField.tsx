import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import './AutocompleteField.css';

interface AutocompleteFieldProps {
  fieldType: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  style?: React.CSSProperties;
  className?: string;
  disabled?: boolean;
  minLength?: number; // Minimum symbols before search starts (default: 1)
  debounceMs?: number; // Debounce delay in ms (default: 300)
  onSave?: () => void; // Optional callback after saving to DB
}

interface AutocompleteSuggestion {
  id?: number;
  value: string;
  usage_count?: number;
  last_used_at?: string;
}

const AutocompleteField: React.FC<AutocompleteFieldProps> = ({
  fieldType,
  value,
  onChange,
  label,
  placeholder,
  required = false,
  multiline = false,
  style,
  className = '',
  disabled = false,
  minLength = 1,
  debounceMs = 300,
  onSave,
}) => {
  const [searchValue, setSearchValue] = useState<string>(value || '');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [wasSuggestionSelected, setWasSuggestionSelected] = useState<boolean>(false);
  // Removed isFocused state - not needed
  const [hasUserInteracted, setHasUserInteracted] = useState<boolean>(false); // Track if user has interacted
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const hasLoadedSuggestionsRef = useRef<boolean>(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync searchValue with value prop when value changes externally
  useEffect(() => {
    if (value !== searchValue) {
      setSearchValue(value || '');
      // Reset interaction flag when value changes externally (e.g., form loaded with data)
      // This prevents suggestions from appearing automatically when modal opens
      setHasUserInteracted(false);
      setWasSuggestionSelected(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Get related field types (for route_from/route_to - show suggestions from both)
  const getRelatedFieldTypes = useCallback((fieldType: string): string[] => {
    // Map old route_from_* and route_to_* to new unified field types
    const fieldTypeMapping: { [key: string]: string } = {
      'route_from_country': 'country',
      'route_to_country': 'country',
      'route_from_postal_code': 'postal_code',
      'route_to_postal_code': 'postal_code',
      'route_from_city': 'city',
      'route_to_city': 'city',
      'route_from_address': 'address',
      'route_to_address': 'address',
    };

    // If it's an old field type, map it to new one
    if (fieldTypeMapping[fieldType]) {
      return [fieldTypeMapping[fieldType]];
    }

    // For other fields, just use the fieldType itself
    return [fieldType];
  }, []);

  // Load all suggestions on mount for dropdown-like behavior
  const loadAllSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const relatedFieldTypes = getRelatedFieldTypes(fieldType);

      if (relatedFieldTypes.length > 1) {
        const promises = relatedFieldTypes.map(async (ft) => {
          try {
            console.log('AutocompleteField loading suggestions for:', ft);
            const response = await api.get('/orders/autocomplete/search/', {
              params: {
                field_type: ft,
                q: '', // Empty query to get all
              },
            });
            console.log('AutocompleteField response for', ft, ':', response.data);
            return response.data || [];
          } catch (error) {
            return [];
          }
        });

        const results = await Promise.all(promises);
        const mergedSuggestions = results.flat();

        // Remove duplicates and sort
        const uniqueSuggestions = mergedSuggestions.filter((suggestion, index, self) =>
          index === self.findIndex(s => s.value === suggestion.value)
        ).sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));

        setSuggestions(uniqueSuggestions);
      } else {
        const mappedFieldType = relatedFieldTypes[0];
        const response = await api.get('/orders/autocomplete/search/', {
          params: {
            field_type: mappedFieldType,
            q: '', // Empty query to get all
          },
        });
        const data = response.data || [];
        setSuggestions(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [fieldType, getRelatedFieldTypes]);

  // Search function
  const searchSuggestions = useCallback(async (query: string) => {
    if (query.length < minLength) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const relatedFieldTypes = getRelatedFieldTypes(fieldType);
      
      // If there are multiple related field types, search in all of them and merge results
      if (relatedFieldTypes.length > 1) {
        const promises = relatedFieldTypes.map(async (ft) => {
          try {
            const response = await api.get('/orders/autocomplete/search/', {
              params: {
                field_type: ft,
                q: query.trim(),
              },
            });
            return response.data || [];
          } catch (error) {
            return [];
          }
        });
        
        const results = await Promise.all(promises);
        // Merge all results and remove duplicates by value
        const mergedSuggestions: AutocompleteSuggestion[] = [];
        const seenValues = new Set<string>();
        
        results.flat().forEach((suggestion: AutocompleteSuggestion) => {
          const normalizedValue = suggestion.value.trim().toLowerCase();
          if (!seenValues.has(normalizedValue)) {
            seenValues.add(normalizedValue);
            mergedSuggestions.push(suggestion);
          }
        });
        
        // Sort by usage_count (descending) if available
        mergedSuggestions.sort((a, b) => {
          const countA = a.usage_count || 0;
          const countB = b.usage_count || 0;
          return countB - countA;
        });
        
        setSuggestions(mergedSuggestions);
      } else {
        // Single field type search
        const mappedFieldType = relatedFieldTypes[0];
        const response = await api.get('/orders/autocomplete/search/', {
          params: {
            field_type: mappedFieldType,
            q: query.trim(),
          },
        });
        const data = response.data || [];
        setSuggestions(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [fieldType, minLength, getRelatedFieldTypes]);

  // Load all suggestions on mount
  useEffect(() => {
    if (!hasLoadedSuggestionsRef.current) {
      hasLoadedSuggestionsRef.current = true;
      loadAllSuggestions();
    }
  }, [fieldType, loadAllSuggestions]);

  // Debounced search effect - only search if user is actively interacting (focused or typing)
  useEffect(() => {
    // Reset selection flag when user starts typing
    if (searchValue !== value && wasSuggestionSelected) {
      setWasSuggestionSelected(false);
    }

    // Mark user as interacted when they type
    if (searchValue && !hasUserInteracted) {
      setHasUserInteracted(true);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [searchValue, value, wasSuggestionSelected, hasUserInteracted]);

  // Debounce search when user types
  useEffect(() => {
    if (!hasUserInteracted || searchValue.length < minLength) {
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      console.log('AutocompleteField searching for:', searchValue);
      searchSuggestions(searchValue);
    }, debounceMs);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchValue, hasUserInteracted, minLength, debounceMs, searchSuggestions]);

  // Save to DB function
  const saveToDatabase = useCallback(async (valueToSave: string) => {
    if (!valueToSave || !valueToSave.trim()) {
      return;
    }

    try {
      await api.post('/orders/autocomplete/save/', {
        field_type: fieldType,
        value: valueToSave.trim(),
      });
      if (onSave) {
        onSave();
      }
    } catch (error: any) {
      // Error handling - silent fail for background operations
    }
  }, [fieldType, onSave]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    onChange(newValue);
    // User is typing, mark as interacted and reset selection flag
    setHasUserInteracted(true);
    setWasSuggestionSelected(false);

    // If dropdown is closed and user starts typing, open it
    if (!isDropdownOpen && newValue.trim()) {
      setIsDropdownOpen(true);
    }
  };

  // Handle suggestion select
  const handleSuggestionSelect = (suggestionValue: string) => {
    // Clear any pending search timeout to prevent reopening suggestions
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    // Set values and close dropdown (but keep suggestions for next open)
    setSearchValue(suggestionValue);
    onChange(suggestionValue);
    setIsDropdownOpen(false);
    setIsLoading(false);
    setWasSuggestionSelected(true); // Mark that suggestion was selected
    
    // Save to DB after a delay (to avoid multiple saves)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      saveToDatabase(suggestionValue);
    }, 500);
  };

  // Handle focus
  const handleFocus = () => {
    setHasUserInteracted(true); // Mark as interacted when user focuses
    setIsFocused(true);
    // Don't automatically open dropdown on focus - let click handler control it
  };

  // Handle input click
  const handleInputClick = () => {
    // If no suggestions loaded yet, load them
    if (suggestions.length === 0 && !isLoading && !hasLoadedSuggestionsRef.current) {
      hasLoadedSuggestionsRef.current = true;
      loadAllSuggestions();
    }

    setIsDropdownOpen(!isDropdownOpen);
  };

  // Handle blur
  const handleBlur = () => {
    setIsFocused(false);
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Handle key down (Escape to close dropdown)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setSuggestions([]);
    }
  };

  const InputComponent = multiline ? 'textarea' : 'input';
  const inputProps = multiline
    ? {}
    : {
        type: 'text',
      };

  return (
    <div className={`autocomplete-field-wrapper ${isFocused ? 'focused' : ''} ${className}`} style={{ position: 'relative', ...style }}>
      {label && (
        <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
          {label} {required && <span style={{ color: 'red' }}>*</span>}
        </label>
      )}
      <div className="autocomplete-input-with-dropdown" onClick={handleInputClick}>
        <InputComponent
          {...inputProps}
          ref={inputRef as any}
          value={searchValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || `Pasirinkite arba įveskite...`}
          required={required}
          disabled={disabled}
          style={{
            padding: multiline ? '5px 24px 5px 6px' : '5px 24px 5px 6px',
            fontSize: '12px',
            width: '100%',
            cursor: 'pointer',
            ...style, // Allow parent styles to override
          }}
        />
        <div className="autocomplete-dropdown-arrow" onClick={(e) => {
          e.stopPropagation();
          setIsDropdownOpen(!isDropdownOpen);
        }}></div>
      </div>
      {isLoading && suggestions.length === 0 && searchValue.length >= minLength && (
        <div className="autocomplete-loading" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', padding: '5px', fontSize: '11px', color: '#666' }}>
          Ieškoma...
        </div>
      )}
      {isDropdownOpen && suggestions.length > 0 && (
        <div className="autocomplete-dropdown" ref={dropdownRef} style={{ zIndex: 2000 }}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id || index}
              className="autocomplete-dropdown-item"
              onClick={() => handleSuggestionSelect(suggestion.value)}
              onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
            >
              {suggestion.value}
              {suggestion.usage_count && suggestion.usage_count > 1 && (
                <span style={{ fontSize: '10px', color: '#999', marginLeft: '8px' }}>
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

export default AutocompleteField;

