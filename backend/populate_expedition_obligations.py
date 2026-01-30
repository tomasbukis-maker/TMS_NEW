#!/usr/bin/env python
"""
Skriptas, kuris užpildo ekspedicijų nustatymus tekstais iš užsakymų nustatymų.
Jei užsakymų nustatymuose nėra tekstų, naudoja default reikšmes.
"""

import os
import sys
import django

# Nustatyti Django settings
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from apps.settings.models import OrderSettings, ExpeditionSettings

def populate_expedition_obligations():
    """Užpildo ekspedicijų nustatymus tekstais iš užsakymų nustatymų"""
    
    # Užkrauti užsakymų nustatymus
    try:
        order_settings = OrderSettings.load()
    except Exception as e:
        print(f"Klaida užkraunant užsakymų nustatymus: {e}")
        return
    
    # Užkrauti ekspedicijų nustatymus
    try:
        expedition_settings = ExpeditionSettings.load()
    except Exception as e:
        print(f"Klaida užkraunant ekspedicijų nustatymus: {e}")
        return
    
    # Default reikšmės (jei užsakymų nustatymuose nėra)
    default_carrier_obligations = [
        {"text": "Vežėjas privalomai turi turėti galiojantį CMR draudimą draudimo sumai nemažesnei nei vežamo krovinio vertė."},
        {"text": "Vežėjas įsipareigoja laiku pateikti tinkamą, techniškai tvarkingą transporto priemonę, sutartyje nurodytu laiku ir nurodytoje vietoje."},
        {"text": "Vežėjas atvykimo ir pristatymo vietose sutikrina krovinio (CMR) važtaraštyje esamas datas ir laikus, atsakingų asmenų (siuntėjo-gavėjo) parašus ir spaudus."},
        {"text": "Vežėjas atsako už krovinio saugumą, jo sugadinimą, sunaikinimą ar trūkumą nuo pakrovimo į automobilį iki krovinio atidavimo laiko jo teisėtam gavėjui."},
        {"text": "Vežėjas dalyvauja nuo pakrovimo (iškrovimo) pradžios iki jo pabaigos ir stebi, kad krovinys atitiktų įrašus CMR ar TIR dokumentuose. Vizualiai nustačius krovinio neatitikimą bei sugadinimą, daro atžymas krovinio (CMR) važtaraštyje. Jeigu vairuotojui neįmanoma suskaičiuoti krovinio kiekio arba jam nėra sudaromos sąlygos dalyvauti pakrovime, tai pažymi krovinio važtaraštyje 18-oje grafoje, bei kuo skubiau apie tai praneša Užsakovui."},
        {"text": "Jeigu pervežimo metu įvyksta krovinio sugadinimas, dalinis sugadinimas, ar netinkamas sutarties vykdymas Vežėjas negali reikalauti pilnai apmokėti pervežimo kainą."},
        {"text": "Vežėjas už krovinio išdėstymą ir su tuo susijusias išlaidas atsako pats. Už transporto priemonės Užsakovui nepateikimą, vėlavimą ir pan. jeigu krovinio Siuntėjas nenumato kitaip, Vežėjas moka po 100 EUR/dieną."},
        {"text": "Apie visas iškilusias problemas (a/m vėlavimas, krovinio trūkumas, sugadinimas, perkrovimas, prastovos, tarpiniai sustojimai, nesusiję su pervežimo procesu ir kitos) dviejų valandų laikotarpyje tiesiogiai informuoja Užsakovą. Pranešus apie tai vėliau, nesant tam objektyvių priežasčių, visa su tuo susijusi atsakomybė tenka Vežėjui."},
        {"text": "Vežėjas pareiškia, kad šią sutartį (ar) kitus dokumentus pasirašantis Vežėjo atstovas yra įgaliotas juos pasirašyti."}
    ]
    
    default_client_obligations = [
        {"text": "Pateikia Vežėjui visus krovinio gabenimui reikalingus dokumentus."},
        {"text": "Įsipareigoja atsiskaityti pagal sutartas apmokėjimo sąlygas."},
        {"text": "Transporto priemonės pakrovimui/iškrovimui skiriamos 48 val., jei tai nėra savaitgalis, šventinės dienos, ar nėra nurodyta kitaip."}
    ]
    
    # Nustatyti vežėjo teises ir pareigas
    if order_settings.carrier_obligations and len(order_settings.carrier_obligations) > 0:
        expedition_settings.carrier_obligations = order_settings.carrier_obligations
        print(f"✓ Nukopijuota {len(order_settings.carrier_obligations)} vežėjo teisių ir pareigų punktų iš užsakymų nustatymų")
    else:
        expedition_settings.carrier_obligations = default_carrier_obligations
        print(f"✓ Naudojamos default vežėjo teisių ir pareigų reikšmės ({len(default_carrier_obligations)} punktai)")
    
    # Nustatyti užsakovo teises ir pareigas
    if order_settings.client_obligations and len(order_settings.client_obligations) > 0:
        expedition_settings.client_obligations = order_settings.client_obligations
        print(f"✓ Nukopijuota {len(order_settings.client_obligations)} užsakovo teisių ir pareigų punktų iš užsakymų nustatymų")
    else:
        expedition_settings.client_obligations = default_client_obligations
        print(f"✓ Naudojamos default užsakovo teisių ir pareigų reikšmės ({len(default_client_obligations)} punktai)")
    
    # Išsaugoti
    expedition_settings.save()
    print("✓ Ekspedicijų nustatymai išsaugoti")
    
    print("\nPatikrinimas:")
    print(f"  Vežėjo teisių ir pareigų punktų: {len(expedition_settings.carrier_obligations)}")
    print(f"  Užsakovo teisių ir pareigų punktų: {len(expedition_settings.client_obligations)}")

if __name__ == '__main__':
    populate_expedition_obligations()

