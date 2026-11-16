# Stół Artyleryjski VR (Meta Quest 3 / 3S)

Symulator WebXR: przed Tobą stoi prostokątny stół, a na nim miniaturowy kawałek świata
1 km × 4 km (skala 1:2000 → stół 0,5 m × 2 m). Są tam pagórki, lasy, rzeka, jezioro, stawy,
wioska i pola. Przy bliższej krawędzi stoi Twoja bateria 4 haubic, a z dalekiego końca
nadciągają fale żołnierzy. Celujesz kontrolerem, widzisz narysowany tor lotu i miejsce
upadku, a spustem oddajesz salwę.

Nie trzeba niczego budować ani instalować. To czysty HTML i JavaScript (Three.js jest
dołączony w `vendor/`), który działa w przeglądarce Meta Quest.

## Sterowanie (Quest)

| Przycisk | Akcja |
|---|---|
| **Promień z kontrolera** | celowanie w teren na stole |
| **Spust** | salwa ze wszystkich gotowych dział (przeładowanie 4 s) |
| **Grip, jedna ręka** | chwyć stół: przesuwanie i obrót |
| **Grip, obie ręce** | skalowanie (0,15× – 25×), obrót i przesuwanie |
| **A** | tor płaski / stromy (stromy przelatuje nad wzgórzami, ale leci dłużej) |
| **B** | pokaż / ukryj tablicę z instrukcją |
| **X** | ustaw stół z powrotem przed sobą |
| **Y** | nowa gra |
| **Gałka** | obrót stołu (←/→) i zoom (↑/↓) wokół punktu, w który celujesz |

Na lewym kontrolerze jest panel z numerem fali, liczbą trafień, przełamaniami, stanem
przeładowania dział i odległością do celu.

Kolory toru:
- **zielony**: pocisk spadnie tam, gdzie celujesz;
- **pomarańczowy**: tor zasłania wzgórze, więc pocisk spadnie wcześniej (przełącz tor przyciskiem A);
- **czerwony**: cel poza zasięgiem.

Pierścień pokazuje strefę rażenia (40 m). Las częściowo osłania żołnierzy, a w wodzie
idą wolniej. Gra kończy się, gdy 10 żołnierzy dojdzie do linii baterii.

Tryby:
- **Wejdź w VR**: wirtualny pokój.
- **Mixed Reality**: passthrough, czyli stół stoi w Twoim prawdziwym pokoju.

## Podgląd na komputerze

Klik lub `Spacja` to ognia. Przeciąganie obraca kamerę, a kółko ją przybliża.
`H` przełącza tor, `N` zaczyna nową grę, a `R` resetuje widok.

## Jak uruchomić na Queście

WebXR wymaga **HTTPS**. Masz dwie możliwości.

### A) GitHub Pages (najprościej)
1. Na GitHubie wejdź w repozytorium, potem *Settings → Pages*.
2. W polu *Source* wybierz *Deploy from a branch*, wskaż gałąź z tym kodem i folder `/ (root)`.
3. Po chwili strona będzie pod adresem `https://<użytkownik>.github.io/vr-brainstorm/`.
4. Otwórz ten adres w przeglądarce na Queście i kliknij **Wejdź w VR** albo **Mixed Reality**.

### B) Lokalnie, przez kabel USB (adb)
```bash
python3 -m http.server 8000            # w katalogu repozytorium
adb reverse tcp:8000 tcp:8000          # Quest podłączony kablem, tryb deweloperski
```
Potem otwórz na Queście `http://localhost:8000` (localhost traktowany jest jak bezpieczny kontekst).

## Parametry URL
- `?seed=42`: inny losowy teren (las, kolory, ukształtowanie).
- `?shadows=0`: wyłącza cienie, jeśli brakuje płynności.

## Struktura
- `src/config.js`: stałe (skala, balistyka, przeładowanie, promień rażenia, fale).
- `src/terrain.js`: generowanie terenu, wody, lasu, wioski, przecięcie promienia z terenem i zniszczenia.
- `src/artillery.js`: modele dział, rozwiązanie balistyczne (tor płaski/stromy), podgląd toru i pociski.
- `src/enemies.js`: fale żołnierzy, ruch po terenie i trafienia.
- `src/effects.js`: wybuchy, dym, rozbryzgi i dźwięk przestrzenny (generowany proceduralnie).
- `src/table.js`: chwytanie, obracanie i skalowanie stołu jedną albo dwiema rękami.
- `src/hud.js`: panel na nadgarstku i tablica z instrukcją.
- `src/main.js`: scena, sesja XR, kontrolery, sterowanie na komputerze i pętla gry.
