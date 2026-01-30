import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import './AutocompleteField.css';

interface RouteContact {
  id: number;
  contact_type: 'sender' | 'receiver';
  contact_type_display: string;
  name: string;
  country: string;
  postal_code: string;
  city: string;
  address: string;
  usage_count: number;
  last_used_at: string;
}

interface RouteContactFieldProps {
  contactType: 'sender' | 'receiver';
  value: string;
  onChange: (value: string) => void;
  onContactSelect?: (contact: RouteContact) => void;
  label?: string;
  required?: boolean;
  style?: React.CSSProperties;
}

const RouteContactField: React.FC<RouteContactFieldProps> = ({
  contactType,
  value,
  onChange,
  onContactSelect,
  label,
  required = false,
  style = {}
}) => {
  const [suggestions, setSuggestions] = useState<RouteContact[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Ieškoti kontaktų
  const searchContacts = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get('/orders/route-contacts/search/', {
        params: {
          contact_type: contactType,
          q: query
        }
      });
      setSuggestions(response.data.contacts || []);
      setShowSuggestions(true);
    } catch (error: any) {
      console.error('Error searching contacts:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for search
    const timeout = setTimeout(() => {
      searchContacts(newValue);
    }, 300);
    setSearchTimeout(timeout);
  };

  // Handle focus - show recent contacts
  const handleFocus = async () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    } else {
      // Jei tuščias laukelis, parodyk populiariausius kontaktus
      if (!value || value.length < 2) {
        setIsLoading(true);
        try {
          const response = await api.get('/orders/route-contacts/search/', {
            params: {
              contact_type: contactType,
              q: ''
            }
          });
          setSuggestions(response.data.contacts || []);
          setShowSuggestions(true);
        } catch (error: any) {
          console.error('Error fetching recent contacts:', error);
        } finally {
          setIsLoading(false);
        }
      }
    }
  };

  // Handle contact selection
  const handleContactSelect = (contact: RouteContact) => {
    onChange(contact.name);
    setShowSuggestions(false);
    
    if (onContactSelect) {
      onContactSelect(contact);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  return (
    <div className="autocomplete-field-wrapper" style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
          {label}
          {required && <span style={{ color: 'red' }}> *</span>}
        </label>
      )}
      <div className="autocomplete-input-with-dropdown">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          required={required}
          style={{
            width: '100%',
            padding: '5px 24px 5px 6px',
            fontSize: style.fontSize || '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            ...style
          }}
          placeholder={`Pasirinkite arba ieškokite ${contactType === 'sender' ? 'siuntėjo' : 'gavėjo'}...`}
        />
        <div className="autocomplete-dropdown-arrow"></div>
      </div>
      {isLoading && (
        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}>
          <span style={{ fontSize: '12px', color: '#666' }}>...</span>
        </div>
      )}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginTop: '2px'
          }}
        >
          {suggestions.map((contact) => (
            <div
              key={contact.id}
              onClick={() => handleContactSelect(contact)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                fontSize: '12px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f0f0f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{contact.name}</div>
              {(contact.city || contact.country) && (
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {[contact.city, contact.country].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RouteContactField;


