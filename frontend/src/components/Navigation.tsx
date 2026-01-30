import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useModule } from '../context/ModuleContext';
import './Navigation.css';

const Navigation: React.FC = () => {
  const { i18n, t } = useTranslation();
  const { logout, user } = useAuth();
  const { activeModule, setActiveModule } = useModule();
  const location = useLocation();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showModuleMenu, setShowModuleMenu] = useState(false);
  const [showOrdersDropdown, setShowOrdersDropdown] = useState(false);
  const [showPaymentsDropdown, setShowPaymentsDropdown] = useState(false);
  const [showDashboardDropdown, setShowDashboardDropdown] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const moduleMenuRef = useRef<HTMLDivElement>(null);
  const ordersDropdownRef = useRef<HTMLDivElement>(null);
  const paymentsDropdownRef = useRef<HTMLDivElement>(null);
  const dashboardDropdownRef = useRef<HTMLDivElement>(null);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setShowLangMenu(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setShowLangMenu(false);
      }
      if (moduleMenuRef.current && !moduleMenuRef.current.contains(event.target as Node)) {
        setShowModuleMenu(false);
      }
      if (ordersDropdownRef.current && !ordersDropdownRef.current.contains(event.target as Node)) {
        setShowOrdersDropdown(false);
      }
      if (paymentsDropdownRef.current && !paymentsDropdownRef.current.contains(event.target as Node)) {
        setShowPaymentsDropdown(false);
      }
      if (dashboardDropdownRef.current && !dashboardDropdownRef.current.contains(event.target as Node)) {
        setShowDashboardDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Automatinis redirect'as kai keičiasi modulis
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Transporto modulio puslapiai
    const transportPages = ['/orders', '/expeditions', '/invoices', '/partners', '/bank-import', '/mail'];
    // Išlaidų modulio puslapiai
    const expensePages = ['/expense-invoices', '/expense-suppliers', '/expense-categories'];
    
    // Jei esame transporto modulyje, bet perjungėme į išlaidas
    if (activeModule === 'expenses' && transportPages.includes(currentPath)) {
      navigate('/');
    }
    
    // Jei esame išlaidų modulyje, bet perjungėme į transportą
    if (activeModule === 'transport' && expensePages.includes(currentPath)) {
      navigate('/');
    }
  }, [activeModule, location.pathname, navigate]);

  // Nerodome navigacijos login puslapyje
  if (location.pathname === '/login') {
    return null;
  }

  return (
    <nav className="navigation">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <img src="/logo.png" alt="Logi-Track TMS" className="nav-logo-img" />
        </Link>
        
        {/* Dinaminiai meniu punktai */}
        <div className="nav-links">
          {/* Pagrindinis su dropdown */}
          <div 
            className="nav-dropdown-container"
            ref={dashboardDropdownRef}
            onMouseEnter={() => setShowDashboardDropdown(true)}
            onMouseLeave={() => setShowDashboardDropdown(false)}
          >
            <Link 
              to="/" 
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              📊 {t('navigation.dashboard')}
            </Link>
            {showDashboardDropdown && (
              <div className="nav-dropdown-menu">
                <Link 
                  to="/" 
                  className={`nav-dropdown-item ${location.pathname === '/' ? 'active' : ''}`}
                  onClick={() => setShowDashboardDropdown(false)}
                >
                  📊 Pagrindinis
                </Link>
                <Link 
                  to="/dashboard-new" 
                  className={`nav-dropdown-item ${location.pathname === '/dashboard-new' ? 'active' : ''}`}
                  onClick={() => setShowDashboardDropdown(false)}
                >
                  ✨ Pagrindinis New
                </Link>
              </div>
            )}
          </div>

          {activeModule === 'transport' && (
            <>
              {/* Užsakymai su dropdown */}
              <div 
                className="nav-dropdown-container"
                ref={ordersDropdownRef}
                onMouseEnter={() => setShowOrdersDropdown(true)}
                onMouseLeave={() => setShowOrdersDropdown(false)}
              >
                <Link 
                  to="/orders" 
                  className={`nav-link ${location.pathname === '/orders' ? 'active' : ''}`}
                >
                  📦 {t('navigation.orders')}
                </Link>
                {showOrdersDropdown && (
                  <div className="nav-dropdown-menu">
                    <Link 
                      to="/expeditions" 
                      className={`nav-dropdown-item ${location.pathname === '/expeditions' ? 'active' : ''}`}
                      onClick={() => setShowOrdersDropdown(false)}
                    >
                      🚚 {t('navigation.expeditions', 'Ekspedicijos')}
                    </Link>
                  </div>
                )}
              </div>

              {/* Mokėjimai su dropdown */}
              <div 
                className="nav-dropdown-container"
                ref={paymentsDropdownRef}
                onMouseEnter={() => setShowPaymentsDropdown(true)}
                onMouseLeave={() => setShowPaymentsDropdown(false)}
              >
                <Link 
                  to="/payments" 
                  className={`nav-link ${location.pathname === '/payments' ? 'active' : ''}`}
                >
                  💰 Mokėjimai
                </Link>
                {showPaymentsDropdown && (
                  <div className="nav-dropdown-menu">
                    <Link 
                      to="/payments" 
                      className={`nav-dropdown-item ${location.pathname === '/payments' ? 'active' : ''}`}
                      onClick={() => setShowPaymentsDropdown(false)}
                    >
                      💰 Mokėjimai
                    </Link>
                    <Link 
                      to="/invoices?tab=sales" 
                      className={`nav-dropdown-item ${location.pathname === '/invoices' && new URLSearchParams(location.search).get('tab') === 'sales' ? 'active' : ''}`}
                      onClick={() => setShowPaymentsDropdown(false)}
                    >
                      📄 Išrašytos sąskaitos
                    </Link>
                    <Link 
                      to="/invoices?tab=purchase" 
                      className={`nav-dropdown-item ${location.pathname === '/invoices' && new URLSearchParams(location.search).get('tab') === 'purchase' ? 'active' : ''}`}
                      onClick={() => setShowPaymentsDropdown(false)}
                    >
                      📥 Gautos sąskaitos
                    </Link>
                  </div>
                )}
              </div>

              <Link 
                to="/mail" 
                className={`nav-link ${location.pathname === '/mail' ? 'active' : ''}`}
              >
                📬 {t('navigation.mail', 'Paštas')}
              </Link>
              <Link 
                to="/partners" 
                className={`nav-link ${location.pathname === '/partners' ? 'active' : ''}`}
              >
                🤝 {t('navigation.partners')}
              </Link>
            </>
          )}

          {activeModule === 'expenses' && (
            <>
              <Link 
                to="/expense-invoices" 
                className={`nav-link ${location.pathname === '/expense-invoices' ? 'active' : ''}`}
              >
                💵 {t('navigation.invoices')}
              </Link>
              <Link 
                to="/expense-suppliers" 
                className={`nav-link ${location.pathname === '/expense-suppliers' ? 'active' : ''}`}
              >
                🏪 {t('navigation.suppliers', 'Tiekėjai')}
              </Link>
              <Link 
                to="/expense-categories" 
                className={`nav-link ${location.pathname === '/expense-categories' ? 'active' : ''}`}
              >
                📂 {t('navigation.categories', 'Kategorijos')}
              </Link>
            </>
          )}
        </div>

        {/* Modulio perjungimas */}
        <div className="nav-module-dropdown" ref={moduleMenuRef}>
          <button
            className="module-dropdown-btn"
            onClick={() => setShowModuleMenu(!showModuleMenu)}
          >
            {activeModule === 'transport' ? '🚚' : '💰'} {activeModule === 'transport' ? t('navigation.transport_module') : t('navigation.expenses_module')}
            <span className="nav-dropdown-arrow">{showModuleMenu ? '▲' : '▼'}</span>
          </button>

          {showModuleMenu && (
            <div className="module-menu">
              <button 
                className={`module-menu-item ${activeModule === 'transport' ? 'active' : ''}`}
                onClick={() => {
                  setActiveModule('transport');
                  setShowModuleMenu(false);
                }}
          >
            🚚 {t('navigation.transport_module')}
          </button>
          <button
                className={`module-menu-item ${activeModule === 'expenses' ? 'active' : ''}`}
                onClick={() => {
                  setActiveModule('expenses');
                  setShowModuleMenu(false);
                }}
          >
            💰 {t('navigation.expenses_module')}
          </button>
            </div>
          )}
        </div>

        {/* Kalbos pasirinkimas */}
        <div className="nav-language-dropdown" ref={langMenuRef}>
          <button 
            className="lang-dropdown-btn"
            onClick={() => setShowLangMenu(!showLangMenu)}
          >
            🌐 {i18n.language.substring(0, 2).toUpperCase()}
            <span className="nav-dropdown-arrow">{showLangMenu ? '▲' : '▼'}</span>
          </button>

          {showLangMenu && (
            <div className="lang-menu">
              <button 
                className={`lang-menu-item ${i18n.language === 'lt' ? 'active' : ''}`}
            onClick={() => changeLanguage('lt')}
              >
                Lietuvių (LT)
          </button>
          <button 
                className={`lang-menu-item ${i18n.language.startsWith('en') ? 'active' : ''}`}
            onClick={() => changeLanguage('en')}
          >
                English (EN)
          </button>
          <button 
                className={`lang-menu-item ${i18n.language.startsWith('ru') ? 'active' : ''}`}
            onClick={() => changeLanguage('ru')}
          >
                Русский (RU)
          </button>
            </div>
          )}
        </div>

        <div className="nav-user-info" ref={userMenuRef}>
          {user && (
            <div className="nav-user-dropdown">
              <button 
                className="nav-user-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <span className="nav-greeting">
                  {user.full_name || user.username}
                  {user.company_name && <span className="nav-company"> | {user.company_name}</span>}
                </span>
                <span className="nav-dropdown-arrow">{showUserMenu ? '▲' : '▼'}</span>
              </button>

              {showUserMenu && (
                <div className="nav-user-menu">
                  <Link 
                    to="/company-info" 
                    className="nav-user-menu-item"
                    onClick={() => setShowUserMenu(false)}
                  >
                    🏢 {t('navigation.company_info')}
                  </Link>
                  <Link 
                    to="/user-settings" 
                    className="nav-user-menu-item"
                    onClick={() => setShowUserMenu(false)}
                  >
                    👤 {t('navigation.user_settings')}
                  </Link>
                  <Link 
                    to="/settings" 
                    className="nav-user-menu-item"
                    onClick={() => setShowUserMenu(false)}
                  >
                    ⚙️ {t('navigation.settings')}
                  </Link>
                  <Link 
                    to="/activity-logs" 
                    className="nav-user-menu-item"
                    onClick={() => setShowUserMenu(false)}
                  >
                    📋 Veiksmų istorija
                  </Link>
                  <button 
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }} 
                    className="nav-user-menu-item nav-logout-item"
                  >
                    🚪 {t('navigation.logout')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
