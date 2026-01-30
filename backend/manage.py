#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys

# Nustatyti DYLD_LIBRARY_PATH WeasyPrint bibliotekoms (macOS)
if sys.platform == 'darwin':
    homebrew_lib = '/opt/homebrew/lib'
    if os.path.exists(homebrew_lib):
        current_dyld = os.environ.get('DYLD_LIBRARY_PATH', '')
        if homebrew_lib not in current_dyld:
            os.environ['DYLD_LIBRARY_PATH'] = f'{homebrew_lib}:{current_dyld}'.strip(':')


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()

