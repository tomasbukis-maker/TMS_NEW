"""
Modulių valdymo sistema - leidžia įjungti/išjungti funkcionalumą
"""
import os
from typing import List, Dict, Any

# Galimi moduliai ir jų priklausomybės
MODULE_REGISTRY = {
    'transport': {
        'name': 'Transporto valdymas',
        'apps': ['orders', 'invoices', 'partners', 'mail'],
        'dependencies': ['auth', 'settings'],
        'description': 'Užsakymai, ekspedicijos, sąskaitos, partneriai'
    },
    'expenses': {
        'name': 'Išlaidų valdymas',
        'apps': ['expenses'],
        'dependencies': ['auth', 'settings'],
        'description': 'Kitos įmonės išlaidos'
    },
    'dashboard': {
        'name': 'Dashboard ir statistika',
        'apps': ['dashboard'],
        'dependencies': [],  # Dashboard gali veikti be kitų modulių
        'description': 'Statistika ir ataskaitos'
    }
}

# Visada įjungti moduliai (core funkcionalumas)
CORE_MODULES = ['core', 'auth', 'settings', 'tools']


def get_enabled_modules() -> List[str]:
    """
    Grąžina sąrašą įjungtų modulių pagal aplinkos kintamuosius

    Galimi būdai:
    1. MODULE_TRANSPORT=1 MODULE_EXPENSES=1
    2. ENABLED_MODULES=transport,expenses,dashboard
    """
    enabled_modules = []

    # 1. Patikrinti individualius modulio kintamuosius
    for module_name in MODULE_REGISTRY.keys():
        env_var = f'MODULE_{module_name.upper()}'
        if os.getenv(env_var, '1').lower() in ('1', 'true', 'yes', 'on'):
            enabled_modules.append(module_name)

    # 2. Patikrinti ENABLED_MODULES sąrašą (užrašo pirmiau)
    enabled_modules_env = os.getenv('ENABLED_MODULES', '')
    if enabled_modules_env:
        specified_modules = [m.strip() for m in enabled_modules_env.split(',')]
        enabled_modules = specified_modules

    # 3. Numatytoji konfigūracija (jei nieko nenurodyta)
    if not enabled_modules:
        enabled_modules = ['transport', 'expenses', 'dashboard']

    # Patikrinti priklausomybes ir įjungti reikalingus
    enabled_modules = _resolve_dependencies(enabled_modules)

    return enabled_modules


def _resolve_dependencies(modules: List[str]) -> List[str]:
    """Išspręsti modulių priklausomybes"""
    resolved = set(modules)

    for module in modules:
        if module in MODULE_REGISTRY:
            # Pridėti priklausomybes
            deps = MODULE_REGISTRY[module].get('dependencies', [])
            resolved.update(deps)

    return list(resolved)


def get_module_config(module_name: str) -> Dict[str, Any]:
    """Gauti modulio konfigūraciją"""
    return MODULE_REGISTRY.get(module_name, {})


def is_module_enabled(module_name: str) -> bool:
    """Patikrinti ar modulis įjungtas"""
    enabled = get_enabled_modules()
    return module_name in enabled


def get_enabled_apps() -> List[str]:
    """Gauti visus įjungtų modulių apps"""
    enabled_modules = get_enabled_modules()
    apps = []

    for module in enabled_modules:
        if module in MODULE_REGISTRY:
            apps.extend(MODULE_REGISTRY[module]['apps'])

    return apps


def get_module_info() -> Dict[str, Any]:
    """Gauti informaciją apie visus modulius"""
    enabled = get_enabled_modules()

    return {
        'enabled_modules': enabled,
        'disabled_modules': [m for m in MODULE_REGISTRY.keys() if m not in enabled],
        'core_modules': CORE_MODULES,
        'module_details': {
            name: {
                **config,
                'enabled': name in enabled
            }
            for name, config in MODULE_REGISTRY.items()
        }
    }


# Patogumo funkcijos
def transport_enabled() -> bool:
    return is_module_enabled('transport')

def expenses_enabled() -> bool:
    return is_module_enabled('expenses')

def dashboard_enabled() -> bool:
    return is_module_enabled('dashboard')





