"""
Modulinė testinių duomenų generatorių sistema.
Kiekvienas modulis turi savo generatorių, kuriuos koordinuoja core modulis.
"""

from .generators import generate_all_test_data
from .deleters import delete_all_test_data

__all__ = ['generate_all_test_data', 'delete_all_test_data']






