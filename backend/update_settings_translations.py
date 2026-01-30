import os
import django
import sys

# Nustatome Django aplinką
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from apps.settings.models import OrderSettings, ExpeditionSettings

def update_settings():
    # 1. Paruošiame vertimus
    payment_terms_lt = "45 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo."
    payment_terms_en = "45 calendar days after receiving the VAT invoice and CMR with the date of receipt of the cargo and the recipient's name, surname, and signature."
    payment_terms_ru = "45 календарных дней после получения счета-фактуры НДС и накладной (CMR) с датой получения груза и именем, фамилией, подписью получателя."

    carrier_obligations_translations = [
        {
            "lt": "Vežėjas privalomai turi turėti galiojantį CMR draudimą draudimo sumai nemažesnei nei vežamo krovinio vertė.",
            "en": "The Carrier must have valid CMR insurance for an amount not less than the value of the cargo being transported.",
            "ru": "Перевозчик обязан иметь действующее страхование CMR на сумму не менее стоимости перевозимого груза."
        },
        {
            "lt": "Vežėjas įsipareigoja laiku pateikti tinkamą, techniškai tvarkingą transporto priemonę, sutartyje nurodytu laiku ir nurodytoje vietoje.",
            "en": "The Carrier undertakes to provide a suitable, technically sound vehicle at the time and place specified in the contract.",
            "ru": "Перевозчик обязуется своевременно предоставить подходящее, технически исправное транспортное средство в указанное в договоре время и место."
        },
        {
            "lt": "Vežėjas atvykimo ir pristatymo vietose sutikrina krovinio (CMR) važtaraštyje esamas datas ir laikus, atsakingų asmenų (siuntėjo-gavėjo) parašus ir spaudus.",
            "en": "The Carrier checks the dates and times, signatures, and stamps of the responsible persons (sender-receiver) on the cargo (CMR) waybill at the arrival and delivery points.",
            "ru": "Перевозчик в местах прибытия и доставки сверяет даты и время, подписи и печати ответственных лиц (отправителя-получателя) в товарно-транспортной накладной (CMR)."
        },
        {
            "lt": "Vežėjas atsako už krovinio saugumą, jo sugadinimą, sunaikinimą ar trūkumą nuo pakrovimo į automobilį iki krovinio atidavimo laiko jo teisėtam gavėjui.",
            "en": "The Carrier is responsible for the safety of the cargo, its damage, destruction, or shortage from loading into the vehicle until the time of delivery to its legal recipient.",
            "ru": "Перевозчик несет ответственность за сохранность груза, его повреждение, уничтожение или недостачу с момента погрузки в автомобиль до момента передачи его законному получателю."
        },
        {
            "lt": "Vežėjas dalyvauja nuo pakrovimo (iškrovimo) pradžios iki jo pabaigos ir stebi, kad krovinys atitiktų įrašus CMR ar TIR dokumentuose. Vizualiai nustačius krovinio neatitikimą bei sugadinimą, daro atžymas krovinio (CMR) važtaraštyje. Jeigu vairuotojui neįmanoma suskaičiuoti krovinio kiekio arba jam nėra sudaromos sąlygos dalyvauti pakrovime, tai pažymi krovinio važtaraštyje 18-oje grafoje, bei kuo skubiau apie tai praneša Užsakovui.",
            "en": "The Carrier participates from the beginning to the end of loading (unloading) and monitors that the cargo corresponds to the entries in the CMR or TIR documents. Having visually determined the discrepancy and damage of the cargo, makes notes on the cargo (CMR) waybill. If it is impossible for the driver to count the quantity of the cargo or he is not provided with the conditions to participate in the loading, he notes this in the cargo waybill in box 18 and informs the Customer as soon as possible.",
            "ru": "Перевозчик участвует от начала до конца погрузки (выгрузки) и следит за тем, чтобы груз соответствовал записям в документах CMR или TIR. Визуально установив несоответствие и повреждение груза, делает отметки в товарно-транспортной накладной (CMR). Если водителю невозможно подсчитать количество груза или ему не созданы условия для участия в погрузке, он отмечает это в транспортной накладной в графе 18 и как можно скорее сообщает об этом Заказчику."
        },
        {
            "lt": "Jeigu pervežimo metu įvyksta krovinio sugadinimas, dalinis sugadinimas, ar netinkamas sutarties vykdymas Vežėjas negali reikalauti pilnai apmokėti pervežimo kainą.",
            "en": "If cargo damage, partial damage, or improper execution of the contract occurs during transportation, the Carrier cannot demand full payment of the transportation price.",
            "ru": "Если во время перевозки происходит повреждение груза, частичное повреждение или ненадлежащее исполнение договора, Перевозчик не может требовать полной оплаты стоимости перевозки."
        },
        {
            "lt": "Vežėjas už krovinio išdėstymą ir su tuo susijusias išlaidas atsako pats. Už transporto priemonės Užsakovui nepateikimą, vėlavimą ir pan. jeigu krovinio Siuntėjas nenumato kitaip, Vežėjas moka po 100 EUR/dieną.",
            "en": "The Carrier is responsible for the arrangement of the cargo and the related costs. For failure to provide the vehicle to the Customer, delay, etc., unless the Sender of the cargo provides otherwise, the Carrier pays 100 EUR/day.",
            "ru": "Перевозчик несет ответственность за размещение груза и связанные с этим расходы. За непредоставление транспортного средства Заказчику, задержку и т.п., если Отправитель груза не предусмотрит иное, Перевозчик выплачивает 100 EUR/день."
        },
        {
            "lt": "Apie visas iškilusias problemas (a/m vėlavimas, krovinio trūkumas, sugadinimas, perkrovimas, prastovos, tarpiniai sustojimai, nesusiję su pervežimo procesu ir kitos) dviejų valandų laikotarpyje tiesiogiai informuoja Užsakovą. Pranešus apie tai vėliau, nesant tam objektyvių priežasčių, visa su tuo susijusi atsakomybė tenka Vežėjui.",
            "en": "Directly informs the Customer about all problems encountered (vehicle delay, cargo shortage, damage, reloading, downtime, intermediate stops not related to the transportation process, and others) within two hours. If reported later, in the absence of objective reasons, all related responsibility lies with the Carrier.",
            "ru": "Обо всех возникших проблемах (задержка а/м, недостача груза, повреждение, перегрузка, простои, промежуточные остановки, не связанные с процессом перевозки, и др.) в течение двух часов напрямую информирует Заказчика. При сообщении об этом позднее, при отсутствии объективных причин, вся связанная с этим ответственность ложится на Перевозчика."
        },
        {
            "lt": "Vežėjas pareiškia, kad šią sutartį (ar) kitus dokumentus pasirašantis Vežėjo atstovas yra įgaliotas juos pasirašyti.",
            "en": "The Carrier declares that the Carrier's representative signing this contract (and) other documents is authorized to sign them.",
            "ru": "Перевозчик заявляет, что представитель Перевозчика, подписывающий настоящий договор (или) другие документы, уполномочен их подписывать."
        }
    ]

    client_obligations_translations = [
        {
            "lt": "Pateikia Vežėjui visus krovinio gabenimui reikalingus dokumentus.",
            "en": "Provides the Carrier with all necessary documentation for cargo transportation.",
            "ru": "Предоставляет Перевозчику всю необходимую документацию для перевозки груза."
        },
        {
            "lt": "Įsipareigoja atsiskaityti pagal sutartas apmokėjimo sąlygas.",
            "en": "Undertakes to settle payments according to the agreed payment terms.",
            "ru": "Обязуется произвести расчет в соответствии с согласованными условиями оплаты."
        },
        {
            "lt": "Transporto priemonės pakrovimui/iškrovimui skiriamos 48 val., jei tai nėra savaitgalis, šventinės dienos, ar nėra nurodyta kitaip.",
            "en": "48 hours are allocated for vehicle loading/unloading, unless it is a weekend, public holiday, or otherwise specified.",
            "ru": "Для погрузки/разгрузки транспортного средства отводится 48 часов, если это не выходные, праздничные дни или не указано иное."
        }
    ]

    # Konvertuojame į JSON formatą saugojimui
    carrier_obs_json = [{"text": o["lt"], "text_en": o["en"], "text_ru": o["ru"]} for o in carrier_obligations_translations]
    client_obs_json = [{"text": o["lt"], "text_en": o["en"], "text_ru": o["ru"]} for o in client_obligations_translations]

    # 2. Atnaujiname OrderSettings
    try:
        order_settings = OrderSettings.load()
        order_settings.payment_terms = payment_terms_lt
        order_settings.payment_terms_en = payment_terms_en
        order_settings.payment_terms_ru = payment_terms_ru
        order_settings.carrier_obligations = carrier_obs_json
        order_settings.client_obligations = client_obs_json
        order_settings.save()
        print("Sėkmingai atnaujinti Užsakymų nustatymai.")
    except Exception as e:
        print(f"Klaida atnaujinant Užsakymų nustatymus: {e}")

    # 3. Atnaujiname ExpeditionSettings
    try:
        exp_settings = ExpeditionSettings.load()
        exp_settings.payment_terms = payment_terms_lt
        exp_settings.payment_terms_en = payment_terms_en
        exp_settings.payment_terms_ru = payment_terms_ru
        exp_settings.carrier_obligations = carrier_obs_json
        exp_settings.client_obligations = client_obs_json
        exp_settings.save()
        print("Sėkmingai atnaujinti Ekspedicijos nustatymai.")
    except Exception as e:
        print(f"Klaida atnaujinant Ekspedicijos nustatymus: {e}")

    # 4. Atnaujiname CostExpeditionSettings (nes jis naudoja kitą lentelę)
    try:
        from apps.settings.models import CostExpeditionSettings
        cost_settings = CostExpeditionSettings.load()
        cost_settings.payment_terms = payment_terms_lt
        cost_settings.payment_terms_en = payment_terms_en
        cost_settings.payment_terms_ru = payment_terms_ru
        cost_settings.carrier_obligations = carrier_obs_json
        cost_settings.client_obligations = client_obs_json
        cost_settings.save()
        print("Sėkmingai atnaujinti Pap. išlaidų nustatymai.")
    except Exception as e:
        print(f"Klaida atnaujinant Pap. išlaidų nustatymus: {e}")

if __name__ == "__main__":
    update_settings()
