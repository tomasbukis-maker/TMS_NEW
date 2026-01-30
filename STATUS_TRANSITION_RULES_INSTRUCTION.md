# Statusų perėjimų taisyklės - Naudojimo instrukcija

## Apžvalga

Statusų perėjimų taisyklės nustato, kokie statusų pakeitimai yra leistini sistemoje. Pavyzdžiui, užsakymas negali pereiti tiesiai iš "Naujas" į "Baigtas" - reikia eiti per tarpinius statusus.

## Kaip pasiekti

1. Eikite į **Nustatymai** (⚙️ Sistema → Statusų perėjimų taisyklės)
2. Pasirinkite objektų tipą (Užsakymas, Pardavimo sąskaita, Pirkimo sąskaita, Užsakymo vežėjas, Užsakymo išlaida)
3. Matysite visas taisykles pasirinktam tipui

## Taisyklės struktūra

Kiekviena taisyklė turi:
- **Dabartinis statusas** - iš kurio statuso keičiama
- **Leistini kiti statusai** - į kuriuos statusus galima pereiti
- **Aktyvus** - ar taisyklė naudojama
- **Eiliškumas** - taisyklių tvarka (mažesnis skaičius = aukščiau)
- **Aprašymas** - papildomas komentaras

## Pavyzdžiai

### 1. Užsakymo statusų taisyklės

**Numatytosios taisyklės:**
- `new` → `assigned`, `executing`, `canceled`
- `assigned` → `executing`, `waiting_for_docs`, `canceled`
- `executing` → `waiting_for_docs`, `finished`, `canceled`
- `waiting_for_docs` → `finished`, `executing`, `canceled`
- `finished` → (nėra leistinų perėjimų - baigtas užsakymas)
- `canceled` → (nėra leistinų perėjimų - atšauktas užsakymas)

**Pavyzdys:** Jei norite leisti pereiti iš `new` tiesiai į `finished`:
1. Raskite taisyklę su `current_status = "new"`
2. Spustelėkite **Redaguoti**
3. Pridėkite `finished` į **Leistini kiti statusai**
4. Išsaugokite

### 2. Sąskaitų mokėjimo statusų taisyklės

**Pardavimo sąskaitos:**
- `unpaid` → `partially_paid`, `paid`, `overdue`
- `partially_paid` → `paid`, `unpaid`, `overdue`
- `paid` → `unpaid`, `partially_paid` (retai, bet galima)
- `overdue` → `paid`, `partially_paid`, `unpaid`

**Pavyzdys:** Jei norite uždrausti grąžinti sąskaitą iš `paid` atgal į `unpaid`:
1. Raskite taisyklę su `current_status = "paid"`
2. Spustelėkite **Redaguoti**
3. Pašalinkite `unpaid` iš **Leistini kiti statusai**
4. Išsaugokite

### 3. Naujos taisyklės kūrimas

**Pavyzdys:** Sukurkite taisyklę, kuri leidžia pereiti iš `executing` į `new` (atkurti užsakymą):

1. Spustelėkite **+ Pridėti taisyklę**
2. Pasirinkite **Objekto tipas:** `order`
3. Įveskite **Dabartinis statusas:** `executing`
4. Pridėkite į **Leistini kiti statusai:** `new`
5. Nustatykite **Eiliškumas:** `10`
6. Įveskite **Aprašymas:** "Leidžia atkurti užsakymą"
7. Išsaugokite

### 4. Taisyklės deaktyvavimas

Jei norite laikinai išjungti taisyklę (bet ne ištrinti):

1. Raskite taisyklę
2. Spustelėkite **Redaguoti**
3. Nuimkite žymę **Aktyvus**
4. Išsaugokite

**Pastaba:** Neaktyvi taisyklė nebus naudojama validacijoje, bet bus išsaugota duomenų bazėje.

### 5. Taisyklės trynimas

1. Raskite taisyklę
2. Spustelėkite **Ištrinti**
3. Patvirtinkite trynimą

**Dėmesio:** Ištrynus taisyklę, bus neįmanoma pereiti iš to statuso į kitus (nebent yra kitos taisyklės).

## Svarbūs patarimai

1. **Vienas statusas - viena taisyklė:** Kiekvienam `(entity_type, current_status)` porai gali būti tik viena taisyklė
2. **Tuščias masyvas = jokių perėjimų:** Jei `allowed_next_statuses` tuščias, iš to statuso negalima pereiti į jokį kitą
3. **Cache'as:** Taisyklės yra cache'uojamos - pakeitimai įsigalioja iš karto, bet cache'as automatiškai išvalomas kai taisyklės keičiamos
4. **Validacija:** StatusService automatiškai tikrina, ar perėjimas leistinas pagal taisykles

## Techninė informacija

- **API endpoint:** `/api/core/status-transition-rules/`
- **Modelis:** `StatusTransitionRule` (duomenų bazėje: `status_transition_rules`)
- **Servisas:** `StatusService` (naudojamas visoms statusų pakeitimams)
- **Cache:** Taisyklės cache'uojamos, išvalomos kai taisyklės keičiamos

## Dažniausios problemos

**Problema:** Negaliu pakeisti statuso
**Sprendimas:** Patikrinkite, ar yra taisyklė, kuri leidžia pereiti iš dabartinio statuso į naują

**Problema:** Taisyklė neveikia
**Sprendimas:** Patikrinkite, ar taisyklė yra **Aktyvus**, ir ar `current_status` tiksliai atitinka (case-sensitive)

**Problema:** Galiu pereiti į bet kokį statusą
**Sprendimas:** Patikrinkite, ar yra taisyklė su tuščiu `allowed_next_statuses` masyvu

## Pavyzdžiai pagal objektų tipus

### Užsakymas (order)
- Statusai: `new`, `assigned`, `executing`, `waiting_for_docs`, `finished`, `canceled`

### Pardavimo sąskaita (sales_invoice)
- Statusai: `unpaid`, `partially_paid`, `paid`, `overdue`

### Pirkimo sąskaita (purchase_invoice)
- Statusai: `unpaid`, `partially_paid`, `paid`, `overdue`

### Užsakymo vežėjas (order_carrier)
- Statusai: `not_paid`, `partially_paid`, `paid`

### Užsakymo išlaida (order_cost)
- Statusai: `new`, `in_progress`, `completed`, `cancelled`
